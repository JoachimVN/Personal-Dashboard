import { describe, expect, it, vi } from 'vitest';
import type { Database } from './db/client.js';
import {
  listenForProviderRefresh,
  notifyProviderRefresh,
  PROVIDER_REFRESH_CHANNEL,
} from './refreshNotify.js';

function fakeDatabase(client: Partial<Database['client']>): Database {
  return { client } as unknown as Database;
}

describe('notifyProviderRefresh', () => {
  it('announces the provider id on the shared channel', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    await notifyProviderRefresh(fakeDatabase({ notify } as never), 'github');
    expect(notify).toHaveBeenCalledWith(PROVIDER_REFRESH_CHANNEL, 'github');
  });

  it('swallows a failed announcement, since the write it describes already committed', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const notify = vi.fn().mockRejectedValue(new Error('connection reset'));

    await expect(
      notifyProviderRefresh(fakeDatabase({ notify } as never), 'health'),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('listenForProviderRefresh', () => {
  function subscribe(onRefresh: (id: string | undefined) => void) {
    let notify: (value: string) => void = () => {};
    let onListen: () => void = () => {};
    const ready = listenForProviderRefresh(
      fakeDatabase({
        listen: ((_channel: string, onnotify: (value: string) => void, onlisten: () => void) => {
          notify = onnotify;
          onListen = onlisten;
          return Promise.resolve();
        }) as never,
      }),
      onRefresh,
    );
    return { ready, notify: (v: string) => notify(v), onListen: () => onListen() };
  }

  it('coalesces a burst for one provider into a single refresh', async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn();
    const { ready, notify } = subscribe(onRefresh);
    await ready;

    notify('health');
    notify('health');
    notify('health');
    expect(onRefresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(onRefresh).toHaveBeenCalledExactlyOnceWith('health');
    vi.useRealTimers();
  });

  it('does not let one provider swallow another provider announced in the same window', async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn();
    const { ready, notify } = subscribe(onRefresh);
    await ready;

    notify('health');
    notify('github');
    await vi.advanceTimersByTimeAsync(1_000);

    expect(onRefresh).toHaveBeenCalledTimes(2);
    expect(onRefresh.mock.calls.map(([id]) => id).sort()).toEqual(['github', 'health']);
    vi.useRealTimers();
  });

  it('signals "you may have missed something" on subscribe, without naming a provider', async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn();
    const { ready, onListen } = subscribe(onRefresh);
    await ready;

    onListen();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(onRefresh).toHaveBeenCalledExactlyOnceWith(undefined);
    vi.useRealTimers();
  });
});
