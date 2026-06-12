// src/slots/context-panel.tsx
/**
 * context-panel slot widget for Greenhouse DT.
 *
 * Shows when an AgriGreenhouse entity is selected in the Unified Viewer.
 * Displays current state: temperature, humidity, VPD, leaf wetness, alerts.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewerEntity } from '@nekazari/viewer-kit';
import { AlertTriangle, Thermometer, Droplets, Wind, Leaf, Activity } from 'lucide-react';
import type { SlotWidgetDefinition } from '@nekazari/sdk';
import { greenhouseApi, GreenhouseState, Alert } from '../services/api';

const GreenhouseContextPanel: React.FC = () => {
  const { t } = useTranslation();
  const selectedEntity = useViewerEntity();

  const [state, setState] = useState<GreenhouseState | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);

  const greenhouseId = selectedEntity?.type === 'AgriGreenhouse'
    ? selectedEntity.id.split(':').pop()
    : null;

  useEffect(() => {
    if (!greenhouseId) {
      setState(null);
      setAlerts([]);
      return;
    }

    setLoading(true);
    Promise.all([
      greenhouseApi.getState(greenhouseId),
      greenhouseApi.getAlerts(greenhouseId, 'active'),
    ])
      .then(([s, a]) => {
        setState(s);
        setAlerts(a);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [greenhouseId]);

  if (!greenhouseId) return null;

  if (loading) {
    return (
      <div className="p-4 text-sm text-gray-500">
        {t('greenhouse.loading') || 'Loading...'}
      </div>
    );
  }

  // Compute global aggregates across all zones
  const allTemps = state?.zones.flatMap(z => z.sensors.map(s => s.temperature).filter((t): t is number => t !== undefined)) || [];
  const allHums = state?.zones.flatMap(z => z.sensors.map(s => s.relativeHumidity).filter((h): h is number => h !== undefined)) || [];
  const avgTemp = allTemps.length ? (allTemps.reduce((a, b) => a + b, 0) / allTemps.length).toFixed(1) : '--';
  const avgHum = allHums.length ? (allHums.reduce((a, b) => a + b, 0) / allHums.length).toFixed(1) : '--';

  // VPD calculation (simplified)
  const es = avgTemp !== '--' && avgHum !== '--'
    ? (0.6108 * Math.exp((17.27 * parseFloat(avgTemp)) / (parseFloat(avgTemp) + 237.3))).toFixed(2)
    : '--';
  const ea = es !== '--' && avgHum !== '--'
    ? (parseFloat(es) * parseFloat(avgHum) / 100).toFixed(2)
    : '--';
  const vpd = es !== '--' && ea !== '--'
    ? (parseFloat(es) - parseFloat(ea)).toFixed(2)
    : '--';

  return (
    <div className="p-3 space-y-3 text-sm">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-nkz-primary" />
        <h3 className="font-semibold text-gray-900">
          {t('greenhouse.title')}
        </h3>
      </div>

      {/* Current conditions */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-blue-50 rounded-lg p-2 flex items-center gap-2">
          <Thermometer className="h-4 w-4 text-blue-600" />
          <div>
            <div className="text-xs text-gray-500">{t('greenhouse.temperature')}</div>
            <div className="font-semibold">{avgTemp}°C</div>
          </div>
        </div>
        <div className="bg-green-50 rounded-lg p-2 flex items-center gap-2">
          <Droplets className="h-4 w-4 text-green-600" />
          <div>
            <div className="text-xs text-gray-500">{t('greenhouse.humidity')}</div>
            <div className="font-semibold">{avgHum}%</div>
          </div>
        </div>
        <div className="bg-purple-50 rounded-lg p-2 flex items-center gap-2">
          <Wind className="h-4 w-4 text-purple-600" />
          <div>
            <div className="text-xs text-gray-500">{t('greenhouse.vpd')}</div>
            <div className="font-semibold">{vpd} kPa</div>
          </div>
        </div>
        <div className="bg-amber-50 rounded-lg p-2 flex items-center gap-2">
          <Leaf className="h-4 w-4 text-amber-600" />
          <div>
            <div className="text-xs text-gray-500">{t('greenhouse.sensors')}</div>
            <div className="font-semibold">{state?.total_sensors || 0}</div>
          </div>
        </div>
      </div>

      {/* Zones summary */}
      {state?.zones.map((zone) => (
        <div key={zone.zone_id} className="border rounded-lg p-2">
          <div className="text-xs font-medium text-gray-500 mb-1">
            {zone.zone_id.split('-').pop()} ({zone.sensor_count} sensores)
          </div>
          <div className="text-xs text-gray-600">
            {zone.aggregates.avg_temperature !== null && (
              <span className="mr-3">Ø {zone.aggregates.avg_temperature}°C</span>
            )}
            {zone.aggregates.min_temperature !== null && (
              <span className="mr-3">↓ {zone.aggregates.min_temperature}°C</span>
            )}
            {zone.aggregates.max_temperature !== null && (
              <span>↑ {zone.aggregates.max_temperature}°C</span>
            )}
          </div>
        </div>
      ))}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div>
          <div className="flex items-center gap-1 text-xs font-medium text-red-600 mb-1">
            <AlertTriangle className="h-3 w-3" />
            {t('greenhouse.active_alerts')} ({alerts.length})
          </div>
          {alerts.slice(0, 3).map((alert) => (
            <div
              key={alert.id}
              className={`text-xs p-2 rounded mb-1 ${
                alert.severity === 'critical' || alert.severity === 'high'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-yellow-50 text-yellow-700'
              }`}
            >
              <div className="font-medium">{alert.name}</div>
              <div className="truncate">{alert.description}</div>
            </div>
          ))}
        </div>
      )}

      {/* Auto-Pilot status (placeholder for Phase 4) */}
      <div className="border-t pt-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">{t('greenhouse.mpc_status')}</span>
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-xs">
            {t('greenhouse.mpc_inactive')}
          </span>
        </div>
      </div>
    </div>
  );
};

export const greenhouseContextPanel: SlotWidgetDefinition = {
  id: 'greenhouse-dt-context-panel',
  component: 'GreenhouseContextPanel',
  priority: 10,
  showWhen: {
    entityType: ['AgriGreenhouse'],
  },
};

export default GreenhouseContextPanel;
