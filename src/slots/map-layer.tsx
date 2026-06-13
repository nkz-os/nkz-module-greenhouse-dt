// src/slots/map-layer.tsx
/**
 * map-layer slot widget for Greenhouse DT.
 *
 * Registers a Cesium layer in the Unified Viewer that renders:
 * - Procedural 3D greenhouse box at the real API location
 * - Sensor points with temperature color-coding
 * - Zone polygons
 *
 * Uses useGreenhouseDetail for greenhouse metadata (location, area, coverType, etc.)
 * and useGreenhouseState for live sensor data.
 *
 * Uses useViewer() from @nekazari/sdk, matching canonical bioorchestrator pattern.
 */

import React, { useMemo } from 'react';
import { useViewer } from '@nekazari/sdk';
import GreenhouseShell from './greenhouse-shell';
import { useGreenhouseState } from '../hooks/useGreenhouseState';
import { useGreenhouseDetail } from '../hooks/useGreenhouseDetail';

interface MapLayerProps {
  greenhouseId?: string;
}

const GreenhouseMapLayer: React.FC<MapLayerProps> = ({ greenhouseId }) => {
  const viewer = useViewer();

  // Derive greenhouseId from selected entity if not explicitly provided
  const activeGreenhouseId: string | null = greenhouseId ||
    (viewer.selectedEntityType === 'AgriGreenhouse' && viewer.selectedEntityId
      ? viewer.selectedEntityId.split(':').pop() || null
      : null);

  const { detail, loading: detailLoading, error: detailError } =
    useGreenhouseDetail(activeGreenhouseId);
  const { state, loading: stateLoading } = useGreenhouseState(activeGreenhouseId);

  // If no greenhouse is selected, render nothing
  if (!activeGreenhouseId) return null;

  // ── Loading state: show DOM overlay ────────────────────────────────────
  if (detailLoading || stateLoading) {
    return (
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          background: 'rgba(0,0,0,0.65)',
          color: '#fff',
          padding: '6px 14px',
          borderRadius: 6,
          fontSize: 13,
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        Cargando sensores…
      </div>
    );
  }

  // ── Error state: show DOM overlay ─────────────────────────────────────
  if (detailError) {
    return (
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          background: 'rgba(180, 30, 30, 0.8)',
          color: '#fff',
          padding: '6px 14px',
          borderRadius: 6,
          fontSize: 13,
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        Error: {detailError}
      </div>
    );
  }

  // ── Build sensor data from state for Cesium rendering ─────────────────
  const sensors = useMemo(() => {
    if (!state) return [];
    return state.zones.flatMap((zone) =>
      zone.sensors.map((s) => ({
        id: s.id,
        temperature: s.temperature,
        humidity: s.relativeHumidity,
        location: s.location as
          | { type: string; coordinates: number[] }
          | undefined,
      })),
    );
  }, [state]);

  // ── Render greenhouse shell with real data ────────────────────────────
  return (
    <GreenhouseShell
      greenhouseId={activeGreenhouseId}
      location={detail?.location}
      area={detail?.area}
      height={detail?.height}
      coverType={detail?.coverType}
      orientation={detail?.orientation}
      sensors={sensors}
      shellOpacity={0.35}
    />
  );
};

export default GreenhouseMapLayer;
