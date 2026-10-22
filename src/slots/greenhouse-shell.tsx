// src/slots/greenhouse-shell.tsx
/**
 * GreenhouseShell: renders a greenhouse on Cesium.
 *
 * If ref3DModel (GLB) is available on the entity, loads the 3D model with
 * modelRotation [heading, pitch, roll] for orientation matching the platform's
 * CesiumMap pattern (sensors, trackers, machines).
 *
 * Otherwise, draws a semi-transparent extruded polygon (box) using Cesium
 * primitives at the real greenhouse location.
 *
 * Extracts position from GeoJSON location (Point or Polygon centroid).
 * Calculates box dimensions from area (sqm) with 2:1 aspect ratio.
 * Applies orientation (N-S / E-W / angle) and color based on coverType.
 *
 * Sensor points and zone polygons are rendered on top of the box.
 * Loading/error states are shown as Cesium labels and descriptions.
 *
 * Uses useViewer() from @nekazari/sdk to access the cesiumViewer.
 */

import React, { useEffect, useRef } from 'react';
import { useViewer } from '@nekazari/sdk';
import { useTimelineContextOptional } from '../contexts/TimelineContext';

interface GreenhouseShellProps {
  greenhouseId: string;
  /** GeoJSON location from API — Point or Polygon */
  location?: { type: string; coordinates: any };
  /** Greenhouse area in square meters */
  area?: number;
  /** Greenhouse height in meters (default 4) */
  height?: number;
  /** Cover type: polyethylene, glass, polycarbonate */
  coverType?: string;
  /** Orientation: 'N-S', 'E-W', or a decimal angle */
  orientation?: string;
  /** 3D model URL (GLB) from ref3DModel — overrides procedural box */
  modelUrl?: string;
  /** 3D model rotation [heading, pitch, roll] in degrees */
  modelRotation?: number[];
  /** 3D model scale factor */
  modelScale?: number;
  /** Array of sensor points with temperature/humidity */
  sensors?: Array<{
    id: string;
    temperature?: number;
    humidity?: number;
    location?: { type: string; coordinates: number[] };
  }>;
  /** Array of zone polygon definitions */
  zonePolygons?: Array<{
    id: string;
    name: string;
    coordinates: number[][][];
  }>;
  shellOpacity?: number;
  /** When true, shows "Loading sensors..." label above the greenhouse */
  loading?: boolean;
  /** Error message shown in the greenhouse description popup */
  error?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract lon/lat from a GeoJSON location object.
 * For Point: uses coordinates directly.
 * For Polygon: computes centroid of the first ring (excludes closing vertex).
 */
function extractPosition(
  location?: { type: string; coordinates: any }
): { lon: number; lat: number } | null {
  if (!location || !location.type || !location.coordinates) return null;
  try {
    if (location.type === 'Point' && location.coordinates.length >= 2) {
      return { lon: location.coordinates[0], lat: location.coordinates[1] };
    }
    if (location.type === 'Polygon') {
      const ring = location.coordinates[0];
      if (!ring || ring.length < 3) return null;
      // The ring may close itself (last coord === first). If so, exclude it.
      const last = ring[ring.length - 1];
      const first = ring[0];
      const n =
        last[0] === first[0] && last[1] === first[1] ? ring.length - 1 : ring.length;
      let lonSum = 0;
      let latSum = 0;
      for (let i = 0; i < n; i++) {
        lonSum += ring[i][0];
        latSum += ring[i][1];
      }
      return { lon: lonSum / n, lat: latSum / n };
    }
  } catch {
    // Malformed location — return null
  }
  return null;
}

/**
 * Parse orientation string to a rotation angle in degrees.
 * 'N-S' → 0, 'E-W' → 90, numeric string → parsed float, else 0.
 */
function parseOrientation(orientation?: string): number {
  if (!orientation) return 0;
  const lower = orientation.toLowerCase().trim();
  if (lower === 'n-s' || lower === 'ns') return 0;
  if (lower === 'e-w' || lower === 'ew') return 90;
  const num = parseFloat(lower);
  return isNaN(num) ? 0 : num;
}

/** Map cover type → fill color with the given opacity. */
function getCoverColor(Cesium: any, coverType?: string, opacity = 0.35): any {
  const hex: Record<string, string> = {
    polyethylene: `rgba(0, 200, 200, ${opacity})`,
    glass: `rgba(100, 150, 255, ${opacity})`,
    polycarbonate: `rgba(100, 200, 100, ${opacity})`,
  };
  return Cesium.Color.fromCssColorString(
    hex[coverType?.toLowerCase() || ''] || `rgba(0, 200, 200, ${opacity})`
  );
}

/** Map cover type → outline color. */
function getCoverOutlineColor(Cesium: any, coverType?: string): any {
  const hex: Record<string, string> = {
    polyethylene: 'rgba(0, 200, 200, 0.8)',
    glass: 'rgba(100, 150, 255, 0.8)',
    polycarbonate: 'rgba(100, 200, 100, 0.8)',
  };
  return Cesium.Color.fromCssColorString(
    hex[coverType?.toLowerCase() || ''] || 'rgba(0, 200, 200, 0.8)'
  );
}

/**
 * Compute the 4 corners of a rectangle centred at (lon, lat).
 *
 * @param lon  Centre longitude (degrees).
 * @param lat  Centre latitude (degrees).
 * @param widthM  Rectangle width (E-W span at 0° orientation) in metres.
 * @param lengthM  Rectangle length (N-S span at 0° orientation) in metres.
 * @param orientationDeg  Clockwise rotation in degrees.
 * @returns Flat array [lon0, lat0, lon1, lat1, lon2, lat2, lon3, lat3]
 *          suitable for Cesium.Cartesian3.fromDegreesArray().
 */
function getRectangleCorners(
  lon: number,
  lat: number,
  widthM: number,
  lengthM: number,
  orientationDeg: number,
): number[] {
  const latRad = (lat * Math.PI) / 180;
  const mPerDeg = 111_320;
  const lonPerDeg = mPerDeg * Math.cos(latRad);

  const halfW = (widthM / 2) / lonPerDeg;
  const halfL = (lengthM / 2) / mPerDeg;

  // Local unrotated corners (centre relative, length = N-S at 0°)
  const corners: [number, number][] = [
    [-halfW, -halfL],
    [halfW, -halfL],
    [halfW, halfL],
    [-halfW, halfL],
  ];

  // Rotate
  const ang = (orientationDeg * Math.PI) / 180;
  const sinA = Math.sin(ang);
  const cosA = Math.cos(ang);

  const out: number[] = [];
  for (const [dx, dy] of corners) {
    out.push(lon + dx * cosA - dy * sinA);
    out.push(lat + dx * sinA + dy * cosA);
  }
  return out;
}

/** Build the entity description HTML, optionally including an error banner. */
function buildDescription(
  greenhouseId: string,
  coverType: string | undefined,
  areaM2: number,
  heightM: number,
  sensorCount: number,
  zoneCount: number,
  error?: string | null,
): string {
  const lines: string[] = [
    '<div>',
    `<h3>Greenhouse ${greenhouseId}</h3>`,
    `<p>${sensorCount} sensors · ${zoneCount} zones</p>`,
    `<p>Cover: ${coverType || 'unknown'} · ${areaM2.toFixed(0)} m² · ${heightM.toFixed(1)} m</p>`,
  ];
  if (error) {
    lines.push('<p style="color:red;font-weight:bold;">⚠️ ' + error + '</p>');
  }
  lines.push('</div>');
  return lines.join('\n');
}

// ── Component ────────────────────────────────────────────────────────────────

const DEFAULT_HEIGHT = 4; // metres
const DEFAULT_AREA = 500; // square metres

const GreenhouseShell: React.FC<GreenhouseShellProps> = ({
  greenhouseId,
  location,
  area,
  height,
  coverType,
  orientation,
  modelUrl,
  modelRotation,
  modelScale,
  sensors = [],
  zonePolygons = [],
  loading = false,
  error = null,
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

    // ── Clean up previous entities ──────────────────────────────────────
    entities.forEach((entity: any) => {
      viewerInstance.entities.remove(entity);
    });
    entities.clear();

    let heatmapLayer: any = null;

    // ── 1. Extract position from GeoJSON ────────────────────────────────
    const pos = extractPosition(location);

    // ── 2. Render greenhouse: GLB model if available, else procedural box ─
    if (pos) {
      if (modelUrl) {
        // ── 2a. 3D model (GLB) — uses HeadingPitchRoll like sensors/trackers
        const scale = modelScale && modelScale > 0 ? modelScale : 1;
        const rot = modelRotation || [0, 0, 0];
        const heading = Cesium.Math.toRadians(rot[0] || 0);
        const pitch = Cesium.Math.toRadians(rot[1] || 0);
        const roll = Cesium.Math.toRadians(rot[2] || 0);
        const position = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 0);
        const hpr = new Cesium.HeadingPitchRoll(heading, pitch, roll);
        const orientationQuat = Cesium.Transforms.headingPitchRollQuaternion(position, hpr);

        const modelEntity = viewerInstance.entities.add({
          id: `greenhouse-shell-${greenhouseId}`,
          position,
          orientation: orientationQuat,
          name: `Greenhouse ${greenhouseId}`,
          model: {
            uri: modelUrl,
            scale,
            minimumPixelSize: 64,
            maximumScale: 20000,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          description: buildDescription(
            greenhouseId,
            coverType,
            area || DEFAULT_AREA,
            height || DEFAULT_HEIGHT,
            sensors.length,
            zonePolygons.length,
            error,
          ),
        });
        entities.set(`greenhouse-shell-${greenhouseId}`, modelEntity);
      } else {
        // ── 2b. Procedural box (fallback when no GLB) ──────────────────
        const boxHeight = height && height > 0 ? height : DEFAULT_HEIGHT;
        const boxArea = area && area > 0 ? area : DEFAULT_AREA;
        const boxWidth = Math.sqrt(boxArea / 2);
        const boxLength = boxWidth * 2;
        const orientDeg = parseOrientation(orientation);
        const corners = getRectangleCorners(pos.lon, pos.lat, boxWidth, boxLength, orientDeg);

        const boxEntity = viewerInstance.entities.add({
          id: `greenhouse-shell-${greenhouseId}`,
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(corners),
            material: getCoverColor(Cesium, coverType, shellOpacity),
            outline: true,
            outlineColor: getCoverOutlineColor(Cesium, coverType),
            outlineWidth: 2,
            extrudedHeight: boxHeight,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          description: buildDescription(
            greenhouseId,
            coverType,
            boxArea,
            boxHeight,
            sensors.length,
            zonePolygons.length,
            error,
          ),
        });
        entities.set(`greenhouse-shell-${greenhouseId}`, boxEntity);
      }

      // ── 3. Loading label (shown above the greenhouse while sensors fetch)
      if (loading) {
        const labelHeight = modelUrl ? 2 : (height && height > 0 ? height : DEFAULT_HEIGHT) + 2;
        const loadingLabel = viewerInstance.entities.add({
          id: `greenhouse-loading-${greenhouseId}`,
          position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, labelHeight),
          label: {
            text: 'Loading sensors...',
            font: '14px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -20),
            showBackground: true,
            backgroundColor: Cesium.Color.BLACK.withAlpha(0.6),
          },
        });
        entities.set(`greenhouse-loading-${greenhouseId}`, loadingLabel);
      }
    }

    // ── 4. Render sensor points ─────────────────────────────────────────
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

    // ── 5. Render zone polygons ─────────────────────────────────────────
    zonePolygons.forEach((zone) => {
      if (!zone.coordinates?.length) return;

      const polygonEntity = viewerInstance.entities.add({
        id: `zone-${zone.id}`,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(
            zone.coordinates[0].flat(),
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

    // ── 6. COG heatmap overlay from TimelineContext ─────────────────────
    if (timeline?.displayUrl && timeline?.bounds && viewerInstance) {
      heatmapLayer = viewerInstance.imageryLayers.addImageryProvider(
        new Cesium.SingleTileImageryProvider({
          url: timeline.displayUrl,
          rectangle: Cesium.Rectangle.fromDegrees(
            timeline.bounds[0],
            timeline.bounds[1],
            timeline.bounds[2],
            timeline.bounds[3],
          ),
        }),
      );
      heatmapLayer.alpha = 0.6;
    }

    // ── Cleanup on unmount or deps change ───────────────────────────────
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
    viewer,
    greenhouseId,
    location,
    area,
    height,
    coverType,
    orientation,
    modelUrl,
    modelRotation,
    modelScale,
    sensors,
    zonePolygons,
    loading,
    error,
    shellOpacity,
    timeline?.displayUrl,
    timeline?.bounds,
  ]);

  return null;
};

export default GreenhouseShell;
