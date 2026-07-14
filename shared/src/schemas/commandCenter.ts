import { z } from 'zod';

export const commandCenterRenderSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text') }),
  z.object({ type: z.literal('calendar-event'), eventId: z.string() }),
  z.object({ type: z.literal('calendar-agenda'), eventIds: z.array(z.string()) }),
  z.object({ type: z.literal('spotify-now-playing') }),
  z.object({ type: z.literal('spotify-track'), trackId: z.string() }),
  z.object({ type: z.literal('health-rings') }),
  z.object({ type: z.literal('github-contributions') }),
]);

export const commandCenterSlotSchema = z.object({
  id: z.string(),
  source: z.string(),
  kind: z.enum(['calendar', 'gmail', 'github', 'spotify', 'health', 'ai-usage', 'fallback']),
  kicker: z.string(),
  title: z.string(),
  detail: z.string(),
  href: z.string(),
  meter: z.number().min(0).max(100).optional(),
  score: z.number(),
  render: commandCenterRenderSchema,
});

export const commandCenterSchema = z.object({
  hero: commandCenterSlotSchema,
  secondary: commandCenterSlotSchema,
  tiles: z.tuple([commandCenterSlotSchema, commandCenterSlotSchema, commandCenterSlotSchema]),
});

export type CommandCenterData = z.infer<typeof commandCenterSchema>;
export type CommandCenterSlot = z.infer<typeof commandCenterSlotSchema>;
