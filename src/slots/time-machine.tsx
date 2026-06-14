// src/slots/time-machine.tsx
import React, { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewer } from '@nekazari/sdk';
import { Play, Pause, Rewind, SkipBack, Download } from 'lucide-react';
import {
  useTimelineContext,
  TimelineVariable,
  TimelineProvider,
} from '../contexts/TimelineContext';
import { greenhouseApi } from '../services/api';

/* ── variable options ─────────────────────────────────────────────────── */

const VARIABLE_OPTIONS: { value: TimelineVariable; labelKey: string }[] = [
  { value: 'temperature', labelKey: 'time_machine.temperature' },
  { value: 'humidity', labelKey: 'time_machine.humidity' },
  { value: 'leafWetness', labelKey: 'time_machine.leaf_wetness' },
  { value: 'co2', labelKey: 'time_machine.co2' },
  { value: 'par', labelKey: 'time_machine.par' },
];

const RANGE_OPTIONS = [
  { hours: 24, label: 'time_machine.range_24h' },
  { hours: 72, label: 'time_machine.range_72h' },
  { hours: 168, label: 'time_machine.range_7d' },
] as const;

/* ── stat colour helpers ──────────────────────────────────────────────── */

type StatColor = 'green' | 'yellow' | 'red';

function getStatColor(variable: TimelineVariable, value: number): StatColor {
  switch (variable) {
    case 'temperature':
      if (value < 10 || value > 35) return 'red';
      if (value < 15 || value > 30) return 'yellow';
      return 'green';
    case 'humidity':
      if (value < 30 || value > 85) return 'red';
      if (value < 50 || value > 75) return 'yellow';
      return 'green';
    case 'leafWetness':
      return value > 0.5 ? 'yellow' : 'green';
    case 'co2':
      if (value < 200 || value > 800) return 'red';
      if (value < 300 || value > 600) return 'yellow';
      return 'green';
    case 'par':
      if (value < 100) return 'red';
      if (value < 300 || value > 2000) return 'yellow';
      return 'green';
  }
}

function isOptimal(variable: TimelineVariable, value: number): boolean {
  return getStatColor(variable, value) === 'green';
}

const statColorClass: Record<StatColor, string> = {
  green: 'text-green-600',
  yellow: 'text-yellow-600',
  red: 'text-red-500',
};

const StatDot: React.FC<{ color: StatColor }> = ({ color }) => (
  <span className={`${statColorClass[color]} text-[10px] leading-none mr-0.5`}>●</span>
);

function variableUnitLabel(v: TimelineVariable): string {
  switch (v) {
    case 'temperature': return ' °C';
    case 'humidity':    return ' %';
    case 'leafWetness': return '';
    case 'co2':         return ' ppm';
    case 'par':         return ' µmol/m²/s';
  }
}

/* ── time-range label ─────────────────────────────────────────────────── */

function rangeAgoLabel(hours: number, t: (k: string, opts?: any) => string): string {
  if (hours >= 168) return t('time_machine.days_ago', { days: Math.round(hours / 24) });
  return t('time_machine.hours_ago', { hours });
}

/* ── inner component ──────────────────────────────────────────────────── */

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
  const directionRef = useRef(ctx.direction);
  const rangeHoursRef = useRef(ctx.rangeHours);
  timeRef.current = ctx.currentTime;
  directionRef.current = ctx.direction;
  rangeHoursRef.current = ctx.rangeHours;
  fetchRef.current = greenhouseId;

  /* ── range-based min/max ─────────────────────────────────────────── */

  const maxTime = new Date();
  const minTime = new Date(maxTime.getTime() - ctx.rangeHours * 60 * 60 * 1000);
  const sliderRange = maxTime.getTime() - minTime.getTime();
  const currentOffset = ctx.currentTime.getTime() - minTime.getTime();
  const clampedOffset = Math.max(0, Math.min(currentOffset, sliderRange));
  const sliderValue = sliderRange > 0 ? (clampedOffset / sliderRange) * 100 : 0;

  /* ── clamp currentTime when range changes ────────────────────────── */

  const prevRangeRef = useRef(ctx.rangeHours);
  useEffect(() => {
    if (prevRangeRef.current === ctx.rangeHours) return;
    prevRangeRef.current = ctx.rangeHours;

    const mxt = new Date();
    const mnt = new Date(mxt.getTime() - ctx.rangeHours * 60 * 60 * 1000);
    if (ctx.currentTime.getTime() < mnt.getTime()) {
      ctx.setCurrentTime(new Date(mnt));
    } else if (ctx.currentTime.getTime() > mxt.getTime()) {
      ctx.setCurrentTime(new Date(mxt));
    }
  }, [ctx.rangeHours]);

  /* ── playback: tick every 500ms in the active direction ──────────── */

  useEffect(() => {
    if (!ctx.playing || !greenhouseId) return;

    const interval = setInterval(() => {
      const delta =
        directionRef.current === 'forward'
          ? 15 * 60 * 1000
          : -15 * 60 * 1000;

      const mxt = new Date();
      const mnt = new Date(mxt.getTime() - rangeHoursRef.current * 60 * 60 * 1000);
      const next = new Date(timeRef.current.getTime() + delta);

      // auto-stop when forward reaches now
      if (directionRef.current === 'forward' && next >= mxt) {
        timeRef.current = new Date();
        ctx.setCurrentTime(new Date());
        ctx.setPlaying(false);
        return;
      }

      // stop at range boundary when rewinding
      if (next < mnt || next > mxt) {
        if (directionRef.current === 'backward' && next < mnt) {
          ctx.setPlaying(false);
        }
        return;
      }

      timeRef.current = next;
      ctx.setCurrentTime(next);
    }, 500);

    return () => clearInterval(interval);
  }, [ctx.playing, greenhouseId]);

  /* ── debounced reconstruction fetch ──────────────────────────────── */

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

  /* ── play button handlers ────────────────────────────────────────── */

  const handlePlayForward = useCallback(() => {
    if (ctx.playing && ctx.direction === 'forward') {
      ctx.setPlaying(false);
    } else {
      ctx.setDirection('forward');
      ctx.setPlaying(true);
    }
  }, [ctx.playing, ctx.direction, ctx.setPlaying, ctx.setDirection]);

  const handlePlayBackward = useCallback(() => {
    if (ctx.playing && ctx.direction === 'backward') {
      ctx.setPlaying(false);
    } else {
      ctx.setDirection('backward');
      ctx.setPlaying(true);
    }
  }, [ctx.playing, ctx.direction, ctx.setPlaying, ctx.setDirection]);

  const handleGoLatest = useCallback(() => {
    ctx.setCurrentTime(new Date());
    ctx.setPlaying(false);
  }, [ctx.setCurrentTime, ctx.setPlaying]);

  /* ── slider change ───────────────────────────────────────────────── */

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const pct = parseFloat(e.target.value);
      const t = new Date(minTime.getTime() + (pct / 100) * sliderRange);
      ctx.setCurrentTime(t);
    },
    [minTime, sliderRange, ctx.setCurrentTime],
  );

  /* ── variable selector ───────────────────────────────────────────── */

  const handleVariableChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      ctx.setVariable(e.target.value as TimelineVariable);
    },
    [ctx.setVariable],
  );

  /* ── early exit ──────────────────────────────────────────────────── */

  if (!greenhouseId) return null;

  /* ── stat display helpers ────────────────────────────────────────── */

  const isInsufficient =
    !ctx.stats &&
    !ctx.loading &&
    (ctx.detail === 'insufficient_sensors' || ctx.detail === 'insufficient_readings');

  const showStats = ctx.stats && !isInsufficient;

  /* ── render ──────────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col gap-1.5 p-2 bg-white border-t text-xs">
      {/* ── Row 1: transport + range selector + variable ──────────────── */}
      <div className="flex items-center gap-1.5">
        {/* Play forward */}
        <button
          className={`p-1 rounded transition-colors ${
            ctx.playing && ctx.direction === 'forward'
              ? 'bg-blue-100 text-blue-600'
              : 'hover:bg-gray-100 text-gray-600'
          }`}
          onClick={handlePlayForward}
          title={t('time_machine.play_forward')}
        >
          {ctx.playing && ctx.direction === 'forward' ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Play backward (rewind) */}
        <button
          className={`p-1 rounded transition-colors ${
            ctx.playing && ctx.direction === 'backward'
              ? 'bg-blue-100 text-blue-600'
              : 'hover:bg-gray-100 text-gray-600'
          }`}
          onClick={handlePlayBackward}
          title={t('time_machine.play_backward')}
        >
          {ctx.playing && ctx.direction === 'backward' ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Rewind className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Latest / SkipBack */}
        <button
          className="p-1 rounded hover:bg-gray-100 text-gray-600"
          onClick={handleGoLatest}
          title={t('time_machine.rewind')}
        >
          <SkipBack className="h-3.5 w-3.5" />
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Range selector */}
        <div className="flex border rounded text-[11px] leading-none overflow-hidden">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.hours}
              className={`px-1.5 py-1 transition-colors ${
                ctx.rangeHours === opt.hours
                  ? 'bg-gray-700 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-100'
              }`}
              onClick={() => ctx.setRangeHours(opt.hours)}
            >
              {t(opt.label)}
            </button>
          ))}
        </div>

        {/* Variable selector */}
        <select
          className="text-[11px] border rounded px-1 py-1 bg-white text-gray-700"
          value={ctx.variable}
          onChange={handleVariableChange}
        >
          {VARIABLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
      </div>

      {/* ── Row 2: axis labels + slider + current time + loading bar ──── */}
      <div className="px-0.5">
        {/* Axis labels */}
        <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
          <span>{rangeAgoLabel(ctx.rangeHours, t)}</span>
          <span>{t('time_machine.now')}</span>
        </div>

        {/* Slider */}
        <input
          type="range"
          className="w-full h-1.5 cursor-pointer accent-gray-700"
          min={0}
          max={100}
          step={0.347}
          value={sliderValue}
          onChange={handleSliderChange}
        />

        {/* Date marker below slider */}
        <div className="flex justify-center text-[10px] text-gray-400 mt-0.5">
          <span>{ctx.currentTime.toLocaleString()}</span>
        </div>

        {/* Thin loading bar */}
        {ctx.loading && (
          <div className="h-0.5 w-full bg-blue-100 rounded overflow-hidden mt-0.5">
            <div
              className="h-full bg-blue-500 rounded animate-pulse"
              style={{ width: '40%' }}
            />
          </div>
        )}
      </div>

      {/* ── Row 3: stats / status ─────────────────────────────────────── */}
      <div className="flex items-center gap-1 min-h-[18px]">
        {showStats && ctx.stats ? (
          <>
            {/* Mean */}
            <span className="text-gray-600 flex items-center gap-0">
              <StatDot color={getStatColor(ctx.variable, ctx.stats.mean)} />
              {t('time_machine.mean', { value: ctx.stats.mean.toFixed(1) })}
              {variableUnitLabel(ctx.variable)}
            </span>
            <span className="text-gray-300">·</span>

            {/* Min */}
            <span className="text-gray-600 flex items-center gap-0">
              <StatDot color={getStatColor(ctx.variable, ctx.stats.min)} />
              {t('time_machine.min', { value: ctx.stats.min.toFixed(1) })}
              {variableUnitLabel(ctx.variable)}
            </span>
            <span className="text-gray-300">·</span>

            {/* Max */}
            <span className="text-gray-600 flex items-center gap-0">
              <StatDot color={getStatColor(ctx.variable, ctx.stats.max)} />
              {t('time_machine.max', { value: ctx.stats.max.toFixed(1) })}
              {variableUnitLabel(ctx.variable)}
            </span>

            {/* Optimal badge */}
            {isOptimal(ctx.variable, ctx.stats.mean) && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-700 font-medium leading-none ml-1">
                {t('time_machine.optimal')}
              </span>
            )}

            <span className="text-gray-300">·</span>
            <span className="text-gray-400">
              {ctx.sensorCount}
              {t('time_machine.sensors_short')}
            </span>

            {ctx.cogUrl && (
              <button
                onClick={() => window.open(ctx.cogUrl!, '_blank')}
                className="ml-auto p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title={t('time_machine.download_cog')}
                aria-label={t('time_machine.download_cog')}
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        ) : isInsufficient ? (
          <>
            <span className="text-gray-400">
              <svg
                className="inline-block h-3 w-3 mr-1 -mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </span>
            <span className="text-gray-400 italic">
              {ctx.detail === 'insufficient_readings'
                ? t('time_machine.no_data')
                : t('time_machine.insufficient_sensors')}
            </span>
          </>
        ) : !ctx.loading ? (
          <span className="text-gray-300">——</span>
        ) : null}
      </div>
    </div>
  );
};

/* ── wrapper ──────────────────────────────────────────────────────────── */

const TimeMachine: React.FC = () => (
  <TimelineProvider>
    <TimeMachineInner />
  </TimelineProvider>
);

export default TimeMachine;
