"""Contract: the Orion-LD notification endpoint must answer 204 with no body.

Orion-LD validates a notification response by looking for the literal string
``Content-Length:`` with a **case-sensitive** ``strstr`` and only skips that check
when the status is exactly 204::

    char* contentLenP = strstr(headers, "Content-Length:");
    if (contentLenP == NULL) { if (httpStatus != 204) -> notificationFailure(...) }

uvicorn/h11 emits response headers lower-cased (``content-length:``) — legal per
RFC 7230, invisible to that ``strstr``. So a 200 + body is counted as a failed
notification, and Orion deactivates the subscription after 3 consecutive failures.

This endpoint previously answered ``200 {"status": "accepted", "queued": n}``, which
meant every notification Orion sent it was recorded as a failure.
"""

from fastapi.testclient import TestClient

NOTIFY = "/api/ngsi-ld/notify"

EMPTY_NOTIFICATION = {
    "id": "urn:ngsi-ld:Notification:contract-test",
    "type": "Notification",
    "subscriptionId": "urn:ngsi-ld:subscription:contract-test",
    "notifiedAt": "2026-09-01T00:00:00Z",
    "data": [],
}


def _client():
    from app.main import app

    return TestClient(app)


def test_notification_endpoint_answers_204_without_body():
    response = _client().post(
        NOTIFY, json=EMPTY_NOTIFICATION, headers={"NGSILD-Tenant": "contract-test"}
    )

    assert response.status_code == 204, (
        f"{NOTIFY} answered {response.status_code}; Orion-LD counts anything other "
        "than 204 as a notification failure unless the response carries a capitalised "
        "'Content-Length:' header, which uvicorn never emits. Three consecutive "
        "failures deactivate the subscription."
    )
    assert response.content == b"", (
        f"{NOTIFY} returned a body with 204: {response.content!r}. "
        "A body forces a content-length header and defeats the purpose."
    )


def test_malformed_notification_is_rejected_not_acknowledged():
    """204 is for success only — a body Orion cannot have produced must still 4xx."""
    response = _client().post(
        NOTIFY,
        json={"data": "not-a-list"},
        headers={"NGSILD-Tenant": "contract-test"},
    )

    assert response.status_code == 400, (
        f"a malformed notification answered {response.status_code}; it must be a 4xx "
        "so the failure is visible instead of being silently acknowledged."
    )
