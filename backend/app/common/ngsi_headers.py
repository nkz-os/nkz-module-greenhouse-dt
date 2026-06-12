# backend/app/common/ngsi_headers.py
"""NGSI-LD header injection helpers."""

def inject_fiware_headers(headers: dict, tenant_id: str) -> dict:
    """Inject NGSILD-Tenant and Fiware-Service headers."""
    headers["NGSILD-Tenant"] = tenant_id
    headers["Fiware-Service"] = tenant_id
    return headers
