# backend/app/core/subscriptions.py
"""
NGSI-LD subscription management for greenhouse-dt.

Creates and ensures per-tenant subscriptions for pathological monitoring.
One subscription per tenant (watches all DeviceMeasurement entities) —
filtering by channel happens in the notify handler, because a DeviceMeasurement
names its channel as a VALUE (`controlledProperty` in the legacy shape, `name` in
the Smart Data Models shape) rather than as an attribute key, so watchedAttributes
cannot select on it.
"""

from __future__ import annotations

import logging
import os

from nkz_platform_sdk import OrionClient

from app.config import settings

logger = logging.getLogger(__name__)

INTERNAL_SERVICE_SECRET = os.getenv("INTERNAL_SERVICE_SECRET", "")

SUBSCRIPTION_DESCRIPTION = "nkz-module: DeviceMeasurement -> greenhouse-dt (pathological)"

# The description this module used before the vocabulary migration. Its
# subscription watches a type that is no longer provisioned, so it can never
# fire; it is deleted on ensure rather than left to accumulate per tenant.
LEGACY_SUBSCRIPTION_DESCRIPTION = "nkz-module: AgriSensor -> greenhouse-dt (pathological)"

# Properties the pathological worker evaluates. Without this the subscription
# would match EVERY reading of EVERY device in the tenant, and `throttling` is a
# per-subscription minimum interval — an unrelated probe could consume the
# window a leafWetness reading needed.
TRACKED_PROPERTIES = ("leafWetness", "temperature", "relativeHumidity")
NOTIFY_PATH = "/api/ngsi-ld/notify"


def _tracked_channels_q() -> str:
    """Select the tracked channels in both DeviceMeasurement shapes.

    Legacy shape: the channel is in ``controlledProperty``. Smart Data Models shape: the
    channel is in ``name`` and ``controlledProperty`` is the catalogue property, so this
    also lets through the statistic channels of a tracked property (``temperatureMin``);
    the notify handler keeps only exact channels (``read_device_measurement``).
    """
    return "|".join(
        f'controlledProperty=="{p}"|name=="{p}"' for p in TRACKED_PROPERTIES
    )


def _subscription_body(callback_url: str) -> dict:
    endpoint = {"uri": callback_url, "accept": "application/json"}
    if INTERNAL_SERVICE_SECRET:
        endpoint["receiverInfo"] = [
            {"key": "X-Internal-Service-Secret", "value": INTERNAL_SERVICE_SECRET}
        ]
    return {
        "type": "Subscription",
        "description": SUBSCRIPTION_DESCRIPTION,
        "entities": [{"type": "DeviceMeasurement"}],
        "watchedAttributes": ["numValue"],
        "q": _tracked_channels_q(),
        "notification": {
            "endpoint": endpoint,
            "format": "normalized",
        },
        "throttling": 60,
        "isActive": True,
    }


async def _reconcile_filter(client: OrionClient, sub: dict, tenant_id: str) -> None:
    """Bring an existing subscription's ``q`` to the current filter, in place.

    Matching by description alone would leave a tenant's subscription on an older filter
    forever. A failure is logged and never blocks startup: the old filter keeps working
    for the legacy shape.
    """
    desired = _tracked_channels_q()
    if sub.get("q") == desired:
        logger.info("Subscription already exists for tenant %s", tenant_id)
        return
    try:
        await client.update_subscription(sub["id"], {"q": desired})
        logger.info("Updated the pathological subscription filter for tenant %s", tenant_id)
    except Exception as e:  # noqa: BLE001 — ensure must not fail on a filter update
        logger.warning("Could not update the subscription filter for tenant %s: %s", tenant_id, e)


async def ensure_pathological_subscription(tenant_id: str) -> str | None:
    """Create or skip the pathological subscription for a tenant.

    Idempotent — checks by description before creating.
    Returns the subscription ID if created, None if already exists.
    """
    client = OrionClient(tenant_id=tenant_id, base_url=settings.orion_ld_url)
    try:
        existing = await client.query_subscriptions(limit=200)
        for sub in existing:
            if sub.get("description") == LEGACY_SUBSCRIPTION_DESCRIPTION and sub.get("id"):
                try:
                    await client.delete_subscription(sub["id"])
                    logger.info("Removed retired AgriSensor subscription for tenant %s", tenant_id)
                except Exception as e:  # noqa: BLE001 — cleanup must not block ensure
                    logger.warning("Could not remove retired subscription: %s", e)
        for sub in existing:
            if sub.get("description") == SUBSCRIPTION_DESCRIPTION:
                await _reconcile_filter(client, sub, tenant_id)
                return None

        callback_url = f"http://greenhouse-bff:8430{NOTIFY_PATH}"
        body = _subscription_body(callback_url)
        location = await client.create_subscription(body)  # Returns Location header
        sub_id = location.rstrip("/").split("/")[-1] if location else ""
        logger.info("Created pathological subscription %s for tenant %s", sub_id, tenant_id)
        return sub_id
    except Exception as e:
        logger.error("Failed to create subscription for tenant %s: %s", tenant_id, e)
        return None
    finally:
        await client.close()
