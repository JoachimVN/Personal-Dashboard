/**
 * Steam's detail page is a stack of independent cards over one envelope, so each card group gets
 * its own module here rather than sharing one file. The whole overview card is a single link (see
 * SectionCard), so these components stay display-only — no nested anchors.
 */
export { SteamAchievementsWidget, SteamAchievementShowcase } from './achievements';
export { SteamFriendsLeaderboard, SteamFriendsWidget } from './friends';
export { SteamGameList, SteamLibraryStats, SteamRecentGames } from './library';
export { SteamNowPlaying } from './nowPlaying';
export { SteamPlaytimeTrend } from './playtimeTrend';
