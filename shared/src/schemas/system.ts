import { z } from 'zod';

export const systemSchema = z.object({
  hostname: z.string(),
  platform: z.string(),
  nodeVersion: z.string(),
  uptimeSeconds: z.number(),
  timezone: z.string(),
  serverTime: z.string(),
});

export type SystemData = z.infer<typeof systemSchema>;
