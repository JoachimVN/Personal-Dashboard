import { z } from 'zod';
import { usageHistoryPointSchema, type UsageHistoryPoint } from '@personal-dashboard/shared';
import type { Database } from './db/client.js';

const persistedSnapshotSchema = z.object({
  available: z.boolean(),
  fiveHour: z.object({ usedPercent: z.number(), resetsAt: z.string() }).optional(),
  weekly: z.object({ usedPercent: z.number(), resetsAt: z.string() }).optional(),
  modelWeekly: z.object({ usedPercent: z.number(), resetsAt: z.string(), model: z.string() }).optional(),
  fiveHourStatus: z.enum(['limited', 'unlimited', 'unknown']).optional(),
  weeklyStatus: z.enum(['limited', 'unlimited', 'unknown']).optional(),
  tokens: z.object({ fiveHour: z.number(), weekly: z.number() }).optional(),
  asOf: z.string().optional(),
});

export type UsageSnapshot = z.infer<typeof persistedSnapshotSchema>;

interface UsagePointRow {
  at: string;
  five_hour_used_percent: number | null;
  weekly_used_percent: number | null;
  model_weekly_used_percent: number | null;
}

function toPoint(row: UsagePointRow): UsageHistoryPoint {
  return usageHistoryPointSchema.parse({
    at: new Date(row.at).toISOString(),
    fiveHourUsedPercent: row.five_hour_used_percent ?? undefined,
    weeklyUsedPercent: row.weekly_used_percent ?? undefined,
    modelWeeklyUsedPercent: row.model_weekly_used_percent ?? undefined,
  });
}

/** Persisted usage time series. Per-tool advisory locks preserve the sample interval across machines. */
export class UsageHistoryStore {
  constructor(
    private readonly database: Database,
    private readonly sampleMs: number,
    private readonly retentionMs: number,
  ) {}

  async record(toolId: string, snapshot: UsageSnapshot): Promise<UsageHistoryPoint[]> {
    const sql = this.database.client;
    if (!snapshot.available || !snapshot.asOf) return this.get(toolId);
    const at = new Date(snapshot.asOf);
    if (Number.isNaN(at.getTime())) return this.get(toolId);

    return sql.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtext(${`ai-usage:${toolId}`}))`;
      const [last] = await transaction<UsagePointRow[]>`
        select at, five_hour_used_percent, weekly_used_percent, model_weekly_used_percent
        from ai_usage_history_points where tool_id = ${toolId} order by at desc limit 1
      `;
      if (!last || at.getTime() - Date.parse(last.at) >= this.sampleMs) {
        await transaction`
          insert into ai_usage_history_points (
            tool_id, at, five_hour_used_percent, weekly_used_percent, model_weekly_used_percent
          ) values (
            ${toolId}, ${at.toISOString()}, ${snapshot.fiveHour?.usedPercent ?? null},
            ${snapshot.weekly?.usedPercent ?? null}, ${snapshot.modelWeekly?.usedPercent ?? null}
          ) on conflict (tool_id, at) do nothing
        `;
        await transaction`
          insert into ai_usage_snapshots (tool_id, snapshot, updated_at)
          values (${toolId}, ${JSON.stringify(snapshot)}::jsonb, now())
          on conflict (tool_id) do update set snapshot = excluded.snapshot, updated_at = now()
        `;
      }
      const cutoff = new Date(Date.now() - this.retentionMs).toISOString();
      await transaction`delete from ai_usage_history_points where tool_id = ${toolId} and at < ${cutoff}`;
      const points = await transaction<UsagePointRow[]>`
        select at, five_hour_used_percent, weekly_used_percent, model_weekly_used_percent
        from ai_usage_history_points where tool_id = ${toolId} order by at asc
      `;
      return points.map(toPoint);
    });
  }

  async get(toolId: string): Promise<UsageHistoryPoint[]> {
    const rows = await this.database.client<UsagePointRow[]>`
      select at, five_hour_used_percent, weekly_used_percent, model_weekly_used_percent
      from ai_usage_history_points where tool_id = ${toolId} order by at asc
    `;
    return rows.map(toPoint);
  }

  async getSnapshot(toolId: string): Promise<UsageSnapshot | undefined> {
    const [row] = await this.database.client<{ snapshot: unknown }[]>`
      select snapshot from ai_usage_snapshots where tool_id = ${toolId}
    `;
    return row ? persistedSnapshotSchema.parse(row.snapshot) : undefined;
  }
}
