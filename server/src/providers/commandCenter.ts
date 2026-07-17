import {
  commandCenterSchema,
  type AiUsageToolData,
  type CalendarData,
  type GitHubData,
  type GmailData,
  type HealthData,
  type HueData,
  type IMessageData,
  type NewsData,
  type SpotifyData,
  type SteamData,
  type WeatherData,
  type WidgetEnvelope,
} from '@personal-dashboard/shared';
import type { AppConfig } from '../config.js';
import { rankCandidates } from '../importance/rank.js';
import {
  aiCandidates,
  calendarCandidates,
  fallbackCandidates,
  githubCandidates,
  gmailCandidates,
  healthCandidates,
  hueCandidates,
  imessageCandidates,
  newsCandidates,
  spotifyCandidates,
  steamCandidates,
  weatherCandidates,
  type SpotifyFreshness,
} from '../importance/sources.js';
import type { ProviderScheduler, Provider } from '../scheduler.js';
import { SignalHistoryStore } from '../signalHistory.js';

function widgetData<T>(envelopes: Record<string, WidgetEnvelope>, id: string): T | undefined {
  const envelope = envelopes[id];
  return envelope?.status === 'ready' || envelope?.status === 'stale' ? envelope.data as T | undefined : undefined;
}

/**
 * Records each timeframe's #1 track/artist/album, then reports which ones changed within
 * freshMs — "just became your new favorite" rather than "different from a week ago because the
 * API is noisy". Spotify's own top-lists only refresh every ~12h, so freshMs is generous (days,
 * not minutes) to give a genuine change real dwell time on the board.
 */
export async function computeSpotifyFreshness(
  signalHistory: SignalHistoryStore,
  spotify: SpotifyData | undefined,
  freshMs: number,
): Promise<SpotifyFreshness> {
  const fresh: SpotifyFreshness = {
    trackShort: false, trackMedium: false, trackLong: false,
    trackAllTime: false,
    artistShort: false, artistMedium: false, artistLong: false,
    artistAllTime: false, albumAllTime: false,
  };
  if (!spotify) return fresh;
  const checks: [keyof SpotifyFreshness, string, string | undefined][] = [
    ['trackShort', 'topTrack:short', spotify.topTracks.shortTerm[0]?.id ?? spotify.topTracks.shortTerm[0]?.track],
    ['trackMedium', 'topTrack:medium', spotify.topTracks.mediumTerm[0]?.id ?? spotify.topTracks.mediumTerm[0]?.track],
    ['trackLong', 'topTrack:long', spotify.topTracks.longTerm[0]?.id ?? spotify.topTracks.longTerm[0]?.track],
    ['trackAllTime', 'topTrack:all-time', spotify.allTime.tracks[0]?.id ?? spotify.allTime.tracks[0]?.track],
    ['artistShort', 'topArtist:short', spotify.topArtists.shortTerm[0]?.id ?? spotify.topArtists.shortTerm[0]?.name],
    ['artistMedium', 'topArtist:medium', spotify.topArtists.mediumTerm[0]?.id ?? spotify.topArtists.mediumTerm[0]?.name],
    ['artistLong', 'topArtist:long', spotify.topArtists.longTerm[0]?.id ?? spotify.topArtists.longTerm[0]?.name],
    ['artistAllTime', 'topArtist:all-time', spotify.allTime.artists[0]?.id ?? spotify.allTime.artists[0]?.name],
    ['albumAllTime', 'topAlbum:all-time', spotify.allTime.albums[0]?.id ?? spotify.allTime.albums[0]?.name],
  ];
  for (const [key, metric, value] of checks) {
    if (value === undefined) continue;
    await signalHistory.record('spotify', metric, value);
    const changedAt = await signalHistory.lastChangedAt('spotify', metric);
    fresh[key] = await signalHistory.hasChangedSinceBaseline('spotify', metric)
      && changedAt !== undefined && Date.now() - changedAt.getTime() < freshMs;
  }
  return fresh;
}

export function createCommandCenterProvider(
  scheduler: ProviderScheduler,
  signalHistory: SignalHistoryStore,
  config: AppConfig,
): Provider {
  return {
    id: 'command-center',
    schema: commandCenterSchema,
    refreshMs: 60_000,
    timeoutMs: 5_000,
    isConfigured: () => true,
    async fetch() {
      const envelopes = scheduler.getAllEnvelopes();
      const gmail = widgetData<GmailData>(envelopes, 'gmail');
      if (gmail) await signalHistory.record('gmail', 'unreadThreads', gmail.unreadThreads);
      const gmailChangedAt = await signalHistory.lastChangedAt('gmail', 'unreadThreads');
      const staleForMs = gmailChangedAt ? Date.now() - gmailChangedAt.getTime() : undefined;
      const github = widgetData<GitHubData>(envelopes, 'github');
      const calendar = widgetData<CalendarData>(envelopes, 'calendar');
      const spotify = widgetData<SpotifyData>(envelopes, 'spotify');
      const spotifyFresh = await computeSpotifyFreshness(signalHistory, spotify, config.commandCenter.spotifyFreshMs);
      return rankCandidates([
        ...calendarCandidates(calendar, Date.now()),
        ...gmailCandidates(gmail, staleForMs, config.commandCenter.gmailStaleMs, config.commandCenter.gmailFreshMs),
        ...githubCandidates(github, config.commandCenter.baselineWindowDays, config.commandCenter.baselineDeviationPercent),
        ...healthCandidates(widgetData<HealthData>(envelopes, 'health')),
        ...hueCandidates(widgetData<HueData>(envelopes, 'hue')),
        ...newsCandidates(widgetData<NewsData>(envelopes, 'news')),
        ...spotifyCandidates(spotify, spotifyFresh),
        ...steamCandidates(widgetData<SteamData>(envelopes, 'steam'), config.commandCenter.steamAchievementFreshMs),
        ...weatherCandidates(widgetData<WeatherData>(envelopes, 'weather'), config.commandCenter.weatherHotC, config.commandCenter.weatherColdC),
        ...imessageCandidates(widgetData<IMessageData>(envelopes, 'imessage'), config.commandCenter.imessageFreshMs),
        ...aiCandidates(
          [
            { id: 'claude', label: 'Claude', data: widgetData<AiUsageToolData>(envelopes, 'ai-usage-claude') },
            { id: 'codex', label: 'Codex', data: widgetData<AiUsageToolData>(envelopes, 'ai-usage-codex') },
          ],
          config.commandCenter.baselineWindowDays,
          config.commandCenter.baselineDeviationPercent,
        ),
        ...fallbackCandidates({
          calendar: envelopes.calendar?.status ?? 'loading',
        }),
      ]);
    },
  };
}
