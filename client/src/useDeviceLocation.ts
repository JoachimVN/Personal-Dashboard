import { useEffect, useRef, type MutableRefObject } from 'react';

/** Roughly 1km — avoids re-reporting on GPS jitter while still tracking real movement. */
const MIN_DELTA_DEG = 0.01;

/** Fired once the server has a fresh location so any mounted `useWidget('weather')` can refetch. */
export const WEATHER_LOCATION_UPDATED_EVENT = 'dashboard:weather-location-updated';

type Coordinates = { lat: number; lon: number };

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      maximumAge: 5 * 60_000,
      timeout: 10_000,
    });
  });
}

function hasMoved(previous: Coordinates | null, next: Coordinates): boolean {
  return !previous
    || Math.abs(previous.lat - next.lat) >= MIN_DELTA_DEG
    || Math.abs(previous.lon - next.lon) >= MIN_DELTA_DEG;
}

async function reportLocation(lastSent: MutableRefObject<Coordinates | null>): Promise<void> {
  try {
    const position = await currentPosition();
    const next = { lat: position.coords.latitude, lon: position.coords.longitude };
    if (!hasMoved(lastSent.current, next)) return;
    const response = await fetch('/api/weather/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (!response.ok) return;
    lastSent.current = next;
    window.dispatchEvent(new Event(WEATHER_LOCATION_UPDATED_EVENT));
  } catch {
    // The configured server location remains in use when geolocation is unavailable or denied.
  }
}

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
  const lastSent = useRef<Coordinates | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    const report = () => { reportLocation(lastSent).catch(() => undefined); };

    report();
    const onVisible = () => {
      if (document.visibilityState === 'visible') report();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [lastSent]);
}
