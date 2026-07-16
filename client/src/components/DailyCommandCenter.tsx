import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import type {
  CalendarData,
  CommandCenterData,
  CommandCenterSlot,
  GitHubData,
  HealthData,
  SpotifyData,
  WeatherData,
} from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { deg, glyph, weatherLocation } from '../lib/weather';
import { ActivityRings, CompactActivityRings } from './ActivityRings';
import { ContributionGrid } from '../widgets/GitHubWidgets';
import { NowPlaying, Thumb } from '../widgets/SpotifyWidget';
import { mapsCoordinatesHref, mapsSearchHref } from '../lib/maps';
import { latestActivityDay } from '../lib/health';
import { rampColor } from '../lib/contributions';
import { ClaudeIcon, OpenAiIcon } from '../sections/ai/ToolIcons';
import { sectionHref } from '../router';
import '../sections/spotify/spotify.css';

const SECONDARY_CAROUSEL_INTERVAL_MS = 7_000;

function formatEventDay(event: CalendarData['events'][number]): string {
  const today = new Date().toLocaleDateString('en-CA');
  if (event.date === today) return event.allDay ? 'Today' : event.startLabel;
  return new Date(`${event.date}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
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

function toneFor(slot: CommandCenterSlot): 'personal' | 'github' | 'ai' | 'health' | 'spotify' | 'claude' | 'codex' {
  if (slot.accent) return slot.accent;
  if (slot.source === 'github') return 'github';
  if (slot.source === 'ai-usage') return 'ai';
  if (slot.source === 'health') return 'health';
  if (slot.source === 'spotify') return 'spotify';
  return 'personal';
}

function AiToolMark({ accent, className }: Readonly<{ accent: CommandCenterSlot['accent']; className: string }>) {
  let Icon: typeof ClaudeIcon | undefined;
  if (accent === 'claude') Icon = ClaudeIcon;
  else if (accent === 'codex') Icon = OpenAiIcon;
  if (!Icon) return null;
  const color = accent === 'codex' ? 'var(--color-openai-mark)' : 'var(--color-claude)';
  return <Icon className={className} style={{ color }} />;
}

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
  const githubMark = slot.source === 'github' && slot.render.type === 'github-contributions'
    ? <GitHubMark className="h-[1.1rem] w-[1.1rem] shrink-0 text-(--color-github-mark)" />
    : undefined;
  return (
    <a href={slot.href} className={`command-signal command-signal--${toneFor(slot)}`}>
      {rings ?? toolMark ?? githubMark ?? <span className="command-signal-dot" aria-hidden />}
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
  hoveredDay: { date: string; count: number } | null;
  onHover: (day: { date: string; count: number } | null) => void;
}>): ReactNode {
  const { slot, calendar, spotify, spotifyFetchedAt, health, github, hoveredDay, onHover } = props;
  switch (slot.render.type) {
    case 'calendar-agenda': return CalendarAgendaSecondary({ slot, calendar }) ?? <FallbackSecondary slot={slot} />;
    case 'spotify-now-playing': return SpotifyNowPlayingSecondary({ spotify, spotifyFetchedAt }) ?? <FallbackSecondary slot={slot} />;
    case 'spotify-track': return SpotifyTrackSecondary({ slot, spotify }) ?? <FallbackSecondary slot={slot} />;
    case 'spotify-artist': return SpotifyArtistSecondary({ slot, spotify }) ?? <FallbackSecondary slot={slot} />;
    case 'spotify-album': return SpotifyAlbumSecondary({ slot, spotify }) ?? <FallbackSecondary slot={slot} />;
    case 'health-rings': return HealthRingsSecondary({ slot, health }) ?? <FallbackSecondary slot={slot} />;
    case 'github-contributions': return GithubContributionsSecondary({ slot, github, hoveredDay, onHover }) ?? <FallbackSecondary slot={slot} />;
    default: return <FallbackSecondary slot={slot} />;
  }
}

function CommandCenterSkeleton() {
  return (
    <section className="command-center glass" aria-labelledby="command-center-title">
      <div className="command-center-head">
        <div><p className="command-eyebrow">Overview</p><h2 id="command-center-title" className="command-title">What's next</h2></div>
        <nav className="command-nav" aria-label="Dashboard sections"><a href="#/personal">Day</a><a href="#/health">Health</a><a href="#/github">Code</a><a href="#/ai">AI</a></nav>
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

export function DailyCommandCenter() {
  const commandCenter = useWidget<CommandCenterData>('command-center').envelope?.data;
  const calendar = useWidget<CalendarData>('calendar').envelope?.data;
  const weather = useWidget<WeatherData>('weather').envelope?.data;
  const github = useWidget<GitHubData>('github').envelope?.data;
  const health = useWidget<HealthData>('health').envelope?.data;
  const spotifyEnvelope = useWidget<SpotifyData>('spotify').envelope;
  const spotify = spotifyEnvelope?.data;
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
  const todayWeather = weather?.days[0];

  return <section className="command-center glass" aria-labelledby="command-center-title">
    <div className="command-center-head">
      <div><p className="command-eyebrow">Overview</p><h2 id="command-center-title" className="command-title">What's next</h2></div>
      <nav className="command-nav" aria-label="Dashboard sections"><a href="#/personal">Day</a><a href="#/health">Health</a><a href="#/github">Code</a><a href="#/ai">AI</a></nav>
    </div>
    <div className="command-layout">
      <CommandPanel
        href={ranked.hero.href}
        label={`Open ${ranked.hero.kicker}: ${heroEvent?.title ?? heroTrack?.track ?? ranked.hero.title}`}
        className={`command-primary command-panel--${toneFor(ranked.hero)}`}
      >
        <p className="command-label">{ranked.hero.kicker}</p>
        <div className="mt-5 flex items-start gap-4">
          {heroTrack && <Thumb url={heroTrack.imageUrl} size="h-16 w-16" />}
          <div className="min-w-0">
            <p className="command-event-time">{heroKicker}</p>
            <p className="command-event-title">{heroEvent?.title ?? heroTrack?.track ?? ranked.hero.title}</p>
            {heroEvent ? (
              <div className="mt-2 space-y-1.5 text-sm text-ink-muted">
                {heroEvent.location && (
                  <p className="flex items-center gap-1.5">
                    <a href={mapsSearchHref(heroEvent.location)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 transition hover:text-ink">
                      <span aria-hidden>📍</span>
                      <span className="truncate">{heroEvent.location}</span>
                    </a>
                  </p>
                )}
                {heroEvent.description && (
                  <p className="line-clamp-2 border-l border-card-border pl-2.5 text-ink-faint">{heroEvent.description}</p>
                )}
                {!heroEvent.location && !heroEvent.description && <p>{ranked.hero.detail}</p>}
              </div>
            ) : <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{heroTrack ? heroTrack.artist : ranked.hero.detail}</p>}
          </div>
        </div>
        {heroActivity?.today && (
          <div className="mt-4">
            <ActivityRings
              activeEnergyKcal={heroActivity.today.activeEnergyKcal ?? 0}
              exerciseMinutes={heroActivity.today.exerciseMinutes ?? 0}
              standHours={heroActivity.today.standHours ?? 0}
              goals={heroActivity.goals}
            />
          </div>
        )}
        <div className="command-weather-row">
          <div className="command-weather-target">
            <a href={sectionHref('personal')} className="command-weather-summary" aria-label="Open weather in Personal">
              <span className="text-2xl" aria-hidden>{weather ? glyph(weather.current.symbol) : '·'}</span>
              <div className="min-w-0"><p className="text-lg font-semibold tabular-nums">{weather ? deg(weather.current.temperature) : 'Syncing'}</p><p className="truncate text-[11px] text-ink-muted">{todayWeather ? `${deg(todayWeather.minTemperature)}–${deg(todayWeather.maxTemperature)} · ${todayWeather.precipitationMm.toFixed(1)} mm rain` : 'Weather details are loading'}</p></div>
              {weather?.hours.slice(0, 4).map((hour) => <div key={hour.time} className="command-forecast"><span>{hour.hourLabel}</span><strong>{deg(hour.temperature)}</strong></div>)}
            </a>
            {weather && <a href={mapsCoordinatesHref(weather.location)} target="_blank" rel="noreferrer" className="command-weather-location"><span aria-hidden>📍</span>{weatherLocation(weather.location)}</a>}
          </div>
        </div>
      </CommandPanel>
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
          <SecondaryContent slot={slot} calendar={calendar} spotify={spotify} spotifyFetchedAt={spotifyEnvelope?.fetchedAt} health={health} github={github} hoveredDay={hoveredDay} onHover={setHoveredDay} />
        </>}
      />
    </CommandPanel>}
  </section>;
}
