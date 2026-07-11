import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { healthDaySchema, type HealthDay, type HealthIngest } from '@personal-dashboard/shared';

const fileSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string().nullable().default(null),
  days: z.array(healthDaySchema).default([]),
});

/**
 * Persists Apple Health day rollups POSTed by a phone Shortcut to a gitignored JSON file
 * (server/.data/health.json) — same load/save-with-tmp-rename shape as usageHistory.ts. There
 * is no external API to poll; the store is the source of truth and the provider just reads it.
 */
export class HealthStore {
  private days: HealthDay[];
  private updatedAt: string | null;

  constructor(
    private readonly filePath: string,
    private readonly retentionDays: number,
  ) {
    const loaded = this.load();
    this.days = loaded.days;
    this.updatedAt = loaded.updatedAt;
  }

  /** Upsert a sample into its day (merging metrics so partial posts accumulate), prune, persist. */
  ingest(sample: HealthIngest, today: string): HealthDay {
    const date = sample.date ?? today;
    const existing = this.days.find((day) => day.date === date);
    const merged: HealthDay = {
      ...(existing ?? { date, workouts: [] }),
      ...sample,
      date,
      workouts: sample.workouts ?? existing?.workouts ?? [],
    };
    this.days = this.days.filter((day) => day.date !== date);
    this.days.push(merged);
    this.days.sort((a, b) => a.date.localeCompare(b.date));
    if (this.days.length > this.retentionDays) {
      this.days = this.days.slice(-this.retentionDays);
    }
    this.updatedAt = new Date().toISOString();
    this.save();
    return merged;
  }

  snapshot(today: string): { today: HealthDay | null; history: HealthDay[]; updatedAt: string | null } {
    return {
      today: this.days.find((day) => day.date === today) ?? null,
      history: this.days.slice(-14),
      updatedAt: this.updatedAt,
    };
  }

  private load(): { days: HealthDay[]; updatedAt: string | null } {
    try {
      const parsed = fileSchema.parse(JSON.parse(readFileSync(this.filePath, 'utf8')));
      return { days: parsed.days, updatedAt: parsed.updatedAt };
    } catch {
      // Missing or corrupt file — start empty rather than failing provider registration.
      return { days: [], updatedAt: null };
    }
  }

  private save(): void {
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
      const tmpPath = `${this.filePath}.tmp`;
      writeFileSync(
        tmpPath,
        JSON.stringify({ version: 1, updatedAt: this.updatedAt, days: this.days }),
        { mode: 0o600 },
      );
      renameSync(tmpPath, this.filePath);
    } catch (err) {
      console.warn('[health] Could not persist health samples:', (err as Error).message);
    }
  }
}
