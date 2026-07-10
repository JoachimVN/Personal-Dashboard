import { z } from 'zod';

export const aiUsageSchema = z.object({
  /** All dollar figures are estimated API-equivalent cost, not actual spend. */
  tools: z.array(
    z.object({
      tool: z.enum(['claude', 'codex']),
      /** False when this machine has no usage data for the tool. */
      available: z.boolean(),
      today: z.object({ cost: z.number(), tokens: z.number() }),
      week: z.object({ cost: z.number(), tokens: z.number() }),
      /** Last-7-day per-model split; codex has no per-model cost, only tokens. */
      models: z.array(
        z.object({
          name: z.string(),
          tokens: z.number(),
          cost: z.number().optional(),
        }),
      ),
      /** Exactly the last 14 dashboard-timezone dates, zero-filled. */
      days: z.array(z.object({ date: z.string(), cost: z.number() })),
    }),
  ),
});

export type AiUsageData = z.infer<typeof aiUsageSchema>;
