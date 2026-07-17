import type { Database } from './db/client.js';
import type { JSONValue } from 'postgres';

/** Cross-machine change history for the few metrics whose *lack* of movement is meaningful. */
export class SignalHistoryStore {
  constructor(private readonly database: Database) {}

  async record(source: string, metric: string, value: JSONValue): Promise<void> {
    const sql = this.database.client;
    await sql.begin(async (transaction) => {
      const lockKey = ['signal', source, metric].join(':');
      await transaction`select pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const [current] = await transaction<{ value: unknown }[]>`
        select value from signal_current where source = ${source} and metric = ${metric} for update
      `;
      if (current && JSON.stringify(current.value) === JSON.stringify(value)) return;
      await transaction`
        insert into signal_current (source, metric, value, changed_at)
        values (${source}, ${metric}, ${JSON.stringify(value)}::jsonb, now())
        on conflict (source, metric) do update set value = excluded.value, changed_at = now()
      `;
      await transaction`
        insert into signal_history (source, metric, value, recorded_at)
        values (${source}, ${metric}, ${JSON.stringify(value)}::jsonb, now())
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

  /** The first observation is a baseline, not a meaningful change. */
  async hasChangedSinceBaseline(source: string, metric: string): Promise<boolean> {
    const [row] = await this.database.client<{ count: number }[]>`
      select count(*)::int as count from signal_history where source = ${source} and metric = ${metric}
    `;
    return (row?.count ?? 0) > 1;
  }
}
