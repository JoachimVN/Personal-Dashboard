import { describe, expect, it } from 'vitest';
import {
  claudeNextRefreshMs,
  isCodexLimitStale,
  limitStatus,
  parseClaudeUsageScreen,
  parseCodexStatusScreen,
  retainKnownClaudeQuota,
  type ClaudeQuota,
} from './aiUsage.js';

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

  it('reads unlimited from a redraw whose headers rendered before its digits did', () => {
    // The interactive screen redraws in place as data streams in. If a capture is cut off right
    // after a fresh redraw's headers land but before their percentage/reset lines do, both windows
    // read as an explicit "no limit" even though an earlier, complete redraw in the same buffer had
    // real numbers — parseClaudeUsageScreen always anchors to the *last* header occurrence (see
    // latestScreen) so it can't fall back to that earlier, fully-rendered report on its own.
    // This is why claudeInteractiveUsageSnapshot's settle timer must re-arm on every chunk rather
    // than only on chunks that parse cleanly: only waiting for genuine quiet keeps this scenario
    // from ever reaching parseClaudeUsageScreen in the first place.
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

    expect(quota.fiveHourStatus).toBe('unlimited');
    expect(quota.weeklyStatus).toBe('unlimited');
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
