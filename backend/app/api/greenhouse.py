"""
Greenhouse CRUD + state API endpoints.
All endpoints require auth (X-Tenant-ID from api-gateway).
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.config import settings
from app.core.orion import get_orion_client, build_greenhouse_entity
from app.middleware.auth import get_tenant_id, get_user_id, get_user_roles
from app.models.ngsi_ld import (
    AgriGreenhouseCreate,
    AgriGreenhouseResponse,
    DeviceState,
    AlertResponse,
)

router = APIRouter()


@router.get("/", response_model=list[AgriGreenhouseResponse])
async def list_greenhouses(
    tenant_id: str = Depends(get_tenant_id),
):
    """List all AgriGreenhouse entities for the tenant."""
    client = get_orion_client(tenant_id)
    entities = client.query_entities(type="AgriGreenhouse")
    
    result = []
    for e in entities:
        result.append(AgriGreenhouseResponse(
            id=e.get("id", ""),
            name=e.get("name", {}).get("value") if isinstance(e.get("name"), dict) else e.get("name"),
            description=e.get("description", {}).get("value") if isinstance(e.get("description"), dict) else e.get("description"),
            location=e.get("location", {}).get("value") if isinstance(e.get("location"), dict) else None,
            refAgriFarm=e.get("refAgriFarm", {}).get("object") if isinstance(e.get("refAgriFarm"), dict) else None,
            hasAgriParcel=e.get("hasAgriParcel", {}).get("object") if isinstance(e.get("hasAgriParcel"), dict) else None,
            area=e.get("area", {}).get("value") if isinstance(e.get("area"), dict) else None,
            coverType=e.get("coverType", {}).get("value") if isinstance(e.get("coverType"), dict) else None,
            height=e.get("height", {}).get("value") if isinstance(e.get("height"), dict) else None,
            orientation=e.get("orientation", {}).get("value") if isinstance(e.get("orientation"), dict) else None,
            ref3DModel=e.get("ref3DModel", {}).get("value") if isinstance(e.get("ref3DModel"), dict) else None,
            modelScale=e.get("modelScale", {}).get("value") if isinstance(e.get("modelScale"), dict) else None,
            modelRotation=e.get("modelRotation", {}).get("value") if isinstance(e.get("modelRotation"), dict) else None,
        ))
    return result


@router.get("/{greenhouse_id}", response_model=AgriGreenhouseResponse)
async def get_greenhouse(
    greenhouse_id: str,
    tenant_id: str = Depends(get_tenant_id),
):
    """Get a single AgriGreenhouse by ID."""
    urn = f"urn:ngsi-ld:AgriGreenhouse:{greenhouse_id}"
    client = get_orion_client(tenant_id)
    
    try:
        entity = client.get_entity(urn)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Greenhouse {greenhouse_id} not found")
    
    return AgriGreenhouseResponse(
        id=entity.get("id", ""),
        name=entity.get("name", {}).get("value") if isinstance(entity.get("name"), dict) else entity.get("name"),
        description=entity.get("description", {}).get("value") if isinstance(entity.get("description"), dict) else entity.get("description"),
        location=entity.get("location", {}).get("value") if isinstance(entity.get("location"), dict) else None,
        area=entity.get("area", {}).get("value") if isinstance(entity.get("area"), dict) else None,
        height=entity.get("height", {}).get("value") if isinstance(entity.get("height"), dict) else None,
        coverType=entity.get("coverType", {}).get("value") if isinstance(entity.get("coverType"), dict) else None,
        orientation=entity.get("orientation", {}).get("value") if isinstance(entity.get("orientation"), dict) else None,
        ref3DModel=entity.get("ref3DModel", {}).get("value") if isinstance(entity.get("ref3DModel"), dict) else None,
        modelScale=entity.get("modelScale", {}).get("value") if isinstance(entity.get("modelScale"), dict) else None,
        modelRotation=entity.get("modelRotation", {}).get("value") if isinstance(entity.get("modelRotation"), dict) else None,
        refAgriFarm=entity.get("refAgriFarm", {}).get("object") if isinstance(entity.get("refAgriFarm"), dict) else None,
        hasAgriParcel=entity.get("hasAgriParcel", {}).get("object") if isinstance(entity.get("hasAgriParcel"), dict) else None,
    )


@router.post("/", status_code=201)
async def create_greenhouse(
    body: AgriGreenhouseCreate,
    tenant_id: str = Depends(get_tenant_id),
    user_id: str = Depends(get_user_id),
):
    """Create a new AgriGreenhouse entity in Orion-LD."""
    client = get_orion_client(tenant_id)
    
    entity = build_greenhouse_entity(
        greenhouse_id=body.id,
        name=body.name,
        description=body.description,
        location=body.location,
        ref_agri_farm=body.refAgriFarm,
        area=body.area,
        cover_type=body.coverType,
        height=body.height,
        orientation=body.orientation,
        ref_3d_model=body.ref3DModel,
        model_scale=body.modelScale,
        model_rotation=body.modelRotation,
    )
    
    try:
        client.create_entity(entity)
    except Exception as e:
        raise HTTPException(status_code=409, detail=f"Failed to create greenhouse: {str(e)}")
    
    return {"id": f"urn:ngsi-ld:AgriGreenhouse:{body.id}", "status": "created"}


@router.delete("/{greenhouse_id}", status_code=204)
async def delete_greenhouse(
    greenhouse_id: str,
    tenant_id: str = Depends(get_tenant_id),
):
    """Delete an AgriGreenhouse entity."""
    urn = f"urn:ngsi-ld:AgriGreenhouse:{greenhouse_id}"
    client = get_orion_client(tenant_id)
    
    try:
        client.delete_entity(urn)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Greenhouse {greenhouse_id} not found: {str(e)}")
    
    return None


@router.get("/{greenhouse_id}/state")
async def get_greenhouse_state(
    greenhouse_id: str,
    tenant_id: str = Depends(get_tenant_id),
):
    """Return aggregated current state of a greenhouse: sensor readings by zone.
    
    Queries Orion-LD for the Device entities linked to the greenhouse's zones,
    then their DeviceMeasurement readings. Returns temperature, humidity, VPD and
    leaf wetness per zone.
    """
    client = get_orion_client(tenant_id)
    urn = f"urn:ngsi-ld:AgriGreenhouse:{greenhouse_id}"
    
    # Get the greenhouse entity to find its zones
    try:
        greenhouse = client.get_entity(urn)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Greenhouse {greenhouse_id} not found")
    
    # Find zones via hasAgriParcel or legacy refAgriGreenhouse
    zone_uris = []
    has_parcel = greenhouse.get("hasAgriParcel", {})
    if isinstance(has_parcel, dict) and has_parcel.get("type") == "Relationship":
        objects = has_parcel.get("object", [])
        zone_uris = objects if isinstance(objects, list) else [objects]
    
    if not zone_uris:
        # Fallback: query AgriParcelZone linked to this greenhouse
        for e in client.query_entities(type="AgriParcelZone", q=f"hasAgriGreenhouse==\"{urn}\""):
            zone_uris.append(e["id"])
    
    # Get sensors for each zone
    zones_state = []
    for zone_uri in zone_uris:
        # Try new relationship name first
        # controlledAsset is canonical; ref*/has* are the migration window
        sensors = []
        for rel in ("controlledAsset", "hasAgriParcel", "refAgriParcel"):
            sensors = client.query_entities(
                type="Device",
                q=f"{rel}==\"{zone_uri}\"",
            )
            if sensors:
                break

        # Readings are separate entities pointing back at the device. One query
        # per zone, OR-joined over its devices — same order as the sensor query.
        readings = _readings_by_device(client, [s.get("id", "") for s in sensors])

        zone_sensors = []
        for s in sensors:
            device_id = s.get("id", "")
            values = readings.get(device_id, {})
            zone_sensors.append(DeviceState(
                id=device_id,
                name=s.get("name", {}).get("value") if isinstance(s.get("name"), dict) else s.get("name"),
                zone=zone_uri,
                temperature=values.get("temperature"),
                relativeHumidity=values.get("relativeHumidity"),
                leafWetness=values.get("leafWetness"),
                solarIrradiance=values.get("solarIrradiance"),
                co2=values.get("co2"),
                location=s.get("location", {}).get("value") if isinstance(s.get("location"), dict) else None,
            ))
        
        # Compute zone aggregates
        temps = [s.temperature for s in zone_sensors if s.temperature is not None]
        hums = [s.relativeHumidity for s in zone_sensors if s.relativeHumidity is not None]
        
        zones_state.append({
            "zone_id": zone_uri,
            "sensor_count": len(zone_sensors),
            "sensors": [s.model_dump() for s in zone_sensors],
            "aggregates": {
                "avg_temperature": round(sum(temps) / len(temps), 1) if temps else None,
                "avg_humidity": round(sum(hums) / len(hums), 1) if hums else None,
                "min_temperature": min(temps) if temps else None,
                "max_temperature": max(temps) if temps else None,
            },
        })
    
    return {
        "greenhouse_id": greenhouse_id,
        "zones": zones_state,
        "total_sensors": sum(z["sensor_count"] for z in zones_state),
    }


@router.get("/{greenhouse_id}/alerts", response_model=list[AlertResponse])
async def get_greenhouse_alerts(
    greenhouse_id: str,
    tenant_id: str = Depends(get_tenant_id),
    status: Optional[str] = Query(default="active", description="Filter by status"),
):
    """Return alerts for a greenhouse."""
    urn = f"urn:ngsi-ld:AgriGreenhouse:{greenhouse_id}"
    client = get_orion_client(tenant_id)
    
    alerts = client.query_entities(
        type="Alert",
        q=f"alertSource==\"{urn}\"",
    )
    
    # Filter by status if provided
    if status:
        alerts = [a for a in alerts if a.get("status", {}).get("value") == status]
    
    result = []
    for a in alerts:
        result.append(AlertResponse(
            id=a.get("id", ""),
            name=a.get("name", {}).get("value"),
            description=a.get("description", {}).get("value"),
            location=a.get("location", {}).get("value") if isinstance(a.get("location"), dict) else None,
            alertSource=a.get("alertSource", {}).get("object"),
            category=a.get("category", {}).get("value"),
            subCategory=a.get("subCategory", {}).get("value"),
            severity=a.get("severity", {}).get("value"),
            status=a.get("status", {}).get("value"),
        ))
    
    return result


def _readings_by_device(client, device_ids: list[str]) -> dict[str, dict]:
    """Latest reading per (device, property), from the devices' DeviceMeasurements.

    A `DeviceMeasurement` names its property in `controlledProperty` (a VALUE, not
    an attribute key) and holds the reading in `numValue`/`textValue`. Its device
    is `refDevice` — never the last segment of its own id, which is the property
    name. Later `dateObserved` wins when a device reports the same property twice.
    """
    ids = [d for d in device_ids if d]
    if not ids:
        return {}

    measurements = client.query_entities(
        type="DeviceMeasurement",
        q="|".join(f'refDevice=="{device_id}"' for device_id in ids),
    )

    latest: dict[str, dict] = {}
    seen_at: dict[tuple[str, str], str] = {}
    for m in measurements or []:
        ref = m.get("refDevice")
        device_id = ref.get("object") if isinstance(ref, dict) else ref
        if not isinstance(device_id, str) or not device_id:
            continue

        prop = m.get("controlledProperty")
        name = prop.get("value") if isinstance(prop, dict) else prop
        if not isinstance(name, str) or not name:
            continue

        value = None
        for value_key in ("numValue", "textValue"):
            attr = m.get(value_key)
            candidate = attr.get("value") if isinstance(attr, dict) else attr
            if candidate is not None:
                value = candidate
                break
        if value is None:
            continue

        observed = m.get("dateObserved")
        observed_at = observed.get("value") if isinstance(observed, dict) else observed
        observed_at = str(observed_at or "")
        key = (device_id, name)
        if key in seen_at and observed_at <= seen_at[key]:
            continue
        seen_at[key] = observed_at
        latest.setdefault(device_id, {})[name] = value

    return latest
