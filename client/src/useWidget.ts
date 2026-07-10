import { useCallback, useEffect, useState } from 'react';
import type { WidgetEnvelope } from '@personal-dashboard/shared';

const MIN_POLL_MS = 15_000;
const MAX_POLL_MS = 300_000;

export interface WidgetState<T> {
  envelope: WidgetEnvelope<T> | null;
  /** True when the dashboard itself can't reach the server. */
  offline: boolean;
  refetch: () => void;
}

/**
 * Polls one widget endpoint. The server does the heavy caching; the client
 * just re-reads the cache — at half the provider's refresh rate, clamped —
 * and again whenever the tab/PWA becomes visible.
 */
export function useWidget<T>(id: string): WidgetState<T> {
  const [envelope, setEnvelope] = useState<WidgetEnvelope<T> | null>(null);
  const [offline, setOffline] = useState(false);

  const refetch = useCallback(() => {
    fetch(`/api/widgets/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<WidgetEnvelope<T>>;
      })
      .then((next) => {
        setEnvelope(next);
        setOffline(false);
      })
      .catch(() => setOffline(true));
  }, [id]);

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

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refetch, envelope?.refreshMs]);

  return { envelope, offline, refetch };
}
