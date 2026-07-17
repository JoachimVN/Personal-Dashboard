import type { CommandCenterSlot } from '@personal-dashboard/shared';

export type SlotShape = 'hero' | 'secondary' | 'tile';

export interface Candidate extends CommandCenterSlot {
  shapes: SlotShape[];
}

/** Steam "moments" that need cross-poll history to detect — computed once in commandCenter.ts
 * (via SignalHistoryStore) and passed into the otherwise-pure steamCandidates(). */
export interface SteamMoments {
  completedGame: boolean;
  playtimeMilestoneHours?: number;
  leaderboardClimb?: { rank: number; delta: number };
}
