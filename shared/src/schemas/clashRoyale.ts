import { z } from 'zod';

export const clashRoyaleCardSchema = z.object({
  id: z.number(),
  name: z.string(),
  level: z.number(),
  maxLevel: z.number(),
  iconUrl: z.string().optional(),
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
  }),
  currentDeck: z.array(clashRoyaleCardSchema),
  /** Next 10 chests in the player's chest cycle, oldest (next-opened) first. */
  upcomingChests: z.array(z.string()),
  recentBattles: z.array(clashRoyaleBattleSchema),
});

export type ClashRoyaleData = z.infer<typeof clashRoyaleSchema>;
