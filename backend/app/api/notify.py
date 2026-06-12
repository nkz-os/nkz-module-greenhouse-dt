# backend/app/api/notify.py
"""
NGSI-LD subscription notification handler.

Receives callbacks from Orion-LD when watched attributes change on AgriSensor
entities (leafWetness, temperature, relativeHumidity). Validates payload,
responds 200 immediately, and enqueues Celery task for pathological evaluation.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.workers.pathological import evaluate_leaf_wetness

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ngsi-ld"])


def _extract_greenhouse_id(entity: dict) -> str | None:
    """Extract greenhouse ID from sensor entity via relationships."""
    # SDM standard: hasAgriParcel
    hp = entity.get("hasAgriParcel", {})
    if isinstance(hp, dict):
        parcel_id = hp.get("object", "")
        if isinstance(parcel_id, str) and parcel_id:
            return parcel_id.split(":")[-1].rsplit("-", 1)[0] if "-" in parcel_id else parcel_id
    # Legacy: refAgriParcel
    rp = entity.get("refAgriParcel", {})
    if isinstance(rp, dict):
        parcel_id = rp.get("object", "")
        if isinstance(parcel_id, str) and parcel_id:
            return parcel_id.split(":")[-1].rsplit("-", 1)[0] if "-" in parcel_id else parcel_id
    return None


@router.post("/api/ngsi-ld/notify")
async def ngsi_ld_notify(request: Request):
    """Receive NGSI-LD subscription notifications from Orion-LD.

    Validates payload, extracts sensor entities, and enqueues Celery tasks
    for pathological evaluation. Returns immediately.
    """
    payload = await request.json()
    if not isinstance(payload, dict):
        return JSONResponse(status_code=400, content={"error": "invalid payload"})
    data = payload.get("data")
    if not isinstance(data, list):
        return JSONResponse(status_code=400, content={"error": "expected data array"})

    # Extract tenant from subscription ID
    sub_id = payload.get("id", "")
    tenant_id = sub_id.rsplit("-", 1)[-1] if "-" in sub_id else ""

    queued = 0
    for entity in data:
        if entity.get("type") != "AgriSensor":
            continue
        sensor_id = entity.get("id", "")
        if not sensor_id:
            continue
        greenhouse_id = _extract_greenhouse_id(entity)
        if not greenhouse_id or not tenant_id:
            logger.warning("Missing context — sensor=%s gh=%s tenant=%s", sensor_id, greenhouse_id, tenant_id)
            continue
        evaluate_leaf_wetness.delay(sensor_id=sensor_id, greenhouse_id=greenhouse_id, tenant_id=tenant_id)
        queued += 1
        logger.debug("Enqueued evaluation for sensor %s", sensor_id)

    return {"status": "accepted", "queued": queued}
