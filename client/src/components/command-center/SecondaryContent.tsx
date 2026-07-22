import { useEffect, useState, type ReactNode } from 'react';
import type {
  AiUsageToolData,
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
import { UsageSparkline } from '../../sections/ai/UsageHistoryChart';
import { FIVE_HOUR_MS, WEEKLY_MS } from '../../sections/ai/UsageMeter';
import { ClaudeIcon, OpenAiIcon } from '../../sections/ai/ToolIcons';
import { UvGauge, WindGauge } from '../../sections/weather/WeatherOverview';
import { deg, glyph } from '../../lib/weather';
import { activitySyncContext, latestActivityDay } from '../../lib/health';
import { ActivityRings } from '../ActivityRings';
import { ContributionGrid } from '../../widgets/GitHubWidgets';
import { NowPlaying, Thumb } from '../../widgets/SpotifyWidget';
import type { AiUsageByTool } from './useCommandCenterData';

const DAY_MS = 24 * 60 * 60_000;

function formatEventDay(event: CalendarData['events'][number]): string {
  const today = new Date().toLocaleDateString('en-CA');
  if (event.date === today) return event.allDay ? 'Today' : event.startLabel;
  return new Date(`${event.date}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
  });
}

function formatAlbumDuration(durationMs?: number): string | undefined {
  if (!durationMs) return undefined;
  const totalMinutes = Math.round(durationMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`;
}

function formatSteamHours(minutes: number): string {
  const hours = minutes / 60;
  return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`;
}

export function AiToolMark({ accent, className }: Readonly<{ accent: CommandCenterSlot['accent']; className: string }>) {
  let Icon: typeof ClaudeIcon | undefined;
  if (accent === 'claude') Icon = ClaudeIcon;
  else if (accent === 'codex') Icon = OpenAiIcon;
  if (!Icon) return null;
  const color = accent === 'codex' ? 'var(--color-openai-mark)' : 'var(--color-claude)';
  return <Icon className={className} style={{ color }} />;
}

function CalendarAgendaSecondary({ slot, calendar }: Readonly<{ slot: CommandCenterSlot; calendar: CalendarData | undefined }>): ReactNode {
  if (slot.render.type !== 'calendar-agenda') return null;
  const agenda = slot.render.eventIds
    .map((id) => calendar?.events.find((event) => event.id === id))
    .filter((event): event is CalendarData['events'][number] => event !== undefined);
  if (!agenda.length) return null;
  return <div className="command-agenda-list mt-4">
    {agenda.map((event) => <div key={event.id} className="command-agenda-item">
      <time dateTime={event.start}>{formatEventDay(event)}</time><span>{event.title}</span>
    </div>)}
  </div>;
}

function SpotifyNowPlayingSecondary({ spotify, spotifyFetchedAt }: Readonly<{ spotify: SpotifyData | undefined; spotifyFetchedAt: string | undefined }>): ReactNode {
  if (!spotify?.nowPlaying) return null;
  return <div className="mt-4"><NowPlaying nowPlaying={spotify.nowPlaying} fetchedAt={spotifyFetchedAt} className="command-secondary-spotify" artworkClassName="command-secondary-spotify-artwork" /></div>;
}

function SpotifyTrackSecondary({ slot, spotify }: Readonly<{ slot: CommandCenterSlot; spotify: SpotifyData | undefined }>): ReactNode {
  if (slot.render.type !== 'spotify-track') return null;
  const trackId = slot.render.trackId;
  const track = [...spotify?.topTracks.shortTerm ?? [], ...spotify?.topTracks.mediumTerm ?? [], ...spotify?.topTracks.longTerm ?? [], ...spotify?.allTime.tracks ?? [], ...spotify?.recentlyPlayed ?? []]
    .find((item) => (item.id ?? item.track) === trackId);
  return <div className="command-secondary-spotify mt-4">
    <Thumb url={track?.imageUrl} size="command-secondary-track-artwork" />
    <div className="min-w-0"><p className="text-sm font-semibold text-ink">{slot.title}</p><p className="mt-0.5 text-sm text-ink-muted">{slot.detail}</p></div>
  </div>;
}

function SpotifyArtistSecondary({ slot, spotify }: Readonly<{ slot: CommandCenterSlot; spotify: SpotifyData | undefined }>): ReactNode {
  if (slot.render.type !== 'spotify-artist') return null;
  const artistId = slot.render.artistId;
  const artist = [...spotify?.topArtists.shortTerm ?? [], ...spotify?.topArtists.mediumTerm ?? [], ...spotify?.topArtists.longTerm ?? [], ...spotify?.allTime.artists ?? []]
    .find((a) => (a.id ?? a.name) === artistId);
  const tracksByTimeframe = {
    short: spotify?.topTracks.shortTerm ?? [],
    medium: spotify?.topTracks.mediumTerm ?? [],
    long: spotify?.topTracks.longTerm ?? [],
    allTime: spotify?.allTime.tracks ?? [],
  };
  const legacyTimeframe = slot.id.split(':')[2];
  const timeframe = slot.render.timeframe ?? (legacyTimeframe in tracksByTimeframe ? legacyTimeframe as keyof typeof tracksByTimeframe : 'short');
  const tracks = tracksByTimeframe[timeframe]
    .filter((track) => track.artist.split(', ').includes(artist?.name ?? slot.title))
    .slice(0, 3);
  return <div className="command-secondary-spotify mt-4">
    {artist && <Thumb url={artist.imageUrl} size="command-secondary-artist-artwork" />}
    <div className="command-secondary-artist-details">
      <p className="text-sm font-semibold text-ink">{slot.title}</p>
      {tracks.length > 0 && <><p className="command-secondary-artist-track-label">Top tracks</p><ol className="command-secondary-artist-tracks" aria-label={`Top tracks by ${slot.title} ${timeframe}`}>
        {tracks.map((track, index) => <li key={track.id ?? track.track}><span>{index + 1}</span><p>{track.track}</p></li>)}
      </ol></>}
    </div>
  </div>;
}

function SpotifyAlbumSecondary({ slot, spotify }: Readonly<{ slot: CommandCenterSlot; spotify: SpotifyData | undefined }>): ReactNode {
  if (slot.render.type !== 'spotify-album') return null;
  const albumId = slot.render.albumId;
  const album = spotify?.allTime.albums.find((a) => (a.id ?? a.name) === albumId);
  const albumMeta = [
    { label: 'Released', value: album?.releaseDate?.slice(0, 4) },
    { label: 'Length', value: formatAlbumDuration(album?.totalDurationMs) },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));
  return <div className="command-secondary-spotify mt-4">
    {album && <Thumb url={album.imageUrl} size="command-secondary-spotify-artwork" />}
    <div className="command-secondary-album-details">
      <p className="line-clamp-2 text-base font-semibold leading-tight text-ink">{slot.title}</p>
      <p className="mt-1 truncate text-sm text-ink-muted">{album?.artist.split(',')[0]?.trim() ?? slot.detail}</p>
      {albumMeta.length > 0 && <dl className="command-secondary-album-meta">
        {albumMeta.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
      </dl>}
      {album?.totalTracks && <p className="mt-2 text-xs text-ink-faint">{album.totalTracks} tracks</p>}
    </div>
  </div>;
}

function SteamNowPlayingSecondary({ slot, steam }: Readonly<{ slot: CommandCenterSlot; steam: SteamData | undefined }>): ReactNode {
  if (slot.render.type !== 'steam-now-playing') return null;
  const appId = slot.render.appId;
  const game = steam?.currentGame?.appId === appId
    ? steam.currentGame
    : steam?.recentlyPlayed.find((g) => g.appId === appId);
  if (!game) return null;
  return <div className="mt-4">
    {game.headerUrl && <img src={game.headerUrl} alt="" className="w-full max-w-xs rounded-xl object-cover shadow-lg" />}
    <p className="mt-3 text-sm font-semibold text-ink">{game.name}</p>
    {game.playtimeForeverMinutes !== undefined && (
      <p className="mt-0.5 text-sm text-ink-muted">{formatSteamHours(game.playtimeForeverMinutes)} total playtime</p>
    )}
  </div>;
}

const robloxCompactNumber = new Intl.NumberFormat('en', { notation: 'compact' });

type RobloxArtColor = readonly [number, number, number];
type RobloxArtPalette = readonly [RobloxArtColor, RobloxArtColor];

const robloxArtPaletteCache = new Map<string, RobloxArtPalette | null>();

function colorDistance(left: RobloxArtColor, right: RobloxArtColor): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function saturation(color: RobloxArtColor): number {
  const highest = Math.max(...color);
  const lowest = Math.min(...color);
  return highest === 0 ? 0 : (highest - lowest) / highest;
}

/** Keep artwork hues recognisable, but prevent naturally dark game icons from making the card muddy. */
function liftBackgroundColor(color: RobloxArtColor): RobloxArtColor {
  const lightness = (Math.max(...color) + Math.min(...color)) / 2;
  const minimumLightness = 76;
  if (lightness >= minimumLightness) return color;
  const amount = (minimumLightness - lightness) / (255 - lightness);
  return [
    Math.round(color[0] + (255 - color[0]) * amount),
    Math.round(color[1] + (255 - color[1]) * amount),
    Math.round(color[2] + (255 - color[2]) * amount),
  ];
}

function paletteFromIcon(icon: HTMLImageElement): RobloxArtPalette | null {
  const canvas = document.createElement('canvas');
  canvas.width = 40;
  canvas.height = 40;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(icon, 0, 0, canvas.width, canvas.height);
  const colors = new Map<string, { color: RobloxArtColor; count: number }>();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 200) continue;
    const color: RobloxArtColor = [pixels[index] & 0xf8, pixels[index + 1] & 0xf8, pixels[index + 2] & 0xf8];
    const lightness = (Math.max(...color) + Math.min(...color)) / 2;
    if (lightness < 12 || lightness > 238 || saturation(color) < 0.18) continue;
    const key = color.join(',');
    const existing = colors.get(key);
    if (existing) existing.count += 1;
    else colors.set(key, { color, count: 1 });
  }

  const candidates = [...colors.values()]
    .sort((left, right) => right.count * (0.65 + saturation(right.color)) - left.count * (0.65 + saturation(left.color)));
  const primary = candidates[0]?.color;
  if (!primary) return null;
  const secondary = candidates.find(({ color }) => colorDistance(primary, color) > 72)?.color;
  return secondary ? [liftBackgroundColor(primary), liftBackgroundColor(secondary)] : null;
}

export function useRobloxArtPalette(iconUrl: string | undefined): RobloxArtPalette | null {
  const [palette, setPalette] = useState<RobloxArtPalette | null>(() => iconUrl ? robloxArtPaletteCache.get(iconUrl) ?? null : null);

  useEffect(() => {
    if (!iconUrl) {
      setPalette(null);
      return;
    }
    const cachedPalette = robloxArtPaletteCache.get(iconUrl);
    if (cachedPalette !== undefined) {
      setPalette(cachedPalette);
      return;
    }

    let disposed = false;
    const icon = new Image();
    icon.crossOrigin = 'anonymous';
    icon.onload = () => {
      let nextPalette: RobloxArtPalette | null = null;
      try {
        nextPalette = paletteFromIcon(icon);
      } catch {
        // Some image hosts do not allow canvas sampling. Keep the Roblox fallback in that case.
      }
      robloxArtPaletteCache.set(iconUrl, nextPalette);
      if (!disposed) setPalette(nextPalette);
    };
    icon.onerror = () => {
      robloxArtPaletteCache.set(iconUrl, null);
      if (!disposed) setPalette(null);
    };
    icon.src = iconUrl;
    return () => { disposed = true; };
  }, [iconUrl]);

  return palette;
}

function RobloxNowPlayingSecondary({ slot, roblox }: Readonly<{ slot: CommandCenterSlot; roblox: RobloxData | undefined }>): ReactNode {
  const presence = roblox?.presence;
  if (slot.render.type !== 'roblox-now-playing' || !presence || presence.status !== 'in-game') return <FallbackSecondary slot={slot} />;
  const gameIcon = presence.iconUrl ? (
    <img src={presence.iconUrl} alt="" className="command-roblox-icon" />
  ) : (
    <span className="command-roblox-icon command-roblox-icon--fallback" aria-hidden><img src="/roblox.svg" alt="" /></span>
  );
  return <div className="command-roblox-now">
    {gameIcon}
    <div className="command-roblox-details">
      <div className="command-roblox-brand" aria-label="Roblox">
        <img src="/roblox_wordmark.svg" alt="Roblox" />
        <span>In game</span>
      </div>
      <div className="command-roblox-game">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-ink">{presence.gameName ?? 'Roblox'}</p>
          <dl className="command-roblox-stats">
            {presence.playing !== undefined && <div><dt>Playing now</dt><dd>{robloxCompactNumber.format(presence.playing)}</dd></div>}
            {presence.visits !== undefined && <div><dt>Visits</dt><dd>{robloxCompactNumber.format(presence.visits)}</dd></div>}
          </dl>
        </div>
      </div>
    </div>
  </div>;
}

function SteamAchievementSecondary({ slot, steam }: Readonly<{ slot: CommandCenterSlot; steam: SteamData | undefined }>): ReactNode {
  if (slot.render.type !== 'steam-achievement') return null;
  const { appId, apiName } = slot.render;
  const achievements = steam?.achievements?.appId === appId ? steam.achievements : undefined;
  const achievement = achievements?.recentUnlocks.find((a) => a.apiName === apiName);
  if (!achievement || !achievements) return null;
  return <div className="mt-4 flex items-center gap-3">
    {achievement.iconUrl ? (
      <img src={achievement.iconUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
    ) : (
      <div className="h-12 w-12 shrink-0 rounded-lg bg-track" />
    )}
    <div className="min-w-0">
      <p className="text-sm font-semibold text-ink">{achievement.displayName}</p>
      <p className="mt-0.5 text-sm text-ink-muted">
        {achievements.unlockedCount}/{achievements.totalCount} unlocked
        {achievement.globalUnlockedPercent !== undefined ? ` · ${achievement.globalUnlockedPercent.toFixed(1)}% of players` : ''}
      </p>
    </div>
  </div>;
}

function HealthRingsSecondary({ slot, health }: Readonly<{ slot: CommandCenterSlot; health: HealthData | undefined }>): ReactNode {
  const activityDay = health ? latestActivityDay(health) : undefined;
  if (slot.render.type !== 'health-rings' || !health || !activityDay) return null;
  const detail = health.today?.date === activityDay.date
    ? slot.detail
    : activitySyncContext(activityDay.date, health.updatedAt);
  return <div className="mt-4">
    <ActivityRings
      activeEnergyKcal={activityDay.activeEnergyKcal ?? 0}
      exerciseMinutes={activityDay.exerciseMinutes ?? 0}
      standHours={activityDay.standHours ?? 0}
      goals={health.goals}
    />
    <p className="mt-2 text-[11px] text-ink-faint">{detail}</p>
  </div>;
}

function GithubContributionsSecondary({
  slot,
  github,
  hoveredDay,
  onHover,
}: Readonly<{
  slot: CommandCenterSlot;
  github: GitHubData | undefined;
  hoveredDay: { date: string; count: number } | null;
  onHover: (day: { date: string; count: number } | null) => void;
}>): ReactNode {
  if (slot.render.type !== 'github-contributions' || !github) return null;
  return <div className="mt-4"><ContributionGrid data={github} hovered={hoveredDay} onHover={onHover} /></div>;
}

/** `"Jane Doe" <jane@example.com>` → `Jane Doe`, falling back to the bare address. */
function senderName(from: string): string {
  const addressStart = from.indexOf('<');
  const visibleName = addressStart === -1 ? from : from.slice(0, addressStart);
  const name = visibleName.replaceAll('"', '').trim();
  return name || from.replace(/[<>]/g, '').trim();
}

export function GithubReviewList({ github, skip = 0 }: Readonly<{ github: GitHubData | undefined; skip?: number }>): ReactNode {
  const reviews = github?.pullRequests.filter((pr) => pr.role === 'review-requested').slice(skip, skip + 4) ?? [];
  if (!reviews.length) return null;
  return <div className="command-agenda-list mt-4">
    {reviews.map((pr) => <div key={`${pr.repo}#${pr.number}`} className="command-agenda-item">
      <span className="command-agenda-lead">{pr.repo}</span><span>{pr.title}</span>
    </div>)}
  </div>;
}

export function GmailThreadList({
  threadIds,
  gmail,
  className = 'command-agenda-list mt-4',
}: Readonly<{ threadIds: string[]; gmail: GmailData | undefined; className?: string }>): ReactNode {
  const threads = threadIds
    .map((id) => gmail?.threads.find((thread) => thread.id === id))
    .filter((thread): thread is GmailData['threads'][number] => thread !== undefined);
  if (!threads.length) return null;
  return <div className={className}>
    {threads.map((thread) => <div key={thread.id} className="command-agenda-item">
      <span className="command-agenda-lead">{senderName(thread.from)}</span><span>{thread.subject}</span>
    </div>)}
  </div>;
}

type AiUsageRender = Extract<CommandCenterSlot['render'], { type: 'ai-usage-tool' }>;

function aiToolColor(toolId: AiUsageRender['toolIds'][number]): string {
  return toolId === 'codex' ? 'var(--color-codex)' : 'var(--color-claude)';
}

/** One sparkline per tool; several overlay in one box — same time window, same fixed 0–100% scale. */
export function AiUsageTrend({ render, aiUsage }: Readonly<{
  render: AiUsageRender;
  aiUsage: AiUsageByTool;
}>): ReactNode {
  const lines = render.toolIds
    .map((toolId) => ({ toolId, data: aiUsage[toolId], history: aiUsage[toolId]?.history }))
    .filter((line): line is { toolId: AiUsageRender['toolIds'][number]; data: AiUsageToolData; history: NonNullable<AiUsageToolData['history']> } =>
      Boolean(line.history?.length));
  if (!lines.length) return null;
  return <div className="relative">
    {lines.map((line, index) => <div key={line.toolId} className={index > 0 ? 'absolute inset-0' : undefined}>
      <UsageSparkline
        points={line.history}
        metric={render.metric === 'fiveHour' ? 'fiveHourUsedPercent' : 'weeklyUsedPercent'}
        windowMs={render.metric === 'fiveHour' ? DAY_MS : WEEKLY_MS}
        color={aiToolColor(line.toolId)}
        sessionResetsAt={render.metric === 'fiveHour' ? line.data.fiveHour?.resetsAt : undefined}
        sessionWindowMs={render.metric === 'fiveHour' ? FIVE_HOUR_MS : undefined}
      />
    </div>)}
  </div>;
}

function GithubReviewsSecondary({ slot, github }: Readonly<{ slot: CommandCenterSlot; github: GitHubData | undefined }>): ReactNode {
  if (slot.render.type !== 'github-reviews') return null;
  return GithubReviewList({ github });
}

function GmailThreadsSecondary({ slot, gmail }: Readonly<{ slot: CommandCenterSlot; gmail: GmailData | undefined }>): ReactNode {
  if (slot.render.type !== 'gmail-threads') return null;
  const list = GmailThreadList({ threadIds: slot.render.threadIds, gmail, className: 'command-agenda-list mt-3' });
  if (!list) return null;
  return <>
    <p className="mt-4 text-sm font-semibold text-ink">{slot.title}</p>
    {list}
  </>;
}

export function WeatherHourlyRows({ weather }: Readonly<{ weather: WeatherData }>): ReactNode {
  if (!weather.hours.length) return null;
  return <div className="command-hours mt-3" aria-label="Hourly forecast">
    {weather.hours.slice(0, 6).map((hour) => <div key={hour.time} className="command-hour">
      <span>{hour.hourLabel}</span>
      <span aria-hidden className="text-base leading-none">{glyph(hour.symbol)}</span>
      <strong>{deg(hour.temperature)}</strong>
    </div>)}
  </div>;
}

/** Shared by every "here's the next few hours" kind (severe/hot/cold/rain) — only the
 * server-supplied title/detail differ between them. */
function WeatherHourlyStrip({ title, detail, weather }: Readonly<{ title: string; detail: string; weather: WeatherData }>): ReactNode {
  if (!weather.hours.length) return null;
  return <>
    <p className="mt-4 text-sm font-semibold text-ink">{title}</p>
    <WeatherHourlyRows weather={weather} />
    <p className="mt-2 text-[11px] text-ink-faint">{detail}</p>
  </>;
}

function WeatherSignalSecondary({ slot, weather }: Readonly<{ slot: CommandCenterSlot; weather: WeatherData | undefined }>): ReactNode {
  if (slot.render.type !== 'weather-signal' || !weather) return null;
  const { kind } = slot.render;
  if (kind === 'wind') {
    return <div className="command-secondary-ai mt-4">
      <WindGauge speed={weather.current.windSpeed} directionDeg={weather.current.windDirectionDeg} />
      <div className="min-w-0"><p className="text-sm font-semibold text-ink">{slot.title}</p><p className="mt-0.5 text-sm text-ink-muted">{slot.detail}</p></div>
    </div>;
  }
  if (kind === 'uv' && weather.current.uvIndex != null) {
    return <div className="command-secondary-ai mt-4">
      <UvGauge uvIndex={weather.current.uvIndex} />
      <div className="min-w-0"><p className="text-sm font-semibold text-ink">{slot.title}</p><p className="mt-0.5 text-sm text-ink-muted">{slot.detail}</p></div>
    </div>;
  }
  return <WeatherHourlyStrip title={slot.title} detail={slot.detail} weather={weather} />;
}

function AiUsageSecondary({ slot, aiUsage }: Readonly<{ slot: CommandCenterSlot; aiUsage: AiUsageByTool }>): ReactNode {
  if (slot.render.type !== 'ai-usage-tool') return null;
  const trend = AiUsageTrend({ render: slot.render, aiUsage });
  if (!trend) return null;
  const toolIds = slot.render.toolIds;
  return <div className="command-secondary-ai mt-4">
    <div className="flex shrink-0 flex-col items-center gap-2">
      {toolIds.map((toolId) => <AiToolMark key={toolId} accent={toolId} className={toolIds.length > 1 ? 'h-6 w-6' : 'h-10 w-10'} />)}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-ink">{slot.title}</p>
      <div className="mt-2">{trend}</div>
      <p className="mt-1.5 text-[11px] tabular-nums text-ink-faint">{slot.detail}</p>
    </div>
  </div>;
}

function FallbackSecondary({ slot }: Readonly<{ slot: CommandCenterSlot }>): ReactNode {
  const toolMark = <AiToolMark accent={slot.accent} className="h-10 w-10 shrink-0" />;
  return <div className={slot.accent ? 'command-secondary-ai mt-4' : 'mt-4'}>
    {toolMark}
    <div><p className="text-sm font-semibold text-ink">{slot.title}</p><p className="mt-1 text-sm text-ink-muted">{slot.detail}</p></div>
  </div>;
}

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
    case 'gmail-threads': return GmailThreadsSecondary({ slot, gmail }) ?? <FallbackSecondary slot={slot} />;
    case 'weather-signal': return WeatherSignalSecondary({ slot, weather }) ?? <FallbackSecondary slot={slot} />;
    case 'ai-usage-tool': return AiUsageSecondary({ slot, aiUsage }) ?? <FallbackSecondary slot={slot} />;
    case 'steam-now-playing': return SteamNowPlayingSecondary({ slot, steam }) ?? <FallbackSecondary slot={slot} />;
    case 'steam-achievement': return SteamAchievementSecondary({ slot, steam }) ?? <FallbackSecondary slot={slot} />;
    case 'roblox-now-playing': return <RobloxNowPlayingSecondary slot={slot} roblox={roblox} />;
    default: return <FallbackSecondary slot={slot} />;
  }
}

export function heroExtraFor(hero: CommandCenterData['hero'], github: GitHubData | undefined, gmail: GmailData | undefined, aiUsage: AiUsageByTool, weather: WeatherData | undefined): ReactNode {
  const { render } = hero;
  if (render.type === 'github-reviews') return GithubReviewList({ github, skip: 1 });
  if (render.type === 'gmail-threads') return GmailThreadList({ threadIds: render.threadIds, gmail });
  if (render.type === 'weather-signal' && render.kind === 'severe' && weather) {
    return <div className="mt-4"><WeatherHourlyRows weather={weather} /></div>;
  }
  if (render.type !== 'ai-usage-tool') return null;

  const trend = AiUsageTrend({ render, aiUsage });
  return trend ? <div className="mt-4 max-w-sm">{trend}</div> : null;
}
