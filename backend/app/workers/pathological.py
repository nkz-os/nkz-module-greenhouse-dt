# backend/app/workers/pathological.py
"""
Pathological alert worker — evaluates leaf wetness duration per sensor.

Triggered by NGSI-LD subscription notification (via notify endpoint).
Queries TimescaleDB for the last 8 hours of leafWetness data, calculates
accumulated wetness duration, and creates Alert entities if thresholds
are exceeded.

Pathogen thresholds (from config):
- Botrytis: leaf wetness >6h at 15-25°C
- Downy mildew: leaf wetness >4h at 10-22°C
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from nkz_platform_sdk import SyncOrionClient
from nkz_platform_sdk.timescale import TimescaleClient

from app.celery_app import celery_app
from app.config import settings

logger = logging.getLogger(__name__)

LOOKBACK_HOURS = 8


# ── Helpers ───────────────────────────────────────────────────────────────────

def _accumulated_wetness_hours(points: list[dict]) -> float:
    """Calculate total hours of leaf wetness (value > 0) from sorted timeseries.

    Each point is {"ts": iso_str, "value": float}. Points expected oldest first.
    """
    if not points:
        return 0.0
    total = 0.0
    for i in range(1, len(points)):
        prev, curr = points[i - 1], points[i]
        if prev["value"] > 0:
            try:
                t1 = datetime.fromisoformat(prev["ts"])
                t2 = datetime.fromisoformat(curr["ts"])
                total += (t2 - t1).total_seconds() / 3600.0
            except (ValueError, TypeError):
                continue
    return total


def _avg_value(points: list[dict]) -> float | None:
    vals = [p["value"] for p in points if p.get("value") is not None]
    if not vals:
        return None
    return sum(vals) / len(vals)


def _evaluate_pathogens(wetness_hours: float, avg_temp: float | None) -> list[dict]:
    """Evaluate pathogen risk. Returns list of alert defs."""
    alerts: list[dict] = []
    if avg_temp is None:
        return alerts

    # Botrytis
    if (
        wetness_hours >= settings.botrytis_wetness_hours
        and settings.botrytis_temp_min <= avg_temp <= settings.botrytis_temp_max
    ):
        alerts.append(dict(
            subCategory="botrytis_cinerea",
            severity="high",
            description=(
                f"Leaf wetness {wetness_hours:.1f}h at {avg_temp:.1f}°C. "
                "Risk of Botrytis cinerea — ventilate immediately."
            ),
        ))
    elif (
        wetness_hours >= settings.botrytis_wetness_hours
        and avg_temp >= settings.botrytis_temp_min
    ):
        alerts.append(dict(
            subCategory="botrytis_cinerea",
            severity="medium",
            description=(
                f"Leaf wetness {wetness_hours:.1f}h at {avg_temp:.1f}°C. "
                "Moderate Botrytis risk — increase ventilation."
            ),
        ))

    # Downy mildew
    if (
        wetness_hours >= settings.mildew_wetness_hours
        and settings.mildew_temp_min <= avg_temp <= settings.mildew_temp_max
    ):
        alerts.append(dict(
            subCategory="downy_mildew",
            severity="high",
            description=(
                f"Leaf wetness {wetness_hours:.1f}h at {avg_temp:.1f}°C. "
                "Risk of downy mildew — reduce humidity."
            ),
        ))

    return alerts


def _build_alert_entity(
    sensor_id: str,
    greenhouse_id: str,
    sub_category: str,
    severity: str,
    description: str,
    now: datetime,
) -> dict:
    """Build a NGSI-LD Alert entity (spec §2.4).

    NOTE: @context is mandatory in the body because SyncOrionClient.create_entity()
    sends Content-Type: application/ld+json but does NOT inject @context
    (unlike the async OrionClient which calls _ensure_context()).
    """
    alert_id = (
        f"urn:ngsi-ld:Alert:{greenhouse_id}-{sub_category}-"
        f"{now.strftime('%Y%m%d%H%M%S')}"
    )
    return {
        "@context": settings.context_url,
        "id": alert_id,
        "type": "Alert",
        "name": {"type": "Property", "value": f"Risk {sub_category.replace('_', ' ').title()}"},
        "description": {"type": "Property", "value": description},
        "category": {"type": "Property", "value": "phytopathology"},
        "subCategory": {"type": "Property", "value": sub_category},
        "severity": {"type": "Property", "value": severity},
        "status": {"type": "Property", "value": "active"},
        "alertSource": {
            "type": "Relationship",
            "object": f"urn:ngsi-ld:AgriGreenhouse:{greenhouse_id}",
        },
        "dateIssued": {"type": "Property", "value": now.isoformat().replace("+00:00", "Z")},
        "validTo": {
            "type": "Property",
            "value": (now + timedelta(hours=24)).isoformat().replace("+00:00", "Z"),
        },
    }


# ── Celery Task ───────────────────────────────────────────────────────────────

@celery_app.task(bind=True, max_retries=2, default_retry_delay=60)
def evaluate_leaf_wetness(
    self,
    sensor_id: str,
    greenhouse_id: str,
    tenant_id: str,
) -> dict:
    """Evaluate leaf wetness duration for a sensor and create alerts if needed."""
    logger.info(
        "Evaluating leaf wetness: sensor=%s gh=%s tenant=%s",
        sensor_id, greenhouse_id, tenant_id,
    )

    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=LOOKBACK_HOURS)

    # 1. Query TimescaleDB for history
    # NOTE: Use a single coroutine to avoid isolated event loops from
    # multiple asyncio.run() calls (each creates a new loop, causing
    # connection pool conflicts on httpx.AsyncClient).
    async def _fetch():
        ts = TimescaleClient(tenant_id=tenant_id, base_url=settings.timeseries_reader_url)
        try:
            sensor_urn = f"urn:ngsi-ld:AgriSensor:{sensor_id.split(':')[-1]}"
            w = await ts.query(sensor_urn, "leafWetness", since, now)
            t = await ts.query(sensor_urn, "temperature", since, now)
            return w, t
        finally:
            await ts.close()

    try:
        wetness, temps = asyncio.run(_fetch())
    except Exception as exc:
        logger.warning("TimescaleDB query failed for %s: %s", sensor_id, exc)
        wetness, temps = [], []

    # 2. Calculate metrics
    wh = _accumulated_wetness_hours(wetness)
    at = _avg_value(temps)
    logger.info("Sensor %s: %.1fh wet, avg temp=%s", sensor_id, wh, f"{at:.1f}°C" if at else "N/A")

    min_threshold = min(settings.botrytis_wetness_hours, settings.mildew_wetness_hours)
    if wh < min_threshold:
        return {"status": "ok", "alerts_created": 0, "reason": "below_threshold"}

    # 3. Evaluate
    alert_defs = _evaluate_pathogens(wh, at)
    if not alert_defs:
        return {"status": "ok", "alerts_created": 0, "reason": "no_pathogen_match"}

    # 4. Create alerts in Orion-LD
    orion = SyncOrionClient(tenant_id=tenant_id, base_url=settings.orion_ld_url)
    created = 0
    for ad in alert_defs:
        entity = _build_alert_entity(sensor_id, greenhouse_id, ad["subCategory"], ad["severity"], ad["description"], now)
        try:
            orion.create_entity(entity)
            created += 1
            logger.info("Alert created: %s (sev=%s)", entity["id"], ad["severity"])
        except Exception as e:
            logger.error("Failed to create alert: %s", e)

    return {
        "status": "ok",
        "alerts_created": created,
        "greenhouse_id": greenhouse_id,
        "wetness_hours": round(wh, 1),
        "avg_temperature": round(at, 1) if at else None,
    }
