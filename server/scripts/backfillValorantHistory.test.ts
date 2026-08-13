import { describe, expect, it } from 'vitest';
import { mapMode, toSparseMatch } from './backfillValorantHistory.js';

describe('Riot Valorant history import', () => {
  it('maps Riot mode ids only where the source contract is supported', () => {
    expect(mapMode('Snowball', 'Matchmaking')).toBe('Snowball Fight');
    expect(mapMode('Valaram', 'Matchmaking')).toBe('All Random One Site');
    expect(mapMode('Onefa', 'Matchmaking')).toBe('Replication');
    expect(mapMode('Skirmish2V2', 'Matchmaking')).toBe('Skirmish 2v2');
  });

  it('retains the exact duration available from Riot export timestamps', () => {
    const match = toSparseMatch({
      game_id: 'synthetic-match',
      game_mode: 'Matchmaking',
      game_type: 'Ranked',
      game_outcome: 'Win',
      game_start_time_utc: '2024-04-01 18:00:00',
      game_end_time_utc: '2024-04-01 18:24:26',
      realm_id: 'synthetic',
    });

    expect(match.durationSeconds).toBe(1_466);
    expect(match.agentName).toBe('');
  });
});
