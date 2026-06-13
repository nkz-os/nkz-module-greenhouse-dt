/**
 * useGreenhouseDetail
 *
 * Fetches GET /api/greenhouse/{id} via greenhouseApi.get()
 * Returns the Greenhouse detail including location, area, height, coverType, orientation.
 *
 * Follows the same pattern as useGreenhouseState.
 */

import { useState, useEffect } from 'react';
import { greenhouseApi, Greenhouse } from '../services/api';

interface GreenhouseDetailResult {
  detail: Greenhouse | null;
  loading: boolean;
  error: string | null;
}

export function useGreenhouseDetail(greenhouseId: string | null): GreenhouseDetailResult {
  const [detail, setDetail] = useState<Greenhouse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!greenhouseId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const fetchDetail = async () => {
      try {
        const result = await greenhouseApi.get(greenhouseId);
        if (!cancelled) {
          setDetail(result);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to fetch greenhouse detail');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDetail();

    return () => {
      cancelled = true;
    };
  }, [greenhouseId]);

  return { detail, loading, error };
}
