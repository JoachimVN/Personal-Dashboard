import type { ReactNode } from 'react';
import type {
  CalendarData,
  CommandCenterData,
  CommandCenterSlot,
  GitHubData,
  GmailData,
  HealthData,
  RobloxData,
  SpotifyData,
  SteamData,
  WeatherData,
} from '@personal-dashboard/shared';
import type { AiUsageByTool } from './useCommandCenterData';
import { AiUsageSecondary, AiUsageTrend } from './secondary/ai';
import { CalendarAgendaSecondary } from './secondary/calendar';
import { ClashOfClansMomentSecondary } from './secondary/clashOfClans';
import { ClashRoyaleWinStreakSecondary } from './secondary/clashRoyale';
import { FallbackSecondary } from './secondary/fallback';
import {
  GithubContributionsSecondary,
  GithubOpenPrList,
  GithubOpenPrsSecondary,
  GithubReviewList,
  GithubReviewsSecondary,
} from './secondary/github';
import { GmailThreadList, GmailThreadsSecondary } from './secondary/gmail';
import { HealthRingsSecondary } from './secondary/health';
import { RobloxNowPlayingSecondary } from './secondary/roblox';
import { SonarQualityGateSecondary } from './secondary/sonar';
import {
  SpotifyAlbumSecondary,
  SpotifyArtistSecondary,
  SpotifyNowPlayingSecondary,
  SpotifyTrackSecondary,
} from './secondary/spotify';
import { SteamAchievementSecondary, SteamNowPlayingSecondary } from './secondary/steam';
import { WeatherHourlyRows, WeatherSignalSecondary } from './secondary/weather';

/**
 * Picks the secondary-card body for a slot. Every branch falls back to `FallbackSecondary` when its
 * own source can't render — a slot is ranked from server-side data that the client may not have
 * fetched yet (or at all), so "the card is seated but its data isn't here" is a normal state.
 */
export function SecondaryContent(props: Readonly<{
  slot: CommandCenterSlot;
  calendar: CalendarData | undefined;
  spotify: SpotifyData | undefined;
  spotifyFetchedAt: string | undefined;
  health: HealthData | undefined;
  github: GitHubData | undefined;
  gmail: GmailData | undefined;
  weather: WeatherData | undefined;
  steam: SteamData | undefined;
  roblox: RobloxData | undefined;
  aiUsage: AiUsageByTool;
  hoveredDay: { date: string; count: number } | null;
  onHover: (day: { date: string; count: number } | null) => void;
}>): ReactNode {
  const { slot, calendar, spotify, spotifyFetchedAt, health, github, gmail, weather, steam, roblox, aiUsage, hoveredDay, onHover } = props;
  switch (slot.render.type) {
    case 'calendar-agenda': return CalendarAgendaSecondary({ slot, calendar }) ?? <FallbackSecondary slot={slot} />;
    case 'spotify-now-playing': return SpotifyNowPlayingSecondary({ spotify, spotifyFetchedAt }) ?? <FallbackSecondary slot={slot} />;
    case 'spotify-track': return SpotifyTrackSecondary({ slot, spotify }) ?? <FallbackSecondary slot={slot} />;
    case 'spotify-artist': return SpotifyArtistSecondary({ slot, spotify }) ?? <FallbackSecondary slot={slot} />;
    case 'spotify-album': return SpotifyAlbumSecondary({ slot, spotify }) ?? <FallbackSecondary slot={slot} />;
    case 'health-rings': return HealthRingsSecondary({ slot, health }) ?? <FallbackSecondary slot={slot} />;
    case 'github-contributions': return GithubContributionsSecondary({ slot, github, hoveredDay, onHover }) ?? <FallbackSecondary slot={slot} />;
    case 'github-reviews': return GithubReviewsSecondary({ slot, github }) ?? <FallbackSecondary slot={slot} />;
    case 'github-open-prs': return GithubOpenPrsSecondary({ slot, github }) ?? <FallbackSecondary slot={slot} />;
    case 'sonar-quality-gate': return SonarQualityGateSecondary({ slot }) ?? <FallbackSecondary slot={slot} />;
    case 'gmail-threads': return GmailThreadsSecondary({ slot, gmail }) ?? <FallbackSecondary slot={slot} />;
    case 'weather-signal': return WeatherSignalSecondary({ slot, weather }) ?? <FallbackSecondary slot={slot} />;
    case 'ai-usage-tool': return AiUsageSecondary({ slot, aiUsage }) ?? <FallbackSecondary slot={slot} />;
    case 'steam-now-playing': return SteamNowPlayingSecondary({ slot, steam }) ?? <FallbackSecondary slot={slot} />;
    case 'steam-achievement': return SteamAchievementSecondary({ slot, steam }) ?? <FallbackSecondary slot={slot} />;
    case 'roblox-now-playing': return <RobloxNowPlayingSecondary slot={slot} roblox={roblox} />;
    case 'clash-royale-moment': return ClashRoyaleWinStreakSecondary({ slot }) ?? <FallbackSecondary slot={slot} />;
    case 'clash-of-clans-moment': return ClashOfClansMomentSecondary({ slot }) ?? <FallbackSecondary slot={slot} />;
    default: return <FallbackSecondary slot={slot} />;
  }
}

export function heroExtraFor(hero: CommandCenterData['hero'], github: GitHubData | undefined, gmail: GmailData | undefined, aiUsage: AiUsageByTool, weather: WeatherData | undefined): ReactNode {
  const { render } = hero;
  if (render.type === 'github-reviews') return GithubReviewList({ github, skip: 1 });
  if (render.type === 'github-open-prs') return GithubOpenPrList({ github, skip: 1 });
  if (render.type === 'gmail-threads') return GmailThreadList({ threadIds: render.threadIds, gmail });
  if (render.type === 'weather-signal' && render.kind === 'severe' && weather) {
    return <div className="mt-4"><WeatherHourlyRows weather={weather} /></div>;
  }
  if (render.type !== 'ai-usage-tool') return null;

  const trend = AiUsageTrend({ render, aiUsage });
  return trend ? <div className="mt-4 max-w-sm">{trend}</div> : null;
}
