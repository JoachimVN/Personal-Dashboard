import { describe, expect, it, vi } from 'vitest';
import type { Database } from './db/client.js';
import { HEALTH_INGEST_CHANNEL, listenForHealthIngest, notifyHealthIngest } from './healthNotify.js';

function fakeDatabase(client: Partial<Database['client']>): Database {
  return { client } as unknown as Database;
}

describe('notifyHealthIngest', () => {
  it('announces the day count on the shared channel', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    await notifyHealthIngest(fakeDatabase({ notify } as never), 7);
    expect(notify).toHaveBeenCalledWith(HEALTH_INGEST_CHANNEL, '7');
  });

  it('swallows a failed announcement, since the samples are already committed', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const notify = vi.fn().mockRejectedValue(new Error('connection reset'));

    await expect(notifyHealthIngest(fakeDatabase({ notify } as never), 1)).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('listenForHealthIngest', () => {
  it('coalesces a burst of announcements into a single refresh', async () => {
    vi.useFakeTimers();
    let notify: (value: string) => void = () => {};
    const onIngest = vi.fn();

    await listenForHealthIngest(
      fakeDatabase({
        listen: ((_channel: string, onnotify: (value: string) => void) => {
          notify = onnotify;
          return Promise.resolve();
        }) as never,
      }),
      onIngest,
    );

    notify('1');
    notify('1');
    notify('1');
    expect(onIngest).not.toHaveBeenCalled(); // still inside the coalescing window

    await vi.advanceTimersByTimeAsync(1_000);
    expect(onIngest).toHaveBeenCalledTimes(1);

    notify('1');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onIngest).toHaveBeenCalledTimes(2); // a later burst is its own refresh
    vi.useRealTimers();
  });

  it('refreshes on subscribe, so a reconnecting dashboard catches what it missed', async () => {
    vi.useFakeTimers();
    let onListen: () => void = () => {};
    const onIngest = vi.fn();

    await listenForHealthIngest(
      fakeDatabase({
        listen: ((_channel: string, _onnotify: unknown, onlisten: () => void) => {
          onListen = onlisten;
          return Promise.resolve();
        }) as never,
      }),
      onIngest,
    );

    onListen();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(onIngest).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
