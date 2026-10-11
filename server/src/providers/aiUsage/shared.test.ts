import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { carryPastReset, cleanupProbeSession, limitStatus, loadUsageSnapshot } from './shared.js';
import type { UsageHistoryStore } from '../../usageHistory.js';

describe('probe resilience', () => {
  it('keeps a real session opened during the probe and removes only the probe transcript', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'usage-probe-test-'));
    try {
      await writeFile(path.join(directory, 'probe-id.jsonl'), 'probe');
      await writeFile(path.join(directory, 'real-session.jsonl'), 'user');
      await cleanupProbeSession(directory, 'probe-id');
      expect(await readFile(path.join(directory, 'real-session.jsonl'), 'utf8')).toBe('user');
      await expect(readFile(path.join(directory, 'probe-id.jsonl'))).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('does not let a hung persisted-baseline lookup block the live refresh', async () => {
    vi.useFakeTimers();
    try {
      const history = { getSnapshot: () => new Promise(() => {}) } as unknown as UsageHistoryStore;
      const result = loadUsageSnapshot(history, 'claude');
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await result).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('limitStatus', () => {
  it('marks an omitted window unlimited when another current quota window is reported', () => {
    expect(limitStatus(false, true)).toBe('unlimited');
  });

  it('keeps a reported limit and an unavailable report distinct', () => {
    expect(limitStatus(true, true)).toBe('limited');
    expect(limitStatus(false, false)).toBe('unknown');
  });
});

describe('carryPastReset', () => {
  const FIVE_HOUR_MS = 5 * 60 * 60_000;

  it('leaves a window untouched while its reset is still in the future', () => {
    const window = { usedPercent: 32, resetsAt: '2026-07-18T15:00:00.000Z' };
    expect(carryPastReset(window, FIVE_HOUR_MS, Date.parse('2026-07-18T10:00:00.000Z'))).toBe(window);
  });

  it('passes through a missing window', () => {
    expect(carryPastReset(undefined, FIVE_HOUR_MS)).toBeUndefined();
  });

  it('zeroes a window whose reset has passed and rolls the reset forward into the future', () => {
    // The real bug: a Codex 5-hour window read a day ago at 32% used, with nothing fresher since
    // (a quiet local log, a failing interactive fallback) — left alone it stays pinned at 32% long
    // after the window must have reset one or more times over.
    const window = { usedPercent: 32, resetsAt: '2026-07-17T10:11:00.000Z' };
    const now = Date.parse('2026-07-18T10:30:00.000Z'); // ~24h later
    const result = carryPastReset(window, FIVE_HOUR_MS, now);

    expect(result?.usedPercent).toBe(0);
    expect(Date.parse(result!.resetsAt)).toBeGreaterThan(now);
    // Still lands on the original reset cadence rather than an arbitrary "now + window" guess.
    expect((Date.parse(result!.resetsAt) - Date.parse(window.resetsAt)) % FIVE_HOUR_MS).toBe(0);
  });

  it('preserves other fields on the window (e.g. modelWeekly\'s model name)', () => {
    const window = { usedPercent: 80, resetsAt: '2026-07-17T10:00:00.000Z', model: 'claude-opus-5' };
    const result = carryPastReset(window, FIVE_HOUR_MS, Date.parse('2026-07-18T00:00:00.000Z'));
    expect(result?.model).toBe('claude-opus-5');
  });
});
