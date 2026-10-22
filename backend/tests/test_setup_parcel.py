"""Activation writes relationships that point at the parcel being activated.

entity-manager sends the parcel id as its full URN; the greenhouse and its zones
must reference that URN as-is, not a second prefix wrapped around it.
"""

import pytest
from fastapi.testclient import TestClient

PARCEL = "urn:ngsi-ld:AgriParcel:0f3c2a1e-5b7d-4c9a-8e21-6d4f0a9b3c55"
SECRET = "test-internal-secret"


class _FakeOrion:
    def __init__(self):
        self.created = []

    def create_entity(self, entity):
        self.created.append(entity)


@pytest.fixture
def orion(monkeypatch):
    from app.api import internal
    from app.config import settings

    fake = _FakeOrion()
    monkeypatch.setattr(settings, "internal_service_secret", SECRET)
    monkeypatch.setattr(internal, "get_orion_client", lambda tenant_id: fake)

    async def _subscription(tenant_id):
        return "urn:ngsi-ld:Subscription:test"

    monkeypatch.setattr(internal, "ensure_pathological_subscription", _subscription)
    return fake


def _activate(parcel_id, zones=1):
    from app.main import app

    return TestClient(app).post(
        "/api/internal/setup-parcel",
        json={"parcel_id": parcel_id, "tenant_id": "tenant-a", "config": {"zones": zones}},
        headers={"X-Internal-Service-Secret": SECRET},
    )


def _target(relationship):
    target = relationship["object"]
    return target[0] if isinstance(target, list) else target


def test_greenhouse_and_zones_point_at_the_parcel_urn(orion):
    response = _activate(PARCEL, zones=2)

    assert response.status_code == 201
    greenhouse, *zones = orion.created
    assert _target(greenhouse["hasAgriParcel"]) == PARCEL
    assert len(zones) == 2
    assert all(_target(zone["hasAgriParcel"]) == PARCEL for zone in zones)


def test_reports_the_zone_ids_it_created(orion):
    response = _activate(PARCEL, zones=2)

    assert response.json()["zones"] == [zone["id"] for zone in orion.created[1:]]


def test_accepts_a_bare_parcel_id(orion):
    _activate("0f3c2a1e-5b7d-4c9a-8e21-6d4f0a9b3c55")

    assert _target(orion.created[0]["hasAgriParcel"]) == PARCEL
