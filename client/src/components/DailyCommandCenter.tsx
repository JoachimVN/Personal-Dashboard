import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import type {
  CalendarData,
  CommandCenterData,
  CommandCenterSlot,
  GitHubData,
  HealthData,
  WeatherData,
} from '@personal-dashboard/shared';
import { deg, glyph, weatherLocation } from '../lib/weather';
import { mapsCoordinatesHref, mapsSearchHref } from '../lib/maps';
import { latestActivityDay } from '../lib/health';
import { rampColor } from '../lib/contributions';
import { accentStyle, SECTIONS, SectionIcon } from '../sections/registry';
import { sectionHref } from '../router';
import { ActivityRings, CompactActivityRings } from './ActivityRings';
import { Thumb } from '../widgets/SpotifyWidget';
import { GitHubMark } from './GitHubMark';
import { AiToolMark, heroExtraFor, SecondaryContent } from './command-center/SecondaryContent';
import { useCommandCenterData } from './command-center/useCommandCenterData';
import '../sections/spotify/spotify.css';

const SECONDARY_CAROUSEL_INTERVAL_MS = 7_000;
const SOON_MS = 6 * 60 * 60_000;

function formatEventDay(event: CalendarData['events'][number]): string {
  const today = new Date().toLocaleDateString('en-CA');
  if (event.date === today) return event.allDay ? 'Today' : event.startLabel;
  return new Date(`${event.date}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
  });
}

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

function toneFor(slot: CommandCenterSlot): 'personal' | 'github' | 'ai' | 'health' | 'spotify' | 'weather' | 'steam' | 'roblox' | 'claude' | 'codex' {
  if (slot.accent) return slot.accent;
  if (slot.source === 'github') return 'github';
  if (slot.source === 'ai-usage') return 'ai';
  if (slot.source === 'health') return 'health';
  if (slot.source === 'spotify') return 'spotify';
  if (slot.source === 'weather') return 'weather';
  if (slot.source === 'steam') return 'steam';
  if (slot.source === 'roblox') return 'roblox';
  return 'personal';
}

const WEATHER_KIND_GLYPH: Record<Extract<CommandCenterSlot['render'], { type: 'weather-signal' }>['kind'], string> = {
  severe: '⛈️', hot: '🌡️', cold: '🥶', rain: '🌧️', wind: '💨', uv: '☀️', sunset: '🌇', moon: '🌕',
};

function CommandPanel({
  href,
  label,
  className,
  children,
  fullCardLink = false,
}: Readonly<{
  href: string;
  label: string;
  className: string;
  children: ReactNode;
  fullCardLink?: boolean;
}>) {
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
  const robloxIcon = slot.render.type === 'roblox-now-playing'
    ? <span className="command-roblox-tile-mark" aria-hidden><img src="/roblox.svg" alt="" /></span>
    : undefined;
  const signalKicker = slot.source === 'roblox' ? 'Roblox · Playing now' : slot.kicker;
  return (
    <a href={slot.href} className={`command-signal command-signal--${toneFor(slot)}`}>
      {rings ?? toolMark ?? dualToolMarks ?? githubMark ?? weatherMark ?? robloxIcon ?? <span className="command-signal-dot" aria-hidden />}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{signalKicker}</p>
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

/** Icon-only so the pill row stays a fixed width as sections are added — labels made it grow
    unbounded. Generated from SECTIONS so a new section doesn't need a second hand-edit here. */
function CommandNav() {
  return (
    <nav className="command-nav" aria-label="Dashboard sections">
      {SECTIONS.map((section) => (
        <a key={section.id} href={sectionHref(section.id)} aria-label={section.title} title={section.title} style={accentStyle(section)}>
          <SectionIcon id={section.id} monochrome />
        </a>
      ))}
    </nav>
  );
}

function CommandCenterSkeleton() {
  return (
    <section className="command-center glass" aria-labelledby="command-center-title">
      <div className="command-center-head">
        <div><p className="command-eyebrow">Overview</p><h2 id="command-center-title" className="command-title">What's next</h2></div>
        <CommandNav />
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
  const today = weather?.days[0];
  const nonEventDetail = hero.render.type === 'gmail-threads' && extra
    ? null
    : <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{track?.artist ?? hero.detail}</p>;
  return (
    <CommandPanel
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
          {event ? (
            <div className="mt-2 space-y-1.5 text-sm text-ink-muted">
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
              {!event.location && !event.description && <p>{hero.detail}</p>}
            </div>
          ) : nonEventDetail}
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
      <div className="command-weather-row">
        <div className="command-weather-target">
          <a href={sectionHref('weather')} className="command-weather-summary" aria-label="Open weather">
            <span className="text-2xl" aria-hidden>{weather ? glyph(weather.current.symbol) : '·'}</span>
            <div className="min-w-0"><p className="text-lg font-semibold tabular-nums">{weather ? deg(weather.current.temperature) : 'Syncing'}</p><p className="truncate text-[11px] text-ink-muted">{today ? `${deg(today.minTemperature)}–${deg(today.maxTemperature)} · ${today.precipitationMm.toFixed(1)} mm rain` : 'Weather details are loading'}</p></div>
            {weather?.hours.slice(0, 4).map((hour) => <div key={hour.time} className="command-forecast"><span>{hour.hourLabel}</span><strong>{deg(hour.temperature)}</strong></div>)}
          </a>
          {weather && <a href={mapsCoordinatesHref(weather.location)} target="_blank" rel="noreferrer" className="command-weather-location"><span aria-hidden>📍</span>{weatherLocation(weather.location)}</a>}
        </div>
      </div>
    </CommandPanel>
  );
}

export function DailyCommandCenter() {
  const { commandCenter, calendar, weather, github, health, gmail, aiUsage, spotify, spotifyFetchedAt, steam, roblox } = useCommandCenterData();
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
  const isRobloxSecondary = activeSecondary?.render.type === 'roblox-now-playing';
  const robloxSecondaryBackdrop = isRobloxSecondary ? roblox?.presence?.thumbnailUrl : undefined;
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

  return (
    <section className="command-center glass" aria-labelledby="command-center-title">
      <div className="command-center-head">
        <div><p className="command-eyebrow">Overview</p><h2 id="command-center-title" className="command-title">What's next</h2></div>
        <CommandNav />
      </div>
      <div className="command-layout">
        <HeroPanel hero={ranked.hero} event={heroEvent} track={heroTrack} kicker={heroKicker} extra={heroExtra} activity={heroActivity} weather={weather} />
        <div className="command-signals">{ranked.tiles.map((slot) => <Signal key={slot.id} slot={slot} github={github} health={health} />)}</div>
      </div>
      {activeSecondary && <CommandPanel
        href={activeSecondary.href}
        label={`Open ${activeSecondary.kicker}: ${activeSecondary.title}`}
        className={`command-agenda command-panel--${toneFor(activeSecondary)}${isRobloxSecondary ? ' command-agenda--roblox' : ''}`}
        fullCardLink
      >
        {robloxSecondaryBackdrop && <img aria-hidden src={robloxSecondaryBackdrop} alt="" className="command-roblox-agenda-backdrop" />}
        <SecondaryCarousel
          items={secondarySlots}
          activeIndex={activeSecondaryIndex}
          onActiveChange={setActiveSecondaryIndex}
          renderItem={(slot) => <>
            {slot.render.type !== 'roblox-now-playing' && <div className="command-agenda-heading"><p className="command-label">{slot.kicker}</p><span className="command-agenda-link" aria-hidden>Open section <span>↗</span></span></div>}
            <SecondaryContent slot={slot} calendar={calendar} spotify={spotify} spotifyFetchedAt={spotifyFetchedAt} health={health} github={github} gmail={gmail} weather={weather} steam={steam} roblox={roblox} aiUsage={aiUsage} hoveredDay={hoveredDay} onHover={setHoveredDay} />
          </>}
        />
      </CommandPanel>}
    </section>
  );
}
