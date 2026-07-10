import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ProviderScheduler, type Provider } from './scheduler.js';

const schema = z.object({ value: z.number() });

function fakeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'fake',
    schema,
    refreshMs: 60_000,
    timeoutMs: 5_000,
    isConfigured: () => true,
    fetch: async () => ({ value: 1 }),
    ...overrides,
  };
}

describe('ProviderScheduler', () => {
  let scheduler: ProviderScheduler;

  beforeEach(() => {
    scheduler = new ProviderScheduler();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    scheduler.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('caches validated data as ready after a successful fetch', async () => {
    scheduler.register(fakeProvider());
    await scheduler.refresh('fake');

    const envelope = scheduler.getEnvelope('fake')!;
    expect(envelope.status).toBe('ready');
    expect(envelope.data).toEqual({ value: 1 });
    expect(envelope.fetchedAt).toBeDefined();
    expect(envelope.lastAttemptAt).toBeDefined();
    expect(envelope.error).toBeUndefined();
  });

  it('keeps last-good data and reports stale when a later fetch fails', async () => {
    let fail = false;
    scheduler.register(
      fakeProvider({
        fetch: async () => {
          if (fail) throw new Error('boom');
          return { value: 1 };
        },
      }),
    );
    await scheduler.refresh('fake');
    fail = true;
    await scheduler.refresh('fake');

    const envelope = scheduler.getEnvelope('fake')!;
    expect(envelope.status).toBe('stale');
    expect(envelope.data).toEqual({ value: 1 });
    expect(envelope.error).toBe('fetch-failed');
  });

  it('reports error when the first fetch fails and no data exists', async () => {
    scheduler.register(
      fakeProvider({
        fetch: async () => {
          throw new Error('boom');
        },
      }),
    );
    await scheduler.refresh('fake');

    const envelope = scheduler.getEnvelope('fake')!;
    expect(envelope.status).toBe('error');
    expect(envelope.data).toBeUndefined();
    expect(envelope.fetchedAt).toBeUndefined();
    expect(envelope.lastAttemptAt).toBeDefined();
  });

  it('treats schema validation failure like a fetch failure', async () => {
    let payload: unknown = { value: 1 };
    scheduler.register(fakeProvider({ fetch: async () => payload }));
    await scheduler.refresh('fake');
    payload = { value: 'not-a-number' };
    await scheduler.refresh('fake');

    const envelope = scheduler.getEnvelope('fake')!;
    expect(envelope.status).toBe('stale');
    expect(envelope.data).toEqual({ value: 1 });
    expect(envelope.error).toBe('invalid-response');
  });

  it('aborts a hung fetch at timeoutMs and records a timeout error', async () => {
    vi.useFakeTimers();
    scheduler.register(
      fakeProvider({
        timeoutMs: 1_000,
        fetch: (signal) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      }),
    );
    const refreshing = scheduler.refresh('fake');
    await vi.advanceTimersByTimeAsync(1_000);
    await refreshing;

    const envelope = scheduler.getEnvelope('fake')!;
    expect(envelope.status).toBe('error');
    expect(envelope.error).toBe('timeout');
  });

  it('skips a refresh while the previous one is in flight (single-flight)', async () => {
    let resolveFetch!: (value: { value: number }) => void;
    const fetch = vi.fn(
      () => new Promise<{ value: number }>((resolve) => (resolveFetch = resolve)),
    );
    scheduler.register(fakeProvider({ fetch }));

    const first = scheduler.refresh('fake');
    const second = scheduler.refresh('fake');
    resolveFetch({ value: 1 });
    await Promise.all([first, second]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(scheduler.getEnvelope('fake')!.status).toBe('ready');
  });

  it('never fetches an unconfigured provider and reports disabled', async () => {
    const fetch = vi.fn(async () => ({ value: 1 }));
    scheduler.register(fakeProvider({ isConfigured: () => false, fetch }));
    scheduler.start();
    await scheduler.refresh('fake');

    expect(fetch).not.toHaveBeenCalled();
    expect(scheduler.getEnvelope('fake')!.status).toBe('disabled');
  });

  it('fetches immediately on start and again on the interval', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => ({ value: 1 }));
    scheduler.register(fakeProvider({ refreshMs: 10_000, fetch }));
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
