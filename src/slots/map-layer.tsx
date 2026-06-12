// src/slots/map-layer.tsx
/**
 * map-layer slot widget for Greenhouse DT.
 *
 * Registers a Cesium layer in the Unified Viewer that renders:
 * - Semi-transparent greenhouse shell
 * - Sensor points with temperature color-coding
 * - Zone polygons
 *
 * Uses the existing map-layer slot system.
 */

import React, { useMemo } from 'react';
import { useViewer, useViewerEntity } from '@nekazari/viewer-kit';
import type { SlotWidgetDefinition } from '@nekazari/sdk';
import GreenhouseShell from './greenhouse-shell';
import { useGreenhouseState } from '../hooks/useGreenhouseState';

interface MapLayerProps {
  greenhouseId?: string;
}

const GreenhouseMapLayer: React.FC<MapLayerProps> = ({ greenhouseId }) => {
  const viewer = useViewer();
  const selectedEntity = useViewerEntity();

  // Derive greenhouseId from selected entity if not explicitly provided
  const activeGreenhouseId = greenhouseId ||
    (selectedEntity?.type === 'AgriGreenhouse' ? selectedEntity.id : null);

  const { state, loading } = useGreenhouseState(activeGreenhouseId);

  if (!activeGreenhouseId || !viewer || loading) return null;

  // Build sensor data from state for Cesium rendering
  const sensors = useMemo(() => {
    if (!state) return [];
    return state.zones.flatMap(zone =>
      zone.sensors.map(s => ({
        id: s.id,
        temperature: s.temperature,
        humidity: s.relativeHumidity,
        location: s.location as { type: string; coordinates: number[] } | undefined,
      }))
    );
  }, [state]);

  // In MVP we use a placeholder — Phase 2 will load from MinIO
  const modelUrl = `/api/greenhouse/${activeGreenhouseId}/model`;

  return (
    <GreenhouseShell
      greenhouseId={activeGreenhouseId}
      modelUrl={modelUrl}
      position={{ lon: -1.65, lat: 42.82, height: 0 }}
      scale={1}
      sensors={sensors}
      shellOpacity={0.35}
    />
  );
};

// Export widget definition for the slot registry
export const greenhouseMapLayer: SlotWidgetDefinition = {
  id: 'greenhouse-dt-map-layer',
  component: 'GreenhouseMapLayer',
  priority: 10,
  showWhen: {
    entityType: ['AgriGreenhouse'],
  },
};

export default GreenhouseMapLayer;
