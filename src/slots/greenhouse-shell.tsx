// src/slots/greenhouse-shell.tsx
/**
 * GreenhouseShell: renders the semi-transparent greenhouse structure on Cesium.
 *
 * Uses Cesium.Entity with model.uri and color.withAlpha(0.35) for the shell,
 * and separate entities for internal crop rows and sensor points.
 *
 * This component is rendered inside the map-layer slot of the Unified Viewer.
 * Uses useViewer() from @nekazari/sdk to access the cesiumViewer.
 */

import React, { useEffect, useRef } from 'react';
import { useViewer } from '@nekazari/sdk';
import { useTimelineContextOptional } from '../contexts/TimelineContext';

interface GreenhouseShellProps {
  greenhouseId: string;
  modelUrl?: string;
  position: {
    lon: number;
    lat: number;
    height?: number;
  };
  scale?: number;
  sensors?: Array<{
    id: string;
    temperature?: number;
    humidity?: number;
    location?: { type: string; coordinates: number[] };
  }>;
  zonePolygons?: Array<{
    id: string;
    name: string;
    coordinates: number[][][];
  }>;
  onSensorClick?: (sensorId: string) => void;
  shellOpacity?: number;
}

const GreenhouseShell: React.FC<GreenhouseShellProps> = ({
  greenhouseId,
  modelUrl,
  position,
  scale = 1,
  sensors = [],
  zonePolygons = [],
  shellOpacity = 0.35,
}) => {
  const viewerCtx = useViewer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewer = (viewerCtx as any).cesiumViewer as any;
  const entitiesRef = useRef<Map<string, any>>(new Map());

  // Access timeline context optionally (returns null if no TimelineProvider)
  const timeline = useTimelineContextOptional();

  useEffect(() => {
    if (!viewer) return;

    const Cesium = (window as any).Cesium;
    if (!Cesium) return;

    const viewerInstance = viewer;
    const entities = entitiesRef.current;

    // Clean up previous entities
    entities.forEach((entity: any) => {
      viewerInstance.entities.remove(entity);
    });
    entities.clear();

    // 1. Render greenhouse shell (semi-transparent glTF model)
    if (modelUrl) {
      const shellPosition = Cesium.Cartesian3.fromDegrees(
        position.lon,
        position.lat,
        position.height || 0
      );

      const shellEntity = viewerInstance.entities.add({
        id: `greenhouse-shell-${greenhouseId}`,
        position: shellPosition,
        model: {
          uri: modelUrl,
          scale: scale,
          minimumPixelSize: 64,
          color: Cesium.Color.WHITE.withAlpha(shellOpacity),
          silhouetteColor: Cesium.Color.CYAN,
          silhouetteSize: 1,
        },
        description: `
          <div>
            <h3>Greenhouse ${greenhouseId}</h3>
            <p>${sensors.length} sensors · ${zonePolygons.length} zones</p>
          </div>
        `,
      });
      entities.set(`greenhouse-shell-${greenhouseId}`, shellEntity);
    }

    // 2. Render sensor points with color-coded temperature
    sensors.forEach((sensor) => {
      if (!sensor.location?.coordinates) return;
      const [lon, lat] = sensor.location.coordinates;
      const temp = sensor.temperature;

      let color = Cesium.Color.CYAN;
      if (temp !== undefined) {
        if (temp < 15) color = Cesium.Color.fromCssColorString('#0088ff');
        else if (temp < 20) color = Cesium.Color.fromCssColorString('#00cc88');
        else if (temp < 25) color = Cesium.Color.fromCssColorString('#88cc00');
        else if (temp < 30) color = Cesium.Color.fromCssColorString('#ffaa00');
        else color = Cesium.Color.fromCssColorString('#ff3300');
      }

      const sensorEntity = viewerInstance.entities.add({
        id: `sensor-${sensor.id}`,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 1),
        name: sensor.id,
        point: {
          pixelSize: 10,
          color: color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: temp !== undefined ? `${temp}°C` : sensor.id,
          font: '11px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          pixelOffset: new Cesium.Cartesian2(0, -20),
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        description: `
          <table>
            <tr><td><b>Sensor:</b></td><td>${sensor.id}</td></tr>
            ${temp !== undefined ? `<tr><td><b>Temp:</b></td><td>${temp}°C</td></tr>` : ''}
            ${sensor.humidity !== undefined ? `<tr><td><b>HR:</b></td><td>${sensor.humidity}%</td></tr>` : ''}
            <tr><td><b>Pos:</b></td><td>${lat.toFixed(5)}, ${lon.toFixed(5)}</td></tr>
          </table>
        `,
      });
      entities.set(`sensor-${sensor.id}`, sensorEntity);
    });

    // 3. Render zone polygons (optional)
    zonePolygons.forEach((zone) => {
      if (!zone.coordinates?.length) return;

      const polygonEntity = viewerInstance.entities.add({
        id: `zone-${zone.id}`,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(
            zone.coordinates[0].flat()
          ),
          material: Cesium.Color.CYAN.withAlpha(0.1),
          outline: true,
          outlineColor: Cesium.Color.CYAN.withAlpha(0.5),
          outlineWidth: 1,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: zone.name,
          font: '12px sans-serif',
          fillColor: Cesium.Color.CYAN,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        },
      });
      entities.set(`zone-${zone.id}`, polygonEntity);
    });

    // 4. COG heatmap overlay (PNG with colormap from TimelineContext)
    let heatmapLayer: any = null;
    if (timeline?.displayUrl && timeline?.bounds && viewerInstance) {
      heatmapLayer = viewerInstance.imageryLayers.addImageryProvider(
        new Cesium.SingleTileImageryProvider({
          url: timeline.displayUrl,
          rectangle: Cesium.Rectangle.fromDegrees(
            timeline.bounds[0], timeline.bounds[1],
            timeline.bounds[2], timeline.bounds[3]
          ),
        })
      );
      heatmapLayer.alpha = 0.6;
    }

    return () => {
      entities.forEach((entity: any) => {
        if (!viewerInstance.isDestroyed()) {
          viewerInstance.entities.remove(entity);
        }
      });
      entities.clear();
      if (heatmapLayer && !viewerInstance.isDestroyed()) {
        viewerInstance.imageryLayers.remove(heatmapLayer);
      }
    };
  }, [
    viewer, greenhouseId, modelUrl, position, scale,
    sensors, zonePolygons, shellOpacity,
    timeline?.displayUrl, timeline?.bounds,
  ]);

  return null;
};

export default GreenhouseShell;
