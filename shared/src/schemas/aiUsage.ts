import { z } from 'zod';

const rateLimitSchema = z.object({
  /** Percent of the provider's rolling allowance that has been used. */
  usedPercent: z.number().min(0).max(100),
  /** ISO timestamp at which this rolling allowance resets. */
  resetsAt: z.string().datetime(),
});

export const aiUsageToolSchema = z.object({
  /** False when the local CLI has not supplied a current limit snapshot. */
  available: z.boolean(),
  fiveHour: rateLimitSchema.optional(),
  weekly: rateLimitSchema.optional(),
});

export type AiUsageToolData = z.infer<typeof aiUsageToolSchema>;
