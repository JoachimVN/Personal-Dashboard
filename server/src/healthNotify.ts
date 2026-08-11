import type { Database } from './db/client.js';

/**
 * Postgres LISTEN/NOTIFY channel announcing that health days were written.
 *
 * The Apple Health Shortcut can post to the always-on Railway service instead of a dashboard
 * (see `src/ingest.ts`), and that service has no way to reach a dashboard directly — they sit on a
 * tailnet and are usually asleep. The one thing every installation shares is the database, so the
 * writer announces through it and each dashboard refreshes on the announcement rather than waiting
 * out its 5-minute poll.
 */
export const HEALTH_INGEST_CHANNEL = 'health_ingest';

/**
 * Announces a completed ingest. Never throws: the samples are already committed by the time this
 * runs, so a failed announcement should cost freshness (the next poll still picks them up), not the
 * caller's 200.
 */
export async function notifyHealthIngest(database: Database, dayCount: number): Promise<void> {
  try {
    await database.client.notify(HEALTH_INGEST_CHANNEL, String(dayCount));
  } catch (error) {
    console.error('[health] could not announce ingest to other dashboards:', error);
  }
}

/**
 * Subscribes to ingest announcements. `onIngest` also fires on every (re)subscribe, including
 * postgres.js's automatic reconnect, because a dashboard that was disconnected missed any
 * announcement sent meanwhile and would otherwise sit on stale data until its next poll.
 *
 * Announcements are coalesced: a burst only refreshes once.
 */
export async function listenForHealthIngest(
  database: Database,
  onIngest: () => void,
  coalesceMs = 1_000,
): Promise<void> {
  let pending: NodeJS.Timeout | undefined;
  const schedule = () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = undefined;
      onIngest();
    }, coalesceMs);
    pending.unref?.();
  };

  await database.client.listen(HEALTH_INGEST_CHANNEL, schedule, schedule);
}
