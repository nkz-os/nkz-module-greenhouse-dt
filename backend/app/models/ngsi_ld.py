"""
Pydantic models for NGSI-LD entities used by Greenhouse DT.
These match the types defined in nkz/apps/host/src/types/ngsi-ld.ts.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class NGSIProperty(BaseModel):
    type: str = "Property"
    value: Any
    unitCode: Optional[str] = None
    observedAt: Optional[datetime] = None


class NGSIGeoProperty(BaseModel):
    type: str = "GeoProperty"
    value: dict  # {"type": "Point"|"Polygon", "coordinates": [...]}


class NGSIRelationship(BaseModel):
    type: str = "Relationship"
    object: str
    observedAt: Optional[datetime] = None


# ── AgriGreenhouse ────────────────────────────────────────────────────────────

class AgriGreenhouseCreate(BaseModel):
    """Payload for creating an AgriGreenhouse entity."""
    id: str  # urn:ngsi-ld:AgriGreenhouse:<id>
    name: str
    description: Optional[str] = None
    location: dict  # GeoJSON geometry
    height: Optional[float] = None  # meters, for volume calculations
    refAgriFarm: Optional[str] = None
    hasAgriParcel: Optional[list[str]] = None
    area: Optional[float] = None
    coverType: Optional[str] = None  # polyethylene, glass, polycarbonate
    orientation: Optional[str] = None  # N-S, E-W
    ventilationType: Optional[str] = None
    shadingType: Optional[str] = None
    heatingType: Optional[str] = None


class AgriGreenhouseResponse(BaseModel):
    id: str
    type: str = "AgriGreenhouse"
    name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[dict] = None
    refAgriFarm: Optional[str] = None
    hasAgriParcel: Optional[list[str]] = None
    height: Optional[float] = None
    area: Optional[float] = None
    coverType: Optional[str] = None
    orientation: Optional[str] = None
    ventilationType: Optional[str] = None
    shadingType: Optional[str] = None
    heatingType: Optional[str] = None
    rowSpacing: Optional[float] = None
    plantDensity: Optional[float] = None


# ── AgriSensor (for internal sensors) ─────────────────────────────────────────
# AgriSensor is a first-class entity type in the platform (see ngsi-ld.ts:131).
# It links to the physical Device via hasDevice.

class AgriSensorState(BaseModel):
    """Current state of a sensor inside the greenhouse."""
    id: str
    name: Optional[str] = None
    zone: Optional[str] = None  # refAgriParcel or hasAgriParcel
    temperature: Optional[float] = None
    relativeHumidity: Optional[float] = None
    leafWetness: Optional[int] = None  # 0 or 1
    solarIrradiance: Optional[float] = None
    co2: Optional[float] = None
    batteryLevel: Optional[float] = None
    dateObserved: Optional[datetime] = None
    hasDevice: Optional[str] = None
    location: Optional[dict] = None  # GeoJSON Point


# ── Alert ─────────────────────────────────────────────────────────────────────

class AlertCreate(BaseModel):
    """Payload for creating a phytopathology alert."""
    id: str
    name: str
    description: str
    location: dict
    alertSource: str  # AgriGreenhouse ID
    category: str = "phytopathology"
    subCategory: str  # e.g. "botrytis_cinerea"
    severity: str = "medium"  # low, medium, high, critical
    status: str = "active"
    validTo: Optional[datetime] = None


class AlertResponse(BaseModel):
    id: str
    type: str = "Alert"
    name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[dict] = None
    alertSource: Optional[str] = None
    category: Optional[str] = None
    subCategory: Optional[str] = None
    severity: Optional[str] = None
    dateIssued: Optional[datetime] = None
    validTo: Optional[datetime] = None
    status: Optional[str] = None


# ── Zone (AgriParcel child) ───────────────────────────────────────────────────

class GreenhouseZone(BaseModel):
    """A sub-zone/cuadrante of a greenhouse, modeled as AgriParcel."""
    id: str
    name: str
    area: Optional[float] = None
    location: Optional[dict] = None
    hasAgriCrop: Optional[str] = None
    hasAgriGreenhouse: Optional[str] = None  # or legacy refAgriGreenhouse
