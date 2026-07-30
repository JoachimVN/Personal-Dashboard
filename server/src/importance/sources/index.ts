/**
 * Candidate builders, one module per data source — the same axis as `shared/src/schemas/` and
 * `server/src/providers/`. Each `xCandidates()` is pure: it turns one source's widget data (plus
 * any cross-poll `moments` computed in commandCenter.ts) into scored, shape-tagged candidates for
 * `rankCandidates()` to seat.
 */
export { aiCandidates, type AiTool } from './ai.js';
export { calendarCandidates } from './calendar.js';
export { clashRoyaleCandidates } from './clashRoyale.js';
export { clashOfClansCandidates } from './clashOfClans.js';
export { fallbackCandidates } from './fallback.js';
export { githubCandidates } from './github.js';
export { gmailCandidates } from './gmail.js';
export { healthCandidates } from './health.js';
export { hueCandidates } from './hue.js';
export { imessageCandidates } from './imessage.js';
export { aiNewsCandidates, newsCandidates } from './news.js';
export { powerCandidates } from './power.js';
export { robloxCandidates } from './roblox.js';
export { sonarCandidates } from './sonar.js';
export { spotifyCandidates, type SpotifyFreshness } from './spotify.js';
export { steamCandidates } from './steam.js';
export { transitCandidates } from './transit.js';
export { weatherCandidates } from './weather.js';
