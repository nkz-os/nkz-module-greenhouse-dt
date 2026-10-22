// src/slots/context-panel.tsx
/**
 * context-panel slot widget for Greenhouse DT.
 *
 * Shows when an AgriGreenhouse entity is selected in the Unified Viewer.
 * Displays current state: temperature, humidity, VPD, leaf wetness, CO₂, PAR,
 * solar irradiance, zone details, alerts with expand/collapse, and last updated.
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewer } from '@nekazari/sdk';
import {
  AlertTriangle,
  BatteryCharging,
  Thermometer,
  Droplets,
  Wind,
  CloudDrizzle,
  FlaskConical,
  Sun,
  SunMedium,
  Activity,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { greenhouseApi, GreenhouseState, Alert, ReconstructionResult } from '../services/api';

// ─── Helpers ───────────────────────────────────────────────────────────

/** Compute VPD (kPa) from temperature (°C) and relative humidity (%). */
function computeVPD(temp: number, hum: number): number {
  const es = 0.6108 * Math.exp((17.27 * temp) / (temp + 237.3));
  const ea = es * (hum / 100);
  return Math.max(0, es - ea);
}

type VPDRange = 'very_low' | 'low' | 'optimal' | 'high' | 'very_high';

function getVPDRange(vpd: number): VPDRange {
  if (vpd < 0.4) return 'very_low';
  if (vpd < 0.8) return 'low';
  if (vpd < 1.2) return 'optimal';
  if (vpd < 1.6) return 'high';
  return 'very_high';
}

function getVPDStyle(vpd: number): { bg: string; text: string; dot: string } {
  const range = getVPDRange(vpd);
  switch (range) {
    case 'very_low':
      return { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' };
    case 'low':
      return { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' };
    case 'optimal':
      return { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' };
    case 'high':
      return { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' };
    case 'very_high':
      return { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' };
  }
}

function getVPDLabelKey(vpd: number): string {
  return `greenhouse.vpd_range_${getVPDRange(vpd)}`;
}

/** Find the most recent lastSeen across all sensors. */
function getMostRecentSeen(
  sensors: Array<{ lastSeen?: string }>,
): string | undefined {
  const dates = sensors
    .map((s) => s.lastSeen)
    .filter((d): d is string => !!d)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return dates[0];
}

/** Format a date string as relative time (e.g. "12s", "2min", "1h"). */
function formatRelativeTime(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return null;
  if (diff < 5000) return '<5s';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

/** Returns true if the given date string is older than 5 minutes. */
function isStale(dateStr: string | undefined): boolean {
  if (!dateStr) return true;
  return Date.now() - new Date(dateStr).getTime() > 5 * 60 * 1000;
}

// ─── Sub-components ────────────────────────────────────────────────────

function SkeletonMetricCard() {
  return (
    <div className="rounded-lg p-3 animate-pulse bg-gray-100">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded bg-gray-300" />
        <div className="h-3 w-16 rounded bg-gray-300" />
      </div>
      <div className="mt-1.5 h-5 w-12 rounded bg-gray-300" />
    </div>
  );
}

function SkeletonZoneCard() {
  return (
    <div className="border rounded-lg p-3 animate-pulse">
      <div className="h-3 w-24 rounded bg-gray-200 mb-2" />
      <div className="h-3 w-32 rounded bg-gray-200" />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  bgColor = 'bg-gray-50',
  iconColor = 'text-gray-600',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  bgColor?: string;
  iconColor?: string;
}) {
  return (
    <div className={`${bgColor} rounded-lg p-2 flex items-center gap-2`}>
      <Icon className={`h-4 w-4 ${iconColor} shrink-0`} />
      <div className="min-w-0">
        <div className="text-xs text-gray-500 truncate">{label}</div>
        <div className="font-semibold text-gray-900">{value}</div>
      </div>
    </div>
  );
}

// ─── Heatmap variable chips ────────────────────────────────────────────

interface HeatmapVar {
  key: string;
  label: string;
  icon: string;
}

const HEATMAP_VARS: HeatmapVar[] = [
  { key: 'temperature', label: 'Temp', icon: '🌡' },
  { key: 'humidity', label: 'Hum', icon: '💧' },
  { key: 'leafWetness', label: 'LW', icon: '🍃' },
  { key: 'co2', label: 'CO₂', icon: '🧪' },
  { key: 'par', label: 'PAR', icon: '☀️' },
];

const LEGEND_CONFIG: Record<string, { min: string; max: string; gradient: string }> = {
  temperature: { min: '0°C', max: '50°C', gradient: 'linear-gradient(to right, #2b6cb0, #e53e3e)' },
  humidity: { min: '0%', max: '100%', gradient: 'linear-gradient(to right, #f7fafc, #2b6cb0)' },
  leafWetness: { min: '0', max: '1', gradient: 'linear-gradient(to right, #f7fafc, #38a169)' },
  co2: { min: '200 ppm', max: '800 ppm', gradient: 'linear-gradient(to right, #38a169, #e53e3e)' },
  par: { min: '0', max: '2000 μmol/m²/s', gradient: 'linear-gradient(to right, #f7fafc, #dd6b20)' },
};

// ─── Main Component ────────────────────────────────────────────────────

const GreenhouseContextPanel: React.FC = () => {
  const { t } = useTranslation('greenhouse-dt');
  const viewer = useViewer();

  const [state, setState] = useState<GreenhouseState | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [activeHeatmapVar, setActiveHeatmapVar] = useState<string | null>(null);
  const [heatmapReconstruct, setHeatmapReconstruct] = useState<ReconstructionResult | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);

  const greenhouseId: string | null =
    viewer.selectedEntityType === 'AgriGreenhouse' && viewer.selectedEntityId
      ? viewer.selectedEntityId.split(':').pop() || null
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
        setAlertsExpanded(false);
      })
      .catch(() => {
        setState(null);
        setAlerts([]);
      })
      .finally(() => setLoading(false));
  }, [greenhouseId]);

  // ── Heatmap variable click ───────────────────────────────────────────

  const handleHeatmapClick = useCallback(async (variable: string) => {
    if (!greenhouseId) return;
    if (activeHeatmapVar === variable) {
      setActiveHeatmapVar(null);
      setHeatmapReconstruct(null);
      return;
    }
    setActiveHeatmapVar(variable);
    setHeatmapLoading(true);
    try {
      const result = await greenhouseApi.reconstruct(
        greenhouseId,
        new Date().toISOString(),
        variable,
      );
      setHeatmapReconstruct(result);
    } catch {
      // Silently fail — the legend is still useful
    } finally {
      setHeatmapLoading(false);
    }
  }, [greenhouseId, activeHeatmapVar]);

  // ── Derived metrics ──────────────────────────────────────────────────

  const metrics = useMemo(() => {
    if (!state) return null;

    const allSensors = state.zones.flatMap((z) => z.sensors);

    // ── Temperature ────────────────────────────────────
    const temps = allSensors
      .map((s) => s.temperature)
      .filter((t): t is number => t !== undefined);
    const avgTemp =
      temps.length > 0
        ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)
        : null;

    // ── Humidity ───────────────────────────────────────
    const hums = allSensors
      .map((s) => s.relativeHumidity)
      .filter((h): h is number => h !== undefined);
    const avgHum =
      hums.length > 0
        ? (hums.reduce((a, b) => a + b, 0) / hums.length).toFixed(1)
        : null;

    // ── Leaf Wetness ───────────────────────────────────
    const lwValues = allSensors
      .map((s) => s.leafWetness)
      .filter((l): l is number => l !== undefined);
    const lwActive = lwValues.filter((l) => l === 1).length;
    const lwPct = lwValues.length > 0 ? Math.round((lwActive / lwValues.length) * 100) : null;

    // ── CO₂ ────────────────────────────────────────────
    const co2Vals = allSensors
      .map((s) => s.co2)
      .filter((c): c is number => c !== undefined);
    const avgCO2 =
      co2Vals.length > 0
        ? Math.round(co2Vals.reduce((a, b) => a + b, 0) / co2Vals.length)
        : null;

    // ── PAR ────────────────────────────────────────────
    const parVals = allSensors
      .map((s) => s.par)
      .filter((p): p is number => p !== undefined);
    const avgPAR =
      parVals.length > 0
        ? Math.round(parVals.reduce((a, b) => a + b, 0) / parVals.length)
        : null;

    // ── Solar Irradiance ───────────────────────────────
    const solVals = allSensors
      .map((s) => s.solarIrradiance)
      .filter((s): s is number => s !== undefined);
    const avgSol =
      solVals.length > 0
        ? Math.round(solVals.reduce((a, b) => a + b, 0) / solVals.length)
        : null;

    // ── Battery ────────────────────────────────────────
    const batteryLevels = allSensors
      .map((s) => s.batteryLevel)
      .filter((b): b is number => b !== undefined);
    const lowBatteryCount = batteryLevels.filter((b) => b < 20).length;
    const lowBatteryPct = batteryLevels.length > 0
      ? Math.round((lowBatteryCount / batteryLevels.length) * 100)
      : null;

    // ── VPD ────────────────────────────────────────────
    let vpdValue: number | null = null;
    if (avgTemp !== null && avgHum !== null) {
      vpdValue = parseFloat(computeVPD(parseFloat(avgTemp), parseFloat(avgHum)).toFixed(2));
    }

    // ── Last seen ──────────────────────────────────────
    const lastSeen = getMostRecentSeen(allSensors);

    return {
      avgTemp,
      avgHum,
      leafWetnessPct: lwPct,
      leafWetnessActive: lwActive,
      leafWetnessTotal: lwValues.length,
      avgCO2,
      avgPAR,
      avgSol,
      lowBatteryPct,
      vpdValue,
      lastSeen,
    };
  }, [state]);

  // ── Early returns ────────────────────────────────────────────────────

  if (!greenhouseId) return null;

  if (loading) {
    return (
      <div className="p-3 space-y-3 text-sm">
        {/* Skeleton header */}
        <div className="flex items-center gap-2 animate-pulse">
          <div className="h-4 w-4 rounded bg-gray-300" />
          <div className="h-4 w-36 rounded bg-gray-300" />
        </div>
        {/* Skeleton metric grid (3×2) */}
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonMetricCard key={i} />
          ))}
        </div>
        {/* Skeleton zone cards */}
        <SkeletonZoneCard />
        <SkeletonZoneCard />
        {/* Skeleton alerts */}
        <div className="animate-pulse">
          <div className="h-3 w-24 rounded bg-gray-200 mb-1" />
          <div className="h-10 rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="p-3 text-sm text-gray-500">
        {t('greenhouse.no_data')}
      </div>
    );
  }

  // ── Derived display values ───────────────────────────────────────────

  const noData = t('greenhouse.no_data');
  const lastSeenStr = metrics?.lastSeen ? formatRelativeTime(metrics.lastSeen) : null;
  const stale = metrics?.lastSeen ? isStale(metrics.lastSeen) : false;

  const visibleAlerts = alertsExpanded ? alerts : alerts.slice(0, 5);
  const hasMoreAlerts = alerts.length > 5 && !alertsExpanded;

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="p-3 space-y-3 text-sm">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-nkz-primary" />
        <h3 className="font-semibold text-gray-900">
          {t('greenhouse.title')}
        </h3>
      </div>

      {/* ── Last updated ────────────────────────────────── */}
      <div
        className={`text-xs ${stale ? 'text-amber-600 font-medium' : 'text-gray-400'}`}
      >
        {t('greenhouse.last_seen')}: {lastSeenStr ?? '--'}
      </div>

      {/* ── Variable chips ──────────────────────────────── */}
      <div className="flex flex-wrap gap-1">
        {HEATMAP_VARS.map((v) => (
          <button
            key={v.key}
            onClick={() => handleHeatmapClick(v.key)}
            disabled={heatmapLoading}
            className={`text-xs px-2 py-1 rounded-full transition-colors ${
              activeHeatmapVar === v.key
                ? 'bg-blue-100 text-blue-700 font-medium ring-1 ring-blue-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            } disabled:opacity-50 disabled:cursor-wait`}
          >
            {v.icon} {v.label}
          </button>
        ))}
        {heatmapLoading && (
          <span className="text-xs text-gray-400 self-center ml-1">
            reconstructing...
          </span>
        )}
      </div>

      {/* ── Heatmap color legend ────────────────────────── */}
      {activeHeatmapVar && LEGEND_CONFIG[activeHeatmapVar] && (() => {
        const cfg = LEGEND_CONFIG[activeHeatmapVar];
        return (
          <div className="rounded-lg p-2 bg-gray-50 border text-xs">
            <div className="flex justify-between text-[10px] text-gray-500 mb-1">
              <span>{cfg.min}</span>
              <span>{cfg.max}</span>
            </div>
            <div
              className="h-3 rounded"
              style={{ background: cfg.gradient }}
            />
            {heatmapReconstruct && (
              <div className="mt-1 text-center text-[10px] text-green-600">
                ✓ {t(`greenhouse.${activeHeatmapVar}`)}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Metric grid (2 cols, auto rows) ─────────────── */}
      <div className="grid grid-cols-2 gap-2">
        {/* Temperature */}
        <MetricCard
          icon={Thermometer}
          label={t('greenhouse.temperature')}
          value={metrics?.avgTemp !== null ? `${metrics?.avgTemp}°C` : noData}
          bgColor="bg-blue-50"
          iconColor="text-blue-600"
        />

        {/* Humidity */}
        <MetricCard
          icon={Droplets}
          label={t('greenhouse.humidity')}
          value={metrics?.avgHum !== null ? `${metrics?.avgHum}%` : noData}
          bgColor="bg-green-50"
          iconColor="text-green-600"
        />

        {/* Leaf Wetness */}
        <MetricCard
          icon={CloudDrizzle}
          label={t('greenhouse.leaf_wetness')}
          value={
            metrics?.leafWetnessPct != null
              ? `${metrics.leafWetnessPct}%`
              : noData
          }
          bgColor="bg-cyan-50"
          iconColor="text-cyan-600"
        />

        {/* CO₂ */}
        <MetricCard
          icon={FlaskConical}
          label={t('greenhouse.co2')}
          value={metrics?.avgCO2 != null ? `${metrics.avgCO2} ppm` : noData}
          bgColor="bg-gray-50"
          iconColor="text-gray-600"
        />

        {/* PAR */}
        <MetricCard
          icon={Sun}
          label={t('greenhouse.par')}
          value={
            metrics?.avgPAR != null ? `${metrics.avgPAR} μmol/m²/s` : noData
          }
          bgColor="bg-amber-50"
          iconColor="text-amber-600"
        />

        {/* Solar Irradiance */}
        <MetricCard
          icon={SunMedium}
          label={t('greenhouse.solar_irradiance')}
          value={metrics?.avgSol != null ? `${metrics.avgSol} W/m²` : noData}
          bgColor="bg-orange-50"
          iconColor="text-orange-600"
        />

        {/* Battery */}
        <MetricCard
          icon={BatteryCharging}
          label={t('greenhouse.battery')}
          value={metrics?.lowBatteryPct != null ? `${metrics.lowBatteryPct}% low` : noData}
          bgColor="bg-purple-50"
          iconColor="text-purple-600"
        />
      </div>

      {/* ── VPD with range indicator ────────────────────── */}
      {(() => {
        const vpd = metrics?.vpdValue;
        if (vpd == null) {
          return (
            <div className="rounded-lg p-3 bg-gray-50">
              <div className="flex items-center gap-2">
                <Wind className="h-4 w-4 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-500">{t('greenhouse.vpd')}</div>
                  <div className="font-semibold text-gray-400">{noData}</div>
                </div>
              </div>
            </div>
          );
        }
        const vpdStyle = getVPDStyle(vpd);
        return (
          <div className={`rounded-lg p-3 ${vpdStyle.bg}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wind className={`h-4 w-4 ${vpdStyle.text}`} />
                <div>
                  <div className="text-xs text-gray-500">{t('greenhouse.vpd')}</div>
                  <div className={`font-semibold ${vpdStyle.text}`}>
                    {vpd} kPa
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`inline-block h-2 w-2 rounded-full ${vpdStyle.dot}`} />
                <span className={`text-xs font-medium ${vpdStyle.text}`}>
                  {t(getVPDLabelKey(vpd))}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Zone cards ──────────────────────────────────── */}
      {state.zones.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 mb-1">
            {t('greenhouse.zones')}
          </h4>
          {state.zones.map((zone) => {
            // Zone-level leaf wetness
            const zoneLW = zone.sensors
              .map((s) => s.leafWetness)
              .filter((l): l is number => l !== undefined);
            const zoneLWActive = zoneLW.filter((l) => l === 1).length;

            return (
              <div
                key={zone.zone_id}
                className="border rounded-lg p-2 mb-1 last:mb-0"
              >
                <div className="text-xs font-medium text-gray-500 mb-1 flex items-center justify-between">
                  <span>
                    {zone.zone_id.split('-').pop()} ({zone.sensor_count}{' '}
                    {t('greenhouse.sensors')})
                  </span>
                </div>

                {/* Temperature aggregate */}
                <div className="text-xs text-gray-600 space-x-3">
                  {zone.aggregates.avg_temperature !== undefined && (
                    <span>Ø {zone.aggregates.avg_temperature}°C</span>
                  )}
                  {zone.aggregates.min_temperature !== undefined && (
                    <span>↓ {zone.aggregates.min_temperature}°C</span>
                  )}
                  {zone.aggregates.max_temperature !== undefined && (
                    <span>↑ {zone.aggregates.max_temperature}°C</span>
                  )}
                  {zone.aggregates.avg_humidity !== undefined && (
                    <span>Ø {zone.aggregates.avg_humidity}% RH</span>
                  )}
                </div>

                {/* Leaf wetness indicator */}
                {zoneLW.length > 0 && (
                  <div className="text-xs text-cyan-600 mt-0.5 flex items-center gap-1">
                    <CloudDrizzle className="h-3 w-3" />
                    <span>
                      {zoneLWActive}/{zoneLW.length} {t('greenhouse.sensors_wet')}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Alerts section ──────────────────────────────── */}
      {alerts.length > 0 ? (
        <div>
          <div className="flex items-center gap-1 text-xs font-medium text-red-600 mb-1">
            <AlertTriangle className="h-3 w-3" />
            {t('greenhouse.active_alerts')} ({alerts.length})
          </div>

          {visibleAlerts.map((alert) => {
            let sevClasses: string;
            if (alert.severity === 'critical' || alert.severity === 'high') {
              sevClasses = 'bg-red-50 text-red-700';
            } else if (alert.severity === 'medium') {
              sevClasses = 'bg-yellow-50 text-yellow-700';
            } else {
              sevClasses = 'bg-blue-50 text-blue-700';
            }

            return (
              <div
                key={alert.id}
                className={`text-xs p-2 rounded mb-1 ${sevClasses}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{alert.name}</span>
                  {alert.subCategory && (
                    <span className="shrink-0 px-1 py-0.5 rounded bg-white/60 text-[10px] uppercase tracking-wider whitespace-nowrap">
                      {alert.subCategory.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                {alert.description && (
                  <div className="truncate mt-0.5 opacity-80">
                    {alert.description}
                  </div>
                )}
              </div>
            );
          })}

          {hasMoreAlerts && (
            <button
              onClick={() => setAlertsExpanded(true)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mt-1"
              aria-expanded={false}
            >
              <ChevronDown className="h-3 w-3" />
              {t('greenhouse.show_more', { count: alerts.length - 5 })}
            </button>
          )}

          {alertsExpanded && alerts.length > 5 && (
            <button
              onClick={() => setAlertsExpanded(false)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mt-1"
              aria-expanded={true}
            >
              <ChevronUp className="h-3 w-3" />
              {t('greenhouse.show_less')}
            </button>
          )}
        </div>
      ) : (
        <div className="text-xs text-gray-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {t('greenhouse.no_active_alerts')}
        </div>
      )}
    </div>
  );
};

export default GreenhouseContextPanel;
