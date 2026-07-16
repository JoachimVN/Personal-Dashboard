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
    /** Direction the wind blows FROM, meteorological degrees (0 = north). */
    windDirectionDeg: z.number().optional(),
    /** Relative humidity, 0–100. */
    humidity: z.number().optional(),
    /** Clear-sky UV index at the moment of the forecast. */
    uvIndex: z.number().optional(),
    /** Expected precipitation over the next hour, mm. */
    precipitationMm: z.number().optional(),
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
      uvIndex: z.number().optional(),
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
  /** Today's sun events from MET sunrise 3.0; null when the sun never rises/sets (polar day/night). */
  sun: z
    .object({
      sunrise: z.string().nullable(),
      sunset: z.string().nullable(),
    })
    .optional(),
  /** Today's moon events from MET sunrise 3.0. */
  moon: z
    .object({
      /** Phase in degrees, 0–360: 0 new, 90 first quarter, 180 full, 270 last quarter. */
      phaseDeg: z.number(),
      moonrise: z.string().nullable(),
      moonset: z.string().nullable(),
    })
    .optional(),
});

export type WeatherData = z.infer<typeof weatherSchema>;
