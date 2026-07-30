import { z } from 'zod';

export const clashRoyaleCardSchema = z.object({
  id: z.number(),
  name: z.string(),
  level: z.number(),
  maxLevel: z.number(),
  /** Present when the player has unlocked an Evolution for this card. */
  evolutionLevel: z.number().optional(),
  /** Clash Royale Wiki card art, including evolution-specific art when equipped. */
  iconUrl: z.string().optional(),
  /** Official API art used only when a wiki file has not been uploaded or renamed yet. */
  fallbackIconUrl: z.string().optional(),
  /** common / rare / epic / legendary / champion, lower-cased. Drives the rarity-colored card
   * frame; absent (rather than validated against a fixed enum) so a new rarity Supercell ships
   * doesn't fail schema validation — it just falls back to the default frame color client-side. */
  rarity: z.string().optional(),
});

export type ClashRoyaleCard = z.infer<typeof clashRoyaleCardSchema>;

export const clashRoyaleBattleSchema = z.object({
  battleTime: z.string(),
  type: z.string(),
  /** Supercell's human-readable game-mode label, when the battle-log response provides one. */
  modeName: z.string().optional(),
  /** The arena recorded with this specific battle — always the player's Trophy Road arena (e.g.
   * "Legendary Arena"), even for a `pathOfLegend` battle. Never the ranked league it was played
   * in; use `pathOfLegendsLeagueNumber` for that. */
  arenaName: z.string().optional(),
  result: z.enum(['win', 'loss', 'draw']),
  crownsFor: z.number(),
  crownsAgainst: z.number(),
  opponentName: z.string().optional(),
  /** Absent for battle types (e.g. friendly/challenge) that don't affect the ladder. */
  trophyChange: z.number().optional(),
  /** Raw API league number this specific `pathOfLegend` battle was played at — the API reports
   * this per-battle (unlike arenaName), so it reflects the league at the time, not the player's
   * current one. Apply `pathOfLegendsDisplayLeagueNumber` before any display lookup. Absent for
   * non-Path-of-Legends battles. */
  pathOfLegendsLeagueNumber: z.number().optional(),
});

export type ClashRoyaleBattle = z.infer<typeof clashRoyaleBattleSchema>;

export const clashRoyaleSchema = z.object({
  profile: z.object({
    tag: z.string(),
    name: z.string(),
    expLevel: z.number(),
    trophies: z.number(),
    bestTrophies: z.number(),
    wins: z.number(),
    losses: z.number(),
    threeCrownWins: z.number(),
    battleCount: z.number(),
    arenaName: z.string(),
    clanName: z.string().optional(),
    clanTag: z.string().optional(),
    clanScore: z.number().optional(),
    /** Resolved from the clan's official badgeId using RoyaleAPI's public badge manifest. */
    clanBadgeUrl: z.string().url().optional(),
    pathOfLegends: z.object({
      leagueNumber: z.number(),
      trophies: z.number(),
      rank: z.number().nullable().optional(),
    }).optional(),
  }),
  currentDeck: z.array(clashRoyaleCardSchema),
  /** Heroes and Champions now occupy a special deck slot which is absent from currentDeck. */
  deckHero: clashRoyaleCardSchema.optional(),
  /** Original position of the recovered special-slot card in the eight-card battle deck. */
  deckHeroIndex: z.number().int().nonnegative().optional(),
  /** The selected Tower Troop is reported separately from the eight battle cards. */
  towerTroop: clashRoyaleCardSchema.optional(),
  recentBattles: z.array(clashRoyaleBattleSchema),
});

export type ClashRoyaleData = z.infer<typeof clashRoyaleSchema>;
