import { z } from 'zod';

export const transitDepartureSchema = z.object({
  /** Line number as riders know it, e.g. "2" or "12". */
  line: z.string(),
  destination: z.string(),
  /** Entur transport mode, e.g. "bus", "tram", "rail", "water". */
  mode: z.string(),
  aimedTime: z.string(),
  /** Real-time expected departure when available; equals aimedTime otherwise. */
  expectedTime: z.string(),
  realtime: z.boolean(),
  /** Line brand color as "#rrggbb" when the operator publishes one. */
  color: z.string().optional(),
});

export const transitStopSchema = z.object({
  /** National stop register id, e.g. "NSR:StopPlace:41613". */
  id: z.string(),
  name: z.string(),
  /** Walking-line distance from the dashboard's location; absent for stops pinned by id in config. */
  distanceMeters: z.number().optional(),
  departures: z.array(transitDepartureSchema),
});

export const transitDataSchema = z.object({
  stops: z.array(transitStopSchema),
});

export type TransitDeparture = z.infer<typeof transitDepartureSchema>;
export type TransitStop = z.infer<typeof transitStopSchema>;
export type TransitData = z.infer<typeof transitDataSchema>;
