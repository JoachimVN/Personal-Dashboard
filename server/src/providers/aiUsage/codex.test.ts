import { describe, expect, it } from 'vitest';
import { isCodexLimitStale, parseCodexStatusScreen } from './codex.js';

describe('parseCodexStatusScreen', () => {
  it('reads the weekly bar as "left" and converts it to used-percent', () => {
    const now = new Date(2026, 6, 18, 11, 0);
    const quota = parseCodexStatusScreen(
      `╭──────────────────────────────────────────────────────────────────────────────────╮
       │  >_ OpenAI Codex (v0.144.5)                                                      │
       │  Weekly limit:         [████████████████████] 100% left (resets 11:49 on 25 Jul) │
       ╰──────────────────────────────────────────────────────────────────────────────────╯`,
      now,
    );

    expect(quota.weekly).toEqual({ usedPercent: 0, resetsAt: new Date(2026, 6, 25, 11, 49).toISOString() });
    expect(quota.weeklyStatus).toBe('limited');
    expect(quota.asOf).toBe(now.toISOString());
  });

  it('reads a partially-used week', () => {
    const quota = parseCodexStatusScreen(
      'Weekly limit:         [████████████░░░░░░░░] 38% left (resets 09:15 on 3 Aug)',
      new Date(2026, 6, 18, 11, 0),
    );

    expect(quota.weekly?.usedPercent).toBe(62);
  });

  it('parses only the final redraw when the panel renders more than once in the captured stream', () => {
    const quota = parseCodexStatusScreen(
      `Weekly limit:         [░░░░░░░░░░░░░░░░░░░░] 0% left (resets 11:49 on 25 Jul)
       Weekly limit:         [████████████████████] 100% left (resets 11:49 on 25 Jul)`,
      new Date(2026, 6, 18, 11, 0),
    );

    expect(quota.weekly?.usedPercent).toBe(0);
  });

  it('reports unknown when the panel never rendered a limit row', () => {
    const quota = parseCodexStatusScreen('Starting MCP servers (2/7): posthog, sonarqube…', new Date(2026, 6, 18, 11, 0));

    expect(quota.weekly).toBeUndefined();
    expect(quota.weeklyStatus).toBe('unknown');
    expect(quota.fiveHourStatus).toBe('unknown');
  });

  it('also picks up a 5-hour row if Codex ever adds one, and marks a missing weekly unlimited', () => {
    // Codex's panel doesn't render this today, but the row format is otherwise identical to the
    // weekly one — this is the forward-compatible case the label classifier exists for.
    const quota = parseCodexStatusScreen(
      '5h limit:              [██████████░░░░░░░░░░] 50% left (resets 16:00 on 18 Jul)',
      new Date(2026, 6, 18, 11, 0),
    );

    expect(quota.fiveHour).toEqual({ usedPercent: 50, resetsAt: new Date(2026, 6, 18, 16, 0).toISOString() });
    expect(quota.fiveHourStatus).toBe('limited');
    // A report that omits the weekly row entirely (rather than never rendering at all) means it's
    // reporting no current weekly limit, not "we don't know" — same convention as codexSnapshot.
    expect(quota.weekly).toBeUndefined();
    expect(quota.weeklyStatus).toBe('unlimited');
  });
});

describe('isCodexLimitStale', () => {
  it('treats a missing window or asOf as stale', () => {
    expect(isCodexLimitStale(undefined, undefined)).toBe(true);
    expect(isCodexLimitStale({ usedPercent: 62, resetsAt: '2026-07-23T09:03:22.000Z' }, undefined)).toBe(true);
  });

  it('treats a window as stale once its own reset time has passed, even if it was read recently', () => {
    const window = { usedPercent: 62, resetsAt: '2026-07-18T09:00:00.000Z' };
    expect(isCodexLimitStale(window, '2026-07-18T09:00:00.000Z', Date.parse('2026-07-18T09:00:01.000Z'))).toBe(true);
    expect(isCodexLimitStale(window, '2026-07-18T09:00:00.000Z', Date.parse('2026-07-18T08:59:59.000Z'))).toBe(false);
  });

  it("treats a reading with a future resetsAt as stale once it hasn't been refreshed in a while", () => {
    // Reproduces the real bug: Codex granted an early, out-of-cycle usage-limit reset, so the
    // account's weekly window rolled over with resetsAt still five days out and no local session
    // write to notice. Age, not resetsAt, is what has to catch that.
    const window = { usedPercent: 62, resetsAt: '2026-07-23T09:03:22.000Z' };
    const now = Date.parse('2026-07-18T09:58:22.000Z'); // ~16.8h after asOf, resetsAt still 5 days out
    expect(isCodexLimitStale(window, '2026-07-17T17:11:31.990Z', now)).toBe(true);
  });

  it('respects a custom max age', () => {
    const window = { usedPercent: 62, resetsAt: '2026-07-23T09:03:22.000Z' };
    expect(isCodexLimitStale(window, '2026-07-18T09:00:00.000Z', Date.parse('2026-07-18T09:30:00.000Z'), 60 * 60_000)).toBe(false);
    expect(isCodexLimitStale(window, '2026-07-18T09:00:00.000Z', Date.parse('2026-07-18T10:30:00.000Z'), 60 * 60_000)).toBe(true);
  });
});
