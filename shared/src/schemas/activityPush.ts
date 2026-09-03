import { z } from 'zod';

/** What the Riot client on this machine says the account is doing at this instant. `riot` means
 * signed in with Valorant not running, which is Riot-wide rather than Valorant-specific (the client
 * is shared with League) — so anything displaying it has to stay honest about meaning "at the
 * launcher". The rest are Valorant itself. */
export const valorantLiveSchema = z.object({
  state: z.enum(['riot', 'menus', 'pregame', 'ingame']),
  mode: z.string().optional(),
  map: z.string().optional(),
  mapArtUrl: z.string().optional(),
  roundsWon: z.number().int().nonnegative().optional(),
  roundsLost: z.number().int().nonnegative().optional(),
  partySize: z.number().int().nonnegative().optional(),
  maxPartySize: z.number().int().nonnegative().optional(),
  /** Riot's own away flag, in game or out of it. */
  idle: z.boolean().optional(),
  observedAt: z.string(),
});

/** Minecraft publishes no formal presence, so this is inferred from the current client log. Recent
 * versions do record whether the player entered singleplayer, a Realm, or a multiplayer server. */
export const minecraftLiveSchema = z.object({
  startedAt: z.string(),
  observedAt: z.string(),
  activity: z.enum(['singleplayer', 'realm', 'server']).optional(),
  /** World/Realm/server label when the client log includes one. Never required: launchers and game
   * versions vary widely in what they write. */
  destination: z.string().optional(),
});

/** Rocket League has no API either, but unlike Minecraft it writes its Steam rich presence into
 * its own log — so this knows the playlist, the arena, the clock and the score, not just that the
 * game is open. `postmatch` is the scoreboard after the whistle, which goes on reporting the final
 * score with no clock on it. */
/** One finished match, read straight off a `postmatch` presence line — see
 * `readCompletedMatches` in rocketLeaguePresence.ts for why this can carry more than one per
 * push. */
export const rocketLeagueMatchEndSchema = z.object({
  goalsFor: z.number().int().nonnegative(),
  goalsAgainst: z.number().int().nonnegative(),
  playlist: z.string().optional(),
  map: z.string().optional(),
  endedAt: z.string(),
});

export const rocketLeagueLiveSchema = z.object({
  state: z.enum(['menus', 'ingame', 'postmatch']),
  playlist: z.string().optional(),
  map: z.string().optional(),
  goalsFor: z.number().int().nonnegative().optional(),
  goalsAgainst: z.number().int().nonnegative().optional(),
  clock: z.string().optional(),
  startedAt: z.string(),
  observedAt: z.string(),
  /** Every match the tail window caught finishing, oldest first — may include matches whose
   * scoreboard already scrolled out of `state`/`goalsFor` above. */
  recentMatches: z.array(rocketLeagueMatchEndSchema).optional(),
});

/** Status of the sink provider that pushes local-only activity signals (Epic Games Launcher,
 * Claude/Codex session recency) to the status page, plus the locally-observed game readings it
 * takes on the way. Those live here rather than on the `valorant` provider because they have to be
 * re-read every minute to mean anything, and that provider refreshes on a ten-minute cycle against
 * a rate-limited API. */
export const activityPushSchema = z.object({
  lastPushedAt: z.string().nullable(),
  lastPushOk: z.boolean(),
  valorantLive: valorantLiveSchema.nullable().optional(),
  minecraftLive: minecraftLiveSchema.nullable().optional(),
  rocketLeagueLive: rocketLeagueLiveSchema.nullable().optional(),
});

export type ActivityPushData = z.infer<typeof activityPushSchema>;
export type ValorantLiveData = z.infer<typeof valorantLiveSchema>;
export type MinecraftLiveData = z.infer<typeof minecraftLiveSchema>;
export type RocketLeagueLiveData = z.infer<typeof rocketLeagueLiveSchema>;
export type RocketLeagueMatchEndData = z.infer<typeof rocketLeagueMatchEndSchema>;
