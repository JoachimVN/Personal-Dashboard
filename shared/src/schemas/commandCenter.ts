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
  z.object({
    type: z.literal('weather-signal'),
    kind: z.enum(['severe', 'hot', 'cold', 'rain', 'wind', 'uv', 'sunset', 'moon']),
  }),
  z.object({
    type: z.literal('ai-usage-tool'),
    /** One trend line per tool, overlaid on the same 0–100% scale when there are several. */
    toolIds: z.array(z.enum(['claude', 'codex'])).min(1),
    /** Which quota window the card is about — drives the trend line and leading summary stat. */
    metric: z.enum(['fiveHour', 'weekly']),
  }),
  z.object({ type: z.literal('steam-now-playing'), appId: z.number() }),
  z.object({ type: z.literal('steam-achievement'), appId: z.number(), apiName: z.string() }),
  z.object({ type: z.literal('roblox-now-playing') }),
  z.object({
    type: z.literal('clash-royale-moment'),
    kind: z.enum(['arena', 'league', 'best-trophies', 'win-streak', 'session']),
    /** Only present for kind 'arena' — looked up against a local name->art table client-side. */
    arenaName: z.string().optional(),
    /** Only present for kind 'league' — looked up against a local league-number->badge table client-side. */
    leagueNumber: z.number().optional(),
    /** Only present for kind 'win-streak' — crown score for each win in the streak, oldest first,
     * so the card can show the run rather than just a bare count. */
    streakCrowns: z.array(z.object({ crownsFor: z.number(), crownsAgainst: z.number(), battleTime: z.string() })).optional(),
  }),
]);

export const commandCenterSlotSchema = z.object({
  id: z.string(),
  source: z.string(),
  kind: z.enum(['calendar', 'gmail', 'github', 'spotify', 'health', 'ai-usage', 'weather', 'hue', 'news', 'imessage', 'steam', 'roblox', 'clash-royale', 'transit', 'power', 'fallback']),
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
