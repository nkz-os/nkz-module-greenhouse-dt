// src/contexts/TimelineContext.tsx
/**
 * TimelineContext — shared state between the timeline slider (bottom-panel)
 * and the COG overlay (map-layer).
 *
 * When the user scrubs the timeline or switches variable, setDirty(true)
 * so the map-layer knows to fetch a new reconstruction.
 * When the fetch completes, setReconstruction() clears dirty.
 *
 * Usage:
 *   import { TimelineProvider, useTimelineContext } from '../contexts/TimelineContext';
 *
 * Provider should be mounted in a component that wraps both the
 * bottom-panel and map-layer slots (e.g. in the viewer shell or
 * in the bottom-panel slot itself).
 */

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import type { ReconstructionResult } from '../services/api';

export type TimelineVariable = 'temperature' | 'humidity' | 'leafWetness' | 'co2' | 'par';

interface TimelineState {
  currentTime: Date;
  variable: TimelineVariable;
  playing: boolean;
  displayUrl: string | null;
  cogUrl: string | null;
  stats: { min: number; max: number; mean: number } | null;
  bounds: [number, number, number, number] | null;
  sensorCount: number;
  dirty: boolean;
  loading: boolean;
  setCurrentTime: (t: Date) => void;
  setVariable: (v: TimelineVariable) => void;
  setPlaying: (p: boolean) => void;
  setReconstruction: (data: ReconstructionResult) => void;
  setLoading: (l: boolean) => void;
}

const TimelineContext = createContext<TimelineState | null>(null);

export function TimelineProvider({ children }: { children: ReactNode }) {
  const now = new Date();
  const [currentTime, setCurrentTime] = useState<Date>(now);
  const [variable, setVariable] = useState<TimelineVariable>('temperature');
  const [playing, setPlaying] = useState(false);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [cogUrl, setCogUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<{ min: number; max: number; mean: number } | null>(null);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const [sensorCount, setSensorCount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSetCurrentTime = useCallback((t: Date) => {
    setCurrentTime(t);
    setDirty(true);
  }, []);

  const handleSetVariable = useCallback((v: TimelineVariable) => {
    setVariable(v);
    setDirty(true);
  }, []);

  const handleSetPlaying = useCallback((p: boolean) => {
    setPlaying(p);
  }, []);

  const handleSetReconstruction = useCallback((data: ReconstructionResult) => {
    setDisplayUrl(data.display_url);
    setCogUrl(data.cog_url);
    setStats(data.stats);
    setBounds(data.bounds);
    setSensorCount(data.sensor_count);
    setDirty(false);
    setLoading(false);
  }, []);

  const value = useMemo(() => ({
    currentTime,
    variable,
    playing,
    displayUrl,
    cogUrl,
    stats,
    bounds,
    sensorCount,
    dirty,
    loading,
    setCurrentTime: handleSetCurrentTime,
    setVariable: handleSetVariable,
    setPlaying: handleSetPlaying,
    setReconstruction: handleSetReconstruction,
    setLoading,
  }), [
    currentTime, variable, playing,
    displayUrl, cogUrl, stats, bounds, sensorCount, dirty, loading,
    handleSetCurrentTime, handleSetVariable, handleSetPlaying,
    handleSetReconstruction, setLoading,
  ]);

  return (
    <TimelineContext.Provider value={value}>
      {children}
    </TimelineContext.Provider>
  );
}

export function useTimelineContext(): TimelineState {
  const ctx = useContext(TimelineContext);
  if (!ctx) {
    throw new Error('useTimelineContext must be used within TimelineProvider');
  }
  return ctx;
}
