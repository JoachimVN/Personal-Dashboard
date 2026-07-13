import type {
  AiUsageToolData,
  CalendarData,
  GitHubData,
  GmailData,
  WeatherData,
} from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { deg, glyph, weatherLocation } from '../lib/weather';

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

/** Kicker above the hero event: live "now" state, a countdown when imminent, else the day. */
function eventTiming(event: CalendarData['events'][number], now: number): string {
  const start = Date.parse(event.start);
  if (start <= now && now < Date.parse(event.end)) {
    return event.allDay ? 'Today · all day' : `Now · until ${event.endLabel}`;
  }
  if (!event.allDay && start - now < SOON_MS) return `${startsIn(start - now)} · ${event.startLabel}`;
  return formatEventDay(event);
}

interface AiConstraint {
  provider: string;
  window: '5h' | 'weekly';
  remaining: number;
  resetsAt: string;
}

/** Every enforced allowance window across providers, so the tightest one can be surfaced. */
function aiConstraints(
  tools: ReadonlyArray<{ provider: string; data: AiUsageToolData | undefined }>,
): AiConstraint[] {
  return tools.flatMap(({ provider, data }) => {
    if (!data?.available) return [];
    const windows: AiConstraint[] = [];
    if (data.fiveHour) {
      windows.push({
        provider,
        window: '5h',
        remaining: Math.max(0, Math.round(100 - data.fiveHour.usedPercent)),
        resetsAt: data.fiveHour.resetsAt,
      });
    }
    if (data.weekly) {
      windows.push({
        provider,
        window: 'weekly',
        remaining: Math.max(0, Math.round(100 - data.weekly.usedPercent)),
        resetsAt: data.weekly.resetsAt,
      });
    }
    return windows;
  });
}

/** Location if set, else a hint about all-day vs timed. */
function nextEventDetail(event: CalendarData['events'][number]): string {
  return event.location || (event.allDay
    ? 'An all-day marker on your calendar'
    : `${event.startLabel}–${event.endLabel}`);
}

function codeQueueValue(github: GitHubData | undefined, queueClear: boolean | undefined, reviewCount: number): string {
  if (!github) return 'Syncing GitHub';
  return queueClear ? 'Queue clear' : `${reviewCount} reviews · ${github.pullRequests.length} PRs`;
}

function resetLabel(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const sameDay = date.toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA');
  return sameDay
    ? `resets ${time}`
    : `resets ${date.toLocaleDateString('en-GB', { weekday: 'short' })} ${time}`;
}

function Signal({ label, value, detail, tone, href, meter }: Readonly<{
  label: string;
  value: string;
  detail: string;
  tone: 'personal' | 'github' | 'ai';
  href: string;
  /** Remaining-capacity bar, 0–100. Omit for signals without a natural meter. */
  meter?: number;
}>) {
  return (
    <a href={href} className={`command-signal command-signal--${tone}`}>
      <span className="command-signal-dot" aria-hidden />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{label}</p>
        <p className="mt-1 truncate text-sm font-semibold text-ink">{value}</p>
        <p className="mt-0.5 truncate text-[11px] text-ink-muted">{detail}</p>
        {meter !== undefined && (
          <span className={`command-meter${meter <= 15 ? ' command-meter--low' : ''}`}>
            <span style={{ width: `${Math.min(100, Math.max(0, meter))}%` }} />
          </span>
        )}
      </div>
      <span className="command-signal-arrow" aria-hidden>↗</span>
    </a>
  );
}

export function DailyCommandCenter() {
  const calendar = useWidget<CalendarData>('calendar').envelope?.data;
  const weather = useWidget<WeatherData>('weather').envelope?.data;
  const gmail = useWidget<GmailData>('gmail').envelope?.data;
  const github = useWidget<GitHubData>('github').envelope?.data;
  const codex = useWidget<AiUsageToolData>('ai-usage-codex').envelope?.data;
  const claude = useWidget<AiUsageToolData>('ai-usage-claude').envelope?.data;

  const now = Date.now();
  const upcoming = calendar?.events
    .filter((event) => new Date(event.end).getTime() >= now)
    .slice(0, 4) ?? [];
  const next = upcoming[0];
  const agenda = upcoming.slice(1);
  const unreadThreads = gmail?.threads.filter((thread) => thread.unread) ?? [];
  const reviewRequests = github?.pullRequests.filter((pr) => pr.role === 'review-requested') ?? [];
  const todayContributions = github?.contributions.days.at(-1)?.count ?? 0;
  const queueClear = github && reviewRequests.length === 0 && github.pullRequests.length === 0;

  const constraints = aiConstraints([
    { provider: 'Claude', data: claude },
    { provider: 'Codex', data: codex },
  ]);
  const tightest = constraints.length
    ? constraints.reduce((min, c) => (c.remaining < min.remaining ? c : min), constraints[0])
    : null;
  const aiLimitsLifted = [claude, codex].some(
    (data) => data?.available && data.fiveHourStatus === 'unlimited' && data.weeklyStatus === 'unlimited',
  );
  let aiRunwayValue = 'Awaiting snapshot';
  let aiRunwayDetail = 'Lowest remaining provider allowance';
  if (tightest) {
    aiRunwayValue = `${tightest.remaining}% available`;
    aiRunwayDetail = `${tightest.provider} ${tightest.window} · ${resetLabel(tightest.resetsAt)}`;
  } else if (aiLimitsLifted) {
    aiRunwayValue = 'No active limits';
    aiRunwayDetail = 'A provider has temporarily lifted its allowance';
  }
  const todayWeather = weather?.days[0];

  return (
    <section className="command-center glass" aria-labelledby="command-center-title">
      <div className="command-center-head">
        <div>
          <p className="command-eyebrow">Daily command center</p>
          <h2 id="command-center-title" className="command-title">What deserves your attention</h2>
        </div>
        <nav className="command-nav" aria-label="Dashboard sections">
          <a href="#/personal">Day</a>
          <a href="#/health">Health</a>
          <a href="#/github">Code</a>
          <a href="#/ai">AI</a>
        </nav>
      </div>

      <div className="command-layout">
        <div className="command-primary">
          <div className="flex items-center justify-between gap-4">
            <p className="command-label">Next on deck</p>
            <span className="command-status"><span aria-hidden /> Live overview</span>
          </div>
          {next ? (
            <div className="mt-5">
              <p className="command-event-time">{eventTiming(next, now)}</p>
              <p className="command-event-title">{next.title}</p>
              <p className="mt-2 text-sm text-ink-muted">
                {nextEventDetail(next)}
              </p>
            </div>
          ) : (
            <div className="mt-5">
              <p className="command-event-time">Open horizon</p>
              <p className="command-event-title">Nothing else scheduled</p>
              <p className="mt-2 text-sm text-ink-muted">Your calendar is clear for focused work.</p>
            </div>
          )}

          <div className="command-weather-row">
            <span className="text-2xl" aria-hidden>{weather ? glyph(weather.current.symbol) : '·'}</span>
            <div>
              <p className="text-lg font-semibold tabular-nums">{weather ? deg(weather.current.temperature) : 'Syncing'}</p>
              <p className="text-[11px] text-ink-muted">
                {todayWeather
                  ? `${deg(todayWeather.minTemperature)}–${deg(todayWeather.maxTemperature)} · ${todayWeather.precipitationMm.toFixed(1)} mm rain`
                  : 'Weather details are loading'}
              </p>
              {weather && <p className="text-[11px] text-ink-faint">📍 {weatherLocation(weather.location)}</p>}
            </div>
            {weather?.hours.slice(0, 4).map((hour) => (
              <div key={hour.time} className="command-forecast">
                <span>{hour.hourLabel}</span>
                <strong>{deg(hour.temperature)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="command-signals">
          <Signal
            label="Inbox"
            value={gmail ? `${gmail.unreadThreads} unread` : 'Syncing mail'}
            detail={unreadThreads[0]?.subject ?? 'No unread thread needs attention'}
            tone="personal"
            href="#/personal"
          />
          <Signal
            label="Code queue"
            value={codeQueueValue(github, queueClear, reviewRequests.length)}
            detail={reviewRequests[0]?.title ?? `${todayContributions} contributions today`}
            tone="github"
            href="#/github"
          />
          <Signal
            label="AI runway"
            value={aiRunwayValue}
            detail={aiRunwayDetail}
            tone="ai"
            href="#/ai"
            meter={tightest?.remaining}
          />
        </div>
      </div>

      <div className="command-agenda">
        <div className="command-agenda-heading">
          <p className="command-label">Coming up</p>
          <a href="#/personal">Full day <span aria-hidden>↗</span></a>
        </div>
        <div className="command-agenda-list">
          {agenda.length ? agenda.map((event) => (
            <div key={event.id} className="command-agenda-item">
              <time dateTime={event.start}>{formatEventDay(event)}</time>
              <span>{event.title}</span>
            </div>
          )) : (
            <p className="text-sm text-ink-faint">
              {next ? 'Nothing more after this.' : 'No upcoming calendar items.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
