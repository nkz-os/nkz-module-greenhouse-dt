"""Tests for heatmap (PNG + COG) generator."""
import sys
sys.path.insert(0, "backend")

import pytest
from unittest.mock import patch, MagicMock
import numpy as np

from app.services.heatmap_generator import (
    grid_to_png_bytes,
    grid_to_cog_bytes,
    upload_heatmap,
    get_cached_heatmap_urls,
)


class TestGridToPng:
    def test_png_bytes_valid(self):
        """grid 10x10 -> PNG bytes valido (comienza con PNG header)."""
        grid = [[20.0 + i + j for i in range(10)] for j in range(10)]
        bounds = [-1.66, 42.81, -1.64, 42.83]
        png_bytes = grid_to_png_bytes(grid, bounds, variable="temperature")
        assert len(png_bytes) > 100
        # PNG magic bytes: \x89PNG
        assert png_bytes[:4] == b'\x89PNG'

    def test_png_different_variable(self):
        """Variables distintas generan PNGs (solo verificamos que es PNG valido)."""
        grid = [[50.0 for _ in range(5)] for _ in range(5)]
        bounds = [-1.66, 42.81, -1.64, 42.83]
        png_bytes = grid_to_png_bytes(grid, bounds, variable="humidity")
        assert png_bytes[:4] == b'\x89PNG'

    def test_png_empty_grid(self):
        """Grid vacio -> error."""
        with pytest.raises(ValueError):
            grid_to_png_bytes([], [0, 0, 1, 1], variable="temperature")


class TestGridToCog:
    def test_cog_bytes_valid(self):
        """grid 10x10 -> COG GeoTIFF bytes valido (abre con rasterio)."""
        import rasterio
        import io
        grid = [[20.0 + i + j for i in range(10)] for j in range(10)]
        bounds = [-1.66, 42.81, -1.64, 42.83]
        cog_bytes = grid_to_cog_bytes(grid, bounds)
        assert len(cog_bytes) > 100

        # Reabrir con rasterio
        with rasterio.open(io.BytesIO(cog_bytes)) as src:
            assert src.count == 1
            assert src.width == 10
            assert src.height == 10
            assert src.crs.to_string() == "EPSG:4326"

    def test_cog_empty_grid(self):
        """Grid vacio -> error."""
        with pytest.raises(ValueError):
            grid_to_cog_bytes([], [0, 0, 1, 1])


class TestUploadHeatmap:
    @patch("app.services.heatmap_generator.boto3")
    def test_upload_creates_both_keys(self, mock_boto3):
        """upload_heatmap sube PNG y COG a MinIO."""
        mock_client = MagicMock()
        mock_boto3.session.Session.return_value.client.return_value = mock_client

        png_bytes = b"fake_png"
        cog_bytes = b"fake_cog"
        result = upload_heatmap(
            tenant_id="demo",
            greenhouse_id="gh-001",
            variable="temperature",
            timestamp="2026-06-12T14:30:00",
            png_bytes=png_bytes,
            cog_bytes=cog_bytes,
            minio_endpoint="http://minio:9000",
            minio_bucket="nekazari-data",
            minio_access_key="minio",
            minio_secret_key="minio123",
        )

        assert result["display_url"].endswith(".png")
        assert result["cog_url"].endswith(".tif")
        assert mock_client.put_object.call_count == 2

    @patch("app.services.heatmap_generator.boto3")
    def test_cached_heatmap(self, mock_boto3):
        """get_cached_heatmap_urls devuelve URLs si ambos archivos existen."""
        mock_client = MagicMock()
        mock_client.head_object.side_effect = [MagicMock(), MagicMock()]
        mock_boto3.session.Session.return_value.client.return_value = mock_client

        result = get_cached_heatmap_urls(
            tenant_id="demo",
            greenhouse_id="gh-001",
            variable="temperature",
            timestamp="2026-06-12T14:30:00",
            minio_endpoint="http://minio:9000",
            minio_bucket="nekazari-data",
            minio_access_key="minio",
            minio_secret_key="minio123",
        )

        assert result is not None
        assert result["display_url"].endswith(".png")
        assert result["cog_url"].endswith(".tif")

    @patch("app.services.heatmap_generator.boto3")
    def test_cached_heatmap_missing(self, mock_boto3):
        """get_cached_heatmap_urls devuelve None si falta algun archivo."""
        from botocore.exceptions import ClientError
        mock_client = MagicMock()
        error_resp = {"Error": {"Code": "404"}}
        mock_client.head_object.side_effect = ClientError(error_resp, "HeadObject")
        mock_boto3.session.Session.return_value.client.return_value = mock_client

        result = get_cached_heatmap_urls(
            tenant_id="demo",
            greenhouse_id="gh-001",
            variable="temperature",
            timestamp="2026-06-12T14:30:00",
            minio_endpoint="http://minio:9000",
            minio_bucket="nekazari-data",
            minio_access_key="minio",
            minio_secret_key="minio123",
        )
        assert result is None
