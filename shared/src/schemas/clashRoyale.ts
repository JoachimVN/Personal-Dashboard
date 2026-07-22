import { z } from 'zod';

export const clashRoyaleCardSchema = z.object({
  id: z.number(),
  name: z.string(),
  level: z.number(),
  maxLevel: z.number(),
  /** Present when the player has unlocked an Evolution for this card. */
  evolutionLevel: z.number().optional(),
  iconUrl: z.string().optional(),
  /** common / rare / epic / legendary / champion, lower-cased. Drives the rarity-colored card
   * frame; absent (rather than validated against a fixed enum) so a new rarity Supercell ships
   * doesn't fail schema validation — it just falls back to the default frame color client-side. */
  rarity: z.string().optional(),
});

export type ClashRoyaleCard = z.infer<typeof clashRoyaleCardSchema>;

export const clashRoyaleBattleSchema = z.object({
  battleTime: z.string(),
  type: z.string(),
  result: z.enum(['win', 'loss', 'draw']),
  crownsFor: z.number(),
  crownsAgainst: z.number(),
  opponentName: z.string().optional(),
  /** Absent for battle types (e.g. friendly/challenge) that don't affect the ladder. */
  trophyChange: z.number().optional(),
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
