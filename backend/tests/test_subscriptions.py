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
        assert body["entities"] == [{"type": "DeviceMeasurement"}]
        # A DeviceMeasurement names its property in `controlledProperty` and
        # carries the reading in `numValue`; "leafWetness" is a VALUE there, not
        # an attribute key, so watching it by name would never fire. Filtering
        # by property belongs in the notify handler.
        assert body["watchedAttributes"] == ["numValue"]
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
            {"description": SUBSCRIPTION_DESCRIPTION}
        ]
        mock_orion_cls.return_value = mock_client

        from app.core.subscriptions import ensure_pathological_subscription

        result = await ensure_pathological_subscription("test-tenant")
        assert result is None
        mock_client.create_subscription.assert_not_called()


class TestSubscriptionScope:
    def test_filters_by_measured_property(self):
        """Without a q filter this matches every reading of every device in the
        tenant, and throttling is a per-subscription minimum interval — an
        unrelated probe would consume the window a leafWetness reading needed."""
        from app.core.subscriptions import TRACKED_PROPERTIES, _subscription_body

        q = _subscription_body("http://greenhouse.example.invalid/notify")["q"]
        for prop in TRACKED_PROPERTIES:
            assert f'controlledProperty=="{prop}"' in q
        assert q.count("|") == len(TRACKED_PROPERTIES) - 1


class TestLegacySubscriptionCleanup:
    @patch("app.core.subscriptions.OrionClient")
    @pytest.mark.asyncio
    async def test_removes_the_retired_agrisensor_subscription(self, mock_orion_cls):
        """The description changed with the vocabulary, so match-by-description
        would never find the old one again: it must be deleted, not orphaned."""
        from app.core.subscriptions import (
            LEGACY_SUBSCRIPTION_DESCRIPTION,
            ensure_pathological_subscription,
        )

        mock_client = AsyncMock()
        mock_client.query_subscriptions.return_value = [
            {"id": "urn:ngsi-ld:Subscription:old", "description": LEGACY_SUBSCRIPTION_DESCRIPTION}
        ]
        mock_client.create_subscription.return_value = "/ngsi-ld/v1/subscriptions/new-1"
        mock_orion_cls.return_value = mock_client

        result = await ensure_pathological_subscription("test-tenant")

        mock_client.delete_subscription.assert_awaited_once_with("urn:ngsi-ld:Subscription:old")
        assert result == "new-1"

    @patch("app.core.subscriptions.OrionClient")
    @pytest.mark.asyncio
    async def test_cleanup_failure_does_not_block_ensure(self, mock_orion_cls):
        from app.core.subscriptions import (
            LEGACY_SUBSCRIPTION_DESCRIPTION,
            ensure_pathological_subscription,
        )

        mock_client = AsyncMock()
        mock_client.query_subscriptions.return_value = [
            {"id": "urn:ngsi-ld:Subscription:old", "description": LEGACY_SUBSCRIPTION_DESCRIPTION}
        ]
        mock_client.delete_subscription.side_effect = RuntimeError("broker down")
        mock_client.create_subscription.return_value = "/ngsi-ld/v1/subscriptions/new-1"
        mock_orion_cls.return_value = mock_client

        assert await ensure_pathological_subscription("test-tenant") == "new-1"
