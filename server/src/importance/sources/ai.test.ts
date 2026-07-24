import { describe, expect, it } from 'vitest';
import type { AiUsageToolData } from '@personal-dashboard/shared';
import { aiCandidates } from './ai.js';

describe('aiCandidates', () => {
  it('identifies the tightest tool and limit window in the runway detail', () => {
    const data: AiUsageToolData = {
      available: true,
      fiveHour: { usedPercent: 80, resetsAt: '2026-07-16T21:59:00.000Z' },
      weekly: { usedPercent: 50, resetsAt: '2026-07-20T21:59:00.000Z' },
      history: [],
    };

    const runway = aiCandidates([{ id: 'codex', label: 'Codex', data }], 7, 50)
      .find((candidate) => candidate.id === 'ai-usage:runway');

    expect(runway).toMatchObject({ title: '20% available', accent: 'codex' });
    expect(runway?.detail).toContain('Codex · 5-hour limit');
  });

  it('does not flag heavy usage from a few hours of same-day samples right after a window reset', () => {
    // All samples land on the same UTC day as "now" and are excluded as the partial, still-forming
    // bucket — mirroring githubCandidates' own trailing window — so there's no prior-day baseline yet.
    const data: AiUsageToolData = {
      available: true,
      fiveHour: { usedPercent: 70, resetsAt: '2026-07-20T18:00:00.000Z' },
      history: [
        { at: '2026-07-20T10:00:00.000Z', fiveHourUsedPercent: 0 },
        { at: '2026-07-20T10:15:00.000Z', fiveHourUsedPercent: 1 },
        { at: '2026-07-20T10:30:00.000Z', fiveHourUsedPercent: 2 },
        { at: '2026-07-20T13:00:00.000Z', fiveHourUsedPercent: 70 },
      ],
    };

    const anomaly = aiCandidates([{ id: 'claude', label: 'Claude', data }], 14, 50)
      .find((candidate) => candidate.id === 'ai-usage:anomaly:claude');

    expect(anomaly).toBeUndefined();
  });

  it('flags heavy usage against a trailing daily-average baseline, not a raw sample-count slice', () => {
    const priorDay = (date: string, percent: number): AiUsageToolData['history'][number] => (
      { at: `${date}T12:00:00.000Z`, fiveHourUsedPercent: percent }
    );
    const data: AiUsageToolData = {
      available: true,
      fiveHour: { usedPercent: 90, resetsAt: '2026-07-20T18:00:00.000Z' },
      history: [
        priorDay('2026-07-15', 10),
        priorDay('2026-07-16', 12),
        priorDay('2026-07-17', 8),
        priorDay('2026-07-18', 11),
        { at: '2026-07-20T09:00:00.000Z', fiveHourUsedPercent: 90 },
      ],
    };

    const anomaly = aiCandidates([{ id: 'claude', label: 'Claude', data }], 14, 50)
      .find((candidate) => candidate.id === 'ai-usage:anomaly:claude');

    expect(anomaly).toMatchObject({ kicker: 'Heavy usage', title: 'Claude running well above usual' });
  });
});
