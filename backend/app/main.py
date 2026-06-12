# backend/app/main.py
"""
Greenhouse DT Backend — FastAPI BFF.

Health probes, auth middleware, and route registration.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.config import settings

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: verify critical dependencies."""
    logger.info("%s v%s starting", settings.app_name, settings.app_version)
    
    # Verify POSTGRES_URL is set (MANDATORY)
    if not settings.postgres_url:
        raise RuntimeError("POSTGRES_URL is not set — service must fail at startup")
    
    # Verify internal_service_secret is set
    if not settings.internal_service_secret:
        raise RuntimeError("INTERNAL_SERVICE_SECRET is not set — /internal/ endpoints will be unprotected")
    
    yield
    
    logger.info("%s shutting down", settings.app_name)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Greenhouse Digital Twin BFF for Nekazari Platform",
        docs_url=f"{settings.api_prefix}/docs",
        redoc_url=f"{settings.api_prefix}/redoc",
        openapi_url=f"{settings.api_prefix}/openapi.json",
        lifespan=lifespan,
    )
    
    # Rate limiter
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    
    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Health probes (exempt from rate limiting)
    @app.get("/health")
    @limiter.exempt
    async def health():
        """K8s liveness probe."""
        return {"status": "ok", "service": settings.app_name}
    
    @app.get("/readyz")
    @limiter.exempt
    async def readyz():
        """K8s readiness probe — verifies Orion-LD connectivity."""
        import httpx
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                r = await client.get(f"{settings.orion_ld_url}/version")
                orion_up = r.status_code < 500
        except Exception:
            orion_up = False
        
        if orion_up:
            return {"status": "ready", "checks": {"orion_ld": "up"}}
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "checks": {"orion_ld": "down"}},
        )
    
    # Routes
    from app.api.greenhouse import router as greenhouse_router
    app.include_router(greenhouse_router, prefix=settings.api_prefix)
    
    # Internal routes (at /api/internal, not under api_prefix)
    from app.api.state import router as state_router
    app.include_router(state_router, prefix="/api/greenhouse", tags=["state"])

    # Internal routes (at /api/internal, not under api_prefix)
    from app.api.internal import router as internal_router
    app.include_router(internal_router, prefix="/api/internal")
    
    # NGSI-LD subscription notification (called by Orion-LD, no JWT)
    from app.api.notify import router as notify_router
    app.include_router(notify_router)

    return app


app = create_app()
