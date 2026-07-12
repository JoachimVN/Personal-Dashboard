import { useCallback, useEffect, useState } from 'react';
import type { WidgetEnvelope } from '@personal-dashboard/shared';
import { WEATHER_LOCATION_UPDATED_EVENT } from './useDeviceLocation';

const MIN_POLL_MS = 15_000;
const MAX_POLL_MS = 300_000;

export interface WidgetState<T> {
  envelope: WidgetEnvelope<T> | null;
  /** True when the dashboard itself can't reach the server. */
  offline: boolean;
  refetch: () => void;
  /** Requests an immediate provider refresh, then replaces the cached widget data. */
  refresh: () => Promise<void>;
  refreshing: boolean;
}

/**
 * Polls one widget endpoint. The server does the heavy caching; the client
 * just re-reads the cache — at half the provider's refresh rate, clamped —
 * and again whenever the tab/PWA becomes visible.
 */
export function useWidget<T>(id: string): WidgetState<T> {
  const [envelope, setEnvelope] = useState<WidgetEnvelope<T> | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const request = useCallback(async (url: string, init?: RequestInit) => {
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const next = (await res.json()) as WidgetEnvelope<T>;
      setEnvelope(next);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  const refetch = useCallback(() => {
    void request(`/api/widgets/${id}`);
  }, [id, request]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await request(`/api/widgets/${id}/refresh`, { method: 'POST' });
    } finally {
      setRefreshing(false);
    }
  }, [id, request]);

  useEffect(() => {
    refetch();

    const pollMs = Math.min(
      Math.max((envelope?.refreshMs ?? 60_000) / 2, MIN_POLL_MS),
      MAX_POLL_MS,
    );
    const timer = setInterval(refetch, pollMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    document.addEventListener('visibilitychange', onVisible);

    // The weather provider's cache updates as soon as the device reports a new
    // location, ahead of this widget's own poll interval — refetch right away.
    if (id === 'weather') window.addEventListener(WEATHER_LOCATION_UPDATED_EVENT, refetch);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      if (id === 'weather') window.removeEventListener(WEATHER_LOCATION_UPDATED_EVENT, refetch);
    };
  }, [id, refetch, envelope?.refreshMs]);

  return { envelope, offline, refetch, refresh, refreshing };
}
