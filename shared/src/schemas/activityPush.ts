import { z } from 'zod';

/** What the Riot client on this machine says the account is doing at this instant. `riot` means
 * signed in with Valorant not running, which is Riot-wide rather than Valorant-specific (the client
 * is shared with League) — so anything displaying it has to stay honest about meaning "at the
 * launcher". The rest are Valorant itself. */
export const valorantLiveSchema = z.object({
  state: z.enum(['riot', 'menus', 'pregame', 'ingame']),
  mode: z.string().optional(),
  map: z.string().optional(),
  roundsWon: z.number().int().nonnegative().optional(),
  roundsLost: z.number().int().nonnegative().optional(),
  partySize: z.number().int().nonnegative().optional(),
  maxPartySize: z.number().int().nonnegative().optional(),
  /** Riot's own away flag, in game or out of it. */
  idle: z.boolean().optional(),
  observedAt: z.string(),
});

/** Minecraft publishes no presence and has no local API, so this is inferred from the log the game
 * writes as it runs. Presence and session length are all it can know. */
export const minecraftLiveSchema = z.object({
  startedAt: z.string(),
  observedAt: z.string(),
});

/** Status of the sink provider that pushes local-only activity signals (Epic Games Launcher,
 * Claude/Codex session recency) to the status page, plus the two locally-observed game readings it
 * takes on the way. Those live here rather than on the `valorant` provider because they have to be
 * re-read every minute to mean anything, and that provider refreshes on a ten-minute cycle against
 * a rate-limited API. */
export const activityPushSchema = z.object({
  lastPushedAt: z.string().nullable(),
  lastPushOk: z.boolean(),
  valorantLive: valorantLiveSchema.nullable().optional(),
  minecraftLive: minecraftLiveSchema.nullable().optional(),
});

export type ActivityPushData = z.infer<typeof activityPushSchema>;
export type ValorantLiveData = z.infer<typeof valorantLiveSchema>;
export type MinecraftLiveData = z.infer<typeof minecraftLiveSchema>;
