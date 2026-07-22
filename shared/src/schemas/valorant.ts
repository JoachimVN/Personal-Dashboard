import { z } from 'zod';

export const valorantMatchSchema = z.object({
  matchId: z.string(),
  map: z.string(),
  mode: z.string(),
  startedAt: z.string(),
  result: z.enum(['win', 'loss', 'draw']),
  roundsWon: z.number().optional(),
  roundsLost: z.number().optional(),
  agentName: z.string(),
  agentIconUrl: z.string().optional(),
  score: z.number(),
  kills: z.number(),
  deaths: z.number(),
  assists: z.number(),
  headshots: z.number(),
  bodyshots: z.number(),
  legshots: z.number(),
  damageDealt: z.number(),
  damageReceived: z.number(),
  /** Ranked act code when HenrikDev can associate the match with an MMR entry (e.g. "e10a2"). */
  actShort: z.string().optional(),
  /** Riot doesn't expose an official MVP flag; these are derived from having the highest combat
   * score in the match/on the team, the same convention third-party trackers use. */
  isMatchMvp: z.boolean(),
  isTeamMvp: z.boolean(),
});

export type ValorantMatch = z.infer<typeof valorantMatchSchema>;

export const valorantSchema = z.object({
  profile: z.object({
    name: z.string(),
    tag: z.string(),
    region: z.string(),
    accountLevel: z.number(),
    cardIconUrl: z.string().optional(),
    /** The tall "large art" render of the equipped player card, for hero-style vertical banners
     * (as opposed to cardIconUrl's wide art, sized for horizontal background treatments). */
    cardBannerUrl: z.string().optional(),
  }),
  rank: z.object({
    tierId: z.number(),
    tierName: z.string(),
    tierIconUrl: z.string().optional(),
    rr: z.number(),
    lastChange: z.number(),
    /** Present only once ranked highly enough to place on the regional leaderboard. */
    leaderboardRank: z.number().nullable().optional(),
  }),
  peak: z.object({
    tierName: z.string(),
    tierIconUrl: z.string().optional(),
    /** Short season code (e.g. "e5a3") the peak rank was reached in — absent for very old accounts. */
    seasonShort: z.string().optional(),
  }),
  /** Win/game tally for the most recent (typically still-active) competitive act — the seasonal
   * history array is append-only and its last entry tracks the live season, not just closed ones. */
  currentSeason: z
    .object({
      wins: z.number(),
      games: z.number(),
    })
    .optional(),
  recentMatches: z.array(valorantMatchSchema),
  /**
   * HenrikDev's stored-match archive, retained locally after the first backfill. The archive is
   * intentionally described as available history rather than a guaranteed Riot-complete career.
   */
  history: z.object({
    matches: z.array(valorantMatchSchema),
    totalMatchesAvailable: z.number().int().nonnegative(),
    fetchedAt: z.string(),
    currentActShort: z.string().optional(),
  }),
});

export type ValorantData = z.infer<typeof valorantSchema>;
