"""Tests for NGSI-LD subscription management."""
import pytest
from unittest.mock import AsyncMock, patch

from app.core.subscriptions import _subscription_body, SUBSCRIPTION_DESCRIPTION, NOTIFY_PATH


class TestSubscriptionBody:
    def test_subscription_body_structure(self):
        """Subscription body has correct NGSI-LD structure."""
        callback_url = "http://greenhouse-bff:8430/api/ngsi-ld/notify"
        body = _subscription_body(callback_url)

        assert body["type"] == "Subscription"
        assert body["description"] == SUBSCRIPTION_DESCRIPTION
        assert body["entities"] == [{"type": "AgriSensor"}]
        assert "leafWetness" in body["watchedAttributes"]
        assert "temperature" in body["watchedAttributes"]
        assert "relativeHumidity" in body["watchedAttributes"]
        assert body["notification"]["endpoint"]["uri"] == callback_url
        assert body["notification"]["endpoint"]["accept"] == "application/json"
        assert body["notification"]["format"] == "normalized"
        assert body["throttling"] == 60
        assert body["isActive"] is True

    def test_notify_path_constant(self):
        """NOTIFY_PATH matches the route registered in main.py."""
        assert NOTIFY_PATH == "/api/ngsi-ld/notify"


class TestEnsureSubscription:
    @patch("app.core.subscriptions.OrionClient")
    @pytest.mark.asyncio
    async def test_creates_subscription_when_not_exists(self, mock_orion_cls):
        """ensure_pathological_subscription creates subscription if none exists."""
        mock_client = AsyncMock()
        mock_client.query_subscriptions.return_value = []
        mock_client.create_subscription.return_value = "/ngsi-ld/v1/subscriptions/abc-123"
        mock_orion_cls.return_value = mock_client

        from app.core.subscriptions import ensure_pathological_subscription

        result = await ensure_pathological_subscription("test-tenant")
        assert result == "abc-123"
        mock_client.create_subscription.assert_called_once()

    @patch("app.core.subscriptions.OrionClient")
    @pytest.mark.asyncio
    async def test_skips_when_subscription_exists(self, mock_orion_cls):
        """ensure_pathological_subscription returns None if subscription exists."""
        mock_client = AsyncMock()
        mock_client.query_subscriptions.return_value = [
            {"description": "nkz-module: AgriSensor -> greenhouse-dt (pathological)"}
        ]
        mock_orion_cls.return_value = mock_client

        from app.core.subscriptions import ensure_pathological_subscription

        result = await ensure_pathological_subscription("test-tenant")
        assert result is None
        mock_client.create_subscription.assert_not_called()
