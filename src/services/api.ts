/**
 * Greenhouse DT API Service
 *
 * Canonical pattern: plain fetch wrapper (no createApiClient — doesn't exist in SDK v1).
 * Uses import.meta.env.VITE_API_URL for base URL, matching bioorchestrator pattern.
 */

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'https://nkz.robotika.cloud';
const BASE = `${API_BASE}/api/greenhouse`;

async function get<T = any>(path: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const resp = await fetch(url, { credentials: 'include' });
  if (resp.status === 401) throw new Error('Unauthorized');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export interface Greenhouse {
  id: string;
  name?: string;
  description?: string;
  location?: any;
  area?: number;
  height?: number;
  coverType?: string;
  orientation?: string;
  ref3DModel?: string;
  modelScale?: number;
  modelRotation?: number[];
}

export interface AgriSensorState {
  id: string;
  name?: string;
  zone?: string;
  temperature?: number;
  relativeHumidity?: number;
  leafWetness?: number;
  solarIrradiance?: number;
  co2?: number;
  par?: number;
  batteryLevel?: number;
  lastSeen?: string;
  location?: any;
}

export interface ZoneState {
  zone_id: string;
  sensor_count: number;
  sensors: AgriSensorState[];
  aggregates: {
    avg_temperature?: number;
    avg_humidity?: number;
    min_temperature?: number;
    max_temperature?: number;
  };
}

export interface GreenhouseState {
  greenhouse_id: string;
  zones: ZoneState[];
  total_sensors: number;
}

export interface Alert {
  id: string;
  name?: string;
  description?: string;
  severity?: string;
  status?: string;
  subCategory?: string;
  dateIssued?: string;
}

export interface ReconstructionResult {
  greenhouse_id: string;
  timestamp: string;
  variable: string;
  sensor_count: number;
  display_url: string | null;
  cog_url: string | null;
  bounds: [number, number, number, number] | null;
  stats: { min: number; max: number; mean: number } | null;
  detail?: string;
}

export const greenhouseApi = {
  list: () => get<Greenhouse[]>('/'),
  get: (id: string) => get<Greenhouse>(`/${id}`),
  getState: (id: string) => get<GreenhouseState>(`/${id}/state`),
  getAlerts: (id: string, status?: string) =>
    get<Alert[]>(`/${id}/alerts${status ? `?status=${status}` : ''}`),
  reconstruct: (id: string, timestamp: string, variable: string, resolution?: number) => {
    const params = new URLSearchParams({ timestamp, variable });
    if (resolution) params.set('resolution', String(resolution));
    return get<ReconstructionResult>(`/${id}/state/reconstruct?${params}`);
  },
};
