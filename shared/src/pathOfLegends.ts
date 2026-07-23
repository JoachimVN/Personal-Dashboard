/**
 * Supercell renumbered Path of Legends leagues, shifting the API's `leagueNumber` down by 3
 * relative to the original 10-tier scheme (Challenger I .. Ultimate Champion) that league names
 * and badge art are keyed to — what the API now reports as league 1 is the original league 4
 * (Master I), and league 5 is the original league 8 (Grand Champion). Apply this offset before
 * looking up a display name or badge for a raw API `leagueNumber`.
 */
export const PATH_OF_LEGENDS_LEAGUE_OFFSET = 3;

export function pathOfLegendsDisplayLeagueNumber(apiLeagueNumber: number): number {
  return apiLeagueNumber + PATH_OF_LEGENDS_LEAGUE_OFFSET;
}

const PATH_OF_LEGENDS_LEAGUE_NAMES = [
  'Challenger I', 'Challenger II', 'Challenger III', 'Master I', 'Master II',
  'Master III', 'Champion', 'Grand Champion', 'Royal Champion', 'Ultimate Champion',
] as const;

/** Falls back to "League N" for a display number outside the named 10-tier scheme (e.g. a future
 * Supercell addition this table hasn't been updated for yet). */
export function pathOfLegendsLeagueName(apiLeagueNumber: number): string {
  const displayNumber = pathOfLegendsDisplayLeagueNumber(apiLeagueNumber);
  return PATH_OF_LEGENDS_LEAGUE_NAMES[displayNumber - 1] ?? `League ${displayNumber}`;
}
