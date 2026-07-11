import { z } from 'zod';

const rateLimitSchema = z.object({
  /** Percent of the provider's rolling allowance that has been used. */
  usedPercent: z.number().min(0).max(100),
  /** ISO timestamp at which this rolling allowance resets. */
  resetsAt: z.string().datetime(),
});

/** Current session's context-window fill, read live from local CLI transcripts (no network call). */
const contextUsageSchema = z.object({
  usedPercent: z.number().min(0).max(100),
  tokens: z.number(),
  contextWindow: z.number(),
  model: z.string().optional(),
});

export const usageHistoryPointSchema = z.object({
  /** The `asOf` moment of the snapshot this point was sampled from. */
  at: z.string().datetime(),
  fiveHourUsedPercent: z.number().min(0).max(100).optional(),
  weeklyUsedPercent: z.number().min(0).max(100).optional(),
  contextUsedPercent: z.number().min(0).max(100).optional(),
});

export type UsageHistoryPoint = z.infer<typeof usageHistoryPointSchema>;

export const aiUsageToolSchema = z.object({
  /** False when the local CLI has not supplied a current limit snapshot. */
  available: z.boolean(),
  fiveHour: rateLimitSchema.optional(),
  weekly: rateLimitSchema.optional(),
  context: contextUsageSchema.optional(),
  /** When this snapshot was actually captured — may lag `fetchedAt` when serving a cached reading. */
  asOf: z.string().datetime().optional(),
  /** Set while backed off from an upstream 429; ISO timestamp of when the next attempt is allowed. */
  rateLimitedUntil: z.string().datetime().optional(),
  /** Server-sampled usage snapshots, oldest first. Empty until the server has recorded some. */
  history: z.array(usageHistoryPointSchema).default([]),
});

export type AiUsageToolData = z.infer<typeof aiUsageToolSchema>;
