import { spotifySchema, type SpotifyData } from '@personal-dashboard/shared';
import type { Database } from './db/client.js';

/** Owner-only last-good Spotify data and rate-limit deadline, shared safely by all installations. */
export class SpotifySnapshotStore {
  constructor(private readonly database: Database) {}

  async getSnapshot(): Promise<SpotifyData | undefined> {
    const [row] = await this.database.client<{ snapshot: unknown }[]>`
      select snapshot from spotify_snapshot where id = 1
    `;
    return row?.snapshot ? spotifySchema.parse(row.snapshot) : undefined;
  }

  async getRateLimitedUntil(): Promise<number> {
    const [row] = await this.database.client<{ rate_limited_until: number }[]>`
      select rate_limited_until from spotify_snapshot where id = 1
    `;
    return Number(row?.rate_limited_until ?? 0);
  }

  async setRateLimitedUntil(until: number): Promise<void> {
    const sql = this.database.client;
    await sql`
      insert into spotify_snapshot (id, rate_limited_until) values (1, ${until})
      on conflict (id) do update set
        rate_limited_until = greatest(spotify_snapshot.rate_limited_until, excluded.rate_limited_until),
        updated_at = now()
    `;
  }

  async setSnapshot(snapshot: SpotifyData): Promise<void> {
    const sql = this.database.client;
    await sql`
      insert into spotify_snapshot (id, snapshot, rate_limited_until) values (1, ${JSON.stringify(snapshot)}::jsonb, 0)
      on conflict (id) do update set snapshot = excluded.snapshot, rate_limited_until = 0, updated_at = now()
    `;
  }
}
