import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const fileSchema = z.object({
  version: z.literal(1),
  /** Section id -> ordered widget-id list, as arranged by the user in the UI. */
  sections: z.record(z.string(), z.array(z.string())).default({}),
});

/**
 * Persists arranged widget order per section to a gitignored JSON file (server/.data/layout.json)
 * — this is interactive runtime UI state, not a hand-edited preference, so it doesn't belong in
 * the tracked server/config.json. Same load/save-with-tmp-rename shape as usageHistory.ts.
 */
export class LayoutStore {
  private sections: Record<string, string[]>;

  constructor(private readonly filePath: string) {
    this.sections = this.load();
  }

  getAll(): Record<string, string[]> {
    return this.sections;
  }

  set(sectionId: string, order: string[]): void {
    this.sections[sectionId] = order;
    this.save();
  }

  private load(): Record<string, string[]> {
    try {
      return fileSchema.parse(JSON.parse(readFileSync(this.filePath, 'utf8'))).sections;
    } catch {
      return {};
    }
  }

  private save(): void {
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
      const tmpPath = `${this.filePath}.tmp`;
      writeFileSync(tmpPath, JSON.stringify({ version: 1, sections: this.sections }), { mode: 0o600 });
      renameSync(tmpPath, this.filePath);
    } catch (err) {
      console.warn('[layout] Could not persist widget order:', (err as Error).message);
    }
  }
}
