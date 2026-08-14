import { describe, expect, it } from 'vitest';
import {
  claudeNextRefreshMs,
  parseClaudeUsageScreen,
  retainKnownClaudeQuota,
  type ClaudeQuota,
} from './claude.js';

const knownQuota: ClaudeQuota = {
  fiveHour: { usedPercent: 100, resetsAt: '2026-07-17T05:00:00.000Z' },
  weekly: { usedPercent: 42, resetsAt: '2026-07-20T05:00:00.000Z' },
  fiveHourStatus: 'limited',
  weeklyStatus: 'limited',
  asOf: '2026-07-17T00:00:00.000Z',
};

describe('retainKnownClaudeQuota', () => {
  const beforeBothReset = Date.parse('2026-07-17T02:00:00.000Z');
  const afterBothReset = Date.parse('2026-07-21T00:00:00.000Z');

  it('keeps the last quota report when Claude only returns run statistics at the cap', () => {
    expect(retainKnownClaudeQuota({ fiveHourStatus: 'unknown', weeklyStatus: 'unknown' }, knownQuota, beforeBothReset))
      .toEqual(knownQuota);
  });

  it('backfills a window that failed to capture this tick even though another window in the same live report parsed fine', () => {
    // Real bug: the 5-hour block captured cleanly (asOf gets stamped) but the weekly block's header
    // never rendered in the PTY capture that tick, so its status is 'unknown', not 'unlimited'.
    // A whole-report gate on live.asOf would discard the still-valid weekly reading here.
    const live: ClaudeQuota = {
      fiveHour: { usedPercent: 71, resetsAt: '2026-07-17T05:00:00.000Z' },
      fiveHourStatus: 'limited',
      weeklyStatus: 'unknown',
      asOf: '2026-07-17T01:00:00.000Z',
    };

    expect(retainKnownClaudeQuota(live, knownQuota, beforeBothReset)).toEqual({
      fiveHour: live.fiveHour,
      weekly: knownQuota.weekly,
      modelWeekly: undefined,
      fiveHourStatus: 'limited',
      weeklyStatus: 'limited',
      asOf: live.asOf,
    });
  });

  it('uses a new explicit no-limits report instead of stale quota data', () => {
    const unlimited: ClaudeQuota = {
      fiveHourStatus: 'unlimited',
      weeklyStatus: 'unlimited',
      asOf: '2026-07-17T01:00:00.000Z',
    };

    expect(retainKnownClaudeQuota(unlimited, knownQuota, beforeBothReset)).toEqual(unlimited);
  });

  it('drops a retained window once its own resetsAt has passed, instead of serving it forever', () => {
    const live: ClaudeQuota = { fiveHourStatus: 'unknown', weeklyStatus: 'unknown' };

    // Both knownQuota windows (fiveHour resets 07-17T05:00, weekly resets 07-20T05:00) are behind us.
    expect(retainKnownClaudeQuota(live, knownQuota, afterBothReset)).toEqual(live);
  });

  it('drops only the expired window, keeping a still-current one from the same retained report', () => {
    const live: ClaudeQuota = { fiveHourStatus: 'unknown', weeklyStatus: 'unknown' };
    // Between the two resetsAt values: fiveHour (07-17T05:00) has passed, weekly (07-20T05:00) hasn't.
    const between = Date.parse('2026-07-18T00:00:00.000Z');

    expect(retainKnownClaudeQuota(live, knownQuota, between)).toEqual({
      fiveHour: undefined,
      weekly: knownQuota.weekly,
      modelWeekly: undefined,
      fiveHourStatus: 'unknown',
      weeklyStatus: 'limited',
      asOf: knownQuota.asOf,
    });
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

  it('reports weekly as unknown, not unlimited, when its header never rendered this capture', () => {
    // A 5-hour-only capture (weekly section missing entirely, e.g. a truncated/early PTY read)
    // must not be conflated with Claude explicitly reporting no weekly cap.
    const quota = parseClaudeUsageScreen(
      `Current session
      71% used
      Resets 5:20pm (Europe/Oslo)`,
      new Date(2026, 6, 17, 13, 0),
    );

    expect(quota.fiveHourStatus).toBe('limited');
    expect(quota.weekly).toBeUndefined();
    expect(quota.weeklyStatus).toBe('unknown');
  });

  it('falls back to an earlier complete redraw when the final one has headers but no values yet', () => {
    // The interactive screen redraws in place as data streams in, so a capture cut off right after
    // a fresh redraw's headers land — but before their percentage/reset lines do — leaves bare
    // headers as the last render. Those headers are not a report: reading only them would make both
    // windows look like an explicit "no limit". The complete render earlier in the same buffer is
    // seconds old and real, so it wins over reporting nothing.
    const quota = parseClaudeUsageScreen(
      `Current session
      5% used
      Resets 11pm (Europe/Oslo)

      Current week (all models)
      11% used
      Resets Jul 26 at 12am (Europe/Oslo)

      Refreshing…

      Current session
      Current week (all models)`,
      new Date(2026, 6, 21, 16, 26),
    );

    expect(quota.fiveHour?.usedPercent).toBe(5);
    expect(quota.weekly?.usedPercent).toBe(11);
    expect(quota.fiveHourStatus).toBe('limited');
    expect(quota.weeklyStatus).toBe('limited');
  });

  it('recovers the weekly window when the final Windows conpty redraw drops characters mid-line', () => {
    // Captured live on Windows: the closing redraw lost enough characters that "Current week (all
    // models)" arrived as "wek (all models)" and "42% used Resets Aug 16" as "42Aug16". Reading only
    // that render leaves weekly unparsed, which stalls the interactive probe's "both windows parsed"
    // check for its full 35s timeout and then serves a days-old transcript instead — the actual
    // cause of both AI usage widgets sitting on "as of 2 d ago" while refresh appeared to do nothing.
    const quota = parseClaudeUsageScreen(
      'Current session█████▌11%usedResets 7pm (Europe/Oslo)Current week (all models)█████████████████████42%used Resets Aug 16, 12am (Europe/Oslo)'
      + " +50% weekly limits promo through Aug 19What's contributing to your limits usage?"
      + 'Current session█████▌ 11%usedResets7pm(Europe/Oslo)wek (all models)████████████████42Aug16, 12am (Europe/Oslo)',
      new Date(2026, 7, 14, 14, 27),
    );

    expect(quota.fiveHour?.usedPercent).toBe(11);
    expect(quota.weekly).toEqual({ usedPercent: 42, resetsAt: new Date(2026, 7, 16, 0, 0).toISOString() });
    expect(quota.weeklyStatus).toBe('limited');
  });

  it('parses the current Usage screen layout', () => {
    const quota = parseClaudeUsageScreen(
      `Settings  Status   Config   Usage   Stats

      Session

      Current session
      ████████████▌                                      25% used
      Resets 2:29am (Europe/Oslo)

      Current week (all models)
      ██████████████████████████████████████▌            77% used
      Resets Jul 25 at 11:59pm (Europe/Oslo)`,
      new Date(2026, 6, 24, 0, 30),
    );

    expect(quota.fiveHour?.usedPercent).toBe(25);
    expect(quota.weekly?.usedPercent).toBe(77);
    expect(quota.fiveHourStatus).toBe('limited');
    expect(quota.weeklyStatus).toBe('limited');
  });

  it('parses the newer comma-separated weekly reset format ("Aug 16, 12am")', () => {
    // Current Claude renders the weekly reset as "Resets Aug 16, 12am" (comma, no "at") while the
    // 5-hour window stays "Resets 4pm". The older "Aug 16 at 12am" form must keep working too. A
    // weekly window that fails to parse here stalls the interactive probe's "both windows parsed"
    // finish check until it times out and discards an otherwise-complete screen.
    const quota = parseClaudeUsageScreen(
      `Current session
      ██████████████████████44% used
      Resets 4pm (Europe/Oslo)

      Current week (all models)
      ███6% used
      Resets Aug 16, 12am (Europe/Oslo)`,
      new Date(2026, 7, 10, 12, 0),
    );

    expect(quota.fiveHour?.usedPercent).toBe(44);
    expect(quota.weekly).toEqual({ usedPercent: 6, resetsAt: new Date(2026, 7, 16, 0, 0).toISOString() });
    expect(quota.weeklyStatus).toBe('limited');
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
