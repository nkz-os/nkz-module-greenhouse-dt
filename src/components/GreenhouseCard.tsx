/**
 * GreenhouseCard — A single greenhouse card for the dashboard grid.
 *
 * Displays the greenhouse name, current temperature/humidity (from aggregate
 * data), alert count, and a "View in viewer" action button.
 */
import React from 'react';
import { Thermometer, Droplets, AlertTriangle, Eye, Building2 } from 'lucide-react';
import { useTranslation } from '@nekazari/sdk';
import type { Greenhouse, GreenhouseState, Alert } from '../services/api';

const VIEWER_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_VIEWER_URL) ||
  'https://nekazari.robotika.cloud';

interface GreenhouseCardProps {
  greenhouse: Greenhouse;
  state?: GreenhouseState;
  alerts?: Alert[];
}

export const GreenhouseCard: React.FC<GreenhouseCardProps> = ({
  greenhouse,
  state,
  alerts,
}) => {
  const { t } = useTranslation('greenhouse-dt');

  // Aggregate metrics: compute average across all zones
  const allZones = state?.zones ?? [];
  const zoneAverages = allZones
    .map((z) => z.aggregates)
    .filter((a): a is NonNullable<typeof a> => a != null);

  const avgTemp =
    zoneAverages.length > 0
      ? zoneAverages.reduce((sum, a) => sum + (a.avg_temperature ?? 0), 0) /
        zoneAverages.length
      : null;

  const avgHumidity =
    zoneAverages.length > 0
      ? zoneAverages.reduce((sum, a) => sum + (a.avg_humidity ?? 0), 0) /
        zoneAverages.length
      : null;

  const activeAlertCount = (alerts ?? []).filter(
    (a) => a.status === 'active',
  ).length;

  const name = greenhouse.name || greenhouse.id;
  const sensorCount = state?.total_sensors ?? '—';

  const handleViewInViewer = () => {
    window.open(VIEWER_BASE_URL, '_blank');
  };

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 transition-all hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-gray-900">
              {name}
            </h3>
            <p className="text-xs text-gray-500">
              {t('greenhouse.sensors')}: {sensorCount}
            </p>
          </div>
        </div>

        {activeAlertCount > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600">
            <AlertTriangle className="h-3 w-3" />
            {activeAlertCount}
          </span>
        )}
      </div>

      {/* Metrics row */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MetricBox
          icon={Thermometer}
          label={t('greenhouse.temperature')}
          value={avgTemp !== null ? `${avgTemp.toFixed(1)}°C` : t('greenhouse.no_data')}
          accent="text-orange-600 bg-orange-50"
        />
        <MetricBox
          icon={Droplets}
          label={t('greenhouse.humidity')}
          value={avgHumidity !== null ? `${avgHumidity.toFixed(0)}%` : t('greenhouse.no_data')}
          accent="text-sky-600 bg-sky-50"
        />
      </div>

      {/* Action */}
      <button
        type="button"
        onClick={handleViewInViewer}
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900"
      >
        <Eye className="h-3.5 w-3.5" />
        {t('greenhouse.view_in_viewer')}
      </button>
    </div>
  );
};

/* ── helper sub-component ────────────────────────────────────────────── */

interface MetricBoxProps {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  accent: string;
}

const MetricBox: React.FC<MetricBoxProps> = ({
  icon: Icon,
  label,
  value,
  accent,
}) => (
  <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/50 p-2.5">
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${accent}`}>
      <Icon className="h-4 w-4" />
    </div>
    <div className="min-w-0">
      <p className="truncate text-[10px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  </div>
);
