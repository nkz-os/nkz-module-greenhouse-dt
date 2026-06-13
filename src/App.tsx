/**
 * App — Main dashboard page for the Greenhouse Digital Twin module.
 *
 * Orchestrates data fetching (greenhouses, states, alerts) and renders:
 *  1. DashboardSummary (total greenhouses / sensors / active alerts)
 *  2. Greenhouse grid (list of greenhouse cards with key metrics)
 *  3. RecentAlerts (latest alerts across all greenhouses)
 *
 * Handles loading, error, and empty states. Responsive layout.
 */
import './i18n';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from '@nekazari/sdk';
import { AlertCircle, RefreshCw, Building2 } from 'lucide-react';
import { greenhouseApi, type Greenhouse, type GreenhouseState, type Alert } from './services/api';
import { DashboardSummary } from './components/DashboardSummary';
import { GreenhouseCard } from './components/GreenhouseCard';
import { RecentAlerts } from './components/RecentAlerts';

/* ── types ────────────────────────────────────────────────────────────── */

interface GreenhouseWithData {
  greenhouse: Greenhouse;
  state?: GreenhouseState;
  alerts?: Alert[];
}

interface DashboardData {
  greenhouses: GreenhouseWithData[];
  allAlerts: Alert[];
  activeAlertCount: number;
  totalSensors: number;
}

/* ── data-fetching hook ───────────────────────────────────────────────── */

function useDashboardData() {
  const [data, setData] = useState<DashboardData>({
    greenhouses: [],
    allAlerts: [],
    activeAlertCount: 0,
    totalSensors: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      // 1. Greenhouse list
      const list = await greenhouseApi.list();
      if (signal?.aborted) return;

      if (list.length === 0) {
        if (!signal?.aborted) {
          setData({
            greenhouses: [],
            allAlerts: [],
            activeAlertCount: 0,
            totalSensors: 0,
          });
          setLoading(false);
        }
        return;
      }

      // 2. States in parallel (gracefully handle individual failures)
      const stateResults = await Promise.allSettled(
        list.map((gh) => greenhouseApi.getState(gh.id)),
      );
      if (signal?.aborted) return;

      const stateMap = new Map<string, GreenhouseState>();
      stateResults.forEach((r) => {
        if (r.status === 'fulfilled') {
          stateMap.set(r.value.greenhouse_id, r.value);
        }
      });

      // 3. Alerts in parallel
      const alertResults = await Promise.allSettled(
        list.map((gh) => greenhouseApi.getAlerts(gh.id)),
      );
      if (signal?.aborted) return;

      const alertsMap = new Map<string, Alert[]>();
      alertResults.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          alertsMap.set(list[i].id, r.value);
        }
      });

      // 4. Derive
      if (signal?.aborted) return;

      const greenhouses: GreenhouseWithData[] = list.map((gh) => ({
        greenhouse: gh,
        state: stateMap.get(gh.id),
        alerts: alertsMap.get(gh.id),
      }));

      const allAlerts = Array.from(alertsMap.values()).flat();
      const activeAlertCount = allAlerts.filter(
        (a) => a.status === 'active',
      ).length;
      const totalSensors = Array.from(stateMap.values()).reduce(
        (sum, s) => sum + s.total_sensors,
        0,
      );

      if (!signal?.aborted) {
        setData({ greenhouses, allAlerts, activeAlertCount, totalSensors });
      }
    } catch (err) {
      if (signal?.aborted) return;
      const msg =
        err instanceof Error ? err.message : 'Failed to load dashboard';
      setError(msg);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    retryRef.current = ctrl;
    fetchAll(ctrl.signal);
    return () => {
      ctrl.abort();
      retryRef.current?.abort();
    };
  }, [fetchAll]);

  const retryRef = useRef<AbortController | null>(null);

  const retry = useCallback(() => {
    retryRef.current?.abort();
    const ctrl = new AbortController();
    retryRef.current = ctrl;
    fetchAll(ctrl.signal);
  }, [fetchAll]);

  return { ...data, loading, error, retry };
}

/* ── Skeleton for the greenhouse grid ─────────────────────────────────── */

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-gray-200 bg-white p-5"
        >
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-gray-200" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-3/5 rounded bg-gray-200" />
              <div className="h-3 w-2/5 rounded bg-gray-100" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="h-14 rounded-lg bg-gray-100" />
            <div className="h-14 rounded-lg bg-gray-100" />
          </div>
          <div className="mt-4 h-9 rounded-lg bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

/* ── Error state ──────────────────────────────────────────────────────── */

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation('greenhouse-dt');

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-red-200 bg-red-50 px-6 py-12 text-center">
      <AlertCircle className="h-10 w-10 text-red-400" />
      <div>
        <p className="text-sm font-medium text-red-800">
          {t('greenhouse.error_loading')}
        </p>
        <p className="mt-1 text-xs text-red-600">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {t('greenhouse.retry')}
      </button>
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────────────────── */

function EmptyState() {
  const { t } = useTranslation('greenhouse-dt');

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
      <Building2 className="h-10 w-10 text-gray-300" />
      <p className="text-sm font-medium text-gray-600">
        {t('greenhouse.no_greenhouses')}
      </p>
    </div>
  );
}

/* ── Main App ─────────────────────────────────────────────────────────── */

const App: React.FC = () => {
  const { t } = useTranslation('greenhouse-dt');
  const {
    greenhouses,
    allAlerts,
    activeAlertCount,
    totalSensors,
    loading,
    error,
    retry,
  } = useDashboardData();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
          {t('greenhouse.title')}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {t('greenhouse.list_title')}
        </p>
      </div>

      {/* Summary cards */}
      <div className="mb-8">
        <DashboardSummary
          totalGreenhouses={greenhouses.length}
          totalSensors={totalSensors}
          activeAlertCount={activeAlertCount}
          loading={loading}
        />
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="mb-8">
          <ErrorState message={error} onRetry={retry} />
        </div>
      )}

      {/* Greenhouse grid */}
      <div className="mb-8">
        {loading ? (
          <SkeletonGrid />
        ) : greenhouses.length === 0 && !error ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {greenhouses.map((gh) => (
              <GreenhouseCard
                key={gh.greenhouse.id}
                greenhouse={gh.greenhouse}
                state={gh.state}
                alerts={gh.alerts}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent alerts */}
      <div className="mb-8">
        <RecentAlerts alerts={allAlerts} loading={loading} />
      </div>
    </div>
  );
};

export default App;
