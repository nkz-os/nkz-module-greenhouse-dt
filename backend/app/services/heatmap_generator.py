"""
Heatmap generation from interpolated grids.
Produces PNG (colormap for Cesium display) and COG GeoTIFF (data preservation).
Uploads both to MinIO with deterministic keys.
"""
from __future__ import annotations

import io
import json
import logging
from typing import Any, Optional

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.transform import from_bounds
from PIL import Image

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# Colormaps por variable: (cmap_name, vmin, vmax, label, unit)
VARIABLE_CMAP = {
    "temperature": ("coolwarm", 0, 50, "Temperature", "°C"),
    "humidity": ("Blues", 0, 100, "Humidity", "%"),
    "leafWetness": ("Greens", 0, 1, "Leaf Wetness", ""),
    "co2": ("RdYlGn_r", 200, 800, "CO2", "ppm"),
    "par": ("YlOrBr", 0, 2000, "PAR", "umol/m2/s"),
}


def _get_colormap(variable: str):
    """Get matplotlib colormap for variable."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    if variable not in VARIABLE_CMAP:
        variable = "temperature"
    cmap_name, vmin, vmax, _, _ = VARIABLE_CMAP[variable]
    return plt.get_cmap(cmap_name), vmin, vmax


def grid_to_png_bytes(
    grid: list[list[float]],
    bounds: list[float],
    variable: str = "temperature",
) -> bytes:
    """Convert interpolated grid to PNG bytes with colormap.

    Args:
        grid: 2D array (ny x nx) of float values
        bounds: [min_x, min_y, max_x, max_y]
        variable: One of temperature, humidity, leafWetness, co2, par

    Returns: PNG image bytes
    """
    data = np.array(grid, dtype=np.float32)
    if data.size == 0:
        raise ValueError("Empty grid")

    cmap, vmin, vmax = _get_colormap(variable)

    # Normalize and apply colormap
    normalized = np.clip((data - vmin) / (vmax - vmin), 0, 1)
    colored = cmap(normalized)  # Returns RGBA (ny, nx, 4)

    # Convert to 8-bit RGBA
    img_array = (colored[:, :, :4] * 255).astype(np.uint8)

    # Create PIL image and save as PNG
    img = Image.fromarray(img_array, "RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.getvalue()


def grid_to_cog_bytes(
    grid: list[list[float]],
    bounds: list[float],
    crs: str = "EPSG:4326",
) -> bytes:
    """Convert interpolated grid to COG GeoTIFF bytes.

    Args:
        grid: 2D array (ny x nx)
        bounds: [min_x, min_y, max_x, max_y]
        crs: Coordinate reference system

    Returns: GeoTIFF bytes
    """
    data = np.array(grid, dtype=np.float32)
    if data.size == 0:
        raise ValueError("Empty grid")
    height, width = data.shape

    transform = from_bounds(*bounds, width, height)

    buf = io.BytesIO()
    with rasterio.open(
        buf, "w", driver="GTiff",
        height=height, width=width,
        count=1, dtype=data.dtype,
        crs=CRS.from_string(crs),
        transform=transform,
        tiled=True, blockxsize=256, blockysize=256,
        compress="deflate", predictor=3,
    ) as dst:
        dst.write(data, 1)

    buf.seek(0)
    return buf.getvalue()


def upload_heatmap(
    tenant_id: str,
    greenhouse_id: str,
    variable: str,
    timestamp: str,
    png_bytes: bytes,
    cog_bytes: bytes,
    bounds: list[float],
    stats: dict[str, Any],
    minio_endpoint: str,
    minio_bucket: str,
    minio_access_key: str,
    minio_secret_key: str,
) -> dict[str, Any]:
    """Upload both PNG and COG to MinIO.

    Returns: {display_url, cog_url, bounds, stats}
    """
    session = boto3.session.Session(
        aws_access_key_id=minio_access_key,
        aws_secret_access_key=minio_secret_key,
    )
    client = session.client(
        "s3",
        endpoint_url=minio_endpoint,
        config=Config(signature_version="s3v4"),
    )

    base_key = f"greenhouse/{tenant_id}/{greenhouse_id}/heatmaps/{variable}/{timestamp}"

    # Upload PNG (display)
    client.put_object(
        Bucket=minio_bucket,
        Key=f"{base_key}.png",
        Body=png_bytes,
        ContentType="image/png",
    )

    # Upload COG (data)
    client.put_object(
        Bucket=minio_bucket,
        Key=f"{base_key}.tif",
        Body=cog_bytes,
        ContentType="image/tiff",
    )

    # Store metadata (bounds + stats) alongside heatmap
    metadata = {
        "bounds": bounds,
        "stats": stats,
        "variable": variable,
        "timestamp": timestamp,
    }
    client.put_object(
        Bucket=minio_bucket,
        Key=f"{base_key}.meta.json",
        Body=json.dumps(metadata),
        ContentType="application/json",
    )

    display_url = f"{minio_endpoint}/{minio_bucket}/{base_key}.png"
    cog_url = f"{minio_endpoint}/{minio_bucket}/{base_key}.tif"

    return {"display_url": display_url, "cog_url": cog_url, "bounds": bounds, "stats": stats}


def get_cached_heatmap_urls(
    tenant_id: str,
    greenhouse_id: str,
    variable: str,
    timestamp: str,
    minio_endpoint: str,
    minio_bucket: str,
    minio_access_key: str,
    minio_secret_key: str,
) -> Optional[dict[str, Any]]:
    """Check if both PNG and COG exist in MinIO.

    Returns: {display_url, cog_url, bounds, stats} or None if missing
    """
    session = boto3.session.Session(
        aws_access_key_id=minio_access_key,
        aws_secret_access_key=minio_secret_key,
    )
    client = session.client(
        "s3",
        endpoint_url=minio_endpoint,
        config=Config(signature_version="s3v4"),
    )

    base_key = f"greenhouse/{tenant_id}/{greenhouse_id}/heatmaps/{variable}/{timestamp}"

    for ext in [".png", ".tif"]:
        try:
            client.head_object(Bucket=minio_bucket, Key=f"{base_key}{ext}")
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if code in ("404", "NoSuchKey"):
                return None
            raise

    # Read metadata (bounds + stats)
    try:
        meta_obj = client.get_object(Bucket=minio_bucket, Key=f"{base_key}.meta.json")
        meta = json.loads(meta_obj["Body"].read())
    except (ClientError, json.JSONDecodeError):
        meta = {}

    return {
        "display_url": f"{minio_endpoint}/{minio_bucket}/{base_key}.png",
        "cog_url": f"{minio_endpoint}/{minio_bucket}/{base_key}.tif",
        "bounds": meta.get("bounds"),
        "stats": meta.get("stats"),
    }
