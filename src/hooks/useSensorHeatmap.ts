/**
 * Hook: fetch sensor readings and interpolate into a heatmap overlay on Cesium.
 *
 * Uses @nekazari/geo-utils to run IDW interpolation locally via WASM,
 * then overlays the resulting PNG on the Cesium viewer as a SingleTileImageryProvider.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useViewer } from '@nekazari/sdk';
import { initGeoLibre, interpolateHeatmap } from '@nekazari/geo-utils';
import type { SensorPoint, HeatmapResult } from '@nekazari/geo-utils';
import { greenhouseApi, type GreenhouseState } from '../services/api';

interface UseSensorHeatmapOptions {
  greenhouseId: string | null;
  variable?: 'temperature' | 'humidity';
  resolution?: number;
  colormap?: 'temperature' | 'stress' | 'ndvi';
}

interface UseSensorHeatmapReturn {
  heatmap: HeatmapResult | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSensorHeatmap(opts: UseSensorHeatmapOptions): UseSensorHeatmapReturn {
  const [heatmap, setHeatmap] = useState<HeatmapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewerCtx = useViewer();
  const heatmapLayerRef = useRef<any>(null);
  const objectUrlRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (heatmapLayerRef.current) {
      try {
        const viewer = (viewerCtx as any).cesiumViewer;
        if (viewer?.imageryLayers) {
          viewer.imageryLayers.remove(heatmapLayerRef.current);
        }
      } catch { /* ignore */ }
      heatmapLayerRef.current = null;
    }
  }, [viewerCtx]);

  const refresh = useCallback(async () => {
    if (!opts.greenhouseId) return;
    setLoading(true);
    setError(null);
    cleanup();

    try {
      // 1. Fetch sensor state from backend
      const state: GreenhouseState = await greenhouseApi.getState(opts.greenhouseId);

      // 2. Extract sensor readings
      const points: SensorPoint[] = [];
      const attr = opts.variable === 'humidity' ? 'relativeHumidity' : 'temperature';

      for (const zone of state.zones) {
        for (const sensor of zone.sensors) {
          const loc = sensor.location as { type: string; coordinates: number[] } | undefined;
          const value = attr === 'temperature' ? sensor.temperature : sensor.relativeHumidity;
          if (loc?.coordinates && loc.coordinates.length >= 2 && value != null) {
            points.push({ x: loc.coordinates[0], y: loc.coordinates[1], value });
          }
        }
      }

      if (points.length < 3) {
        setError(`Not enough sensors with location data: ${points.length}`);
        return;
      }

      // 3. Interpolate in browser via WASM
      await initGeoLibre();
      const result = await interpolateHeatmap(points, {
        resolution: opts.resolution ?? 50,
        colormap: opts.colormap ?? 'temperature',
      });

      setHeatmap(result);

      // 4. Overlay on Cesium
      const viewer = (viewerCtx as any).cesiumViewer;
      if (viewer?.imageryLayers && result.png) {
        const blob = new Blob([result.png as BlobPart], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;

        // Cesium is provided by the host as a global (via vite-plugin-cesium)
        const Cesium = (window as any).Cesium;
        if (!Cesium?.Rectangle || !Cesium?.SingleTileImageryProvider) {
          setError('Cesium globals not available from host');
          return;
        }
        const layer = viewer.imageryLayers.addImageryProvider(
          new Cesium.SingleTileImageryProvider({
            url,
            rectangle: Cesium.Rectangle.fromDegrees(
              result.bounds[0], result.bounds[1],
              result.bounds[2], result.bounds[3],
            ),
          })
        );
        layer.alpha = 0.7;
        layer.show = false; // Hidden by default — shown when toggled
        heatmapLayerRef.current = layer;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [opts.greenhouseId, opts.variable, opts.resolution, opts.colormap, viewerCtx, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return { heatmap, loading, error, refresh };
}
