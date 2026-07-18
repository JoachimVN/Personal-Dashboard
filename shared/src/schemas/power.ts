import { z } from 'zod';

/** Norwegian day-ahead bidding areas (Nord Pool): Øst, Sør, Midt, Nord, Vest. */
export const POWER_AREAS = ['NO1', 'NO2', 'NO3', 'NO4', 'NO5'] as const;

export const powerHourSchema = z.object({
  /** Start of the hour, ISO with offset. */
  time: z.string(),
  /** Local hour "00"–"23", formatted server-side in the dashboard timezone. */
  hourLabel: z.string(),
  /** Nord Pool spot price — what a spot deal is billed from, excluding grid rent, taxes and subsidy. */
  priceNokPerKwh: z.number(),
});

export const powerDataSchema = z.object({
  area: z.enum(POWER_AREAS),
  today: z.array(powerHourSchema),
  /** Published by Nord Pool around 13:00; empty until then. */
  tomorrow: z.array(powerHourSchema),
});

export type PowerArea = (typeof POWER_AREAS)[number];
export type PowerHour = z.infer<typeof powerHourSchema>;
export type PowerData = z.infer<typeof powerDataSchema>;
