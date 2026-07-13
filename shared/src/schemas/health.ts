import { z } from 'zod';

/** One day's Apple Health rollup. Every metric is optional — the Shortcut sends what it can gather. */
export const healthDaySchema = z.object({
  date: z.string(), // YYYY-MM-DD
  /** The conservative dashboard total: the larger of watchSteps and phoneSteps when available. */
  steps: z.number().optional(),
  /** Daily cumulative steps recorded specifically by Apple Watch. */
  watchSteps: z.number().optional(),
  /** Daily cumulative steps recorded specifically by iPhone. */
  phoneSteps: z.number().optional(),
  activeEnergyKcal: z.number().optional(),
  exerciseMinutes: z.number().optional(),
  standHours: z.number().optional(),
  /** Average regular (non-resting) heart rate for the day, in BPM. */
  heartRate: z.number().optional(),
  restingHeartRate: z.number().optional(),
  /** Average heart rate while walking for the day, in BPM. */
  walkingHeartRate: z.number().optional(),
  /** Average blood-oxygen saturation for the day, as a percentage (for example, 98). */
  bloodOxygenPercent: z.number().optional(),
});

/**
 * Metrics arrive as 0 on days the phone has no data. Treat 0 as "no reading" everywhere
 * rather than storing it (or failing validation), so a stray 0 never shows up as a real
 * value or invalidates a batched day's other metrics.
 */
const readingOrMissing = (schema: z.ZodNumber) =>
  schema.optional().transform((value) => (value === 0 ? undefined : value));

/**
 * Body the Apple Shortcut POSTs to /api/health/ingest. Metrics are optional and additive:
 * a partial post (e.g. only steps) merges into that day rather than replacing it. `date`
 * defaults to the server's today; posts through the day overwrite the same date's totals.
 */
export const healthIngestSchema = z.object({
  date: z.string().optional(),
  steps: readingOrMissing(z.number().nonnegative()),
  watchSteps: readingOrMissing(z.number().nonnegative()),
  phoneSteps: readingOrMissing(z.number().nonnegative()),
  activeEnergyKcal: readingOrMissing(z.number().nonnegative()),
  exerciseMinutes: readingOrMissing(z.number().nonnegative()),
  standHours: readingOrMissing(z.number().nonnegative()),
  heartRate: readingOrMissing(z.number().nonnegative()),
  restingHeartRate: readingOrMissing(z.number().nonnegative()),
  walkingHeartRate: readingOrMissing(z.number().nonnegative()),
  bloodOxygenPercent: readingOrMissing(z.number().nonnegative().max(100)),
});

/**
 * Multi-day variant: `{ days: [...] }` lets one POST carry a window of days (e.g. the last week),
 * so a Shortcut run after the server was offline backfills the gap in a single request. Entries
 * should each carry `date`; ones without it merge into the server's today. Bodies with a `days`
 * key must be validated against this schema only — falling back to the all-optional single-sample
 * schema would silently accept an invalid batch as an empty `{}` sample.
 */
export const healthIngestBatchSchema = z.object({
  days: z.array(healthIngestSchema).min(1).max(31),
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

export type HealthDay = z.infer<typeof healthDaySchema>;
export type HealthIngest = z.infer<typeof healthIngestSchema>;
export type HealthData = z.infer<typeof healthSchema>;
