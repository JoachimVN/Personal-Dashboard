import { z } from 'zod';

export const clashOfClansWarSchema = z.object({
  state: z.enum(['preparation', 'inWar']),
  opponentName: z.string().optional(),
  endTime: z.string(),
  /** This player's own attacks used/available — clan-wide totals live in `clanStars`/`clanDestructionPercentage`. */
  attacksUsed: z.number(),
  attacksTotal: z.number(),
  clanStars: z.number(),
  clanDestructionPercentage: z.number(),
  opponentStars: z.number(),
  opponentDestructionPercentage: z.number(),
});

export type ClashOfClansWar = z.infer<typeof clashOfClansWarSchema>;

export const clashOfClansRaidWeekendSchema = z.object({
  state: z.enum(['ongoing', 'ended']),
  endTime: z.string(),
  attacksUsed: z.number(),
  attacksLimit: z.number(),
  capitalTotalLoot: z.number(),
});

export type ClashOfClansRaidWeekend = z.infer<typeof clashOfClansRaidWeekendSchema>;

export const clashOfClansSchema = z.object({
  profile: z.object({
    tag: z.string(),
    name: z.string(),
    townHallLevel: z.number(),
    trophies: z.number(),
    /** Absent only if Supercell's response is missing `leagueTier` entirely — shouldn't happen
     * once a player has ever left the unranked starting tier. */
    league: z.object({
      name: z.string(),
      /** Supercell's own league-tier art (api-assets.clashofclans.com) — unlike the war/raid
       * icons, these come pre-cropped, so no local vendoring needed. */
      iconUrl: z.string().optional(),
    }).optional(),
    clanTag: z.string().optional(),
    clanName: z.string().optional(),
  }),
  /** Absent when not currently in a war (private war log, or between wars). */
  war: clashOfClansWarSchema.nullable(),
  /** Absent outside a raid weekend, or when the clan has no capital raid history yet. */
  raidWeekend: clashOfClansRaidWeekendSchema.nullable(),
});

export type ClashOfClansData = z.infer<typeof clashOfClansSchema>;
