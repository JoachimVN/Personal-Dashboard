import { z } from 'zod';

export const healthWorkoutSchema = z.object({
  type: z.string(),
  durationMin: z.number().optional(),
  energyKcal: z.number().optional(),
  distanceKm: z.number().optional(),
  start: z.string().optional(),
});

/** One day's Apple Health rollup. Every metric is optional — the Shortcut sends what it can gather. */
export const healthDaySchema = z.object({
  date: z.string(), // YYYY-MM-DD
  steps: z.number().optional(),
  activeEnergyKcal: z.number().optional(),
  exerciseMinutes: z.number().optional(),
  standHours: z.number().optional(),
  /** Average regular (non-resting) heart rate for the day, in BPM. */
  heartRate: z.number().optional(),
  restingHeartRate: z.number().optional(),
  /** Time spent outdoors in daylight today, in minutes. */
  daylightMinutes: z.number().optional(),
  /** Average blood-oxygen saturation for the day, as a percentage (for example, 98). */
  bloodOxygenPercent: z.number().optional(),
  /** Average respiratory rate for the day, in breaths per minute. */
  respiratoryRate: z.number().optional(),
  sleepHours: z.number().optional(),
  workouts: z.array(healthWorkoutSchema).default([]),
});

/**
 * Body the Apple Shortcut POSTs to /api/health/ingest. Metrics are optional and additive:
 * a partial post (e.g. only steps) merges into that day rather than replacing it. `date`
 * defaults to the server's today; posts through the day overwrite the same date's totals.
 */
export const healthIngestSchema = z.object({
  date: z.string().optional(),
  steps: z.number().nonnegative().optional(),
  activeEnergyKcal: z.number().nonnegative().optional(),
  exerciseMinutes: z.number().nonnegative().optional(),
  standHours: z.number().nonnegative().optional(),
  heartRate: z.number().positive().optional(),
  restingHeartRate: z.number().positive().optional(),
  daylightMinutes: z.number().nonnegative().optional(),
  bloodOxygenPercent: z.number().positive().max(100).optional(),
  respiratoryRate: z.number().positive().optional(),
  sleepHours: z.number().nonnegative().optional(),
  workouts: z.array(healthWorkoutSchema).optional(),
});

export const healthSchema = z.object({
  today: healthDaySchema.nullable(),
  /** Recent days, oldest first, for the week-trend chart. */
  history: z.array(healthDaySchema),
  updatedAt: z.string().nullable(),
  goals: z.object({
    steps: z.number(),
    activeEnergyKcal: z.number(),
    exerciseMinutes: z.number(),
    standHours: z.number(),
  }),
});

export type HealthWorkout = z.infer<typeof healthWorkoutSchema>;
export type HealthDay = z.infer<typeof healthDaySchema>;
export type HealthIngest = z.infer<typeof healthIngestSchema>;
export type HealthData = z.infer<typeof healthSchema>;
