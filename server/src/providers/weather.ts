import { z } from 'zod';
import { weatherSchema, type WeatherData } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';

// Identify ourselves as api.met.no's terms require.
const USER_AGENT = 'personal-dashboard/0.1 github.com/JoachimVN/Personal-Dashboard';
const GEOCODER_URL = 'https://nominatim.openstreetmap.org/reverse';

// Minimal view of the Locationforecast 2.0 "compact" response.
const metSchema = z.object({
  properties: z.object({
    timeseries: z.array(
      z.object({
        time: z.string(),
        data: z.object({
          instant: z.object({
            details: z.object({
              air_temperature: z.number(),
              wind_speed: z.number().optional(),
            }),
          }),
          next_1_hours: z
            .object({
              summary: z.object({ symbol_code: z.string() }),
              details: z.object({ precipitation_amount: z.number().optional() }).optional(),
            })
            .optional(),
          next_6_hours: z
            .object({
              summary: z.object({ symbol_code: z.string() }),
              details: z.object({ precipitation_amount: z.number().optional() }).optional(),
            })
            .optional(),
          next_12_hours: z
            .object({ summary: z.object({ symbol_code: z.string() }) })
            .optional(),
        }),
      }),
    ),
  }),
});

type MetEntry = z.infer<typeof metSchema>['properties']['timeseries'][number];

const reverseGeocodeSchema = z.object({
  address: z.record(z.string(), z.string()).optional(),
  display_name: z.string().optional(),
});

function coordinateLabel(coords: { lat: number; lon: number }): string {
  const latitude = `${Math.abs(coords.lat).toFixed(2)}° ${coords.lat >= 0 ? 'N' : 'S'}`;
  const longitude = `${Math.abs(coords.lon).toFixed(2)}° ${coords.lon >= 0 ? 'E' : 'W'}`;
  return `${latitude} · ${longitude}`;
}

async function reverseGeocode(coords: { lat: number; lon: number }, signal: AbortSignal): Promise<string> {
  const url = new URL(GEOCODER_URL);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('zoom', '10');
  url.searchParams.set('lat', coords.lat.toFixed(4));
  url.searchParams.set('lon', coords.lon.toFixed(4));
  try {
    const response = await fetch(url, { signal, headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) return coordinateLabel(coords);
    const result = reverseGeocodeSchema.parse(await response.json());
    const address = result.address ?? {};
    return address.city
      ?? address.town
      ?? address.village
      ?? address.municipality
      ?? address.suburb
      ?? address.neighbourhood
      ?? result.display_name?.split(',')[0]
      ?? coordinateLabel(coords);
  } catch {
    return coordinateLabel(coords);
  }
}

function symbolOf(entry: MetEntry): string {
  return (
    entry.data.next_1_hours?.summary.symbol_code ??
    entry.data.next_6_hours?.summary.symbol_code ??
    entry.data.next_12_hours?.summary.symbol_code ??
    'cloudy'
  );
}

export interface WeatherProvider extends Provider<WeatherData> {
  /** Overrides the env-configured location, e.g. with the client's device geolocation. */
  setCoords(next: { lat: number; lon: number }): void;
}

export function createWeatherProvider(
  fallbackCoords: { lat: number; lon: number } | undefined,
  timezone: string,
): WeatherProvider {
  let coords = fallbackCoords;
  let locationCache: { key: string; name: string } | undefined;
  const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }); // YYYY-MM-DD
  const hourFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  });
  const weekdayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short' });

  return {
    id: 'weather',
    schema: weatherSchema,
    refreshMs: 15 * 60_000,
    timeoutMs: 10_000,
    isConfigured: () => coords !== undefined,
    setCoords(next) {
      coords = next;
    },
    async fetch(signal) {
      if (!coords) throw new Error('weather is not configured');
      const url =
        `https://api.met.no/weatherapi/locationforecast/2.0/compact` +
        `?lat=${coords.lat.toFixed(4)}&lon=${coords.lon.toFixed(4)}`;
      const res = await fetch(url, { signal, headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new Error(`met.no responded ${res.status}`);
      const { properties } = metSchema.parse(await res.json());
      const series = properties.timeseries;
      if (series.length === 0) throw new Error('met.no returned an empty timeseries');

      const now = series[0];
      const current = {
        temperature: now.data.instant.details.air_temperature,
        windSpeed: now.data.instant.details.wind_speed ?? 0,
        symbol: symbolOf(now),
      };

      const hours = series
        .filter((entry) => entry.data.next_1_hours)
        .slice(0, 12)
        .map((entry) => ({
          time: entry.time,
          hourLabel: hourFmt.format(new Date(entry.time)),
          temperature: entry.data.instant.details.air_temperature,
          precipitationMm: entry.data.next_1_hours?.details?.precipitation_amount ?? 0,
          symbol: symbolOf(entry),
        }));

      const byDate = new Map<string, MetEntry[]>();
      for (const entry of series) {
        const date = dateFmt.format(new Date(entry.time));
        const bucket = byDate.get(date);
        if (bucket) bucket.push(entry);
        else byDate.set(date, [entry]);
      }

      const days = [...byDate.entries()].slice(0, 7).map(([date, entries]) => {
        const temps = entries.map((entry) => entry.data.instant.details.air_temperature);
        // Near-term days have hourly precipitation; far-term series is 6-hourly,
        // where summing next_6_hours across the (6h-spaced) entries doesn't double-count.
        const hourly = entries.filter((entry) => entry.data.next_1_hours);
        const precipitationMm = (hourly.length > 0 ? hourly : entries).reduce(
          (sum, entry) =>
            sum +
            ((hourly.length > 0
              ? entry.data.next_1_hours?.details?.precipitation_amount
              : entry.data.next_6_hours?.details?.precipitation_amount) ?? 0),
          0,
        );
        // Represent the day by the entry nearest 12:00 local.
        const midday = entries.reduce((best, entry) => {
          const dist = (time: string) => Math.abs(Number(hourFmt.format(new Date(time))) - 12);
          return dist(entry.time) < dist(best.time) ? entry : best;
        });
        return {
          date,
          dayLabel: weekdayFmt.format(new Date(`${date}T12:00:00Z`)),
          minTemperature: Math.min(...temps),
          maxTemperature: Math.max(...temps),
          precipitationMm: Math.round(precipitationMm * 10) / 10,
          symbol: symbolOf(midday),
        };
      });

      const locationKey = `${coords.lat.toFixed(4)},${coords.lon.toFixed(4)}`;
      if (locationCache?.key !== locationKey) {
        locationCache = { key: locationKey, name: await reverseGeocode(coords, signal) };
      }
      return { location: { ...coords, name: locationCache.name }, current, hours, days };
    },
  };
}
