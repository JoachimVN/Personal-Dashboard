import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import type {
  AiUsageToolData,
  CalendarData,
  CommandCenterData,
  CommandCenterSlot,
  GitHubData,
  GmailData,
  HealthData,
  SpotifyData,
  SteamData,
  WeatherData,
} from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { UsageSparkline } from '../sections/ai/UsageHistoryChart';
import { WEEKLY_MS } from '../sections/ai/UsageMeter';
import { deg, glyph, weatherLocation } from '../lib/weather';
import { ActivityRings, CompactActivityRings } from './ActivityRings';
import { ContributionGrid } from '../widgets/GitHubWidgets';
import { NowPlaying, Thumb } from '../widgets/SpotifyWidget';
import { mapsCoordinatesHref, mapsSearchHref } from '../lib/maps';
import { latestActivityDay } from '../lib/health';
import { rampColor } from '../lib/contributions';
import { ClaudeIcon, OpenAiIcon } from '../sections/ai/ToolIcons';
import { sectionHref } from '../router';
import { UvGauge, WindGauge } from '../sections/weather/WeatherOverview';
import '../sections/spotify/spotify.css';

const SECONDARY_CAROUSEL_INTERVAL_MS = 7_000;

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

const SOON_MS = 6 * 60 * 60_000;

function startsIn(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `in ${hours} h ${rest} min` : `in ${hours} h`;
}

/** Calendar timing is intentionally computed in the browser so it keeps counting down between polls. */
function eventTiming(event: CalendarData['events'][number], now: number): string {
  const start = Date.parse(event.start);
  if (start <= now && now < Date.parse(event.end)) {
    return event.allDay ? 'Today · all day' : `Now · until ${event.endLabel}`;
  }
  if (!event.allDay && start - now < SOON_MS) return `${startsIn(start - now)} · ${event.startLabel}`;
  return formatEventDay(event);
}

function toneFor(slot: CommandCenterSlot): 'personal' | 'github' | 'ai' | 'health' | 'spotify' | 'weather' | 'steam' | 'claude' | 'codex' {
  if (slot.accent) return slot.accent;
  if (slot.source === 'github') return 'github';
  if (slot.source === 'ai-usage') return 'ai';
  if (slot.source === 'health') return 'health';
  if (slot.source === 'spotify') return 'spotify';
  if (slot.source === 'weather') return 'weather';
  if (slot.source === 'steam') return 'steam';
  return 'personal';
}

function formatSteamHours(minutes: number): string {
  const hours = minutes / 60;
  return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`;
}

function AiToolMark({ accent, className }: Readonly<{ accent: CommandCenterSlot['accent']; className: string }>) {
  let Icon: typeof ClaudeIcon | undefined;
  if (accent === 'claude') Icon = ClaudeIcon;
  else if (accent === 'codex') Icon = OpenAiIcon;
  if (!Icon) return null;
  const color = accent === 'codex' ? 'var(--color-openai-mark)' : 'var(--color-claude)';
  return <Icon className={className} style={{ color }} />;
}

type WeatherSignalRender = Extract<CommandCenterSlot['render'], { type: 'weather-signal' }>;

const WEATHER_KIND_GLYPH: Record<WeatherSignalRender['kind'], string> = {
  severe: '⛈️', hot: '🌡️', cold: '🥶', rain: '🌧️', wind: '💨', uv: '☀️', sunset: '🌇', moon: '🌕',
};

function GitHubMark({ className }: Readonly<{ className: string }>) {
  return <svg viewBox="-1.5 -1.5 27 27" fill="currentColor" aria-hidden className={className}>
    <path d="M12 .297C5.373.297 0 5.67 0 12.297c0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.011-1.232-.016-2.235-3.338.724-4.042-1.416-4.042-1.416-.546-1.385-1.333-1.754-1.333-1.754-1.089-.745.083-.73.083-.73 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.419-1.305.762-1.605-2.665-.305-5.467-1.332-5.467-5.93 0-1.31.465-2.38 1.235-3.22-.124-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.3 1.23A11.498 11.498 0 0 1 12 6.002c1.02.005 2.045.138 3.003.404 2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.873.118 3.176.77.84 1.233 1.91 1.233 3.22 0 4.61-2.807 5.622-5.479 5.92.43.372.823 1.102.823 2.222 0 1.606-.015 2.898-.015 3.293 0 .32.216.694.825.576C20.565 22.092 24 17.592 24 12.297 24 5.67 18.627.297 12 .297Z" />
  </svg>;
}

function CommandPanel({
  href,
  label,
  className,
  children,
  navigable = true,
  fullCardLink = false,
}: Readonly<{
  href: string;
  label: string;
  className: string;
  children: ReactNode;
  navigable?: boolean;
  fullCardLink?: boolean;
}>) {
  if (!navigable) return <div className={className}>{children}</div>;

  return (
    <div className={`${className} cursor-pointer${fullCardLink ? ' command-panel--full-link' : ''}`}>
      <a href={href} aria-label={label} className="command-panel-stretched-link" />
      {children}
    </div>
  );
}

function Signal({ slot, github, health }: Readonly<{ slot: CommandCenterSlot; github: GitHubData | undefined; health: HealthData | undefined }>) {
  const activityDay = health ? latestActivityDay(health) : undefined;
  const rings = slot.render.type === 'health-rings' && health && activityDay
    ? <CompactActivityRings
        activeEnergyKcal={activityDay.activeEnergyKcal ?? 0}
        exerciseMinutes={activityDay.exerciseMinutes ?? 0}
        standHours={activityDay.standHours ?? 0}
        goals={health.goals}
      />
    : undefined;
  const contributionDays = slot.render.type === 'github-contributions'
    ? github?.contributions.days.slice(-7)
    : undefined;
  const maxContributions = Math.max(...(github?.contributions.days.map((day) => day.count) ?? []), 1);
  const toolMark = slot.accent ? <AiToolMark accent={slot.accent} className="h-4 w-4 shrink-0" /> : undefined;
  const dualToolMarks = !slot.accent && slot.render.type === 'ai-usage-tool' && slot.render.toolIds.length > 1
    ? <span className="flex shrink-0 flex-col items-center gap-0.5">
        {slot.render.toolIds.map((toolId) => <AiToolMark key={toolId} accent={toolId} className="h-3 w-3" />)}
      </span>
    : undefined;
  const githubMark = slot.source === 'github' && slot.render.type === 'github-contributions'
    ? <GitHubMark className="h-[1.1rem] w-[1.1rem] shrink-0 text-(--color-github-mark)" />
    : undefined;
  const weatherMark = slot.render.type === 'weather-signal'
    ? <span className="text-base leading-none" aria-hidden>{WEATHER_KIND_GLYPH[slot.render.kind]}</span>
    : undefined;
  return (
    <a href={slot.href} className={`command-signal command-signal--${toneFor(slot)}`}>
      {rings ?? toolMark ?? dualToolMarks ?? githubMark ?? weatherMark ?? <span className="command-signal-dot" aria-hidden />}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{slot.kicker}</p>
        <p className="mt-1 truncate text-sm font-semibold text-ink">{slot.title}</p>
        {contributionDays?.length
          ? <div className="command-contribution-squares" aria-label="Contributions over the last seven days">
              {contributionDays.map((day) => <span key={day.date} aria-hidden style={{ backgroundColor: rampColor(day.count, maxContributions) }} />)}
            </div>
          : <p className="mt-0.5 truncate text-[11px] text-ink-muted">{slot.detail}</p>}
        {slot.meter !== undefined && (
          <span className={`command-meter${slot.meter <= 15 ? ' command-meter--low' : ''}`}>
            <span style={{ width: `${Math.min(100, Math.max(0, slot.meter))}%` }} />
          </span>
        )}
      </div>
      <span className="command-signal-arrow" aria-hidden>↗</span>
    </a>
  );
}

function SecondaryCarousel({
  items,
  activeIndex,
  onActiveChange,
  renderItem,
}: Readonly<{
  items: CommandCenterSlot[];
  activeIndex: number;
  onActiveChange: (index: number) => void;
  renderItem: (slot: CommandCenterSlot) => ReactNode;
}>) {
  const [paused, setPaused] = useState(false);
  const hasMultipleItems = items.length > 1;
  const visibleIndex = Math.min(activeIndex, items.length - 1);

  useEffect(() => {
    onActiveChange(0);
  }, [items.map((item) => item.id).join('|'), onActiveChange]);

  useEffect(() => {
    if (!hasMultipleItems || paused) return undefined;
    const timer = window.setInterval(() => {
      onActiveChange((activeIndex + 1) % items.length);
    }, SECONDARY_CAROUSEL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [activeIndex, hasMultipleItems, items.length, onActiveChange, paused]);

  if (!items.length) return null;
  if (!hasMultipleItems) return <>{renderItem(items[0]!)}</>;

  const goTo = (index: number) => {
    onActiveChange((index + items.length) % items.length);
  };

  const pause = () => setPaused(true);
  const resume = () => setPaused(false);

  return (
    <MotionConfig reducedMotion="never">
      <section
        className="command-secondary-carousel"
        aria-roledescription="carousel"
        aria-label="Upcoming items"
        onMouseEnter={pause}
        onMouseLeave={resume}
        onFocusCapture={pause}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) resume();
        }}
      >
        <div className="command-secondary-carousel-viewport">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={items[visibleIndex]!.id}
              className="command-secondary-carousel-slide"
              initial={{ opacity: 0, x: 28, y: 8, filter: 'blur(7px)' }}
              animate={{ opacity: 1, x: 0, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: -20, y: -5, filter: 'blur(5px)' }}
              transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
            >
              {renderItem(items[visibleIndex]!)}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="command-secondary-carousel-timeline">
          <div className="command-secondary-carousel-dots" aria-label="Choose a secondary signal">
            {items.map((item, index) => <button
              key={item.id}
              type="button"
              className={index === visibleIndex ? 'is-active' : undefined}
              aria-label={`Show ${item.kicker}: ${item.title}`}
              aria-current={index === visibleIndex ? 'true' : undefined}
              onClick={() => goTo(index)}
            />)}
          </div>
        </div>
      </section>
    </MotionConfig>
  );
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
  return <div className="mt-4"><ActivityRings
    activeEnergyKcal={activityDay.activeEnergyKcal ?? 0}
    exerciseMinutes={activityDay.exerciseMinutes ?? 0}
    standHours={activityDay.standHours ?? 0}
    goals={health.goals}
  /></div>;
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

type AiUsageByTool = Readonly<{ claude: AiUsageToolData | undefined; codex: AiUsageToolData | undefined }>;

const DAY_MS = 24 * 60 * 60_000;

/** `"Jane Doe" <jane@example.com>` → `Jane Doe`, falling back to the bare address. */
function senderName(from: string): string {
  const addressStart = from.indexOf('<');
  const visibleName = addressStart === -1 ? from : from.slice(0, addressStart);
  const name = visibleName.replaceAll('"', '').trim();
  return name || from.replace(/[<>]/g, '').trim();
}

function GithubReviewList({ github, skip = 0 }: Readonly<{ github: GitHubData | undefined; skip?: number }>): ReactNode {
  const reviews = github?.pullRequests.filter((pr) => pr.role === 'review-requested').slice(skip, skip + 4) ?? [];
  if (!reviews.length) return null;
  return <div className="command-agenda-list mt-4">
    {reviews.map((pr) => <div key={`${pr.repo}#${pr.number}`} className="command-agenda-item">
      <span className="command-agenda-lead">{pr.repo}</span><span>{pr.title}</span>
    </div>)}
  </div>;
}

function GmailThreadList({
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
function AiUsageTrend({ render, aiUsage }: Readonly<{
  render: AiUsageRender;
  aiUsage: AiUsageByTool;
}>): ReactNode {
  const lines = render.toolIds
    .map((toolId) => ({ toolId, history: aiUsage[toolId]?.history }))
    .filter((line): line is { toolId: AiUsageRender['toolIds'][number]; history: NonNullable<AiUsageToolData['history']> } =>
      Boolean(line.history?.length));
  if (!lines.length) return null;
  return <div className="relative">
    {lines.map((line, index) => <div key={line.toolId} className={index > 0 ? 'absolute inset-0' : undefined}>
      <UsageSparkline
        points={line.history}
        metric={render.metric === 'fiveHour' ? 'fiveHourUsedPercent' : 'weeklyUsedPercent'}
        windowMs={render.metric === 'fiveHour' ? DAY_MS : WEEKLY_MS}
        color={aiToolColor(line.toolId)}
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

function WeatherHourlyRows({ weather }: Readonly<{ weather: WeatherData }>): ReactNode {
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

function SecondaryContent(props: Readonly<{
  slot: CommandCenterSlot;
  calendar: CalendarData | undefined;
  spotify: SpotifyData | undefined;
  spotifyFetchedAt: string | undefined;
  health: HealthData | undefined;
  github: GitHubData | undefined;
  gmail: GmailData | undefined;
  weather: WeatherData | undefined;
  steam: SteamData | undefined;
  aiUsage: AiUsageByTool;
  hoveredDay: { date: string; count: number } | null;
  onHover: (day: { date: string; count: number } | null) => void;
}>): ReactNode {
  const { slot, calendar, spotify, spotifyFetchedAt, health, github, gmail, weather, steam, aiUsage, hoveredDay, onHover } = props;
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
    default: return <FallbackSecondary slot={slot} />;
  }
}

function CommandCenterSkeleton() {
  return (
    <section className="command-center glass" aria-labelledby="command-center-title">
      <div className="command-center-head">
        <div><p className="command-eyebrow">Overview</p><h2 id="command-center-title" className="command-title">What's next</h2></div>
        <nav className="command-nav" aria-label="Dashboard sections"><a href="#/personal">Day</a><a href="#/weather">Sky</a><a href="#/health">Health</a><a href="#/github">Code</a><a href="#/ai">AI</a><a href="#/spotify">Music</a><a href="#/steam">Games</a></nav>
      </div>
      <div className="command-layout animate-pulse">
        <div className="command-primary space-y-3">
          <div className="h-3 w-24 rounded bg-track" />
          <div className="h-6 w-2/3 rounded bg-track" />
          <div className="h-4 w-1/3 rounded bg-track" />
          <div className="mt-4 h-10 w-full rounded bg-track" />
        </div>
        <div className="command-signals space-y-3">
          <div className="h-16 rounded bg-track" />
          <div className="h-16 rounded bg-track" />
          <div className="h-16 rounded bg-track" />
        </div>
      </div>
      <div className="command-agenda animate-pulse space-y-2">
        <div className="h-3 w-20 rounded bg-track" />
        <div className="h-4 w-1/2 rounded bg-track" />
      </div>
    </section>
  );
}

function heroExtraFor(hero: CommandCenterData['hero'], github: GitHubData | undefined, gmail: GmailData | undefined, aiUsage: AiUsageByTool, weather: WeatherData | undefined): ReactNode {
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

function HeroDescription({
  detail,
  event,
  render,
  extra,
  track,
}: Readonly<{
  detail: string;
  event: CalendarData['events'][number] | undefined;
  render: CommandCenterData['hero']['render'];
  extra: ReactNode;
  track: { artist: string } | undefined;
}>): ReactNode {
  if (event) {
    return <div className="mt-2 space-y-1.5 text-sm text-ink-muted">
      {event.location && (
        <p className="flex items-center gap-1.5">
          <a href={mapsSearchHref(event.location)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 transition hover:text-ink">
            <span aria-hidden>📍</span>
            <span className="truncate">{event.location}</span>
          </a>
        </p>
      )}
      {event.description && (
        <p className="line-clamp-2 border-l border-card-border pl-2.5 text-ink-faint">{event.description}</p>
      )}
      {!event.location && !event.description && <p>{detail}</p>}
    </div>;
  }

  if (render.type === 'gmail-threads' && extra) return null;
  return <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{track?.artist ?? detail}</p>;
}

function HeroWeather({ weather }: Readonly<{ weather: WeatherData | undefined }>): ReactNode {
  const today = weather?.days[0];
  return <div className="command-weather-row">
    <div className="command-weather-target">
      <a href={sectionHref('weather')} className="command-weather-summary" aria-label="Open weather">
        <span className="text-2xl" aria-hidden>{weather ? glyph(weather.current.symbol) : '·'}</span>
        <div className="min-w-0"><p className="text-lg font-semibold tabular-nums">{weather ? deg(weather.current.temperature) : 'Syncing'}</p><p className="truncate text-[11px] text-ink-muted">{today ? `${deg(today.minTemperature)}–${deg(today.maxTemperature)} · ${today.precipitationMm.toFixed(1)} mm rain` : 'Weather details are loading'}</p></div>
        {weather?.hours.slice(0, 4).map((hour) => <div key={hour.time} className="command-forecast"><span>{hour.hourLabel}</span><strong>{deg(hour.temperature)}</strong></div>)}
      </a>
      {weather && <a href={mapsCoordinatesHref(weather.location)} target="_blank" rel="noreferrer" className="command-weather-location"><span aria-hidden>📍</span>{weatherLocation(weather.location)}</a>}
    </div>
  </div>;
}

function HeroPanel({
  hero,
  event,
  track,
  kicker,
  extra,
  activity,
  weather,
}: Readonly<{
  hero: CommandCenterData['hero'];
  event: CalendarData['events'][number] | undefined;
  track: { imageUrl?: string; track: string; artist: string } | undefined;
  kicker: string;
  extra: ReactNode;
  activity: HealthData | undefined;
  weather: WeatherData | undefined;
}>) {
  return <CommandPanel
    href={hero.href}
    label={`Open ${hero.kicker}: ${event?.title ?? track?.track ?? hero.title}`}
    className={`command-primary command-panel--${toneFor(hero)}`}
  >
    <p className="command-label">{hero.kicker}</p>
    <div className="mt-5 flex items-start gap-4">
      {track && <Thumb url={track.imageUrl} size="h-16 w-16" />}
      <div className="min-w-0">
        {kicker !== hero.kicker && <p className="command-event-time">{kicker}</p>}
        <p className="command-event-title">{event?.title ?? track?.track ?? hero.title}</p>
        <HeroDescription detail={hero.detail} event={event} render={hero.render} extra={extra} track={track} />
      </div>
    </div>
    {extra}
    {activity?.today && (
      <div className="mt-4">
        <ActivityRings
          activeEnergyKcal={activity.today.activeEnergyKcal ?? 0}
          exerciseMinutes={activity.today.exerciseMinutes ?? 0}
          standHours={activity.today.standHours ?? 0}
          goals={activity.goals}
        />
      </div>
    )}
    <HeroWeather weather={weather} />
  </CommandPanel>;
}

export function DailyCommandCenter() {
  const commandCenter = useWidget<CommandCenterData>('command-center').envelope?.data;
  const calendar = useWidget<CalendarData>('calendar').envelope?.data;
  const weather = useWidget<WeatherData>('weather').envelope?.data;
  const github = useWidget<GitHubData>('github').envelope?.data;
  const health = useWidget<HealthData>('health').envelope?.data;
  const gmail = useWidget<GmailData>('gmail').envelope?.data;
  const aiUsage: AiUsageByTool = {
    claude: useWidget<AiUsageToolData>('ai-usage-claude').envelope?.data,
    codex: useWidget<AiUsageToolData>('ai-usage-codex').envelope?.data,
  };
  const spotifyEnvelope = useWidget<SpotifyData>('spotify').envelope;
  const spotify = spotifyEnvelope?.data;
  const steam = useWidget<SteamData>('steam').envelope?.data;
  const [hoveredDay, setHoveredDay] = useState<{ date: string; count: number } | null>(null);
  const [activeSecondaryIndex, setActiveSecondaryIndex] = useState(0);

  if (!commandCenter) return <CommandCenterSkeleton />;

  const ranked = commandCenter;
  // A running server may be refreshed separately from the Vite client during local development.
  // Keep the overview usable while the server still returns the pre-carousel single-slot payload.
  const secondarySlots = Array.isArray(ranked.secondary)
    ? ranked.secondary
    : [ranked.secondary as unknown as CommandCenterSlot];
  const activeSecondary = secondarySlots[Math.min(activeSecondaryIndex, secondarySlots.length - 1)];
  const heroRender = ranked.hero.render;
  const heroEvent = heroRender.type === 'calendar-event'
    ? calendar?.events.find((event) => event.id === heroRender.eventId)
    : undefined;
  const heroTrack = heroRender.type === 'spotify-track'
    ? [...spotify?.topTracks.shortTerm ?? [], ...spotify?.topTracks.mediumTerm ?? [], ...spotify?.topTracks.longTerm ?? [], ...spotify?.allTime.tracks ?? []]
      .find((track) => (track.id ?? track.track) === heroRender.trackId)
    : undefined;
  const heroActivity = heroRender.type === 'health-rings' && health?.today ? health : undefined;
  const heroKicker = heroEvent ? eventTiming(heroEvent, Date.now()) : ranked.hero.kicker;
  // Richer hero bodies for signals whose title/detail alone undersell them. The GitHub list skips
  // the first PR because the hero title already names it.
  const heroExtra = heroExtraFor(ranked.hero, github, gmail, aiUsage, weather);

  return <section className="command-center glass" aria-labelledby="command-center-title">
    <div className="command-center-head">
      <div><p className="command-eyebrow">Overview</p><h2 id="command-center-title" className="command-title">What's next</h2></div>
      <nav className="command-nav" aria-label="Dashboard sections"><a href="#/personal">Day</a><a href="#/weather">Sky</a><a href="#/health">Health</a><a href="#/github">Code</a><a href="#/ai">AI</a><a href="#/spotify">Music</a><a href="#/steam">Games</a></nav>
    </div>
    <div className="command-layout">
      <HeroPanel hero={ranked.hero} event={heroEvent} track={heroTrack} kicker={heroKicker} extra={heroExtra} activity={heroActivity} weather={weather} />
      <div className="command-signals">{ranked.tiles.map((slot) => <Signal key={slot.id} slot={slot} github={github} health={health} />)}</div>
    </div>
    {activeSecondary && <CommandPanel
      href={activeSecondary.href}
      label={`Open ${activeSecondary.kicker}: ${activeSecondary.title}`}
      className={`command-agenda command-panel--${toneFor(activeSecondary)}`}
      fullCardLink
    >
      <SecondaryCarousel
        items={secondarySlots}
        activeIndex={activeSecondaryIndex}
        onActiveChange={setActiveSecondaryIndex}
        renderItem={(slot) => <>
          <div className="command-agenda-heading"><p className="command-label">{slot.kicker}</p><span className="command-agenda-link" aria-hidden>Open section <span>↗</span></span></div>
          <SecondaryContent slot={slot} calendar={calendar} spotify={spotify} spotifyFetchedAt={spotifyEnvelope?.fetchedAt} health={health} github={github} gmail={gmail} weather={weather} steam={steam} aiUsage={aiUsage} hoveredDay={hoveredDay} onHover={setHoveredDay} />
        </>}
      />
    </CommandPanel>}
  </section>;
}
