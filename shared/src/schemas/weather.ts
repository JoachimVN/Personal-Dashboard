import { z } from 'zod';

/** MET symbol codes look like "partlycloudy_day"; the client maps them to glyphs. */
const symbol = z.string();

export const weatherSchema = z.object({
  location: z.object({
    lat: z.number(),
    lon: z.number(),
    name: z.string(),
  }),
  current: z.object({
    temperature: z.number(),
    windSpeed: z.number(),
    symbol,
  }),
  /** Next hours (hourly resolution while MET provides it). */
  hours: z.array(
    z.object({
      /** ISO timestamp. */
      time: z.string(),
      /** Hour label already rendered in the dashboard timezone, e.g. "14". */
      hourLabel: z.string(),
      temperature: z.number(),
      precipitationMm: z.number(),
      symbol,
    }),
  ),
  /** Today + coming days, grouped by DASHBOARD_TIMEZONE day boundaries. */
  days: z.array(
    z.object({
      /** Date-only string, YYYY-MM-DD in the dashboard timezone. */
      date: z.string(),
      /** Short weekday label, e.g. "Fri". */
      dayLabel: z.string(),
      minTemperature: z.number(),
      maxTemperature: z.number(),
      precipitationMm: z.number(),
      symbol,
    }),
  ),
});

export type WeatherData = z.infer<typeof weatherSchema>;
