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

    def test_sdm_shape_keys_by_channel_not_by_property(self):
        """SDM shape: temperature and temperatureMax share controlledProperty=temperature;
        the window maximum must not overwrite the temperature reading."""
        from app.api.greenhouse import _readings_by_device

        def _dm(channel, statistic, value):
            return {
                "refDevice": {"object": "urn:ngsi-ld:Device:acme:d1"},
                "controlledProperty": {"value": "temperature"},
                "name": {"value": channel},
                "measurementType": {"value": statistic},
                "numValue": {"value": value},
                "dateObserved": {"value": "2026-08-29T10:00:00Z"},
            }

        class _Client:
            def query_entities(self, type, q=None, **kw):
                return [_dm("temperature", "instant", 21.0), _dm("temperatureMax", "max", 27.0)]

        out = _readings_by_device(_Client(), ["urn:ngsi-ld:Device:acme:d1"])
        assert out["urn:ngsi-ld:Device:acme:d1"] == {"temperature": 21.0, "temperatureMax": 27.0}

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


class _PagingClient:
    """Fake broker: records each request and serves `entities` honouring limit/offset."""

    def __init__(self, entities_for=None):
        self.requests = []
        self._entities_for = entities_for or (lambda q: [])

    def query_entities(self, type, q=None, limit=100, offset=0, **kw):
        self.requests.append({"type": type, "q": q, "limit": limit, "offset": offset})
        return self._entities_for(q)[offset:offset + limit]


def _measurement(device, channel, value, observed="2026-08-29T10:00:00Z"):
    return {
        "refDevice": {"object": device},
        "controlledProperty": {"value": channel},
        "numValue": {"value": value},
        "dateObserved": {"value": observed},
    }


def _values_in(q):
    prefix = 'refDevice=="'
    assert q.startswith(prefix) and q.endswith('"')
    return q[len(prefix):-1].split('","')


class TestReadingsByDeviceBatches:
    def test_many_devices_use_one_comparison_and_at_most_50_values_per_request(self):
        from app.api.greenhouse import _readings_by_device

        ids = [f"urn:ngsi-ld:Device:acme:d{i}" for i in range(120)]
        client = _PagingClient()
        _readings_by_device(client, ids)

        assert len(client.requests) == 3
        seen = []
        for r in client.requests:
            assert r["type"] == "DeviceMeasurement"
            assert "|" not in r["q"] and ";" not in r["q"]
            assert r["q"].count("==") == 1
            values = _values_in(r["q"])
            assert len(values) <= 50
            seen.extend(values)
        assert seen == ids

    def test_results_are_merged_across_batches(self):
        from app.api.greenhouse import _readings_by_device

        ids = [f"urn:ngsi-ld:Device:acme:d{i}" for i in range(60)]
        client = _PagingClient(lambda q: [_measurement(d, "temperature", 20.0) for d in _values_in(q)])
        out = _readings_by_device(client, ids)
        assert set(out) == set(ids)

    def test_newest_reading_wins_across_batches(self):
        from app.api.greenhouse import _readings_by_device

        ids = [f"urn:ngsi-ld:Device:acme:d{i}" for i in range(60)]
        first, last = ids[0], ids[-1]

        def entities_for(q):
            if first in _values_in(q):
                return [_measurement(first, "temperature", 30.0, "2026-08-29T12:00:00Z")]
            return [_measurement(first, "temperature", 10.0, "2026-08-29T08:00:00Z")]

        out = _readings_by_device(_PagingClient(entities_for), ids)
        assert out[first]["temperature"] == 30.0

    def test_every_page_of_a_batch_is_read_until_a_short_page(self):
        from app.api.greenhouse import _readings_by_device

        device = "urn:ngsi-ld:Device:acme:d1"
        entities = [
            _measurement(device, f"ch{i}", float(i)) for i in range(250)
        ]
        client = _PagingClient(lambda q: entities)
        out = _readings_by_device(client, [device])

        assert [r["offset"] for r in client.requests] == [0, 100, 200]
        assert len(out[device]) == 250

    def test_duplicate_ids_are_sent_once_in_stable_order(self):
        from app.api.greenhouse import _readings_by_device

        client = _PagingClient()
        _readings_by_device(client, ["urn:b", "urn:a", "urn:b", "", "urn:a", "urn:c"])
        assert [r["q"] for r in client.requests] == ['refDevice=="urn:b","urn:a","urn:c"']

    def test_empty_list_makes_no_request(self):
        from app.api.greenhouse import _readings_by_device

        client = _PagingClient()
        assert _readings_by_device(client, []) == {}
        assert _readings_by_device(client, ["", None]) == {}
        assert client.requests == []

    def test_id_with_a_double_quote_is_skipped_with_a_warning(self, caplog):
        from app.api.greenhouse import _readings_by_device

        client = _PagingClient()
        with caplog.at_level("WARNING"):
            _readings_by_device(client, ['urn:bad"id', "urn:ok"])
        assert [r["q"] for r in client.requests] == ['refDevice=="urn:ok"']
        assert "bad" in caplog.text

    def test_only_unsafe_ids_means_no_request(self):
        from app.api.greenhouse import _readings_by_device

        client = _PagingClient()
        assert _readings_by_device(client, ['urn:bad"id']) == {}
        assert client.requests == []
