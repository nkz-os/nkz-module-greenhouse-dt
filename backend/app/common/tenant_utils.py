# backend/app/common/tenant_utils.py
"""Tenant-scoped resource helpers."""

from app.config import settings


def tenant_bucket(tenant_id: str) -> str:
    """MinIO bucket key for a tenant's greenhouse data."""
    return f"{settings.minio_bucket}/{tenant_id}"


def tenant_model_key(tenant_id: str, greenhouse_id: str) -> str:
    """MinIO object key for a greenhouse's 3D model."""
    return f"{tenant_id}/greenhouse/{greenhouse_id}/models/shell.glb"
