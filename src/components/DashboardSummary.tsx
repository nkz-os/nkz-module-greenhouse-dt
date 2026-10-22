/**
 * DashboardSummary — Summary cards at top of the greenhouse dashboard.
 *
 * Shows three cards: Total Greenhouses, Total Sensors, Active Alerts.
 * Renders skeleton placeholders while loading.
 */
import React from 'react';
import { Warehouse, Activity, Bell } from 'lucide-react';
import { useTranslation } from '@nekazari/sdk';

interface DashboardSummaryProps {
  totalGreenhouses: number;
  totalSensors: number;
  activeAlertCount: number;
  loading: boolean;
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gray-200" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 rounded bg-gray-200" />
          <div className="h-6 w-12 rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

export const DashboardSummary: React.FC<DashboardSummaryProps> = ({
  totalGreenhouses,
  totalSensors,
  activeAlertCount,
  loading,
}) => {
  const { t } = useTranslation('greenhouse-dt');

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const cards = [
    {
      label: t('greenhouse.total_greenhouses'),
      value: totalGreenhouses,
      icon: Warehouse,
      accent: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: t('greenhouse.total_sensors'),
      value: totalSensors,
      icon: Activity,
      accent: 'text-blue-600 bg-blue-50',
    },
    {
      label: t('greenhouse.active_alerts_count'),
      value: activeAlertCount,
      icon: Bell,
      accent: activeAlertCount > 0 ? 'text-amber-600 bg-amber-50' : 'text-gray-400 bg-gray-50',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.accent}`}>
              <card.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                {card.label}
              </p>
              <p className="mt-0.5 text-2xl font-bold text-gray-900">
                {card.value}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
