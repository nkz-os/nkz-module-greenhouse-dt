"""Canonical `DeviceMeasurement` identifiers.

Shared by the API and the worker so both address the same timeseries series.
"""

from __future__ import annotations


def _measurement_urn(device_id: str, tenant_id: str, prop: str) -> str:
    """Build the timeseries key for one (device, property) series.

    telemetry-worker stores `entity_id` = the notified entity's own id, and a
    canonical reading is one entity per device and property:
    `urn:ngsi-ld:DeviceMeasurement:{tenant}:{device}:{property}`. Accepts either a
    full Device URN or a bare device id.
    """
    marker = ":Device:"
    if marker in device_id:
        # Rewrite in place: an external id may itself contain colons, so slicing
        # the URN into segments would truncate it. entity-manager builds the
        # measurement id as `<device urn with Device->DeviceMeasurement>:<prop>`.
        return device_id.replace(marker, ":DeviceMeasurement:", 1) + f":{prop}"
    return f"urn:ngsi-ld:DeviceMeasurement:{tenant_id}:{device_id}:{prop}"


def _zone_link_q(zone_uri: str) -> str:
    """NGSI-LD `q` matching a device linked to `zone_uri` by any accepted name.

    `controlledAsset` is canonical; `hasAgriParcel`/`refAgriParcel` remain for
    devices provisioned before the cutover. One OR'd query rather than three
    sequential ones — these run synchronously inside async handlers, so each
    extra round trip blocks the event loop.
    """
    return "|".join(
        f'{rel}=="{zone_uri}"'
        for rel in ("controlledAsset", "hasAgriParcel", "refAgriParcel")
    )
