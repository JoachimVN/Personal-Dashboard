import { describe, expect, it } from 'vitest';
import { claudeNextRefreshMs, limitStatus, parseClaudeUsageScreen, retainKnownClaudeQuota, type ClaudeQuota } from './aiUsage.js';

describe('limitStatus', () => {
  it('marks an omitted window unlimited when another current quota window is reported', () => {
    expect(limitStatus(false, true)).toBe('unlimited');
  });

  it('keeps a reported limit and an unavailable report distinct', () => {
    expect(limitStatus(true, true)).toBe('limited');
    expect(limitStatus(false, false)).toBe('unknown');
  });
});

const knownQuota: ClaudeQuota = {
  fiveHour: { usedPercent: 100, resetsAt: '2026-07-17T05:00:00.000Z' },
  weekly: { usedPercent: 42, resetsAt: '2026-07-20T05:00:00.000Z' },
  fiveHourStatus: 'limited',
  weeklyStatus: 'limited',
  asOf: '2026-07-17T00:00:00.000Z',
};

describe('retainKnownClaudeQuota', () => {
  it('keeps the last quota report when Claude only returns run statistics at the cap', () => {
    expect(retainKnownClaudeQuota({ fiveHourStatus: 'unknown', weeklyStatus: 'unknown' }, knownQuota)).toEqual(knownQuota);
  });

  it('uses a new explicit no-limits report instead of stale quota data', () => {
    const unlimited: ClaudeQuota = {
      fiveHourStatus: 'unlimited',
      weeklyStatus: 'unlimited',
      asOf: '2026-07-17T01:00:00.000Z',
    };

    expect(retainKnownClaudeQuota(unlimited, knownQuota)).toEqual(unlimited);
  });
});

describe('parseClaudeUsageScreen', () => {
  it('reads the multiline interactive Usage screen rather than the print-mode statistics', () => {
    const now = new Date(2026, 6, 17, 13, 0);
    const quota = parseClaudeUsageScreen(`
      \u001B[2JCurrent session
      ███████████████████████████████████▌               71% used
      Resets 5:20pm (Europe/Oslo)

      Current week (all models)
      ███████████████▌                                   31% used
      Resets Jul 19 at 12am (Europe/Oslo)
    `, now);

    expect(quota.fiveHour).toEqual({ usedPercent: 71, resetsAt: new Date(2026, 6, 17, 17, 20).toISOString() });
    expect(quota.weekly).toEqual({ usedPercent: 31, resetsAt: new Date(2026, 6, 19, 0, 0).toISOString() });
    expect(quota.fiveHourStatus).toBe('limited');
    expect(quota.weeklyStatus).toBe('limited');
  });

  it('handles terminal cursor captures that collapse visual spaces', () => {
    const quota = parseClaudeUsageScreen(
      'Currentsession96%usedResets5:20pm(Europe/Oslo)Currentweek(allmodels)33%usedResetsJul19at12am(Europe/Oslo)',
      new Date(2026, 6, 17, 13, 0),
    );

    expect(quota.fiveHour?.usedPercent).toBe(96);
    expect(quota.weekly?.usedPercent).toBe(33);
  });

  it('reads the final redraw instead of an earlier approximate one still sitting in the captured stream', () => {
    // The interactive screen redraws in place — an approximate render first, then a corrected one
    // once local sessions finish scanning for the per-model breakdown. The PTY capture is
    // append-only, so both renders are present in the buffer; the earlier one must be ignored.
    const now = new Date(2026, 6, 17, 13, 0);
    const quota = parseClaudeUsageScreen(
      `
      Current session
      5% used
      Resets 5:59am (Europe/Oslo)

      Current week (all models)
      40% used
      Resets Jul 18 at 11:59pm (Europe/Oslo)

      Current week (Fable)
      12% used
      Resets Jul 18 at 11:59pm (Europe/Oslo)

      Refreshing…

      Current session
      7% used
      Resets 5:59am (Europe/Oslo)

      Current week (all models)
      41% used
      Resets Jul 18 at 11:59pm (Europe/Oslo)

      Current week (Fable)
      12% used
      Resets Jul 18 at 11:59pm (Europe/Oslo)
    `,
      now,
    );

    expect(quota.fiveHour?.usedPercent).toBe(7);
    expect(quota.weekly?.usedPercent).toBe(41);
    expect(quota.modelWeekly).toMatchObject({ model: 'Fable', usedPercent: 12 });
  });

  it('continues to read older transcript reports with dated session resets', () => {
    const quota = parseClaudeUsageScreen(
      'Current session: 80% used · resets Jul 13 at 2am (Europe/Oslo)\nCurrent week (all models): 13% used · resets Jul 19 at 12am (Europe/Oslo)\nCurrent week (Fable): 9% used · resets Jul 19 at 12am (Europe/Oslo)',
      new Date(2026, 6, 12, 22, 0),
    );

    expect(quota.fiveHour?.usedPercent).toBe(80);
    expect(quota.weekly?.usedPercent).toBe(13);
    expect(quota.modelWeekly).toMatchObject({ model: 'Fable', usedPercent: 9 });
  });

  it('backdates asOf when the screen reports rate-limited last-known usage instead of a live read', () => {
    const now = new Date(2026, 6, 17, 18, 0);
    const quota = parseClaudeUsageScreen(
      `Current session
      0% used
      Resets 11:59pm (Europe/Oslo)

      Current week (all models)
      35% used
      Resets Jul 18 at 11:59pm (Europe/Oslo)

      Showing last-known usage as of 50m ago (rate limited — try again in a moment)`,
      now,
    );

    expect(quota.fiveHour?.usedPercent).toBe(0);
    expect(quota.asOf).toBe(new Date(2026, 6, 17, 17, 10).toISOString());
  });
});

describe('claudeNextRefreshMs', () => {
  it('waits until the last capped window resets instead of probing during a rate limit', () => {
    const now = Date.parse('2026-07-17T12:00:00.000Z');
    const refreshMs = claudeNextRefreshMs({
      available: true,
      fiveHour: { usedPercent: 100, resetsAt: '2026-07-17T15:20:00.000Z' },
      weekly: { usedPercent: 100, resetsAt: '2026-07-19T00:00:00.000Z' },
      fiveHourStatus: 'limited',
      weeklyStatus: 'limited',
      asOf: new Date(now).toISOString(),
    }, 15 * 60_000, now);

    expect(refreshMs).toBe(Date.parse('2026-07-19T00:00:00.000Z') - now + 5_000);
  });
});
