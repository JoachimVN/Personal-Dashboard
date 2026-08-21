import { z } from 'zod';
import type { Database } from './db/client.js';

const milestoneBaselineSchema = z.object({
  townHallLevel: z.number(),
  builderHallLevel: z.number().optional(),
  bestTrophies: z.number(),
  bestBuilderBaseTrophies: z.number().optional(),
  leagueTierName: z.string().optional(),
  builderBaseLeagueName: z.string().optional(),
});

export type ClashOfClansMilestoneBaseline = z.infer<typeof milestoneBaselineSchema>;

const countersSchema = z.object({
  donations: z.number(),
  clanCapitalContributions: z.number(),
  attackWins: z.number(),
  warStars: z.number(),
});

export type ClashOfClansCounters = z.infer<typeof countersSchema>;

const pushStateSchema = z.object({
  attackKey: z.string().optional(),
  raidKey: z.string().optional(),
  milestoneBaseline: milestoneBaselineSchema.optional(),
  counters: countersSchema.optional(),
  lastActiveAt: z.string().nullable(),
  /** When the player was last successfully fetched — the newest instant we know `counters` was
   * still accurate. A counter increase found on the *next* fetch could have happened anywhere
   * between this and now (Supercell's API has no per-event timestamp for these), so this doubles
   * as the honest lower bound for that event's timestamp instead of "now", which overstates
   * freshness by the whole gap after any downtime (see detectClashOfClansCounterActivity). */
  lastCheckedAt: z.string().nullable().optional(),
});

export type ClashOfClansPushState = z.infer<typeof pushStateSchema>;

/**
 * Cross-restart memory for the Clash of Clans activity push. Without this, the attack/raid
 * dedup keys and milestone baseline only ever lived in the provider's in-memory closure — a
 * server restart reset them to undefined, which made `fetchClashOfClansActivity` treat the
 * *same* already-reported war attack as brand new, re-stamp it with `new Date().toISOString()`,
 * and re-push it to Batabiboing. Batabiboing then displayed the same stale attack/message with a
 * timestamp that looked fresh, resetting its 12h staleness window on every restart.
 */
export class ClashOfClansStateStore {
  constructor(private readonly database: Database) {}

  async get(): Promise<ClashOfClansPushState | undefined> {
    const [row] = await this.database.client<{ value: unknown }[]>`
      select value from signal_current where source = 'clash-of-clans' and metric = 'push-state'
    `;
    if (!row) return undefined;
    const parsed = pushStateSchema.safeParse(row.value);
    return parsed.success ? parsed.data : undefined;
  }

  async set(state: ClashOfClansPushState): Promise<void> {
    await this.database.client`
      insert into signal_current (source, metric, value, changed_at)
      values ('clash-of-clans', 'push-state', ${JSON.stringify(state)}::jsonb, now())
      on conflict (source, metric) do update set value = excluded.value, changed_at = now()
    `;
  }
}
