import { describe, expect, it } from 'vitest';
import { latestClashRoyaleActivity } from './activityPush.js';

describe('latestClashRoyaleActivity', () => {
  it('keeps only the latest battle fields Batabiboing needs', () => {
    expect(latestClashRoyaleActivity({
      recentBattles: [{
        battleTime: '2026-07-23T18:00:00.000Z',
        type: 'pathOfLegend',
        result: 'win',
        crownsFor: 3,
        crownsAgainst: 1,
        opponentName: 'Private opponent',
      }],
    })).toEqual({
      result: 'win',
      crownsFor: 3,
      crownsAgainst: 1,
      timestamp: '2026-07-23T18:00:00.000Z',
    });
  });

  it('returns null when the Clash Royale source has no battles yet', () => {
    expect(latestClashRoyaleActivity({ recentBattles: [] })).toBeNull();
  });
});
