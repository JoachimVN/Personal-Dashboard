import { describe, expect, it } from 'vitest';
import { limitStatus, retainKnownClaudeQuota, type ClaudeQuota } from './aiUsage.js';

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
