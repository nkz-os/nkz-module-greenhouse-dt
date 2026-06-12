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

export const greenhouseApi = {
  list: () => api.get<Greenhouse[]>('/'),
  get: (id: string) => api.get<Greenhouse>(`/${id}`),
  getState: (id: string) => api.get<GreenhouseState>(`/${id}/state`),
  getAlerts: (id: string, status?: string) =>
    api.get<Alert[]>(`/${id}/alerts`, { params: { status } }),
};
