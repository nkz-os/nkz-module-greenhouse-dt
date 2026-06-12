// src/services/api.ts
import { createApiClient } from '@nekazari/sdk';

const api = createApiClient({
  baseURL: '/api/greenhouse',
});

export interface Greenhouse {
  id: string;
  name?: string;
  description?: string;
  location?: any;
  area?: number;
  coverType?: string;
  orientation?: string;
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
  list: () => api.get<Greenhouse[]>('/'),
  get: (id: string) => api.get<Greenhouse>(`/${id}`),
  getState: (id: string) => api.get<GreenhouseState>(`/${id}/state`),
  getAlerts: (id: string, status?: string) =>
    api.get<Alert[]>(`/${id}/alerts`, { params: { status } }),
  reconstruct: (id: string, timestamp: string, variable: string, resolution?: number) =>
    api.get<ReconstructionResult>(`/${id}/state/reconstruct`, {
      params: { timestamp, variable, resolution: resolution ?? 50 },
    }),
};
