import type { JSONValue } from 'postgres';
import type { ProviderScheduler } from './scheduler.js';
import type { SignalHistoryStore } from './signalHistory.js';

/**
 * Not data: `command-center` is derived from the other providers, so persisting it would store a
 * second copy of what they already wrote, and `activity-push` is a delivery mechanism with no
 * payload worth keeping.
 */
export const DERIVED_PROVIDER_IDS = ['command-center', 'activity-push'];

/** Metric name every provider's full payload is stored under, alongside curated ones like `gmail`/`unreadThreads`. */
export const PAYLOAD_METRIC = 'payload';

export function shouldPersist(providerId: string, excluded: readonly string[]): boolean {
  return !excluded.includes(providerId);
}

/**
 * Persists every provider's payload to `signal_history` as it settles, so the dashboard accumulates
 * a queryable archive rather than only ever holding the latest reading in memory.
 *
 * `SignalHistoryStore.record` skips the write when the value is unchanged, so a provider that polls
 * every minute but only moves twice a day costs two rows, not 1440. Nothing is pruned: the history
 * is the point.
 *
 * Only `ready` envelopes are recorded. A failed fetch leaves the last good payload in the cache
 * (that is what `stale` means), and re-recording it would forge an observation that never happened.
 */
export function persistProviderHistory(
  scheduler: ProviderScheduler,
  signalHistory: SignalHistoryStore,
  excluded: readonly string[] = DERIVED_PROVIDER_IDS,
): void {
  scheduler.onSettled((id) => {
    if (!shouldPersist(id, excluded)) return;
    const envelope = scheduler.getEnvelope(id);
    if (envelope?.status !== 'ready' || envelope.data === undefined) return;
    // Fire-and-forget with its own catch: `onSettled` listeners run in a synchronous loop, so a
    // rejection here would surface as an unhandled rejection rather than as this provider's problem.
    void signalHistory.record(id, PAYLOAD_METRIC, envelope.data as JSONValue).catch((error) => {
      console.error(`[history] could not persist "${id}":`, error);
    });
  });
}
