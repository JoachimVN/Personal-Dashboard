import { z } from 'zod';
import { powerDataSchema, type PowerArea, type PowerData, type PowerHour } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';

// Free, no-key day-ahead spot prices per Norwegian bidding area. Their API terms only ask for
// attribution, which the client widget renders ("Strømpriser levert av Hva koster strømmen.no").
const API_BASE = 'https://www.hvakosterstrommen.no/api/v1/prices';

const priceDaySchema = z.array(
  z.object({
    NOK_per_kWh: z.number(),
    time_start: z.string(),
  }),
);

type PriceEntry = z.infer<typeof priceDaySchema>[number];

export function mapPriceHours(entries: PriceEntry[], hourFmt: Intl.DateTimeFormat): PowerHour[] {
  return entries.map((hour) => ({
    time: hour.time_start,
    hourLabel: hourFmt.format(new Date(hour.time_start)),
    priceNokPerKwh: hour.NOK_per_kWh,
  }));
}

/** "prices/2026/07-18_NO3.json"-style path segments for a date in the dashboard timezone. */
export function priceDayPath(date: Date, dateFmt: Intl.DateTimeFormat, area: PowerArea): string {
  const formatted = dateFmt.format(date);
  return `${formatted.slice(0, 4)}/${formatted.slice(5)}_${area}.json`;
}

export function createPowerProvider(area: PowerArea | undefined, timezone: string): Provider<PowerData> {
  const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }); // YYYY-MM-DD
  const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hour12: false });

  async function fetchDay(date: Date, signal: AbortSignal): Promise<PowerHour[] | undefined> {
    if (!area) throw new Error('power is not configured');
    const res = await fetch(`${API_BASE}/${priceDayPath(date, dateFmt, area)}`, { signal });
    // Tomorrow's prices 404 until Nord Pool publishes them (~13:00) — absent, not broken.
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`hvakosterstrommen responded ${res.status}`);
    return mapPriceHours(priceDaySchema.parse(await res.json()), hourFmt);
  }

  return {
    id: 'power',
    schema: powerDataSchema,
    // Prices change once a day; the point of polling is catching tomorrow's ~13:00 publication promptly.
    refreshMs: 20 * 60_000,
    timeoutMs: 10_000,
    isConfigured: () => area !== undefined,
    async fetch(signal) {
      if (!area) throw new Error('power is not configured');
      const [today, tomorrow] = await Promise.all([
        fetchDay(new Date(), signal),
        fetchDay(new Date(Date.now() + 24 * 60 * 60_000), signal),
      ]);
      if (!today) throw new Error('hvakosterstrommen has no prices for today');
      return { area, today, tomorrow: tomorrow ?? [] };
    },
  };
}
