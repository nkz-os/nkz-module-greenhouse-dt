"""The notify handler must read the canonical `DeviceMeasurement` shape.

The retired `AgriSensor` carried its readings as attributes and its zone as a
`hasAgriParcel` relationship. A `DeviceMeasurement` carries neither: the property
name is the VALUE of `controlledProperty`, the reading is in `numValue`, and the
zone is one hop away on the device's `controlledAsset`.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

DEVICE_URN = "urn:ngsi-ld:Device:acme:gh42-temp-01"
ZONE_URN = "urn:ngsi-ld:AgriParcel:acme:gh42-zone-north"


def _measurement(**overrides):
    entity = {
        "id": "urn:ngsi-ld:DeviceMeasurement:acme:gh42-temp-01:leafWetness",
        "type": "DeviceMeasurement",
        "refDevice": {"type": "Relationship", "object": DEVICE_URN},
        "controlledProperty": {"type": "Property", "value": "leafWetness"},
        "numValue": {"type": "Property", "value": 1},
        "dateObserved": {"type": "Property", "value": "2026-08-29T09:00:00Z"},
    }
    entity.update(overrides)
    return entity


def _post(entity, device=None):
    """POST one notification; `device` is what the broker returns for refDevice."""
    if device is None:
        device = {
            "id": DEVICE_URN,
            "type": "Device",
            "controlledAsset": {"type": "Relationship", "object": ZONE_URN},
        }
    from app.main import app

    with patch("app.api.notify.OrionClient") as orion_cls, patch(
        "app.api.notify.evaluate_leaf_wetness"
    ) as task:
        client = AsyncMock()
        client.get_entity.return_value = device
        orion_cls.return_value = client
        resp = TestClient(app).post(
            "/api/ngsi-ld/notify",
            json={"data": [entity]},
            headers={"NGSILD-Tenant": "acme"},
        )
        return resp, task


def test_enqueues_with_device_and_greenhouse_resolved_through_the_device():
    resp, task = _post(_measurement())
    assert resp.status_code == 204
    task.delay.assert_called_once_with(
        sensor_id=DEVICE_URN, greenhouse_id="gh42", tenant_id="acme"
    )


def test_untracked_property_is_ignored():
    """`batteryLevel` is a real reading, just not one this module evaluates."""
    resp, task = _post(
        _measurement(controlledProperty={"type": "Property", "value": "batteryLevel"})
    )
    assert resp.status_code == 204
    task.delay.assert_not_called()


@pytest.mark.parametrize(
    "broken",
    [{"refDevice": None}, {"controlledProperty": None}],
    ids=["no-refDevice", "no-property-name"],
)
def test_incomplete_measurement_enqueues_nothing(broken):
    entity = _measurement()
    for key in broken:
        entity.pop(key, None)
    resp, task = _post(entity)
    assert resp.status_code == 204
    task.delay.assert_not_called()


def test_device_without_a_zone_enqueues_nothing():
    """No zone means no greenhouse. Never a guess."""
    resp, task = _post(_measurement(), device={"id": DEVICE_URN, "type": "Device"})
    assert resp.status_code == 204
    task.delay.assert_not_called()


def test_legacy_relationship_names_still_resolve():
    """Devices provisioned before the cutover still carry hasAgriParcel."""
    resp, task = _post(
        _measurement(),
        device={
            "id": DEVICE_URN,
            "type": "Device",
            "hasAgriParcel": {"type": "Relationship", "object": ZONE_URN},
        },
    )
    assert resp.status_code == 204
    task.delay.assert_called_once()
