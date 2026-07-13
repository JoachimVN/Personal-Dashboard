import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { spotifySchema, type SpotifyData } from '@personal-dashboard/shared';

const cacheFileSchema = z.object({
  version: z.literal(1),
  snapshot: spotifySchema.optional(),
  rateLimitedUntil: z.number().nonnegative().default(0),
});

/**
 * Owner-only last-good Spotify data and rate-limit deadline. Keeping both on disk means a server
 * restart during a Spotify cooldown can still render the previous dashboard state without making
 * another request that extends the limit.
 */
export class SpotifySnapshotStore {
  private snapshot: SpotifyData | undefined;
  private rateLimitedUntil: number;

  constructor(private readonly filePath: string) {
    const loaded = this.load();
    this.snapshot = loaded.snapshot;
    this.rateLimitedUntil = loaded.rateLimitedUntil;
  }

  getSnapshot(): SpotifyData | undefined {
    return this.snapshot;
  }

  getRateLimitedUntil(): number {
    return this.rateLimitedUntil;
  }

  setRateLimitedUntil(until: number): void {
    this.rateLimitedUntil = Math.max(this.rateLimitedUntil, until);
    this.save();
  }

  setSnapshot(snapshot: SpotifyData): void {
    this.snapshot = snapshot;
    this.rateLimitedUntil = 0;
    this.save();
  }

  private load(): z.infer<typeof cacheFileSchema> {
    try {
      return cacheFileSchema.parse(JSON.parse(readFileSync(this.filePath, 'utf8')));
    } catch {
      return { version: 1, rateLimitedUntil: 0 };
    }
  }

  private save(): void {
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
      const temporaryPath = `${this.filePath}.tmp`;
      writeFileSync(
        temporaryPath,
        JSON.stringify({ version: 1, snapshot: this.snapshot, rateLimitedUntil: this.rateLimitedUntil }),
        { mode: 0o600 },
      );
      renameSync(temporaryPath, this.filePath);
    } catch (error) {
      console.warn('[spotify] Could not persist cached data:', (error as Error).message);
    }
  }
}
