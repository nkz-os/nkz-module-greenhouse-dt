# backend/app/api/notify.py
"""
NGSI-LD subscription notification handler.

Receives callbacks from Orion-LD when a DeviceMeasurement reading changes.
Validates payload, responds 204 immediately, and enqueues a Celery task for
pathological evaluation.

A DeviceMeasurement inverts the shape the retired AgriSensor used: the measured
property is the VALUE of `controlledProperty` (not an attribute key), the reading
sits in `numValue`/`textValue`, the device is the `refDevice` relationship — NOT
the last segment of the entity id, which is the property name — and the zone is
one hop further, on the device's `controlledAsset`.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from nkz_platform_sdk import OrionClient

from app.config import settings
from app.workers.pathological import evaluate_leaf_wetness

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ngsi-ld"])


# Properties this module evaluates. Anything else is a real reading we ignore.
_TRACKED_PROPERTIES = frozenset({"leafWetness", "temperature", "relativeHumidity"})


def _read_measurement(entity: dict) -> tuple[str | None, str | None]:
    """Pull (device_urn, property_name) out of a `DeviceMeasurement`.

    Returns (None, None) when either is missing — nothing safe to act on.
    """
    ref_device = entity.get("refDevice")
    if not isinstance(ref_device, dict):
        return None, None
    device_urn = ref_device.get("object")
    if not isinstance(device_urn, str) or not device_urn:
        return None, None

    controlled_property = entity.get("controlledProperty")
    if not isinstance(controlled_property, dict):
        return None, None
    name = controlled_property.get("value")
    if not isinstance(name, str) or not name:
        return None, None

    return device_urn, name


def _greenhouse_from_zone(zone_urn: str) -> str | None:
    """Zone parcels are named {greenhouse_id}-zone-{quadrant} or similar.

    Case-insensitive search for the "-zone-" suffix, so any variant (zone, Zone,
    ZONE) is handled regardless of hyphens in the greenhouse id itself.
    """
    ZONE_SUFFIX = "-zone-"
    parcel_id = zone_urn.split(":")[-1]
    zone_idx = parcel_id.lower().find(ZONE_SUFFIX)
    if zone_idx != -1:
        return parcel_id[:zone_idx]
    logger.debug(
        "Parcel %s is not a zone entity (no '%s' found), skipping greenhouse extraction",
        parcel_id,
        ZONE_SUFFIX,
    )
    return None


async def _resolve_greenhouse(device_urn: str, tenant_id: str) -> str | None:
    """Resolve a device's greenhouse through its zone parcel.

    The measurement carries no zone, so this takes the broker hop:
    DeviceMeasurement.refDevice -> Device.controlledAsset -> zone parcel.
    `hasAgriParcel`/`refAgriParcel` remain as fallbacks for devices provisioned
    before the cutover. Returns None when the device is unlinked or unreachable.
    """
    client = OrionClient(tenant_id=tenant_id, base_url=settings.orion_ld_url)
    try:
        device = await client.get_entity(device_urn)
    except Exception as exc:  # noqa: BLE001 — an unreachable broker is not a zone
        logger.warning("Cannot read device %s: %s", device_urn, exc)
        return None
    finally:
        try:
            await client.close()
        except Exception:  # noqa: BLE001
            pass

    if not isinstance(device, dict):
        return None
    for attr in ("controlledAsset", "hasAgriParcel", "refAgriParcel"):
        link = device.get(attr)
        target = link.get("object") if isinstance(link, dict) else link
        if isinstance(target, str) and target:
            return _greenhouse_from_zone(target)
    return None


@router.post("/api/ngsi-ld/notify", status_code=204)
async def ngsi_ld_notify(request: Request):
    """Receive NGSI-LD subscription notifications from Orion-LD.

    Validates payload, extracts sensor entities, and enqueues Celery tasks
    for pathological evaluation. Returns immediately.

    Answers 204 with no body: Orion-LD looks for a capitalised ``Content-Length:``
    with a case-sensitive ``strstr`` and only waives it on 204, while uvicorn always
    emits the header lower-cased. A 200 + body is therefore counted as a failed
    notification, and three consecutive failures deactivate the subscription.
    Malformed payloads still answer 400 so the failure stays visible.
    """
    payload = await request.json()
    if not isinstance(payload, dict):
        return JSONResponse(status_code=400, content={"error": "invalid payload"})
    data = payload.get("data")
    if not isinstance(data, list):
        return JSONResponse(status_code=400, content={"error": "expected data array"})

    # Extract tenant from NGSILD-Tenant header (Orion-LD includes it in callbacks)
    tenant_id = request.headers.get("NGSILD-Tenant", "")

    queued = 0
    for entity in data:
        if entity.get("type") != "DeviceMeasurement":
            continue
        device_urn, prop = _read_measurement(entity)
        if device_urn is None:
            logger.debug(
                "Skipping %s: missing refDevice or controlledProperty",
                entity.get("id", "<no id>"),
            )
            continue
        if prop not in _TRACKED_PROPERTIES:
            continue
        if not tenant_id:
            logger.warning("Notification without a tenant — device=%s", device_urn)
            continue
        greenhouse_id = await _resolve_greenhouse(device_urn, tenant_id)
        if not greenhouse_id:
            logger.warning("No greenhouse for device=%s tenant=%s", device_urn, tenant_id)
            continue
        evaluate_leaf_wetness.delay(
            sensor_id=device_urn, greenhouse_id=greenhouse_id, tenant_id=tenant_id
        )
        queued += 1
        logger.debug("Enqueued evaluation for device %s", device_urn)

    logger.info("Notification processed: %d evaluation(s) queued", queued)
