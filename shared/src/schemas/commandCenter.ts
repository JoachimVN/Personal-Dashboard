import { z } from 'zod';

export const commandCenterRenderSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text') }),
  z.object({ type: z.literal('calendar-event'), eventId: z.string() }),
  z.object({ type: z.literal('calendar-agenda'), eventIds: z.array(z.string()) }),
  z.object({ type: z.literal('spotify-now-playing') }),
  z.object({ type: z.literal('spotify-track'), trackId: z.string() }),
  z.object({ type: z.literal('spotify-artist'), artistId: z.string(), timeframe: z.enum(['short', 'medium', 'long', 'allTime']) }),
  z.object({ type: z.literal('spotify-album'), albumId: z.string() }),
  z.object({ type: z.literal('health-rings') }),
  z.object({ type: z.literal('github-contributions') }),
  z.object({ type: z.literal('github-reviews') }),
  z.object({ type: z.literal('gmail-threads'), threadIds: z.array(z.string()) }),
  z.object({ type: z.literal('weather-hours') }),
  z.object({
    type: z.literal('ai-usage-tool'),
    /** One trend line per tool, overlaid on the same 0–100% scale when there are several. */
    toolIds: z.array(z.enum(['claude', 'codex'])).min(1),
    /** Which quota window the card is about — drives the trend line and leading summary stat. */
    metric: z.enum(['fiveHour', 'weekly']),
  }),
]);

export const commandCenterSlotSchema = z.object({
  id: z.string(),
  source: z.string(),
  kind: z.enum(['calendar', 'gmail', 'github', 'spotify', 'health', 'ai-usage', 'weather', 'hue', 'news', 'imessage', 'fallback']),
  kicker: z.string(),
  title: z.string(),
  detail: z.string(),
  href: z.string(),
  accent: z.enum(['claude', 'codex']).optional(),
  meter: z.number().min(0).max(100).optional(),
  score: z.number(),
  render: commandCenterRenderSchema,
});

export const commandCenterSchema = z.object({
  hero: commandCenterSlotSchema,
  secondary: z.array(commandCenterSlotSchema).max(3),
  tiles: z.array(commandCenterSlotSchema).max(3),
});

export type CommandCenterData = z.infer<typeof commandCenterSchema>;
export type CommandCenterSlot = z.infer<typeof commandCenterSlotSchema>;
