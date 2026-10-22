# backend/tests/test_api.py
"""Smoke tests for the greenhouse-dt backend."""

import pytest
from fastapi.testclient import TestClient

from app.main import app, lifespan

client = TestClient(app)


def test_health():
    """Health endpoint returns 200 with service name."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "greenhouse-dt"


def test_readyz_down():
    """Readyz returns 503 when Orion-LD is unreachable."""
    response = client.get("/readyz")
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "not_ready"
    assert data["checks"]["orion_ld"] == "down"


@pytest.mark.asyncio
async def test_lifespan_fails_without_postgres_url():
    """Lifespan raises RuntimeError if POSTGRES_URL is not set."""
    from app.config import settings

    old_url = settings.postgres_url
    old_secret = settings.internal_service_secret
    settings.postgres_url = ""
    settings.internal_service_secret = ""
    try:
        with pytest.raises(RuntimeError, match="POSTGRES_URL is not set"):
            async with lifespan(app):
                pass
    finally:
        settings.postgres_url = old_url
        settings.internal_service_secret = old_secret


def test_auth_missing_tenant_id():
    """get_tenant_id raises 401 when X-Tenant-ID is missing."""
    from app.middleware.auth import get_tenant_id
    from fastapi import Request, HTTPException
    from starlette.datastructures import Headers

    scope = {"type": "http", "headers": []}
    request = Request(scope)

    with pytest.raises(HTTPException) as exc:
        get_tenant_id(request)
    assert exc.value.status_code == 401


class TestReadingsByDevice:
    """The largest new read path: readings reached through refDevice."""

    def test_indexes_by_device_and_property_keeping_the_newest(self):
        from app.api.greenhouse import _readings_by_device

        class _Client:
            def query_entities(self, type, q=None, **kw):
                return [
                    {
                        "refDevice": {"object": "urn:ngsi-ld:Device:acme:d1"},
                        "controlledProperty": {"value": "temperature"},
                        "numValue": {"value": 19.0},
                        "dateObserved": {"value": "2026-08-29T08:00:00Z"},
                    },
                    {
                        "refDevice": {"object": "urn:ngsi-ld:Device:acme:d1"},
                        "controlledProperty": {"value": "temperature"},
                        "numValue": {"value": 23.5},
                        "dateObserved": {"value": "2026-08-29T10:00:00Z"},
                    },
                    {
                        "refDevice": {"object": "urn:ngsi-ld:Device:acme:d2"},
                        "controlledProperty": {"value": "leafWetness"},
                        "numValue": {"value": 1},
                        "dateObserved": {"value": "2026-08-29T10:00:00Z"},
                    },
                ]

        out = _readings_by_device(_Client(), ["urn:ngsi-ld:Device:acme:d1", "urn:ngsi-ld:Device:acme:d2"])
        assert out["urn:ngsi-ld:Device:acme:d1"]["temperature"] == 23.5
        assert out["urn:ngsi-ld:Device:acme:d2"]["leafWetness"] == 1

    def test_no_devices_means_no_query_at_all(self):
        class _Exploding:
            def query_entities(self, *a, **k):
                raise AssertionError("must not query without devices")

        from app.api.greenhouse import _readings_by_device

        assert _readings_by_device(_Exploding(), []) == {}

    def test_measurement_without_a_reading_is_skipped(self):
        from app.api.greenhouse import _readings_by_device

        class _Client:
            def query_entities(self, type, q=None, **kw):
                return [{
                    "refDevice": {"object": "urn:ngsi-ld:Device:acme:d1"},
                    "controlledProperty": {"value": "temperature"},
                    "dateObserved": {"value": "2026-08-29T10:00:00Z"},
                }]

        assert _readings_by_device(_Client(), ["urn:ngsi-ld:Device:acme:d1"]) == {}
