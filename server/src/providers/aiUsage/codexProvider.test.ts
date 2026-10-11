import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCodexUsageProvider } from './codex.js';
import type { UsageHistoryStore } from '../../usageHistory.js';
const { account } = vi.hoisted(() => ({ account: vi.fn() }));
vi.mock('./codexAccount.js', () => ({ codexAccountSnapshot: account }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('Codex refresh', () => {
  it('retains a live account read on ordinary ticks and forces another account request on manual Refresh', async () => {
    vi.stubEnv('CODEX_HOME', '/missing-codex-test-home');
    const now = new Date().toISOString();
    const reading = { available: true, asOf: now, fiveHourStatus: 'limited', weeklyStatus: 'limited',
      fiveHour: { usedPercent: 3, resetsAt: new Date(Date.now() + 3_600_000).toISOString() },
      weekly: { usedPercent: 7, resetsAt: new Date(Date.now() + 86_400_000).toISOString() },
    };
    account.mockResolvedValueOnce(reading).mockResolvedValueOnce({ ...reading, fiveHour: { ...reading.fiveHour, usedPercent: 4 } });
    const history = { getSnapshot: vi.fn().mockResolvedValue(undefined), record: vi.fn().mockResolvedValue([]) } as unknown as UsageHistoryStore;
    const provider = createCodexUsageProvider(30_000, history);
    const signal = new AbortController().signal;
    expect((await provider.fetch(signal, false)).fiveHour?.usedPercent).toBe(3);
    expect((await provider.fetch(signal, false)).fiveHour?.usedPercent).toBe(3);
    expect(account).toHaveBeenCalledOnce();
    expect((await provider.fetch(signal, true)).fiveHour?.usedPercent).toBe(4);
    expect(account).toHaveBeenCalledTimes(2);
  });
});
