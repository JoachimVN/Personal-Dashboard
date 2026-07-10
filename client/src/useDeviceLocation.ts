import { useEffect, useRef } from 'react';

/** Roughly 1km — avoids re-reporting on GPS jitter while still tracking real movement. */
const MIN_DELTA_DEG = 0.01;

/**
 * Reports the browser's geolocation to the server on mount and whenever the tab
 * regains visibility, skipping the request if the device hasn't moved meaningfully.
 * Silently no-ops if geolocation is unavailable or permission is denied — the
 * server keeps using its configured fallback location.
 */
export function useDeviceLocation(onReported?: () => void): void {
  const onReportedRef = useRef(onReported);
  onReportedRef.current = onReported;

  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    const lastSent = { current: null as { lat: number; lon: number } | null };

    const report = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          const prev = lastSent.current;
          if (
            prev &&
            Math.abs(prev.lat - lat) < MIN_DELTA_DEG &&
            Math.abs(prev.lon - lon) < MIN_DELTA_DEG
          ) {
            return;
          }
          fetch('/api/weather/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lon }),
          })
            .then((res) => {
              if (!res.ok) return;
              lastSent.current = { lat, lon };
              onReportedRef.current?.();
            })
            .catch(() => {});
        },
        () => {},
        { maximumAge: 5 * 60_000, timeout: 10_000 },
      );
    };

    report();
    const onVisible = () => {
      if (document.visibilityState === 'visible') report();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
}
