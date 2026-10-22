# backend/app/middleware/auth.py
"""
Auth middleware for greenhouse-dt BFF.

Relies on api-gateway injected headers: X-Tenant-ID, X-User-ID, X-User-Roles.
DO NOT validate JWT — the api-gateway does that.
Internal endpoints (/internal/) are exempt from tenant auth and use
X-Internal-Service-Secret instead.
"""

from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings

bearer = HTTPBearer(auto_error=False)


def get_tenant_id(request: Request) -> str:
    """Extract tenant_id from api-gateway injected header."""
    tenant_id = request.headers.get("X-Tenant-ID") or ""
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Missing X-Tenant-ID")
    return tenant_id


def get_user_id(request: Request) -> str:
    return request.headers.get("X-User-ID") or ""


def get_user_roles(request: Request) -> list[str]:
    roles = request.headers.get("X-User-Roles") or ""
    return [r.strip() for r in roles.split(",") if r.strip()]


async def verify_internal_secret(request: Request) -> None:
    """Verify that the request carries the internal service secret.
    
    Used for /internal/ endpoints called by entity-manager.
    """
    secret = request.headers.get("X-Internal-Service-Secret") or ""
    if not secret or secret != settings.internal_service_secret:
        raise HTTPException(status_code=403, detail="Invalid internal service secret")
