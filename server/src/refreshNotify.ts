import type { Database } from './db/client.js';

/**
 * Postgres LISTEN/NOTIFY channel carrying "this provider has new data, re-read it".
 *
 * Writers that are not a dashboard — the always-on ingest service, the GitHub webhook receiver —
 * have no route back to one: dashboards sit on a tailnet and are usually asleep. The one thing
 * every installation shares is the database, so writers announce through it and each dashboard
 * refreshes on the announcement rather than waiting out that provider's poll interval.
 */
export const PROVIDER_REFRESH_CHANNEL = 'provider_refresh';

/**
 * Providers something outside this process can write: the phone's Shortcut posts health samples to
 * the ingest service, and GitHub's webhook reaches it too. Used on reconnect, when a dashboard
 * knows it may have missed an announcement but not which one.
 */
export const EXTERNALLY_WRITTEN_PROVIDER_IDS = ['health', 'github'];

/**
 * Announces that a provider's underlying data changed. Never throws: whatever prompted this is
 * already committed, so a failed announcement should cost freshness (the next poll still picks it
 * up), not the caller's response.
 */
export async function notifyProviderRefresh(database: Database, providerId: string): Promise<void> {
  try {
    await database.client.notify(PROVIDER_REFRESH_CHANNEL, providerId);
  } catch (error) {
    console.error(`[refresh] could not announce "${providerId}" to other dashboards:`, error);
  }
}

/**
 * Subscribes to refresh announcements. `onRefresh` also fires on every (re)subscribe, including
 * postgres.js's automatic reconnect — a dashboard that was disconnected missed any announcement
 * sent meanwhile and would otherwise sit on stale data until its next poll. It receives `undefined`
 * in that case, meaning "you may have missed something", rather than a specific provider id.
 *
 * Announcements are coalesced per provider: a burst only refreshes once.
 */
export async function listenForProviderRefresh(
  database: Database,
  onRefresh: (providerId: string | undefined) => void,
  coalesceMs = 1_000,
): Promise<void> {
  const pending = new Map<string, NodeJS.Timeout>();
  const schedule = (providerId: string | undefined) => {
    const key = providerId ?? '';
    if (pending.has(key)) return;
    const timer = setTimeout(() => {
      pending.delete(key);
      onRefresh(providerId);
    }, coalesceMs);
    timer.unref?.();
    pending.set(key, timer);
  };

  await database.client.listen(
    PROVIDER_REFRESH_CHANNEL,
    (providerId) => schedule(providerId),
    () => schedule(undefined),
  );
}
