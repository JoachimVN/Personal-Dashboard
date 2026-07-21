import type { ReactNode } from 'react';
import type { AiUsageToolData, CalendarData, CommandCenterData, CommandCenterSlot, GitHubData, GmailData, HealthData, SpotifyData, SteamData, WeatherData } from '@personal-dashboard/shared';
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
  return new Date(`${event.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric' });
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
  const Icon = accent === 'claude' ? ClaudeIcon : accent === 'codex' ? OpenAiIcon : undefined;
  if (!Icon) return null;
  return <Icon className={className} style={{ color: accent === 'codex' ? 'var(--color-openai-mark)' : 'var(--color-claude)' }} />;
}

function CalendarAgendaSecondary({ slot, calendar }: Readonly<{ slot: CommandCenterSlot; calendar: CalendarData | undefined }>): ReactNode {
  if (slot.render.type !== 'calendar-agenda') return null;
  const agenda = slot.render.eventIds.map((id) => calendar?.events.find((event) => event.id === id)).filter((event): event is CalendarData['events'][number] => event !== undefined);
  if (!agenda.length) return null;
  return <div className="command-agenda-list mt-4">{agenda.map((event) => <div key={event.id} className="command-agenda-item"><time dateTime={event.start}>{formatEventDay(event)}</time><span>{event.title}</span></div>)}</div>;
}

function SpotifySecondary({ slot, spotify, spotifyFetchedAt }: Readonly<{ slot: CommandCenterSlot; spotify: SpotifyData | undefined; spotifyFetchedAt: string | undefined }>): ReactNode {
  if (slot.render.type === 'spotify-now-playing') {
    return spotify?.nowPlaying ? <div className="mt-4"><NowPlaying nowPlaying={spotify.nowPlaying} fetchedAt={spotifyFetchedAt} className="command-secondary-spotify" artworkClassName="command-secondary-spotify-artwork" /></div> : null;
  }
  if (slot.render.type === 'spotify-track') {
    const { trackId } = slot.render;
    const track = [...spotify?.topTracks.shortTerm ?? [], ...spotify?.topTracks.mediumTerm ?? [], ...spotify?.topTracks.longTerm ?? [], ...spotify?.allTime.tracks ?? [], ...spotify?.recentlyPlayed ?? []].find((item) => (item.id ?? item.track) === trackId);
    return <div className="command-secondary-spotify mt-4"><Thumb url={track?.imageUrl} size="command-secondary-track-artwork" /><div className="min-w-0"><p className="text-sm font-semibold text-ink">{slot.title}</p><p className="mt-0.5 text-sm text-ink-muted">{slot.detail}</p></div></div>;
  }
  if (slot.render.type === 'spotify-artist') {
    const { artistId } = slot.render;
    const artist = [...spotify?.topArtists.shortTerm ?? [], ...spotify?.topArtists.mediumTerm ?? [], ...spotify?.topArtists.longTerm ?? [], ...spotify?.allTime.artists ?? []].find((item) => (item.id ?? item.name) === artistId);
    const tracksByTimeframe = { short: spotify?.topTracks.shortTerm ?? [], medium: spotify?.topTracks.mediumTerm ?? [], long: spotify?.topTracks.longTerm ?? [], allTime: spotify?.allTime.tracks ?? [] };
    const legacyTimeframe = slot.id.split(':')[2];
    const timeframe = slot.render.timeframe ?? (legacyTimeframe in tracksByTimeframe ? legacyTimeframe as keyof typeof tracksByTimeframe : 'short');
    const tracks = tracksByTimeframe[timeframe].filter((track) => track.artist.split(', ').includes(artist?.name ?? slot.title)).slice(0, 3);
    return <div className="command-secondary-spotify mt-4">{artist && <Thumb url={artist.imageUrl} size="command-secondary-artist-artwork" />}<div className="command-secondary-artist-details"><p className="text-sm font-semibold text-ink">{slot.title}</p>{tracks.length > 0 && <><p className="command-secondary-artist-track-label">Top tracks</p><ol className="command-secondary-artist-tracks" aria-label={`Top tracks by ${slot.title} ${timeframe}`}>{tracks.map((track, index) => <li key={track.id ?? track.track}><span>{index + 1}</span><p>{track.track}</p></li>)}</ol></>}</div></div>;
  }
  if (slot.render.type === 'spotify-album') {
    const { albumId } = slot.render;
    const album = spotify?.allTime.albums.find((item) => (item.id ?? item.name) === albumId);
    const albumMeta = [{ label: 'Released', value: album?.releaseDate?.slice(0, 4) }, { label: 'Length', value: formatAlbumDuration(album?.totalDurationMs) }].filter((item): item is { label: string; value: string } => Boolean(item.value));
    return <div className="command-secondary-spotify mt-4">{album && <Thumb url={album.imageUrl} size="command-secondary-spotify-artwork" />}<div className="command-secondary-album-details"><p className="line-clamp-2 text-base font-semibold leading-tight text-ink">{slot.title}</p><p className="mt-1 truncate text-sm text-ink-muted">{album?.artist.split(',')[0]?.trim() ?? slot.detail}</p>{albumMeta.length > 0 && <dl className="command-secondary-album-meta">{albumMeta.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>}{album?.totalTracks && <p className="mt-2 text-xs text-ink-faint">{album.totalTracks} tracks</p>}</div></div>;
  }
  return null;
}

function SteamSecondary({ slot, steam }: Readonly<{ slot: CommandCenterSlot; steam: SteamData | undefined }>): ReactNode {
  if (slot.render.type === 'steam-now-playing') {
    const { appId } = slot.render;
    const game = steam?.currentGame?.appId === appId ? steam.currentGame : steam?.recentlyPlayed.find((item) => item.appId === appId);
    if (!game) return null;
    return <div className="mt-4">{game.headerUrl && <img src={game.headerUrl} alt="" className="w-full max-w-xs rounded-xl object-cover shadow-lg" />}<p className="mt-3 text-sm font-semibold text-ink">{game.name}</p>{game.playtimeForeverMinutes !== undefined && <p className="mt-0.5 text-sm text-ink-muted">{formatSteamHours(game.playtimeForeverMinutes)} total playtime</p>}</div>;
  }
  if (slot.render.type !== 'steam-achievement') return null;
  const { appId, apiName } = slot.render;
  const achievements = steam?.achievements?.appId === appId ? steam.achievements : undefined;
  const achievement = achievements?.recentUnlocks.find((item) => item.apiName === apiName);
  if (!achievement || !achievements) return null;
  return <div className="mt-4 flex items-center gap-3">{achievement.iconUrl ? <img src={achievement.iconUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" /> : <div className="h-12 w-12 shrink-0 rounded-lg bg-track" />}<div className="min-w-0"><p className="text-sm font-semibold text-ink">{achievement.displayName}</p><p className="mt-0.5 text-sm text-ink-muted">{achievements.unlockedCount}/{achievements.totalCount} unlocked{achievement.globalUnlockedPercent !== undefined ? ` · ${achievement.globalUnlockedPercent.toFixed(1)}% of players` : ''}</p></div></div>;
}

function HealthSecondary({ slot, health }: Readonly<{ slot: CommandCenterSlot; health: HealthData | undefined }>): ReactNode {
  const activityDay = health ? latestActivityDay(health) : undefined;
  if (slot.render.type !== 'health-rings' || !health || !activityDay) return null;
  const detail = health.today?.date === activityDay.date ? slot.detail : activitySyncContext(activityDay.date, health.updatedAt);
  return <div className="mt-4"><ActivityRings activeEnergyKcal={activityDay.activeEnergyKcal ?? 0} exerciseMinutes={activityDay.exerciseMinutes ?? 0} standHours={activityDay.standHours ?? 0} goals={health.goals} /><p className="mt-2 text-[11px] text-ink-faint">{detail}</p></div>;
}

export function GithubReviewList({ github, skip = 0 }: Readonly<{ github: GitHubData | undefined; skip?: number }>): ReactNode {
  const reviews = github?.pullRequests.filter((pr) => pr.role === 'review-requested').slice(skip, skip + 4) ?? [];
  if (!reviews.length) return null;
  return <div className="command-agenda-list mt-4">{reviews.map((pr) => <div key={`${pr.repo}#${pr.number}`} className="command-agenda-item"><span className="command-agenda-lead">{pr.repo}</span><span>{pr.title}</span></div>)}</div>;
}

export function GmailThreadList({ threadIds, gmail, className = 'command-agenda-list mt-4' }: Readonly<{ threadIds: string[]; gmail: GmailData | undefined; className?: string }>): ReactNode {
  const threads = threadIds.map((id) => gmail?.threads.find((thread) => thread.id === id)).filter((thread): thread is GmailData['threads'][number] => thread !== undefined);
  if (!threads.length) return null;
  return <div className={className}>{threads.map((thread) => <div key={thread.id} className="command-agenda-item"><span className="command-agenda-lead">{thread.from.replace(/\s*<.*$/, '').replaceAll('"', '').trim() || thread.from.replace(/[<>]/g, '').trim()}</span><span>{thread.subject}</span></div>)}</div>;
}

type AiUsageRender = Extract<CommandCenterSlot['render'], { type: 'ai-usage-tool' }>;

export function AiUsageTrend({ render, aiUsage }: Readonly<{ render: AiUsageRender; aiUsage: AiUsageByTool }>): ReactNode {
  const lines = render.toolIds.map((toolId) => ({ toolId, data: aiUsage[toolId], history: aiUsage[toolId]?.history })).filter((line): line is { toolId: AiUsageRender['toolIds'][number]; data: AiUsageToolData; history: NonNullable<AiUsageToolData['history']> } => Boolean(line.history?.length));
  if (!lines.length) return null;
  return <div className="relative">{lines.map((line, index) => <div key={line.toolId} className={index > 0 ? 'absolute inset-0' : undefined}><UsageSparkline points={line.history} metric={render.metric === 'fiveHour' ? 'fiveHourUsedPercent' : 'weeklyUsedPercent'} windowMs={render.metric === 'fiveHour' ? DAY_MS : WEEKLY_MS} color={line.toolId === 'codex' ? 'var(--color-codex)' : 'var(--color-claude)'} sessionResetsAt={render.metric === 'fiveHour' ? line.data.fiveHour?.resetsAt : undefined} sessionWindowMs={render.metric === 'fiveHour' ? FIVE_HOUR_MS : undefined} /></div>)}</div>;
}

export function WeatherHourlyRows({ weather }: Readonly<{ weather: WeatherData }>): ReactNode {
  if (!weather.hours.length) return null;
  return <div className="command-hours mt-3" aria-label="Hourly forecast">{weather.hours.slice(0, 6).map((hour) => <div key={hour.time} className="command-hour"><span>{hour.hourLabel}</span><span aria-hidden className="text-base leading-none">{glyph(hour.symbol)}</span><strong>{deg(hour.temperature)}</strong></div>)}</div>;
}

function WeatherSecondary({ slot, weather }: Readonly<{ slot: CommandCenterSlot; weather: WeatherData | undefined }>): ReactNode {
  if (slot.render.type !== 'weather-signal' || !weather) return null;
  if (slot.render.kind === 'wind') return <div className="command-secondary-ai mt-4"><WindGauge speed={weather.current.windSpeed} directionDeg={weather.current.windDirectionDeg} /><div className="min-w-0"><p className="text-sm font-semibold text-ink">{slot.title}</p><p className="mt-0.5 text-sm text-ink-muted">{slot.detail}</p></div></div>;
  if (slot.render.kind === 'uv' && weather.current.uvIndex != null) return <div className="command-secondary-ai mt-4"><UvGauge uvIndex={weather.current.uvIndex} /><div className="min-w-0"><p className="text-sm font-semibold text-ink">{slot.title}</p><p className="mt-0.5 text-sm text-ink-muted">{slot.detail}</p></div></div>;
  return <><p className="mt-4 text-sm font-semibold text-ink">{slot.title}</p><WeatherHourlyRows weather={weather} /><p className="mt-2 text-[11px] text-ink-faint">{slot.detail}</p></>;
}

function FallbackSecondary({ slot }: Readonly<{ slot: CommandCenterSlot }>): ReactNode {
  return <div className={slot.accent ? 'command-secondary-ai mt-4' : 'mt-4'}><AiToolMark accent={slot.accent} className="h-10 w-10 shrink-0" /><div><p className="text-sm font-semibold text-ink">{slot.title}</p><p className="mt-1 text-sm text-ink-muted">{slot.detail}</p></div></div>;
}

export function SecondaryContent(props: Readonly<{ slot: CommandCenterSlot; calendar: CalendarData | undefined; spotify: SpotifyData | undefined; spotifyFetchedAt: string | undefined; health: HealthData | undefined; github: GitHubData | undefined; gmail: GmailData | undefined; weather: WeatherData | undefined; steam: SteamData | undefined; aiUsage: AiUsageByTool; hoveredDay: { date: string; count: number } | null; onHover: (day: { date: string; count: number } | null) => void }>): ReactNode {
  const { slot } = props;
  const gmailThreads = slot.render.type === 'gmail-threads'
    ? GmailThreadList({ threadIds: slot.render.threadIds, gmail: props.gmail, className: 'command-agenda-list mt-3' })
    : null;
  const content = slot.render.type === 'calendar-agenda' ? CalendarAgendaSecondary({ slot, calendar: props.calendar })
    : slot.render.type.startsWith('spotify-') ? SpotifySecondary({ slot, spotify: props.spotify, spotifyFetchedAt: props.spotifyFetchedAt })
    : slot.render.type.startsWith('steam-') ? SteamSecondary({ slot, steam: props.steam })
    : slot.render.type === 'health-rings' ? HealthSecondary({ slot, health: props.health })
    : slot.render.type === 'github-contributions' ? <div className="mt-4">{props.github && <ContributionGrid data={props.github} hovered={props.hoveredDay} onHover={props.onHover} />}</div>
    : slot.render.type === 'github-reviews' ? GithubReviewList({ github: props.github })
    : slot.render.type === 'gmail-threads' ? <>{gmailThreads && <p className="mt-4 text-sm font-semibold text-ink">{slot.title}</p>}{gmailThreads}</>
    : slot.render.type === 'weather-signal' ? WeatherSecondary({ slot, weather: props.weather })
    : slot.render.type === 'ai-usage-tool' ? <AiUsageSecondary slot={slot} aiUsage={props.aiUsage} />
    : null;
  return content ?? <FallbackSecondary slot={slot} />;
}

function AiUsageSecondary({ slot, aiUsage }: Readonly<{ slot: CommandCenterSlot; aiUsage: AiUsageByTool }>): ReactNode {
  if (slot.render.type !== 'ai-usage-tool') return null;
  const { toolIds } = slot.render;
  return <div className="command-secondary-ai mt-4"><div className="flex shrink-0 flex-col items-center gap-2">{toolIds.map((toolId) => <AiToolMark key={toolId} accent={toolId} className={toolIds.length > 1 ? 'h-6 w-6' : 'h-10 w-10'} />)}</div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink">{slot.title}</p><div className="mt-2">{AiUsageTrend({ render: slot.render, aiUsage })}</div><p className="mt-1.5 text-[11px] tabular-nums text-ink-faint">{slot.detail}</p></div></div>;
}

export function heroExtraFor(hero: CommandCenterData['hero'], github: GitHubData | undefined, gmail: GmailData | undefined, aiUsage: AiUsageByTool, weather: WeatherData | undefined): ReactNode {
  if (hero.render.type === 'github-reviews') return GithubReviewList({ github, skip: 1 });
  if (hero.render.type === 'gmail-threads') return GmailThreadList({ threadIds: hero.render.threadIds, gmail });
  if (hero.render.type === 'weather-signal' && hero.render.kind === 'severe' && weather) return <div className="mt-4"><WeatherHourlyRows weather={weather} /></div>;
  return hero.render.type === 'ai-usage-tool' ? <div className="mt-4 max-w-sm">{AiUsageTrend({ render: hero.render, aiUsage })}</div> : null;
}
