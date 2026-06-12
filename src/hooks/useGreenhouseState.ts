// src/hooks/useGreenhouseState.ts
import { useState, useEffect } from 'react';
import { greenhouseApi, GreenhouseState } from '../services/api';

export function useGreenhouseState(greenhouseId: string | null) {
  const [state, setState] = useState<GreenhouseState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!greenhouseId) {
      setState(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const fetchState = async () => {
      try {
        const result = await greenhouseApi.getState(greenhouseId);
        if (!cancelled) {
          setState(result);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to fetch greenhouse state');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchState();

    // Poll every 30s for live updates
    const interval = setInterval(fetchState, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [greenhouseId]);

  return { state, loading, error };
}
