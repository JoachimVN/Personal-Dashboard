import { useEffect } from 'react';

/** Roughly 1km — avoids re-reporting on GPS jitter while still tracking real movement. */
const MIN_DELTA_DEG = 0.01;

/** Fired once the server has a fresh location so any mounted `useWidget('weather')` can refetch. */
export const WEATHER_LOCATION_UPDATED_EVENT = 'dashboard:weather-location-updated';

/**
 * Reports the browser's geolocation to the server on mount and whenever the tab
 * regains visibility, skipping the request if the device hasn't moved meaningfully.
 * Silently no-ops if geolocation is unavailable or permission is denied — the
 * server keeps using its configured fallback location.
 *
 * Call this once near the app root, not per-widget — geolocation permission
 * prompts and reports should happen regardless of which page is showing.
 */
export function useDeviceLocation(): void {
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
              window.dispatchEvent(new Event(WEATHER_LOCATION_UPDATED_EVENT));
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
