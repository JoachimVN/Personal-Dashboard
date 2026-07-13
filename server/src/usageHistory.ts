import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { usageHistoryPointSchema, type UsageHistoryPoint } from '@personal-dashboard/shared';

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

const fileSchema = z.object({
  version: z.literal(1),
  tools: z.record(z.string(), z.array(usageHistoryPointSchema)),
  /** Last sampled snapshot per tool; absent in files written before this field existed. */
  snapshots: z.record(z.string(), persistedSnapshotSchema).default({}),
});

/** The provider snapshot fields the store samples from — AiUsageToolData minus the history it produces. */
export type UsageSnapshot = z.infer<typeof persistedSnapshotSchema>;

/**
 * Records AI usage snapshots over time so the client can chart trends. One store is shared by
 * all AI usage providers; points are persisted to a gitignored JSON file (same pattern as
 * server/.tokens/) so history survives server restarts.
 */
export class UsageHistoryStore {
  private tools: Record<string, UsageHistoryPoint[]>;
  private snapshots: Record<string, UsageSnapshot>;
  private readonly lastAsOf = new Map<string, string>();

  constructor(
    private readonly filePath: string,
    private readonly sampleMs: number,
    private readonly retentionMs: number,
  ) {
    const loaded = this.load();
    this.tools = loaded.tools;
    this.snapshots = loaded.snapshots;
  }

  /**
   * Record a snapshot if it is a genuinely new reading (`asOf` dedupe — providers re-serve
   * cached snapshots during cooldowns/idle) at least `sampleMs` after the previous point.
   * Returns the tool's history for embedding in the provider payload. Never throws: a broken
   * disk must not turn a working usage widget into fetch-failed.
   */
  record(toolId: string, snapshot: UsageSnapshot): UsageHistoryPoint[] {
    const points = (this.tools[toolId] ??= []);
    if (!snapshot.available || !snapshot.asOf) return points;
    if (this.lastAsOf.get(toolId) === snapshot.asOf) return points;
    this.lastAsOf.set(toolId, snapshot.asOf);

    const last = points.at(-1);
    if (last && Date.parse(snapshot.asOf) - Date.parse(last.at) < this.sampleMs) return points;

    points.push({
      at: snapshot.asOf,
      fiveHourUsedPercent: snapshot.fiveHour?.usedPercent,
      weeklyUsedPercent: snapshot.weekly?.usedPercent,
      modelWeeklyUsedPercent: snapshot.modelWeekly?.usedPercent,
    });
    const cutoff = Date.now() - this.retentionMs;
    this.tools[toolId] = points.filter((point) => Date.parse(point.at) >= cutoff);
    this.snapshots[toolId] = snapshot;
    this.save();
    return this.tools[toolId];
  }

  get(toolId: string): UsageHistoryPoint[] {
    return this.tools[toolId] ?? [];
  }

  /** Last persisted snapshot, for re-serving across restarts (e.g. while rate-limit cooldowns block a fresh fetch). */
  getSnapshot(toolId: string): UsageSnapshot | undefined {
    return this.snapshots[toolId];
  }

  private load(): { tools: Record<string, UsageHistoryPoint[]>; snapshots: Record<string, UsageSnapshot> } {
    try {
      const parsed = fileSchema.parse(JSON.parse(readFileSync(this.filePath, 'utf8')));
      return { tools: parsed.tools, snapshots: parsed.snapshots };
    } catch {
      // Missing or corrupt file — start fresh rather than failing provider registration.
      return { tools: {}, snapshots: {} };
    }
  }

  /** Write cadence is bounded by the sample gate (≤ a few writes/hour), so no debounce needed. */
  private save(): void {
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
      const tmpPath = `${this.filePath}.tmp`;
      writeFileSync(
        tmpPath,
        JSON.stringify({ version: 1, tools: this.tools, snapshots: this.snapshots }),
        { mode: 0o600 },
      );
      renameSync(tmpPath, this.filePath);
    } catch (err) {
      console.warn('[ai-usage] Could not persist usage history:', (err as Error).message);
    }
  }
}
