"""Tests for the pathological alert worker."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.workers.pathological import (
    _accumulated_wetness_hours,
    _avg_value,
    _evaluate_pathogens,
    _build_alert_entity,
    evaluate_leaf_wetness,
)


class TestAccumulatedWetnessHours:
    def test_empty_points(self):
        assert _accumulated_wetness_hours([]) == 0.0

    def test_single_point(self):
        p = [{"ts": "2026-06-12T10:00:00Z", "value": 1}]
        assert _accumulated_wetness_hours(p) == 0.0

    def test_two_hours_wet(self):
        p = [
            {"ts": "2026-06-12T08:00:00Z", "value": 1},
            {"ts": "2026-06-12T10:00:00Z", "value": 1},
        ]
        assert _accumulated_wetness_hours(p) == 2.0

    def test_one_hour_dry_then_wet(self):
        p = [
            {"ts": "2026-06-12T08:00:00Z", "value": 0},
            {"ts": "2026-06-12T09:00:00Z", "value": 1},
            {"ts": "2026-06-12T10:00:00Z", "value": 1},
        ]
        assert _accumulated_wetness_hours(p) == 1.0

    def test_multiple_wet_periods(self):
        p = [
            {"ts": "2026-06-12T08:00:00Z", "value": 1},
            {"ts": "2026-06-12T09:00:00Z", "value": 0},
            {"ts": "2026-06-12T10:00:00Z", "value": 1},
            {"ts": "2026-06-12T11:00:00Z", "value": 1},
        ]
        assert _accumulated_wetness_hours(p) == 2.0  # 1h + 1h


class TestAvgValue:
    def test_empty(self):
        assert _avg_value([]) is None

    def test_single(self):
        assert _avg_value([{"ts": "x", "value": 25}]) == 25.0

    def test_multiple(self):
        p = [{"ts": "x", "value": 20}, {"ts": "y", "value": 30}]
        assert _avg_value(p) == 25.0

    def test_filters_none(self):
        p = [{"ts": "x", "value": 20}, {"ts": "y", "value": None}]
        assert _avg_value(p) == 20.0


class TestEvaluatePathogens:
    @patch("app.workers.pathological.settings")
    def test_botrytis_high(self, mock_settings):
        mock_settings.botrytis_wetness_hours = 6.0
        mock_settings.botrytis_temp_min = 15.0
        mock_settings.botrytis_temp_max = 25.0
        mock_settings.mildew_wetness_hours = 4.0
        mock_settings.mildew_temp_min = 10.0
        mock_settings.mildew_temp_max = 22.0
        alerts = _evaluate_pathogens(7.0, 20.0)
        assert len(alerts) >= 1
        assert any(a["subCategory"] == "botrytis_cinerea" and a["severity"] == "high" for a in alerts)

    @patch("app.workers.pathological.settings")
    def test_botrytis_medium(self, mock_settings):
        mock_settings.botrytis_wetness_hours = 6.0
        mock_settings.botrytis_temp_min = 15.0
        mock_settings.botrytis_temp_max = 25.0
        mock_settings.mildew_wetness_hours = 4.0
        mock_settings.mildew_temp_min = 10.0
        mock_settings.mildew_temp_max = 22.0
        alerts = _evaluate_pathogens(7.0, 30.0)  # above max → medium
        assert any(a["subCategory"] == "botrytis_cinerea" and a["severity"] == "medium" for a in alerts)

    @patch("app.workers.pathological.settings")
    def test_below_threshold(self, mock_settings):
        mock_settings.botrytis_wetness_hours = 6.0
        mock_settings.botrytis_temp_min = 15.0
        mock_settings.botrytis_temp_max = 25.0
        mock_settings.mildew_wetness_hours = 4.0
        mock_settings.mildew_temp_min = 10.0
        mock_settings.mildew_temp_max = 22.0
        alerts = _evaluate_pathogens(2.0, 20.0)
        assert len(alerts) == 0

    @patch("app.workers.pathological.settings")
    def test_no_temp(self, mock_settings):
        alerts = _evaluate_pathogens(10.0, None)
        assert len(alerts) == 0


class TestBuildAlertEntity:
    def test_basic_structure(self):
        now = datetime(2026, 6, 12, 10, 0, 0, tzinfo=timezone.utc)
        entity = _build_alert_entity(
            sensor_id="urn:ngsi-ld:AgriSensor:gh42-temp-01",
            greenhouse_id="gh42",
            sub_category="botrytis_cinerea",
            severity="high",
            description="Test alert",
            now=now,
        )
        assert entity["type"] == "Alert"
        assert entity["@context"]  # @context must be present (SyncOrionClient doesn't inject it)
        assert entity["severity"]["value"] == "high"
        assert entity["subCategory"]["value"] == "botrytis_cinerea"
        assert entity["status"]["value"] == "active"
        assert entity["alertSource"]["object"] == "urn:ngsi-ld:AgriGreenhouse:gh42"
        assert "botrytis" in entity["id"]


class TestExtractGreenhouseId:
    """Tests for _extract_greenhouse_id — handles any zone naming pattern."""

    def test_standard_zone_naming(self):
        from app.api.notify import _extract_greenhouse_id
        entity = {
            "hasAgriParcel": {
                "type": "Relationship",
                "object": "urn:ngsi-ld:AgriParcel:gh42-zone-NO",
            }
        }
        assert _extract_greenhouse_id(entity) == "gh42"

    def test_direct_parcel_reference(self):
        from app.api.notify import _extract_greenhouse_id
        entity = {
            "hasAgriParcel": {
                "type": "Relationship",
                "object": "urn:ngsi-ld:AgriParcel:parcel-001",
            }
        }
        assert _extract_greenhouse_id(entity) is None

    def test_no_relationship(self):
        from app.api.notify import _extract_greenhouse_id
        assert _extract_greenhouse_id({}) is None

    def test_multiple_zone_dashes(self):
        """Greenhouse ID with hyphens, and zone suffix with capital Z."""
        from app.api.notify import _extract_greenhouse_id
        entity = {
            "hasAgriParcel": {
                "type": "Relationship",
                "object": "urn:ngsi-ld:AgriParcel:my-gh-Zone-A",
            }
        }
        assert _extract_greenhouse_id(entity) == "my-gh"

    def test_legacy_refAgriParcel(self):
        from app.api.notify import _extract_greenhouse_id
        entity = {
            "refAgriParcel": {
                "type": "Relationship",
                "object": "urn:ngsi-ld:AgriParcel:gh42-zone-NO",
            }
        }
        assert _extract_greenhouse_id(entity) == "gh42"

    def test_no_parcel_id(self):
        from app.api.notify import _extract_greenhouse_id
        entity = {"hasAgriParcel": {"type": "Relationship", "object": ""}}
        assert _extract_greenhouse_id(entity) is None

    def test_wrong_rel_type(self):
        from app.api.notify import _extract_greenhouse_id
        entity = {"hasAgriParcel": "not_a_dict"}
        assert _extract_greenhouse_id(entity) is None


class TestEvaluateTask:
    @patch("app.workers.pathological.TimescaleClient")
    @patch("app.workers.pathological.SyncOrionClient")
    def test_task_flow(self, mock_orion_cls, mock_ts_cls, monkeypatch):
        """Integration-style test: mock TimescaleDB and Orion, verify Celery task."""
        from app.config import settings
        monkeypatch.setattr(settings, "botrytis_wetness_hours", 6.0)
        monkeypatch.setattr(settings, "botrytis_temp_min", 15.0)
        monkeypatch.setattr(settings, "botrytis_temp_max", 25.0)
        monkeypatch.setattr(settings, "mildew_wetness_hours", 4.0)
        monkeypatch.setattr(settings, "mildew_temp_min", 10.0)
        monkeypatch.setattr(settings, "mildew_temp_max", 22.0)

        # Mock TimescaleDB to return 8h of wetness at 20°C
        mock_ts = AsyncMock()
        mock_ts.query = AsyncMock(side_effect=[
            # leafWetness query: 8h of wet
            [
                {"ts": "2026-06-12T02:00:00Z", "value": 1},
                {"ts": "2026-06-12T10:00:00Z", "value": 1},
            ],
            # temperature query: avg 20
            [
                {"ts": "2026-06-12T02:00:00Z", "value": 20},
                {"ts": "2026-06-12T10:00:00Z", "value": 20},
            ],
        ])
        mock_ts_cls.return_value = mock_ts

        # Mock Orion to accept alert creation
        mock_orion = mock_orion_cls.return_value
        mock_orion.create_entity.return_value = {"id": "test"}

        result = evaluate_leaf_wetness(
            sensor_id="urn:ngsi-ld:AgriSensor:gh42-temp-01",
            greenhouse_id="gh42",
            tenant_id="tenant-abc",
        )

        assert result["status"] == "ok"
        assert result["alerts_created"] >= 1
        assert result["wetness_hours"] >= 7.9  # ~8h
