/**
 * RecentAlerts — Lists the most recent alerts across all greenhouses.
 *
 * Alerts are sorted by dateIssued (newest first). Shows severity level,
 * alert name, and a relative timestamp. Handles empty and loading states.
 */
import React from 'react';
import { AlertCircle, Clock } from 'lucide-react';
import { useTranslation } from '@nekazari/sdk';
import type { Alert } from '../services/api';

interface RecentAlertsProps {
  alerts: Alert[];
  loading: boolean;
}

/* ── helpers ──────────────────────────────────────────────────────────── */

function formatRelativeTime(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return dateStr;

  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d`;
}

const severityConfig: Record<
  string,
  { bg: string; text: string; dot: string; labelKey: string }
> = {
  critical: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    dot: 'bg-red-500',
    labelKey: 'greenhouse.alert_critical',
  },
  warning: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-400',
    labelKey: 'greenhouse.alert_warning',
  },
  info: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    dot: 'bg-blue-400',
    labelKey: 'greenhouse.alert_info',
  },
};

const defaultSeverity = severityConfig.info;

/* ── skeleton ─────────────────────────────────────────────────────────── */

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
      <div className="h-2 w-2 rounded-full bg-gray-200" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-3/4 rounded bg-gray-200" />
        <div className="h-2.5 w-1/3 rounded bg-gray-100" />
      </div>
      <div className="h-2.5 w-10 rounded bg-gray-200" />
    </div>
  );
}

/* ── component ────────────────────────────────────────────────────────── */

export const RecentAlerts: React.FC<RecentAlertsProps> = ({
  alerts,
  loading,
}) => {
  const { t } = useTranslation('greenhouse-dt');

  // Sort newest first
  const sorted = loading
    ? []
    : [...alerts].sort((a, b) => {
        const da = a.dateIssued ? new Date(a.dateIssued).getTime() : 0;
        const db = b.dateIssued ? new Date(b.dateIssued).getTime() : 0;
        return db - da;
      });

  // Show at most 20
  const visible = sorted.slice(0, 20);

  const renderBody = () => {
    if (loading) {
      return (
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      );
    }

    if (visible.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <AlertCircle className="h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">
            {t('greenhouse.no_active_alerts')}
          </p>
        </div>
      );
    }

    return (
      <ul className="divide-y divide-gray-100" role="list">
        {visible.map((alert) => {
          const sev = severityConfig[alert.severity?.toLowerCase() ?? ''] ?? defaultSeverity;
          return (
            <li
              key={alert.id}
              className={`flex items-start gap-3 px-4 py-3 ${sev.bg}`}
            >
              {/* Severity dot */}
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sev.dot}`}
                title={t(sev.labelKey)}
              />

              {/* Content */}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${sev.text}`}>
                  {alert.name || alert.subCategory || alert.id}
                </p>
                {alert.description && (
                  <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">
                    {alert.description}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-gray-400">
                  <span>{t(sev.labelKey)}</span>
                  {alert.subCategory && (
                    <>
                      <span>·</span>
                      <span>{alert.subCategory}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Timestamp */}
              {alert.dateIssued && (
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-gray-400">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(alert.dateIssued)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <AlertCircle className="h-4 w-4 text-gray-500" />
          {t('greenhouse.recent_alerts')}
          {!loading && visible.length > 0 && (
            <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
              {visible.length}
            </span>
          )}
        </h2>
      </div>
      {renderBody()}
    </section>
  );
};
