import { useState } from 'react';
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
import { ActivityRings } from './ActivityRings';
import { ContributionGrid } from '../widgets/GitHubWidgets';
import { NowPlaying, Thumb } from '../widgets/SpotifyWidget';
import '../sections/spotify/spotify.css';

function formatEventDay(event: CalendarData['events'][number]): string {
  const today = new Date().toLocaleDateString('en-CA');
  if (event.date === today) return event.allDay ? 'Today' : event.startLabel;
  return new Date(`${event.date}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
  });
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

function toneFor(slot: CommandCenterSlot): 'personal' | 'github' | 'ai' {
  if (slot.source === 'github') return 'github';
  if (slot.source === 'ai-usage') return 'ai';
  return 'personal';
}

function Signal({ slot }: Readonly<{ slot: CommandCenterSlot }>) {
  return (
    <a href={slot.href} className={`command-signal command-signal--${toneFor(slot)}`}>
      <span className="command-signal-dot" aria-hidden />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{slot.kicker}</p>
        <p className="mt-1 truncate text-sm font-semibold text-ink">{slot.title}</p>
        <p className="mt-0.5 truncate text-[11px] text-ink-muted">{slot.detail}</p>
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

function SecondaryContent({
  slot,
  calendar,
  spotify,
  spotifyFetchedAt,
  health,
  github,
  hoveredDay,
  onHover,
}: Readonly<{
  slot: CommandCenterSlot;
  calendar: CalendarData | undefined;
  spotify: SpotifyData | undefined;
  spotifyFetchedAt: string | undefined;
  health: HealthData | undefined;
  github: GitHubData | undefined;
  hoveredDay: { date: string; count: number } | null;
  onHover: (day: { date: string; count: number } | null) => void;
}>) {
  if (slot.render.type === 'calendar-agenda') {
    const agenda = slot.render.eventIds
      .map((id) => calendar?.events.find((event) => event.id === id))
      .filter((event): event is CalendarData['events'][number] => event !== undefined);
    if (agenda.length) {
      return <div className="command-agenda-list mt-4">
        {agenda.map((event) => <div key={event.id} className="command-agenda-item">
          <time dateTime={event.start}>{formatEventDay(event)}</time><span>{event.title}</span>
        </div>)}
      </div>;
    }
  }
  if (slot.render.type === 'spotify-now-playing' && spotify?.nowPlaying) {
    return <div className="mt-4"><NowPlaying nowPlaying={spotify.nowPlaying} fetchedAt={spotifyFetchedAt} /></div>;
  }
  if (slot.render.type === 'health-rings' && health?.today) {
    return <div className="mt-4"><ActivityRings
      activeEnergyKcal={health.today.activeEnergyKcal ?? 0}
      exerciseMinutes={health.today.exerciseMinutes ?? 0}
      standHours={health.today.standHours ?? 0}
      goals={health.goals}
    /></div>;
  }
  if (slot.render.type === 'github-contributions' && github) {
    return <div className="mt-4"><ContributionGrid data={github} hovered={hoveredDay} onHover={onHover} /></div>;
  }
  return <div className="mt-4"><p className="text-sm font-semibold text-ink">{slot.title}</p><p className="mt-1 text-sm text-ink-muted">{slot.detail}</p></div>;
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

  if (!commandCenter) return <CommandCenterSkeleton />;

  const ranked = commandCenter;
  const heroRender = ranked.hero.render;
  const heroEvent = heroRender.type === 'calendar-event'
    ? calendar?.events.find((event) => event.id === heroRender.eventId)
    : undefined;
  const heroTrack = heroRender.type === 'spotify-track'
    ? spotify?.topTracks.shortTerm.find((track) => (track.id ?? track.track) === heroRender.trackId)
    : undefined;
  const heroKicker = heroEvent ? eventTiming(heroEvent, Date.now()) : ranked.hero.kicker;
  const todayWeather = weather?.days[0];

  return <section className="command-center glass" aria-labelledby="command-center-title">
    <div className="command-center-head">
      <div><p className="command-eyebrow">Overview</p><h2 id="command-center-title" className="command-title">What's next</h2></div>
      <nav className="command-nav" aria-label="Dashboard sections"><a href="#/personal">Day</a><a href="#/health">Health</a><a href="#/github">Code</a><a href="#/ai">AI</a></nav>
    </div>
    <div className="command-layout">
      <div className="command-primary">
        <p className="command-label">{ranked.hero.kicker}</p>
        <div className="mt-5 flex items-start gap-4">
          {heroTrack && <Thumb url={heroTrack.imageUrl} size="h-16 w-16" />}
          <div className="min-w-0">
            <p className="command-event-time">{heroKicker}</p>
            <p className="command-event-title">{heroEvent?.title ?? heroTrack?.track ?? ranked.hero.title}</p>
            <p className="mt-2 text-sm text-ink-muted">{heroEvent?.location || (heroTrack ? heroTrack.artist : ranked.hero.detail)}</p>
          </div>
        </div>
        <div className="command-weather-row">
          <span className="text-2xl" aria-hidden>{weather ? glyph(weather.current.symbol) : '·'}</span>
          <div><p className="text-lg font-semibold tabular-nums">{weather ? deg(weather.current.temperature) : 'Syncing'}</p><p className="text-[11px] text-ink-muted">{todayWeather ? `${deg(todayWeather.minTemperature)}–${deg(todayWeather.maxTemperature)} · ${todayWeather.precipitationMm.toFixed(1)} mm rain` : 'Weather details are loading'}</p>{weather && <p className="text-[11px] text-ink-faint">📍 {weatherLocation(weather.location)}</p>}</div>
          {weather?.hours.slice(0, 4).map((hour) => <div key={hour.time} className="command-forecast"><span>{hour.hourLabel}</span><strong>{deg(hour.temperature)}</strong></div>)}
        </div>
      </div>
      <div className="command-signals">{ranked.tiles.map((slot) => <Signal key={slot.id} slot={slot} />)}</div>
    </div>
    <div className="command-agenda">
      <div className="command-agenda-heading"><p className="command-label">{ranked.secondary.kicker}</p><a href={ranked.secondary.href}>Open section <span aria-hidden>↗</span></a></div>
      <SecondaryContent slot={ranked.secondary} calendar={calendar} spotify={spotify} spotifyFetchedAt={spotifyEnvelope?.fetchedAt} health={health} github={github} hoveredDay={hoveredDay} onHover={setHoveredDay} />
    </div>
  </section>;
}
