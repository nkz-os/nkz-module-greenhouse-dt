"""
Internal endpoints for module activation.

Called by entity-manager during parcel activation flow.
Authenticated by X-Internal-Service-Secret (NOT tenant JWT).
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

import logging

from app.config import settings
from app.core.orion import get_orion_client, build_greenhouse_entity, build_zone_entity
from app.core.subscriptions import ensure_pathological_subscription
from app.middleware.auth import verify_internal_secret

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/setup-parcel", status_code=201)
async def setup_parcel(
    request: Request,
    _: None = Depends(verify_internal_secret),
):
    """Activate greenhouse DT for a parcel.
    
    Called by entity-manager: POST /api/entities/parcels/{id}/modules/greenhouse-dt/activate
    which then calls this internal endpoint.
    
    Creates:
    1. AgriGreenhouse entity
    2. Zone sub-entities (AgriParcel children)
    3. Subscriptions for telemetry (stub)
    4. IoT Agent device provisioning (stub)
    """
    body = await request.json()
    parcel_id = body.get("parcel_id")
    tenant_id = body.get("tenant_id")
    config = body.get("config", {})
    
    if not parcel_id or not tenant_id:
        raise HTTPException(status_code=400, detail="parcel_id and tenant_id are required")
    
    client = get_orion_client(tenant_id)
    
    greenhouse_id = parcel_id.split(":")[-1]  # Derive from parcel
    
    # 1. Create AgriGreenhouse entity
    gh_entity = build_greenhouse_entity(
        greenhouse_id=greenhouse_id,
        name=config.get("name", f"Greenhouse {greenhouse_id}"),
        description=config.get("description"),
        cover_type=config.get("cover_type", "polyethylene"),
        orientation=config.get("orientation", "N-S"),
        area=config.get("area_sqm"),
    )
    gh_entity["hasAgriParcel"] = {
        "type": "Relationship",
        "object": [f"urn:ngsi-ld:AgriParcel:{parcel_id}"],
    }
    
    try:
        client.create_entity(gh_entity)
    except Exception as e:
        raise HTTPException(status_code=409, detail=f"Failed to create greenhouse: {str(e)}")
    
    gh_urn = f"urn:ngsi-ld:AgriGreenhouse:{greenhouse_id}"
    
    # 2. Create zone sub-entities (optional, based on config)
    zones = []
    num_zones = config.get("zones", 1)
    zone_names = ["NO", "NE", "SO", "SE"][:num_zones]
    
    for i, zn in enumerate(zone_names):
        zone_id = f"{greenhouse_id}-zone-{zn}"
        zone_entity = build_zone_entity(
            zone_id=zone_id,
            greenhouse_id=greenhouse_id,
            name=f"Cuadrante {zn}",
        )
        # Link zone to parent parcel too (for backward compat)
        zone_entity["hasAgriParcel"] = {
            "type": "Relationship",
            "object": f"urn:ngsi-ld:AgriParcel:{parcel_id}",
        }
        
        try:
            client.create_entity(zone_entity)
            zones.append(f"urn:ngsi-ld:AgriParcel:{zone_id}")
        except Exception as e:
            err_str = str(e).lower()
            if "already exists" in err_str or "conflict" in err_str:
                logger.debug("Zone %s already exists", zone_id)
            else:
                logger.warning("Failed to create zone %s: %s", zone_id, e)
    
    # 3. Create NGSI-LD subscription for pathological monitoring
    sub_id = await ensure_pathological_subscription(tenant_id)
    subscriptions = [sub_id] if sub_id else []

    # Determine setup_status: ok only if greenhouse entity created + subscription exists
    setup_status = "ok" if subscriptions else "degraded"

    # 4. IoT Agent device provisioning (stub — MVP logs instead of provisioning)
    
    return {
        "greenhouse_id": gh_urn,
        "zones": zones,
        "subscriptions": subscriptions,
        "iot_devices_provisioned": 0,
        "setup_status": setup_status,
    }
