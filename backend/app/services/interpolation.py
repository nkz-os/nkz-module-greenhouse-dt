"""
Interpolacion espacial para greenhouses.
Toma lecturas de sensores con coordenadas y genera un grid 2D regular
usando scipy.griddata (linear + nearest fallback para NaN).
"""
from __future__ import annotations

from typing import Any

import numpy as np
from scipy.interpolate import griddata
from scipy.spatial import QhullError


def _fill_with_nearest(
    coords: np.ndarray,
    values: np.ndarray,
    xi_grid: np.ndarray,
    yi_grid: np.ndarray,
    mask: np.ndarray,
) -> np.ndarray:
    """Fill NaN cells with nearest-neighbor interpolation.

    Falls back to overall mean if nearest interpolation also fails
    (e.g. collinear points that Qhull cannot triangulate).
    """
    try:
        fill = griddata(
            coords, values, (xi_grid[mask], yi_grid[mask]), method="nearest"
        )
        # griddata with method="nearest" can still produce NaN if all
        # points are collinear and the query point is outside the line.
        if np.any(np.isnan(fill)):
            fill_mean = np.nanmean(values)
            fill = np.where(np.isnan(fill), fill_mean, fill)
        return fill
    except QhullError:
        # Triangulation failure → fallback to mean
        return np.full(mask.sum(), np.nanmean(values))


def interpolate_to_grid(
    points: list[dict[str, Any]],
    resolution: int = 50,
    method: str = "linear",
) -> dict[str, Any]:
    """Interpolar valores de sensores a grid 2D regular.

    Args:
        points: Lista de dicts con {"x": lon, "y": lat, "value": val}
        resolution: Celdas por eje (output = resolution x resolution)
        method: Metodo scipy: "linear", "cubic", "nearest"

    Returns:
        dict con grid, bounds, stats o error si < 3 puntos
    """
    if len(points) < 3:
        return {"error": "insufficient_points"}

    coords = np.array([[p["x"], p["y"]] for p in points])
    values = np.array([p["value"] for p in points])

    x_min, x_max = float(coords[:, 0].min()), float(coords[:, 0].max())
    y_min, y_max = float(coords[:, 1].min()), float(coords[:, 1].max())

    # Small padding (~10m)
    pad = 0.0001
    xi = np.linspace(x_min - pad, x_max + pad, resolution)
    yi = np.linspace(y_min - pad, y_max + pad, resolution)
    xi_grid, yi_grid = np.meshgrid(xi, yi)

    # Try requested method; fall back to nearest on QhullError (collinear points)
    try:
        grid = griddata(coords, values, (xi_grid, yi_grid), method=method)
    except QhullError:
        # QhullError for collinear/degenerate input → nearest neighbor
        grid = griddata(coords, values, (xi_grid, yi_grid), method="nearest")

    # Fill NaN with nearest neighbor (handles residual NaN resiliently)
    mask = np.isnan(grid)
    if mask.any():
        grid[mask] = _fill_with_nearest(coords, values, xi_grid, yi_grid, mask)

    # Round to clean up floating-point noise from triangulation
    grid = np.around(grid, decimals=10)

    bounds = [
        float(x_min - pad), float(y_min - pad),
        float(x_max + pad), float(y_max + pad),
    ]

    stats = {
        "min": float(np.nanmin(grid)),
        "max": float(np.nanmax(grid)),
        "mean": float(np.nanmean(grid)),
    }

    return {
        "grid": grid.tolist(),
        "x_min": bounds[0],
        "x_max": bounds[2],
        "y_min": bounds[1],
        "y_max": bounds[3],
        "bounds": bounds,
        "stats": stats,
    }
