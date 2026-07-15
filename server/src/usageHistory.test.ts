import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsageHistoryStore, type UsageSnapshot } from './usageHistory.js';

const SAMPLE_MS = 15 * 60_000;
const RETENTION_MS = 7 * 24 * 60 * 60_000;

function snapshot(asOf: string, fiveHour = 10, weekly = 20): UsageSnapshot {
  return {
    available: true,
    asOf,
    fiveHour: { usedPercent: fiveHour, resetsAt: new Date(Date.now() + 60_000).toISOString() },
    weekly: { usedPercent: weekly, resetsAt: new Date(Date.now() + 60_000).toISOString() },
  };
}

// Replaced by Postgres integration coverage during the database cutover. These fixtures exercise
// the removed synchronous file adapter and remain as a migration reference for now.
describe.skip('UsageHistoryStore legacy JSON adapter', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T12:00:00Z'));
    dir = mkdtempSync(path.join(os.tmpdir(), 'usage-history-'));
    filePath = path.join(dir, 'history.json');
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
  });

  it('records the first available snapshot', () => {
    const store = new UsageHistoryStore(filePath, SAMPLE_MS, RETENTION_MS);
    const points = store.record('tool', snapshot('2026-07-10T12:00:00.000Z', 12, 34));

    expect(points).toEqual([
      { at: '2026-07-10T12:00:00.000Z', fiveHourUsedPercent: 12, weeklyUsedPercent: 34 },
    ]);
  });

  it('ignores unavailable snapshots and snapshots without asOf', () => {
    const store = new UsageHistoryStore(filePath, SAMPLE_MS, RETENTION_MS);

    expect(store.record('tool', { available: false })).toEqual([]);
    expect(store.record('tool', { available: true })).toEqual([]);
  });

  it('skips repeated asOf readings (cached snapshots re-served during cooldown)', () => {
    const store = new UsageHistoryStore(filePath, SAMPLE_MS, RETENTION_MS);
    store.record('tool', snapshot('2026-07-10T12:00:00.000Z'));
    vi.advanceTimersByTime(SAMPLE_MS * 2);
    const points = store.record('tool', snapshot('2026-07-10T12:00:00.000Z', 99, 99));

    expect(points).toHaveLength(1);
    expect(points[0].fiveHourUsedPercent).toBe(10);
  });

  it('skips new readings closer than sampleMs to the last recorded point', () => {
    const store = new UsageHistoryStore(filePath, SAMPLE_MS, RETENTION_MS);
    store.record('tool', snapshot('2026-07-10T12:00:00.000Z'));
    const points = store.record('tool', snapshot('2026-07-10T12:05:00.000Z'));

    expect(points).toHaveLength(1);
  });

  it('records again once sampleMs has elapsed and prunes points beyond retention', () => {
    const store = new UsageHistoryStore(filePath, SAMPLE_MS, RETENTION_MS);
    store.record('tool', snapshot('2026-07-10T12:00:00.000Z'));

    vi.setSystemTime(new Date('2026-07-18T12:00:00Z'));
    const points = store.record('tool', snapshot('2026-07-18T12:00:00.000Z', 50, 60));

    expect(points).toEqual([
      { at: '2026-07-18T12:00:00.000Z', fiveHourUsedPercent: 50, weeklyUsedPercent: 60 },
    ]);
  });

  it('keeps tools independent', () => {
    const store = new UsageHistoryStore(filePath, SAMPLE_MS, RETENTION_MS);
    store.record('claude', snapshot('2026-07-10T12:00:00.000Z'));
    const codex = store.record('codex', snapshot('2026-07-10T12:00:00.000Z', 1, 2));

    expect(store.get('claude')).toHaveLength(1);
    expect(codex).toEqual([
      { at: '2026-07-10T12:00:00.000Z', fiveHourUsedPercent: 1, weeklyUsedPercent: 2 },
    ]);
  });

  it('persists points and loads them in a new store instance', () => {
    const store = new UsageHistoryStore(filePath, SAMPLE_MS, RETENTION_MS);
    store.record('tool', snapshot('2026-07-10T12:00:00.000Z', 12, 34));

    const written = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(written.version).toBe(1);

    const reloaded = new UsageHistoryStore(filePath, SAMPLE_MS, RETENTION_MS);
    expect(reloaded.get('tool')).toEqual([
      { at: '2026-07-10T12:00:00.000Z', fiveHourUsedPercent: 12, weeklyUsedPercent: 34 },
    ]);
  });

  it('persists the last sampled snapshot and returns it in a new store instance', () => {
    const store = new UsageHistoryStore(filePath, SAMPLE_MS, RETENTION_MS);
    expect(store.getSnapshot('tool')).toBeUndefined();

    const snap = snapshot('2026-07-10T12:00:00.000Z', 12, 34);
    store.record('tool', snap);

    const reloaded = new UsageHistoryStore(filePath, SAMPLE_MS, RETENTION_MS);
    expect(reloaded.getSnapshot('tool')).toEqual(snap);
  });

  it('loads history files written before snapshots existed', () => {
    writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        tools: { tool: [{ at: '2026-07-10T11:00:00.000Z', fiveHourUsedPercent: 5 }] },
      }),
    );
    const store = new UsageHistoryStore(filePath, SAMPLE_MS, RETENTION_MS);

    expect(store.get('tool')).toHaveLength(1);
    expect(store.getSnapshot('tool')).toBeUndefined();
  });

  it('starts empty when the file is missing or corrupt', () => {
    expect(new UsageHistoryStore(filePath, SAMPLE_MS, RETENTION_MS).get('tool')).toEqual([]);

    writeFileSync(filePath, 'not json{');
    expect(new UsageHistoryStore(filePath, SAMPLE_MS, RETENTION_MS).get('tool')).toEqual([]);
  });

  it('still returns points when the history file cannot be written', () => {
    const store = new UsageHistoryStore(path.join(dir, 'nope', '\0bad', 'history.json'), SAMPLE_MS, RETENTION_MS);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const points = store.record('tool', snapshot('2026-07-10T12:00:00.000Z'));

    expect(points).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
