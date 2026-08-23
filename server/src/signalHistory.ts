import type { Database } from './db/client.js';
import type { JSONValue } from 'postgres';

/** Cross-machine change history for the few metrics whose *lack* of movement is meaningful. */
export class SignalHistoryStore {
  constructor(private readonly database: Database) {}

  async record(source: string, metric: string, value: JSONValue): Promise<void> {
    const sql = this.database.client;
    const json = JSON.stringify(value);
    await sql.begin(async (transaction) => {
      const lockKey = ['signal', source, metric].join(':');
      await transaction`select pg_advisory_xact_lock(hashtext(${lockKey}))`;
      // Compared as jsonb rather than by stringifying what was read back: jsonb stores object keys
      // in its own canonical order (shortest first), so a round-tripped payload almost never
      // re-serializes to the byte string the provider produced, and a JS-side string comparison
      // reports "changed" on every single poll. `=` on jsonb is semantic, so key order and numeric
      // spelling (1 vs 1.0) do not count as a change.
      //
      // The `::text::jsonb` cast is load-bearing: with a bare `::jsonb`, postgres.js types the
      // parameter as jsonb and JSON-encodes the string we pass, so the comparison runs against a
      // jsonb *string scalar* ("{\"rooms\":…}") and never matches the stored object.
      const [current] = await transaction<{ unchanged: boolean }[]>`
        select value = ${json}::text::jsonb as unchanged
        from signal_current where source = ${source} and metric = ${metric} for update
      `;
      if (current?.unchanged) return;
      await transaction`
        insert into signal_current (source, metric, value, changed_at)
        values (${source}, ${metric}, ${json}::jsonb, now())
        on conflict (source, metric) do update set value = excluded.value, changed_at = now()
      `;
      await transaction`
        insert into signal_history (source, metric, value, recorded_at)
        values (${source}, ${metric}, ${json}::jsonb, now())
      `;
    });
  }

  async lastChangedAt(source: string, metric: string): Promise<Date | undefined> {
    const [row] = await this.database.client<{ changed_at: string }[]>`
      select changed_at from signal_current where source = ${source} and metric = ${metric}
    `;
    return row ? new Date(row.changed_at) : undefined;
  }

  /** The value stored before the next `record()` call overwrites it — read this first to compute a delta. */
  async getValue(source: string, metric: string): Promise<JSONValue | undefined> {
    const [row] = await this.database.client<{ value: JSONValue }[]>`
      select value from signal_current where source = ${source} and metric = ${metric}
    `;
    return row?.value;
  }

  /**
   * Drops archived observations older than `retentionDays`, keeping the newest row of every
   * (source, metric) whatever its age.
   *
   * That exemption is not tidiness: `hasChangedSinceBaseline` counts rows and `lastChangedAt` reads
   * the latest, so a signal that settled months ago and has not moved since would otherwise lose
   * its only observation and start reporting as if it had never been seen.
   *
   * Returns the number of rows deleted.
   */
  async prune(retentionDays: number): Promise<number> {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
    const deleted = await this.database.client<{ id: string }[]>`
      delete from signal_history
      where recorded_at < now() - make_interval(days => ${Math.floor(retentionDays)})
        and id not in (
          select distinct on (source, metric) id from signal_history
          order by source, metric, recorded_at desc
        )
      returning id
    `;
    return deleted.length;
  }

  /** The first observation is a baseline, not a meaningful change. */
  async hasChangedSinceBaseline(source: string, metric: string): Promise<boolean> {
    const [row] = await this.database.client<{ count: number }[]>`
      select count(*)::int as count from signal_history where source = ${source} and metric = ${metric}
    `;
    return (row?.count ?? 0) > 1;
  }
}
