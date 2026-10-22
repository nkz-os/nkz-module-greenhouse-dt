# backend/app/common/ngsi_headers.py
"""NGSI-LD header injection helpers.

NOTE: The nkz-platform-sdk's OrionClient/SyncOrionClient handles
@context injection automatically. This module provides a minimal
fallback for cases where the SDK cannot be used.
"""

CONTEXT_URL = "http://api-gateway-service:5000/ngsi-ld-context.json"


def inject_fiware_headers(headers: dict, tenant_id: str) -> dict:
    """Inject mandatory NGSI-LD headers for application/json requests.

    For application/ld+json, the @context must be in the body instead.
    """
    headers["NGSILD-Tenant"] = tenant_id
    headers["Fiware-Service"] = tenant_id
    headers["Link"] = f'<{CONTEXT_URL}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"'
    return headers
