# backend/app/core/subscriptions.py
"""
NGSI-LD subscription management for greenhouse-dt.

Creates and ensures per-tenant subscriptions for pathological monitoring.
One subscription per tenant (watches all AgriSensor entities) — filtering
happens in the notify handler.
"""

from __future__ import annotations

import logging

from nkz_platform_sdk import OrionClient

from app.config import settings

logger = logging.getLogger(__name__)

SUBSCRIPTION_DESCRIPTION = "nkz-module: AgriSensor -> greenhouse-dt (pathological)"
NOTIFY_PATH = "/api/ngsi-ld/notify"


def _subscription_body(callback_url: str) -> dict:
    return {
        "type": "Subscription",
        "description": SUBSCRIPTION_DESCRIPTION,
        "entities": [{"type": "AgriSensor"}],
        "watchedAttributes": ["leafWetness", "temperature", "relativeHumidity"],
        "notification": {
            "endpoint": {"uri": callback_url, "accept": "application/json"},
            "format": "normalized",
        },
        "throttling": 60,
        "isActive": True,
    }


async def ensure_pathological_subscription(tenant_id: str) -> str | None:
    """Create or skip the pathological subscription for a tenant.

    Idempotent — checks by description before creating.
    Returns the subscription ID if created, None if already exists.
    """
    client = OrionClient(tenant_id=tenant_id, base_url=settings.orion_ld_url)
    try:
        existing = await client.query_subscriptions(limit=200)
        for sub in existing:
            if sub.get("description") == SUBSCRIPTION_DESCRIPTION:
                logger.info("Subscription already exists for tenant %s", tenant_id)
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
