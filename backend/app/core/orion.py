"""
Tenant-aware Orion-LD client wrapper.

Uses nkz-platform-sdk OrionClient for automatic header injection
(NGSILD-Tenant, Fiware-Service, @context/Link).
"""

from __future__ import annotations

from typing import Any, Optional

from nkz_platform_sdk import SyncOrionClient, OrionClient
from app.config import settings


def get_orion_client(tenant_id: str) -> SyncOrionClient:
    """Get a synchronous Orion-LD client for the given tenant.
    
    Uses SyncOrionClient from nkz-platform-sdk which handles:
    - NGSILD-Tenant header injection
    - Fiware-Service header
    - @context/Link header (application/ld+json vs application/json)
    """
    return SyncOrionClient(
        tenant_id=tenant_id,
        base_url=settings.orion_ld_url,
    )


async def get_async_orion(tenant_id: str) -> OrionClient:
    """Get an async Orion-LD client for the given tenant."""
    return OrionClient(
        tenant_id=tenant_id,
        base_url=settings.orion_ld_url,
    )


def build_greenhouse_entity(
    greenhouse_id: str,
    name: str,
    description: Optional[str] = None,
    location: Optional[dict] = None,
    ref_agri_farm: Optional[str] = None,
    area: Optional[float] = None,
    height: Optional[float] = None,
    cover_type: Optional[str] = None,
    orientation: Optional[str] = None,
    ref_3d_model: Optional[str] = None,
    model_scale: Optional[float] = None,
    model_rotation: Optional[list[float]] = None,
) -> dict:
    """Build an AgriGreenhouse NGSI-LD entity payload.

    NOTE: @context is mandatory in the body because SyncOrionClient.create_entity()
    sends Content-Type: application/ld+json but does NOT inject @context.
    Uses SDM standard attributes. refAgriGreenhouse is legacy;
    new code uses hasAgriParcel for child relationships.

    Supports optional 3D model via ref3DModel + modelScale + modelRotation
    (heading, pitch, roll in degrees, matching Cesium HeadingPitchRoll).
    """
    entity = {
        "@context": settings.context_url,
        "id": f"urn:ngsi-ld:AgriGreenhouse:{greenhouse_id}",
        "type": "AgriGreenhouse",
        "name": {"type": "Property", "value": name},
    }
    
    if description:
        entity["description"] = {"type": "Property", "value": description}
    
    if location:
        entity["location"] = {
            "type": "GeoProperty",
            "value": location,
        }
    
    if ref_agri_farm:
        entity["refAgriFarm"] = {
            "type": "Relationship",
            "object": ref_agri_farm,
        }
    
    if area is not None:
        entity["area"] = {"type": "Property", "value": area, "unitCode": "MTK"}
    
    if height is not None:
        entity["height"] = {"type": "Property", "value": height, "unitCode": "MT"}
    
    if cover_type:
        entity["coverType"] = {"type": "Property", "value": cover_type}
    
    if orientation:
        entity["orientation"] = {"type": "Property", "value": orientation}

    if ref_3d_model:
        entity["ref3DModel"] = {"type": "Property", "value": ref_3d_model}
    if model_scale is not None:
        entity["modelScale"] = {"type": "Property", "value": model_scale}
    if model_rotation is not None:
        entity["modelRotation"] = {"type": "Property", "value": model_rotation}

    return entity


def build_zone_entity(
    zone_id: str,
    greenhouse_id: str,
    name: str,
    location: Optional[dict] = None,
    area: Optional[float] = None,
) -> dict:
    """Build an AgriParcel zone entity linked to a greenhouse.

    NOTE: @context is mandatory in the body because SyncOrionClient.create_entity()
    sends Content-Type: application/ld+json but does NOT inject @context.
    SDM-standard hasAgriGreenhouse relationship, with refAgriGreenhouse
    as legacy fallback for backward compatibility during migration.
    """
    entity = {
        "@context": settings.context_url,
        "id": f"urn:ngsi-ld:AgriParcel:{zone_id}",
        "type": "AgriParcel",
        "name": {"type": "Property", "value": name},
        "refAgriGreenhouse": {  # Legacy — kept for backward compat during migration
            "type": "Relationship",
            "object": f"urn:ngsi-ld:AgriGreenhouse:{greenhouse_id}",
        },
        "hasAgriGreenhouse": {  # SDM standard (FIWARE Relationship Naming)
            "type": "Relationship",
            "object": f"urn:ngsi-ld:AgriGreenhouse:{greenhouse_id}",
        },
    }
    
    if location:
        entity["location"] = {"type": "GeoProperty", "value": location}
    
    if area is not None:
        entity["area"] = {"type": "Property", "value": area, "unitCode": "MTK"}
    
    return entity
