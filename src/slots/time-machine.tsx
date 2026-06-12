// src/slots/time-machine.tsx
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewer } from '@nekazari/sdk';
import { Play, Pause, SkipBack } from 'lucide-react';
import { useTimelineContext, TimelineVariable, TimelineProvider } from '../contexts/TimelineContext';
import { greenhouseApi } from '../services/api';

const VARIABLE_OPTIONS: { value: TimelineVariable; labelKey: string }[] = [
  { value: 'temperature', labelKey: 'time_machine.temperature' },
  { value: 'humidity', labelKey: 'time_machine.humidity' },
  { value: 'leafWetness', labelKey: 'time_machine.leaf_wetness' },
  { value: 'co2', labelKey: 'time_machine.co2' },
  { value: 'par', labelKey: 'time_machine.par' },
];

const TimeMachineInner: React.FC = () => {
  const { t } = useTranslation('greenhouse-dt');
  const viewer = useViewer();
  const ctx = useTimelineContext();

  const greenhouseId: string | null =
    viewer.selectedEntityType === 'AgriGreenhouse' && viewer.selectedEntityId
      ? viewer.selectedEntityId.split(':').pop() || null
      : null;

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const fetchRef = useRef(greenhouseId);
  const timeRef = useRef(ctx.currentTime);
  timeRef.current = ctx.currentTime;
  fetchRef.current = greenhouseId;

  // Playback animation: tick backward 15 min every 500ms
  useEffect(() => {
    if (!ctx.playing || !greenhouseId) return;
    const interval = setInterval(() => {
      const next = new Date(timeRef.current.getTime() - 15 * 60 * 1000);
      timeRef.current = next;
      ctx.setCurrentTime(next);
    }, 500);
    return () => clearInterval(interval);
  }, [ctx.playing, greenhouseId]);

  // Debounced reconstruction fetch
  useEffect(() => {
    if (!ctx.dirty || !greenhouseId || ctx.loading) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      if (fetchRef.current !== greenhouseId) return;
      ctx.setLoading(true);
      try {
        const result = await greenhouseApi.reconstruct(
          greenhouseId,
          ctx.currentTime.toISOString(),
          ctx.variable,
        );
        if (fetchRef.current === greenhouseId) {
          ctx.setReconstruction(result);
        } else {
          ctx.setLoading(false);
        }
      } catch (err) {
        console.error('Reconstruction failed:', err);
        ctx.setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [ctx.dirty, ctx.currentTime, ctx.variable, greenhouseId]);

  if (!greenhouseId) return null;

  const MIN_TIME = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const MAX_TIME = new Date();
  const sliderRange = MAX_TIME.getTime() - MIN_TIME.getTime();
  const currentOffset = ctx.currentTime.getTime() - MIN_TIME.getTime();
  const sliderValue = sliderRange > 0 ? (currentOffset / sliderRange) * 100 : 0;

  return (
    <div className="flex items-center gap-3 p-2 bg-white border-t text-sm">
      {/* Play/Pause */}
      <button
        className="p-1 rounded hover:bg-gray-100"
        onClick={() => ctx.setPlaying(!ctx.playing)}
        title={ctx.playing ? t('time_machine.pause') : t('time_machine.play')}
      >
        {ctx.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>

      {/* Rewind to latest */}
      <button
        className="p-1 rounded hover:bg-gray-100"
        onClick={() => ctx.setCurrentTime(new Date())}
        title={t('time_machine.rewind')}
      >
        <SkipBack className="h-4 w-4" />
      </button>

      {/* Timeline slider */}
      <input
        type="range"
        className="flex-1 h-2"
        min={0}
        max={100}
        step={0.347}
        value={sliderValue}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const pct = parseFloat(e.target.value);
          const t = new Date(MIN_TIME.getTime() + (pct / 100) * sliderRange);
          ctx.setCurrentTime(t);
        }}
      />

      {/* Timestamp display */}
      <span className="text-xs text-gray-500 min-w-[140px] text-right">
        {ctx.currentTime.toLocaleString()}
      </span>

      {/* Variable selector */}
      <select
        className="text-xs border rounded px-1 py-0.5"
        value={ctx.variable}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
          ctx.setVariable(e.target.value as TimelineVariable)
        }
      >
        {VARIABLE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {t(opt.labelKey)}
          </option>
        ))}
      </select>

      {/* Stats (keep visible but dimmed during loading) */}
      <span
        className={`text-xs min-w-[180px] ${ctx.loading ? 'opacity-40' : 'text-gray-500'}`}
      >
        {ctx.stats ? (
          <>
            {t('time_machine.mean', { value: ctx.stats.mean.toFixed(1) })}
            {' \u00B7 '}
            {t('time_machine.min', { value: ctx.stats.min.toFixed(1) })}
            {' \u00B7 '}
            {t('time_machine.max', { value: ctx.stats.max.toFixed(1) })}
            {' \u00B7 '}
            {ctx.sensorCount} {t('time_machine.sensors')}
          </>
        ) : (
          '\u2014\u2014'
        )}
      </span>

      {ctx.loading && (
        <span className="text-xs text-blue-500 animate-pulse ml-1">{t('time_machine.loading')}</span>
      )}
    </div>
  );
};

const TimeMachine: React.FC = () => (
  <TimelineProvider>
    <TimeMachineInner />
  </TimelineProvider>
);

export default TimeMachine;
