import { z } from 'zod';

/** Own status of the sink provider that pushes local-only activity signals (Epic Games Launcher,
 * Claude/Codex session recency) to the Batabiboing status page — not the pushed payload itself. */
export const activityPushSchema = z.object({
  lastPushedAt: z.string().nullable(),
  lastPushOk: z.boolean(),
});

export type ActivityPushData = z.infer<typeof activityPushSchema>;
