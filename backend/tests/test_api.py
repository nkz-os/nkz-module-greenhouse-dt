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
