import type { JSONValue } from 'postgres';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { ProviderScheduler } from './scheduler.js';
import type { SignalHistoryStore } from './signalHistory.js';
import { DERIVED_PROVIDER_IDS, PAYLOAD_METRIC, persistProviderHistory, shouldPersist } from './providerHistory.js';

interface Recorded {
  source: string;
  metric: string;
  value: JSONValue;
}

function recordingStore(onRecord?: () => Promise<void>) {
  const recorded: Recorded[] = [];
  const store = {
    record: async (source: string, metric: string, value: JSONValue) => {
      recorded.push({ source, metric, value });
      await onRecord?.();
    },
  } as unknown as SignalHistoryStore;
  return { store, recorded };
}

function register(scheduler: ProviderScheduler, id: string, fetch: () => Promise<unknown>) {
  scheduler.register({
    id,
    schema: z.any(),
    refreshMs: 60_000,
    timeoutMs: 1_000,
    isConfigured: () => true,
    fetch,
  });
}

/** `record` is fired without being awaited by the settle hook, so let its microtasks drain. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('shouldPersist', () => {
  it('archives real providers and skips the ones holding no data of their own', () => {
    expect(shouldPersist('github', DERIVED_PROVIDER_IDS)).toBe(true);
    expect(shouldPersist('imessage', DERIVED_PROVIDER_IDS)).toBe(true);
    expect(shouldPersist('command-center', DERIVED_PROVIDER_IDS)).toBe(false);
    expect(shouldPersist('activity-push', DERIVED_PROVIDER_IDS)).toBe(false);
  });
});

describe('persistProviderHistory', () => {
  it('archives a settled payload under the provider id', async () => {
    const scheduler = new ProviderScheduler();
    const { store, recorded } = recordingStore();
    persistProviderHistory(scheduler, store);
    register(scheduler, 'clash-royale', async () => ({ trophies: 6_412 }));

    await scheduler.refresh('clash-royale');
    await settle();

    expect(recorded).toEqual([
      { source: 'clash-royale', metric: PAYLOAD_METRIC, value: { trophies: 6_412 } },
    ]);
  });

  it('skips providers the config excludes', async () => {
    const scheduler = new ProviderScheduler();
    const { store, recorded } = recordingStore();
    persistProviderHistory(scheduler, store, ['clash-royale']);
    register(scheduler, 'clash-royale', async () => ({ trophies: 1 }));

    await scheduler.refresh('clash-royale');
    await settle();

    expect(recorded).toEqual([]);
  });

  it('does not archive a failed fetch, which would forge an observation from cached data', async () => {
    const scheduler = new ProviderScheduler();
    const { store, recorded } = recordingStore();
    persistProviderHistory(scheduler, store);
    register(scheduler, 'github', async () => {
      throw new Error('upstream down');
    });

    await scheduler.refresh('github');
    await settle();

    expect(recorded).toEqual([]);
  });

  it('keeps a store failure from escaping the settle hook as an unhandled rejection', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const scheduler = new ProviderScheduler();
    const { store } = recordingStore(() => Promise.reject(new Error('postgres gone')));
    persistProviderHistory(scheduler, store);
    register(scheduler, 'weather', async () => ({ tempC: 21 }));

    await expect(scheduler.refresh('weather')).resolves.not.toThrow();
    await settle();

    expect(unhandled).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    process.off('unhandledRejection', unhandled);
    consoleError.mockRestore();
  });
});
