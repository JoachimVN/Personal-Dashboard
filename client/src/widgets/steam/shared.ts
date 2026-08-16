import type { SteamData, SteamGame } from '@personal-dashboard/shared';

export const accent = 'var(--color-accent-steam)';

export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`;
}

/** Looks up a game (for its header/icon art) across every game list the payload already carries,
 * rather than growing the achievements payload with a duplicate field. `currentGame` is checked
 * first but never carries an `iconUrl` — GetPlayerSummaries doesn't return one — so a game that's
 * currently being played would otherwise never show its square icon even though recentlyPlayed or
 * the library has it. Keep searching past a match with no icon until one turns up, falling back to
 * the first match found (for its headerUrl/name, which every pool does populate) if none do. */
export function findTrackedGame(data: SteamData, appId: number): SteamGame | undefined {
  const pools: SteamGame[][] = [
    data.currentGame ? [data.currentGame] : [],
    data.recentlyPlayed,
    data.library?.mostPlayed ?? [],
    data.library?.allGames ?? [],
  ];
  let fallback: SteamGame | undefined;
  for (const pool of pools) {
    const match = pool.find((game) => game.appId === appId);
    if (!match) continue;
    fallback ??= match;
    if (match.iconUrl) return match;
  }
  return fallback;
}
