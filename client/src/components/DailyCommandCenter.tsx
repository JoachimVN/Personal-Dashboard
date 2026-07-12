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

function remainingCapacity(data: AiUsageToolData | undefined): number | null {
  if (!data?.available) return null;
  const used = data.weekly?.usedPercent ?? data.fiveHour?.usedPercent;
  return used === undefined ? null : Math.max(0, Math.round(100 - used));
}

function Signal({ label, value, detail, tone }: Readonly<{
  label: string;
  value: string;
  detail: string;
  tone: 'personal' | 'github' | 'ai';
}>) {
  return (
    <div className="command-signal">
      <span className={`command-signal-dot command-signal-dot--${tone}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{label}</p>
        <p className="mt-1 truncate text-sm font-semibold text-ink">{value}</p>
        <p className="mt-0.5 truncate text-[11px] text-ink-muted">{detail}</p>
      </div>
    </div>
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
    .slice(0, 3) ?? [];
  const next = upcoming[0];
  const unreadThreads = gmail?.threads.filter((thread) => thread.unread) ?? [];
  const reviewRequests = github?.pullRequests.filter((pr) => pr.role === 'review-requested') ?? [];
  const todayContributions = github?.contributions.days.at(-1)?.count ?? 0;
  const aiCapacity = [remainingCapacity(codex), remainingCapacity(claude)].filter(
    (value): value is number => value !== null,
  );
  const lowestAiCapacity = aiCapacity.length ? Math.min(...aiCapacity) : null;
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
              <p className="command-event-time">{formatEventDay(next)}</p>
              <p className="command-event-title">{next.title}</p>
              <p className="mt-2 text-sm text-ink-muted">
                {next.location || (next.allDay ? 'An all-day marker on your calendar' : `${next.startLabel}–${next.endLabel}`)}
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
          />
          <Signal
            label="Code queue"
            value={github ? `${reviewRequests.length} reviews · ${github.pullRequests.length} PRs` : 'Syncing GitHub'}
            detail={reviewRequests[0]?.title ?? `${todayContributions} contributions today`}
            tone="github"
          />
          <Signal
            label="AI runway"
            value={lowestAiCapacity === null ? 'Awaiting snapshot' : `${lowestAiCapacity}% available`}
            detail="Lowest remaining provider allowance"
            tone="ai"
          />
        </div>
      </div>

      <div className="command-agenda">
        <div className="command-agenda-heading">
          <p className="command-label">Coming up</p>
          <a href="#/personal">Full day <span aria-hidden>↗</span></a>
        </div>
        <div className="command-agenda-list">
          {upcoming.length ? upcoming.map((event) => (
            <div key={event.id} className="command-agenda-item">
              <time dateTime={event.start}>{formatEventDay(event)}</time>
              <span>{event.title}</span>
            </div>
          )) : (
            <p className="text-sm text-ink-faint">No upcoming calendar items.</p>
          )}
        </div>
      </div>
    </section>
  );
}
