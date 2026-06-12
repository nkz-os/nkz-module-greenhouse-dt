"""
State reconstruction endpoint for greenhouse DT.
GET /api/greenhouse/{id}/state/reconstruct
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

from nkz_platform_sdk import TimescaleClient

from app.config import settings
from app.core.orion import get_orion_client
from app.middleware.auth import get_tenant_id
from app.services.interpolation import interpolate_to_grid
from app.services.heatmap_generator import (
    grid_to_png_bytes,
    grid_to_cog_bytes,
    upload_heatmap,
    get_cached_heatmap_urls,
)

logger = logging.getLogger(__name__)

router = APIRouter()

VALID_VARIABLES = {"temperature", "humidity", "leafWetness", "co2", "par"}


@router.get("/{greenhouse_id}/state/reconstruct")
async def reconstruct_state(
    greenhouse_id: str,
    timestamp: str = Query(..., description="ISO8601 timestamp"),
    variable: str = Query("temperature", description="Variable to interpolate"),
    resolution: int = Query(50, ge=10, le=200, description="Grid cells per axis"),
    tenant_id: str = Depends(get_tenant_id),
) -> dict:
    """Reconstruct greenhouse state at a given timestamp.

    Queries Orion-LD for sensors + TimescaleDB for historical readings,
    interpolates spatially, generates PNG heatmap + COG, uploads to MinIO.
    """
    # Validate variable
    if variable not in VALID_VARIABLES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid variable '{variable}'. Valid: {', '.join(sorted(VALID_VARIABLES))}",
        )

    client = get_orion_client(tenant_id)
    gh_urn = f"urn:ngsi-ld:AgriGreenhouse:{greenhouse_id}"

    # 1. Get greenhouse entity
    try:
        greenhouse = client.get_entity(gh_urn)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Greenhouse {greenhouse_id} not found")

    # 2. Find zones / sensors
    zone_uris = _get_zone_uris(greenhouse)
    sensors = _get_sensors_for_zones(client, zone_uris)

    if len(sensors) < 3:
        return {
            "greenhouse_id": gh_urn,
            "timestamp": timestamp,
            "variable": variable,
            "sensor_count": len(sensors),
            "display_url": None,
            "cog_url": None,
            "bounds": None,
            "stats": None,
            "detail": "insufficient_sensors",
        }

    # 3. Check cache
    cached = get_cached_heatmap_urls(
        tenant_id=tenant_id,
        greenhouse_id=greenhouse_id,
        variable=variable,
        timestamp=timestamp,
        minio_endpoint=settings.minio_endpoint,
        minio_bucket=settings.minio_bucket,
        minio_access_key=settings.minio_access_key,
        minio_secret_key=settings.minio_secret_key,
    )
    if cached:
        logger.debug("Cache hit for %s/%s/%s", greenhouse_id, variable, timestamp)
        return {
            "greenhouse_id": gh_urn,
            "timestamp": timestamp,
            "variable": variable,
            "sensor_count": len(sensors),
            **cached,
            "bounds": None,
            "stats": None,
            "detail": "cached",
        }

    # 4. Query TimescaleDB for sensor readings at timestamp
    ts_client = TimescaleClient(tenant_id, base_url=settings.timeseries_reader_url)

    points = []
    for s in sensors:
        sensor_id = s["id"].rsplit(":", 1)[-1]
        loc = s.get("location", {}).get("value", {})
        coords = loc.get("coordinates", [None, None])
        try:
            readings = await ts_client.query(
                entity_id=sensor_id,
                attr_name=variable,
                from_date=timestamp,
                to_date=timestamp,
                limit=1,
            )
        except Exception as exc:
            logger.warning("Failed to query TS for %s: %s", sensor_id, exc)
            readings = []

        if readings and coords[0] is not None:
            points.append({
                "x": coords[0],
                "y": coords[1],
                "value": readings[-1]["value"],
            })

    if len(points) < 3:
        return {
            "greenhouse_id": gh_urn,
            "timestamp": timestamp,
            "variable": variable,
            "sensor_count": len(points),
            "display_url": None,
            "cog_url": None,
            "bounds": None,
            "stats": None,
            "detail": "insufficient_readings",
        }

    # 5. Interpolate (CPU-bound -> offload to thread)
    grid_result = await run_in_threadpool(interpolate_to_grid, points, resolution)

    if "error" in grid_result:
        return {
            "greenhouse_id": gh_urn,
            "timestamp": timestamp,
            "variable": variable,
            "sensor_count": len(points),
            "display_url": None,
            "cog_url": None,
            "bounds": None,
            "stats": None,
            "detail": grid_result["error"],
        }

    # 6. Generate PNG + COG (CPU-bound -> offload)
    png_bytes = await run_in_threadpool(
        grid_to_png_bytes, grid_result["grid"], grid_result["bounds"], variable
    )
    cog_bytes = await run_in_threadpool(
        grid_to_cog_bytes, grid_result["grid"], grid_result["bounds"]
    )

    # 7. Upload to MinIO (sync I/O -> offload)
    urls = await run_in_threadpool(
        upload_heatmap,
        tenant_id, greenhouse_id, variable, timestamp,
        png_bytes, cog_bytes,
        settings.minio_endpoint, settings.minio_bucket,
        settings.minio_access_key, settings.minio_secret_key,
    )

    return {
        "greenhouse_id": gh_urn,
        "timestamp": timestamp,
        "variable": variable,
        "sensor_count": len(points),
        **urls,
        "bounds": grid_result["bounds"],
        "stats": grid_result["stats"],
        "detail": "generated",
    }


def _get_zone_uris(greenhouse: dict) -> list[str]:
    """Extract zone URIs from greenhouse entity (hasAgriParcel or legacy)."""
    has_parcel = greenhouse.get("hasAgriParcel", {})
    if isinstance(has_parcel, dict) and has_parcel.get("type") == "Relationship":
        objects = has_parcel.get("object", [])
        if isinstance(objects, list):
            return objects
        return [objects]
    return []


def _get_sensors_for_zones(client, zone_uris: list[str]) -> list[dict]:
    """Get all AgriSensor entities for given zones.

    Queries using BOTH new (hasAgriParcel) and legacy (refAgriParcel)
    relationship names per AGENTS.md FIWARE Relationship Naming rule.
    """
    sensors = []
    for zone_uri in zone_uris:
        # Try new relationship name first
        zone_sensors = client.query_entities(
            type="AgriSensor",
            q=f"hasAgriParcel==\"{zone_uri}\"",
        )
        if not zone_sensors:
            # Fallback to legacy refAgriParcel
            zone_sensors = client.query_entities(
                type="AgriSensor",
                q=f"refAgriParcel==\"{zone_uri}\"",
            )
        sensors.extend(zone_sensors)
    return sensors
