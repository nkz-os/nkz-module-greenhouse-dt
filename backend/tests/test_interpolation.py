"""Tests for spatial interpolation service."""
import sys
sys.path.insert(0, "backend")

import pytest
import numpy as np
from app.services.interpolation import interpolate_to_grid


class TestInterpolateToGrid:
    def test_linear_basic(self):
        """4 corner sensors -> 10x10 grid via linear interpolation, no NaN."""
        points = [
            {"x": 0.0, "y": 0.0, "value": 20.0},
            {"x": 1.0, "y": 0.0, "value": 25.0},
            {"x": 0.0, "y": 1.0, "value": 18.0},
            {"x": 1.0, "y": 1.0, "value": 22.0},
        ]
        result = interpolate_to_grid(points, resolution=10)
        assert "error" not in result
        assert len(result["grid"]) == 10
        assert len(result["grid"][0]) == 10
        # No NaN
        assert not any(
            np.isnan(v) for row in result["grid"] for v in row
        )
        # Bounds should encompass points
        assert result["x_min"] <= 0.0
        assert result["x_max"] >= 1.0
        assert result["y_min"] <= 0.0
        assert result["y_max"] >= 1.0
        # Mean should be between min and max
        flat = [v for row in result["grid"] for v in row if not np.isnan(v)]
        assert 18.0 <= np.mean(flat) <= 25.0

    def test_insufficient_points(self):
        """Menos de 3 puntos -> error."""
        points = [{"x": 0.0, "y": 0.0, "value": 20.0}]
        result = interpolate_to_grid(points)
        assert result.get("error") == "insufficient_points"

        points2 = [
            {"x": 0.0, "y": 0.0, "value": 20.0},
            {"x": 1.0, "y": 0.0, "value": 25.0},
        ]
        result2 = interpolate_to_grid(points2)
        assert result2.get("error") == "insufficient_points"

    def test_nan_filled_with_nearest(self):
        """3 collinear points -> linear produces NaN outside line -> nearest fills them."""
        points = [
            {"x": 0.0, "y": 0.0, "value": 20.0},
            {"x": 0.5, "y": 0.0, "value": 25.0},
            {"x": 1.0, "y": 0.0, "value": 30.0},
        ]
        result = interpolate_to_grid(points, resolution=10)
        assert "error" not in result
        # Grid should have no NaN (nearest fallback fills all)
        flat = [v for row in result["grid"] for v in row]
        assert not any(np.isnan(v) for v in flat)
        # Values along y=0 should be 20-30 gradient
        # Values far from line should trend toward nearest sensor
        assert all(20.0 <= v <= 30.0 for v in flat)

    def test_all_same_value(self):
        """Todos los sensores mismo valor -> grid homogeneo."""
        points = [
            {"x": 0.0, "y": 0.0, "value": 25.0},
            {"x": 2.0, "y": 0.0, "value": 25.0},
            {"x": 0.0, "y": 2.0, "value": 25.0},
            {"x": 2.0, "y": 2.0, "value": 25.0},
            {"x": 1.0, "y": 1.0, "value": 25.0},
        ]
        result = interpolate_to_grid(points, resolution=5)
        flat = [v for row in result["grid"] for v in row]
        assert all(v == 25.0 for v in flat)
