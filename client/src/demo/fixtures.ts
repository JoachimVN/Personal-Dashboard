// Fake, fully-anonymized data for the public interactive demo build (see api.ts, which serves
// this instead of hitting a real server). One consistent fake persona across every widget — no
// real names, places, accounts, or credentials. Modeled on server/scripts/screenshotFixtures.ts
// (the README screenshot generator), but self-contained: no Node imports, no network calls at
// build time, and timestamped off the real clock instead of a frozen one, since this is a live
// page a visitor actually clicks around in rather than a single captured frame.
import type {
  AiNewsData,
  AiUsageToolData,
  CalendarData,
  ClashRoyaleData,
  CommandCenterData,
  GitHubData,
  GmailData,
  HealthData,
  HueData,
  IMessageData,
  NewsData,
  PowerData,
  RobloxData,
  SonarCloudData,
  SpotifyData,
  SteamData,
  SystemData,
  TransitData,
  ValorantData,
  WeatherData,
  WidgetEnvelope,
} from '@personal-dashboard/shared';

// Seeded PRNG (mulberry32) — reproducible "realistic noise" instead of a perfectly smooth curve.
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = Math.trunc(state);
    state = Math.trunc(state + 0x6d2b79f5);
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function iso(now: Date, hoursFromNow: number): string {
  return new Date(now.getTime() + hoursFromNow * 3_600_000).toISOString();
}

function isoDaysAgo(now: Date, days: number, hoursFromNow = 0): string {
  return new Date(now.getTime() - days * 86_400_000 + hoursFromNow * 3_600_000).toISOString();
}

function dateDaysAgo(now: Date, days: number): string {
  return isoDaysAgo(now, days).slice(0, 10);
}

function hhmm(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function daysFromNowAt(now: Date, days: number, hour: number, minute: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const fallbackArt = (seed: string) => `https://picsum.photos/seed/${seed}/300/300`;

function envelope<T>(id: string, data: T, now: Date, refreshMs: number): WidgetEnvelope<T> {
  const at = now.toISOString();
  return { id, status: 'ready', data, fetchedAt: at, lastAttemptAt: at, refreshMs };
}

// ── Weather ──────────────────────────────────────────────────────────────────────────────────

function weather(now: Date): WeatherData {
  const day = (offset: number) => new Date(now.getTime() + offset * 86_400_000);
  const weekday = (offset: number) => day(offset).toLocaleDateString('en-GB', { weekday: 'short' });
  const sunrise = daysFromNowAt(now, 0, 5, 42);
  const sunset = daysFromNowAt(now, 0, 21, 8);
  return {
    location: { lat: 59.91, lon: 10.75, name: 'Oslo' },
    current: {
      temperature: 18, windSpeed: 2.6, windDirectionDeg: 224, humidity: 58, uvIndex: 4.2,
      precipitationMm: 0, symbol: 'partlycloudy_day',
    },
    hours: [
      { time: iso(now, 1), hourLabel: '14', temperature: 18, precipitationMm: 0, uvIndex: 4.2, windSpeed: 2.4, humidity: 57, symbol: 'partlycloudy_day' },
      { time: iso(now, 2), hourLabel: '15', temperature: 19, precipitationMm: 0, uvIndex: 4.6, windSpeed: 2.6, humidity: 55, symbol: 'clearsky_day' },
      { time: iso(now, 3), hourLabel: '16', temperature: 19, precipitationMm: 0, uvIndex: 3.8, windSpeed: 2.9, humidity: 55, symbol: 'clearsky_day' },
      { time: iso(now, 4), hourLabel: '17', temperature: 17, precipitationMm: 0.1, uvIndex: 2.4, windSpeed: 3.1, humidity: 60, symbol: 'fair_day' },
      { time: iso(now, 5), hourLabel: '18', temperature: 16, precipitationMm: 0.3, uvIndex: 1.5, windSpeed: 3.4, humidity: 64, symbol: 'lightrain' },
      { time: iso(now, 6), hourLabel: '19', temperature: 15, precipitationMm: 0.8, uvIndex: 0.7, windSpeed: 3.8, humidity: 70, symbol: 'rain' },
      { time: iso(now, 7), hourLabel: '20', temperature: 14, precipitationMm: 0.4, uvIndex: 0.2, windSpeed: 3.2, humidity: 72, symbol: 'lightrain' },
      { time: iso(now, 8), hourLabel: '21', temperature: 14, precipitationMm: 0, uvIndex: 0, windSpeed: 2.4, humidity: 71, symbol: 'partlycloudy_night' },
      { time: iso(now, 9), hourLabel: '22', temperature: 13, precipitationMm: 0, uvIndex: 0, windSpeed: 2.0, humidity: 73, symbol: 'fair_night' },
      { time: iso(now, 10), hourLabel: '23', temperature: 13, precipitationMm: 0, uvIndex: 0, windSpeed: 1.8, humidity: 75, symbol: 'clearsky_night' },
      { time: iso(now, 11), hourLabel: '00', temperature: 12, precipitationMm: 0, uvIndex: 0, windSpeed: 1.6, humidity: 76, symbol: 'clearsky_night' },
      { time: iso(now, 12), hourLabel: '01', temperature: 12, precipitationMm: 0, uvIndex: 0, windSpeed: 1.5, humidity: 77, symbol: 'clearsky_night' },
    ],
    days: [
      { date: dateDaysAgo(now, 0), dayLabel: weekday(0), minTemperature: 14, maxTemperature: 20, precipitationMm: 0.4, maxUvIndex: 4.6, maxWindSpeed: 3.8, humidity: 58, symbol: 'partlycloudy_day' },
      { date: dateDaysAgo(now, -1), dayLabel: weekday(1), minTemperature: 13, maxTemperature: 22, precipitationMm: 0, maxUvIndex: 5.1, maxWindSpeed: 2.9, humidity: 52, symbol: 'clearsky_day' },
      { date: dateDaysAgo(now, -2), dayLabel: weekday(2), minTemperature: 15, maxTemperature: 24, precipitationMm: 0, maxUvIndex: 5.4, maxWindSpeed: 3.1, humidity: 49, symbol: 'clearsky_day' },
      { date: dateDaysAgo(now, -3), dayLabel: weekday(3), minTemperature: 16, maxTemperature: 21, precipitationMm: 2.8, maxUvIndex: 3.2, maxWindSpeed: 5.6, humidity: 68, symbol: 'rainshowers_day' },
      { date: dateDaysAgo(now, -4), dayLabel: weekday(4), minTemperature: 13, maxTemperature: 17, precipitationMm: 6.1, maxUvIndex: 1.8, maxWindSpeed: 6.9, humidity: 78, symbol: 'rain' },
      { date: dateDaysAgo(now, -5), dayLabel: weekday(5), minTemperature: 12, maxTemperature: 18, precipitationMm: 1.2, maxUvIndex: 3.9, maxWindSpeed: 4.2, humidity: 63, symbol: 'partlycloudy_day' },
      { date: dateDaysAgo(now, -6), dayLabel: weekday(6), minTemperature: 14, maxTemperature: 20, precipitationMm: 0, maxUvIndex: 4.8, maxWindSpeed: 2.7, humidity: 55, symbol: 'fair_day' },
    ],
    sun: { sunrise: sunrise.toISOString(), sunset: sunset.toISOString() },
    moon: { phaseDeg: 132, moonrise: daysFromNowAt(now, 0, 16, 24).toISOString(), moonset: daysFromNowAt(now, 0, 2, 51).toISOString() },
  };
}

// ── Calendar — spread across last month/this month/next month so month nav isn't empty ────────

function calendar(now: Date): CalendarData {
  const events: CalendarData['events'] = [];
  let n = 0;
  const add = (title: string, cal: string, days: number, hour: number, minute: number, durationMin: number, opts: { location?: string; description?: string; allDay?: boolean } = {}) => {
    n += 1;
    const start = daysFromNowAt(now, days, hour, minute);
    const end = new Date(start.getTime() + durationMin * 60_000);
    events.push({
      id: `ev${n}`, title, calendar: cal, allDay: opts.allDay ?? false,
      location: opts.location, description: opts.description,
      start: start.toISOString(), end: end.toISOString(),
      date: start.toISOString().slice(0, 10), startLabel: hhmm(start), endLabel: hhmm(end),
    });
  };

  add('Cinema — The Odyssey', 'Personal', 1, 19, 15, 173, { location: 'Northstar Cinema', description: '2h 53m · with Sam' });
  add('Team standup', 'Work', 2, 9, 30, 30, { location: 'Video call' });
  add('Dentist appointment', 'Personal', 4, 11, 0, 45, { location: 'Bright Smile Dental' });
  add('Sprint planning', 'Work', 5, 10, 0, 60, { location: 'Video call' });
  add('Dinner with Alex', 'Personal', 7, 19, 0, 120, { location: 'Riverside Bistro' });
  add('Quarterly review', 'Work', 9, 14, 0, 90, { location: 'Conference room B' });
  add("Sam's birthday", 'Personal', 12, 0, 0, 0, { allDay: true });
  add('Gym — leg day', 'Personal', 3, 7, 0, 60, {});
  add('1:1 with manager', 'Work', 6, 15, 30, 30, { location: 'Video call' });
  add('Weekend hike', 'Personal', 6, 9, 0, 240, { location: 'Nordmarka trailhead' });
  add('Code review', 'Work', 1, 13, 0, 45, {});
  add('Grocery run', 'Personal', 0, 17, 30, 30, {});
  add('Design sync', 'Work', -3, 11, 0, 45, {});
  add('Coffee with old coworker', 'Personal', -5, 10, 0, 60, { location: 'Fuglen' });
  add('Deploy freeze starts', 'Work', 14, 0, 0, 0, { allDay: true });
  add('Concert — outdoor stage', 'Personal', 18, 20, 0, 150, { location: 'Frognerparken' });
  add('Retro', 'Work', -1, 16, 0, 45, {});
  add('Vet checkup', 'Personal', 9, 12, 0, 30, { location: 'Green Paw Clinic' });

  events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return { events };
}

// ── GitHub ───────────────────────────────────────────────────────────────────────────────────

function contributionDays(now: Date, rng: () => number) {
  const days: { date: string; count: number }[] = [];
  for (let i = 364; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 86_400_000);
    const weekend = i % 7 === 0 || i % 7 === 1;
    const roll = rng();
    let count: number;
    if (weekend) count = roll < 0.3 ? Math.round(rng() * rng() * 6) : 0;
    else if (roll < 0.1) count = 0;
    else count = Math.round(1 + rng() * rng() * 13);
    if (i < 3) count = Math.max(count, 2 + Math.round(rng() * 4));
    days.push({ date: date.toISOString().slice(0, 10), count });
  }
  return days;
}

function github(now: Date): GitHubData {
  const rng = mulberry32(42);
  const days = contributionDays(now, rng);
  return {
    activity: [
      {
        id: 'ev1', summary: '3 commits', repo: 'yourname/personal-dashboard', timestamp: iso(now, -2), url: '#', branch: 'dev',
        commits: [
          { sha: 'a1b2c3d', title: 'Add importance scoring to the command center' },
          { sha: 'b2c3d4e', title: 'Wire health baseline into the scoring engine' },
          { sha: 'c3d4e5f', title: 'Fix null coalescing on Postgres-backed health store' },
        ],
      },
      { id: 'ev2', summary: '1 commit', repo: 'yourname/weekend-project', timestamp: iso(now, -26), url: '#', branch: 'main', commits: [{ sha: 'd4e5f6a', title: 'Prototype the offline sync queue' }] },
      { id: 'ev3', summary: 'Opened a pull request', repo: 'yourname/personal-dashboard', timestamp: iso(now, -20), url: '#' },
      { id: 'ev4', summary: '2 commits', repo: 'yourname/dotfiles', timestamp: iso(now, -50), url: '#', branch: 'main', commits: [{ sha: 'e5f6a7b', title: 'Tidy up shell aliases' }, { sha: 'f6a7b8c', title: 'Add starship prompt config' }] },
    ],
    pullRequests: [
      { title: 'Add importance scoring to the command center', repo: 'yourname/personal-dashboard', number: 42, url: '#', role: 'author', draft: false, updatedAt: iso(now, -2) },
      { title: 'Bump Vite to 7.x', repo: 'yourname/personal-dashboard', number: 40, url: '#', role: 'review-requested', draft: false, updatedAt: iso(now, -20) },
      { title: 'WIP: offline sync queue', repo: 'yourname/weekend-project', number: 3, url: '#', role: 'author', draft: true, updatedAt: iso(now, -26) },
    ],
    issues: [
      { title: 'Contribution grid should scroll on narrow viewports', repo: 'yourname/personal-dashboard', number: 38, url: '#', updatedAt: iso(now, -40) },
      { title: 'Investigate flaky transit test', repo: 'yourname/personal-dashboard', number: 35, url: '#', updatedAt: iso(now, -96) },
    ],
    contributions: { total: days.reduce((sum, d) => sum + d.count, 0), days },
    repoHealth: [
      { fullName: 'yourname/personal-dashboard', stars: 12, ciStatus: 'success', ciUrl: '#', latestRelease: 'v1.4.0', url: '#', lastPushedAt: iso(now, -3) },
      { fullName: 'yourname/weekend-project', stars: 3, ciStatus: 'running', ciUrl: '#', url: '#', lastPushedAt: iso(now, -26) },
      { fullName: 'yourname/dotfiles', stars: 41, ciStatus: 'none', url: '#', lastPushedAt: iso(now, -14 * 24) },
      { fullName: 'yourname/old-experiment', stars: 2, ciStatus: 'failure', ciUrl: '#', url: '#', lastPushedAt: iso(now, -60 * 24) },
    ],
  };
}

// ── SonarCloud ───────────────────────────────────────────────────────────────────────────────

function sonarCloud(now: Date): SonarCloudData {
  return {
    projects: [
      { key: 'yourname_personal-dashboard', name: 'personal-dashboard', visibility: 'public', lastAnalysis: iso(now, -3), qualityGateStatus: 'passed', linesOfCode: 18420, languages: ['TypeScript', 'CSS'], security: 'A', reliability: 'A', maintainability: 'A', hotspotsReviewedPercent: 100, coveragePercent: 78.4, duplicationsPercent: 1.2 },
      { key: 'yourname_weekend-project', name: 'weekend-project', visibility: 'public', lastAnalysis: iso(now, -26), qualityGateStatus: 'failed', linesOfCode: 3120, languages: ['TypeScript'], security: 'B', reliability: 'C', maintainability: 'A', hotspotsReviewedPercent: 60, coveragePercent: 42.1, duplicationsPercent: 4.6 },
      { key: 'yourname_dotfiles', name: 'dotfiles', visibility: 'public', lastAnalysis: iso(now, -14 * 24), qualityGateStatus: 'none', linesOfCode: 640, languages: ['Shell'], duplicationsPercent: 0 },
    ],
  };
}

// ── Gmail ────────────────────────────────────────────────────────────────────────────────────

function gmail(now: Date): GmailData {
  return {
    unreadThreads: 5,
    threads: [
      { id: 't1', from: 'Newsletter', subject: 'This week in open source', date: iso(now, -3), unread: true, url: '#' },
      { id: 't2', from: 'GitHub', subject: '[yourname/personal-dashboard] Review requested', date: iso(now, -5), unread: true, url: '#' },
      { id: 't3', from: 'Sam', subject: 'Re: dinner Friday?', date: iso(now, -8), unread: false, url: '#' },
      { id: 't4', from: 'Bank', subject: 'Your monthly statement is ready', date: iso(now, -20), unread: true, url: '#' },
      { id: 't5', from: 'Spotify', subject: 'Your 2026 Wrapped is here', date: iso(now, -30), unread: true, url: '#' },
      { id: 't6', from: 'Team', subject: 'Sprint retro notes', date: iso(now, -44), unread: false, url: '#' },
      { id: 't7', from: 'Landlord', subject: 'Reminder: rent due the 1st', date: iso(now, -50), unread: true, url: '#' },
    ],
  };
}

// ── iMessage ─────────────────────────────────────────────────────────────────────────────────

function imessage(now: Date): IMessageData {
  return {
    conversations: [
      { id: 'c1', label: 'Sam', lastMessage: 'Sounds good, see you at 7!', isFromMe: false, timestamp: iso(now, -0.3), unreadCount: 1 },
      { id: 'c2', label: 'Family', lastMessage: 'Don’t forget to call grandma', isFromMe: false, timestamp: iso(now, -2), unreadCount: 2 },
      { id: 'c3', label: 'Alex', lastMessage: 'Sent you the photos from the hike', isFromMe: true, timestamp: iso(now, -5), unreadCount: 0 },
      { id: 'c4', label: '+1 555 0142', lastMessage: '[attachment]', isFromMe: false, timestamp: iso(now, -9), unreadCount: 0 },
      { id: 'c5', label: 'Work friends', lastMessage: 'lol did you see the standup notes', isFromMe: false, timestamp: iso(now, -22), unreadCount: 0 },
    ],
  };
}

// ── News / AI news ───────────────────────────────────────────────────────────────────────────

function news(now: Date): NewsData {
  return {
    items: [
      { title: 'Show HN: I built a personal dashboard that runs entirely on my own machine', source: 'Hacker News', url: '#', publishedAt: iso(now, -1) },
      { title: 'The quiet return of the RSS reader', source: 'Hacker News', url: '#', publishedAt: iso(now, -4) },
      { title: 'Why local-first software is having a moment', source: 'Hacker News', url: '#', publishedAt: iso(now, -9) },
      { title: 'A deep dive into React 19’s concurrent rendering', source: 'Hacker News', url: '#', publishedAt: iso(now, -14) },
      { title: 'Norway’s power grid in 2026: what changed', source: 'Hacker News', url: '#', publishedAt: iso(now, -20) },
    ],
  };
}

function aiNews(now: Date): AiNewsData {
  return {
    items: [
      { title: 'Claude Sonnet 5 released with improved agentic coding', source: 'Anthropic', url: '#', publishedAt: iso(now, -6), provider: 'anthropic' },
      { title: 'New context caching improvements for long-running agents', source: 'Anthropic', url: '#', publishedAt: iso(now, -30), provider: 'anthropic' },
      { title: 'GPT-5.1 Codex update improves tool-use reliability', source: 'OpenAI', url: '#', publishedAt: iso(now, -12), provider: 'openai' },
      { title: 'OpenAI announces expanded rate limits for Plus subscribers', source: 'OpenAI', url: '#', publishedAt: iso(now, -40), provider: 'openai' },
    ],
  };
}

// ── Health ───────────────────────────────────────────────────────────────────────────────────

function healthDayFor(now: Date, daysAgo: number, rng: () => number) {
  const date = new Date(now.getTime() - daysAgo * 86_400_000);
  const weekend = daysAgo % 7 === 0 || daysAgo % 7 === 1;
  const roll = rng();
  let stepsBase: number;
  if (roll < 0.12) stepsBase = 1800 + rng() * 1800;
  else if (roll > 0.85) stepsBase = 12500 + rng() * 4000;
  else stepsBase = (weekend ? 5200 : 6800) + rng() * 4200;
  const steps = Math.round(stepsBase);
  const activity = Math.min(1, steps / 12000);
  const resting = Math.round(58 - activity * 4 + (rng() - 0.5) * 4);
  const walking = Math.round(84 + activity * 14 + (rng() - 0.5) * 5);
  return {
    date: date.toISOString().slice(0, 10),
    steps, watchSteps: steps,
    activeEnergyKcal: Math.round(180 + activity * 420 + (rng() - 0.5) * 60),
    exerciseMinutes: Math.round(6 + activity * 40 + (rng() - 0.5) * 8),
    standHours: Math.max(1, Math.round(4 + activity * 9 + (rng() - 0.5) * 2)),
    heartRate: Math.round(resting + (walking - resting) * (0.25 + rng() * 0.15)),
    restingHeartRate: resting,
    walkingHeartRate: walking,
    bloodOxygenPercent: Math.min(100, Math.round(96 + rng() * 3)),
  };
}

function health(now: Date): HealthData {
  const rng = mulberry32(20260714);
  const history = Array.from({ length: 30 }, (_, i) => healthDayFor(now, 29 - i, rng));
  const today = { ...healthDayFor(now, 0, rng), date: dateDaysAgo(now, 0), exerciseMinutes: 23 };
  const restingAvg = history.reduce((sum, d) => sum + d.restingHeartRate, 0) / history.length;
  return {
    today, history, updatedAt: iso(now, 0),
    goals: { steps: 9000, activeEnergyKcal: 500, exerciseMinutes: 30, standHours: 12 },
    baseline: {
      windowDays: 30, minimumSamples: 7,
      metrics: {
        restingHeartRate: {
          average: Math.round(restingAvg * 10) / 10, current: today.restingHeartRate,
          deviationPercent: Math.round(((today.restingHeartRate - restingAvg) / restingAvg) * 1000) / 10,
          samples: history.length, direction: today.restingHeartRate >= restingAvg ? 'above' : 'below', anomalous: false,
        },
      },
    },
  };
}

// ── AI usage (Claude / Codex) ────────────────────────────────────────────────────────────────

interface SawtoothOptions {
  resetsAtIso: string; periodMs: number; spanMs: number; stepMs: number;
  peakRange: [number, number]; rng: () => number;
  field: 'fiveHourUsedPercent' | 'weeklyUsedPercent'; gapSteps: number; now: number;
}

function sawtoothHistory({ resetsAtIso, periodMs, spanMs, stepMs, peakRange, rng, field, gapSteps, now }: SawtoothOptions): AiUsageToolData['history'] {
  const resetsAt = Date.parse(resetsAtIso);
  const peaks = new Map<number, number>();
  const peakFor = (cycle: number) => {
    if (!peaks.has(cycle)) peaks.set(cycle, peakRange[0] + rng() * (peakRange[1] - peakRange[0]));
    return peaks.get(cycle)!;
  };
  const points: AiUsageToolData['history'] = [];
  for (let t = now - spanMs; t <= now; t += stepMs) {
    const cycle = Math.ceil((resetsAt - t) / periodMs);
    const lastReset = resetsAt - cycle * periodMs;
    const msIntoWindow = t - lastReset;
    if (msIntoWindow < gapSteps * stepMs) continue;
    const fraction = Math.min(1, msIntoWindow / periodMs);
    const percent = Math.max(0, Math.min(100, fraction * peakFor(cycle) + (rng() - 0.5) * 3));
    points.push({ at: new Date(t).toISOString(), [field]: Math.round(percent) });
  }
  return points;
}

function usageHistoryFor(fiveHour: { usedPercent: number; resetsAt: string }, weekly: { usedPercent: number; resetsAt: string }, seed: number, now: number): AiUsageToolData['history'] {
  const rng = mulberry32(seed);
  const fiveHourPoints = sawtoothHistory({
    resetsAtIso: fiveHour.resetsAt, periodMs: 5 * 3_600_000, spanMs: 24 * 3_600_000,
    stepMs: 15 * 60_000, peakRange: [fiveHour.usedPercent * 0.6, Math.min(100, fiveHour.usedPercent * 1.15)],
    rng, field: 'fiveHourUsedPercent', gapSteps: 4, now,
  });
  const weeklyPoints = sawtoothHistory({
    resetsAtIso: weekly.resetsAt, periodMs: 7 * 86_400_000, spanMs: 7 * 86_400_000,
    stepMs: 3 * 3_600_000, peakRange: [weekly.usedPercent * 0.5, Math.min(100, weekly.usedPercent * 1.1)],
    rng, field: 'weeklyUsedPercent', gapSteps: 4, now,
  });
  return [...fiveHourPoints, ...weeklyPoints].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function aiUsage(now: Date): { claude: AiUsageToolData; codex: AiUsageToolData } {
  const nowMs = now.getTime();
  const isoFrom = (hoursFromNow: number) => new Date(nowMs + hoursFromNow * 3_600_000).toISOString();

  const claudeFiveHour = { usedPercent: 54, resetsAt: isoFrom(2) };
  const claudeWeekly = { usedPercent: 61, resetsAt: isoFrom(90) };
  const claude: AiUsageToolData = {
    available: true, fiveHour: claudeFiveHour, weekly: claudeWeekly,
    fiveHourStatus: 'limited', weeklyStatus: 'limited',
    tokens: { fiveHour: 812_000, weekly: 4_260_000 }, asOf: isoFrom(0),
    history: usageHistoryFor(claudeFiveHour, claudeWeekly, 1, nowMs),
  };

  const codexFiveHour = { usedPercent: 22, resetsAt: isoFrom(3) };
  const codexWeekly = { usedPercent: 38, resetsAt: isoFrom(90) };
  const codex: AiUsageToolData = {
    available: true, fiveHour: codexFiveHour, weekly: codexWeekly,
    fiveHourStatus: 'limited', weeklyStatus: 'limited',
    tokens: { fiveHour: 305_000, weekly: 1_870_000 }, asOf: isoFrom(0),
    history: usageHistoryFor(codexFiveHour, codexWeekly, 2, nowMs),
  };

  return { claude, codex };
}

// ── Spotify — broadly-recognizable artists/tracks, real cover-art/photo CDN links where known ─

const MANUAL_ARTIST_IMAGES: Record<string, string> = {
  'The Weeknd': 'https://i.scdn.co/image/ab6761610000e5ebc1719ac9e6a75c1c25835018',
  'Dua Lipa': 'https://i.scdn.co/image/ab6761610000e5eb0c68f6c95232e716f0abee8d',
  'Kendrick Lamar': 'https://i.scdn.co/image/ab6761610000e5eb39ba6dcd4355c03de0b50918',
  'Olivia Rodrigo': 'https://i.scdn.co/image/ab67616100005174b14eb4dcfd2f3858bed06e44',
  'Billie Eilish': 'https://i.scdn.co/image/ab6761610000e5eb4a21b4760d2ecb7b0dcdc8da',
  Coldplay: 'https://i.scdn.co/image/ab6761610000e5eb1ba8fc5f5c73e7e9313cc6eb',
  'Bruno Mars': 'https://i.scdn.co/image/ab6761610000e5ebc7688aad1bf03986934d7e26',
  Madonna: 'https://i.scdn.co/image/ab6761610000e5ebed2208b41d49ebd24687985b',
};

const ARTIST_NAMES = Object.keys(MANUAL_ARTIST_IMAGES);

const TRACKS = [
  { id: 't1', track: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours' },
  { id: 't2', track: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia' },
  { id: 't3', track: 'HUMBLE.', artist: 'Kendrick Lamar', album: 'DAMN.' },
  { id: 't4', track: 'Viva la Vida', artist: 'Coldplay', album: 'Viva la Vida or Death and All His Friends' },
  { id: 't5', track: 'good 4 u', artist: 'Olivia Rodrigo', album: 'SOUR' },
  { id: 't6', track: '24K Magic', artist: 'Bruno Mars', album: '24K Magic' },
  { id: 't7', track: 'bad guy', artist: 'Billie Eilish', album: 'When We All Fall Asleep, Where Do We Go?' },
  { id: 't8', track: 'Vogue', artist: 'Madonna', album: "I'm Breathless" },
];

const ONE_OFFS = [
  { id: 'r1', track: 'Flowers', artist: 'Miley Cyrus', album: 'Endless Summer Vacation' },
  { id: 'r2', track: 'Cruel Summer', artist: 'Taylor Swift', album: 'Lover' },
  { id: 'r3', track: 'Watermelon Sugar', artist: 'Harry Styles', album: 'Fine Line' },
];

const ALBUMS = [
  { id: 'al1', name: 'After Hours', artist: 'The Weeknd', releaseDate: '2020-03-20', totalTracks: 14, totalDurationMs: 3_400_000, playCount: 256, topTrack: TRACKS[0] },
  { id: 'al2', name: 'Future Nostalgia', artist: 'Dua Lipa', releaseDate: '2020-03-27', totalTracks: 11, totalDurationMs: 2_300_000, playCount: 214, topTrack: TRACKS[1] },
  { id: 'al3', name: 'SOUR', artist: 'Olivia Rodrigo', releaseDate: '2021-05-21', totalTracks: 11, totalDurationMs: 2_050_000, playCount: 176, topTrack: TRACKS[4] },
];

function spotify(now: Date): SpotifyData {
  const artistImages = Object.fromEntries(ARTIST_NAMES.map((name) => [name, MANUAL_ARTIST_IMAGES[name]]));
  const albumImages = new Map<string, string>();
  for (const t of [...TRACKS, ...ONE_OFFS]) {
    if (!albumImages.has(t.album)) albumImages.set(t.album, fallbackArt(t.album));
  }

  const artists = ARTIST_NAMES.map((name, i) => ({ id: `a${i + 1}`, name, imageUrl: artistImages[name], url: '#', genres: [] as string[] }));
  const tracks = TRACKS.map((t) => ({ ...t, imageUrl: albumImages.get(t.album)!, url: '#' }));
  const oneOffs = ONE_OFFS.map((t) => ({ ...t, imageUrl: albumImages.get(t.album)!, url: '#' }));

  return {
    nowPlaying: { track: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', imageUrl: tracks[1].imageUrl, isPlaying: true, progressMs: 112_000, durationMs: 203_000 },
    recentlyPlayed: [
      { ...tracks[2], playedAt: isoDaysAgo(now, 0, -0.1) },
      { ...oneOffs[0], playedAt: isoDaysAgo(now, 0, -0.6) },
      { ...tracks[6], playedAt: isoDaysAgo(now, 0, -1.4) },
      { ...oneOffs[1], playedAt: isoDaysAgo(now, 0, -2.9) },
      { ...tracks[0], playedAt: isoDaysAgo(now, 0, -4.1) },
      { ...oneOffs[2], playedAt: isoDaysAgo(now, 0, -6.3) },
    ],
    topArtists: { shortTerm: artists, mediumTerm: artists.slice().reverse(), longTerm: artists },
    topTracks: { shortTerm: tracks, mediumTerm: tracks.slice().reverse(), longTerm: tracks },
    allTime: {
      trackedSince: dateDaysAgo(now, 280),
      artists: artists.map((artist, i) => ({ ...artist, playCount: 410 - i * 38 })),
      tracks: tracks.map((track, i) => ({ ...track, playCount: 128 - i * 11, verified: i < 2 })),
      albums: ALBUMS.map((album) => ({
        id: album.id, name: album.name, artist: album.artist, imageUrl: albumImages.get(album.name)!,
        url: '#', releaseDate: album.releaseDate, releaseDatePrecision: 'day' as const, totalTracks: album.totalTracks,
        totalDurationMs: album.totalDurationMs, playCount: album.playCount,
        topTracks: [{ id: album.topTrack.id, track: album.topTrack.track, playCount: Math.round(album.playCount * 0.5), url: '#' }],
      })),
    },
  };
}

// ── Steam ────────────────────────────────────────────────────────────────────────────────────

const steamHeaderUrl = (appId: number) => `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;

function steamGame(appId: number, name: string, foreverMin: number, recentMin: number) {
  return { appId, name, headerUrl: steamHeaderUrl(appId), playtimeForeverMinutes: foreverMin, playtimeRecentMinutes: recentMin };
}

function steam(now: Date): SteamData {
  const games = [
    steamGame(730, 'Counter-Strike 2', 48_200, 620),
    steamGame(1245620, 'ELDEN RING', 18_400, 340),
    steamGame(292030, 'The Witcher 3: Wild Hunt', 9_800, 0),
    steamGame(1091500, 'Cyberpunk 2077', 7_200, 180),
    steamGame(570, 'Dota 2', 32_600, 0),
    steamGame(440, 'Team Fortress 2', 5_100, 0),
  ];
  const rng = mulberry32(9001);
  const playtimeHistory = Array.from({ length: 60 }, (_, i) => {
    const daysAgo = 59 - i;
    const totalSoFar = games.reduce((sum, g) => sum + (g.playtimeForeverMinutes ?? 0), 0);
    return { date: dateDaysAgo(now, daysAgo), totalPlaytimeMinutes: Math.max(0, Math.round(totalSoFar - daysAgo * (280 + rng() * 120))) };
  });

  return {
    profile: { steamId: '76561197960287930', personaName: 'yourname', profileUrl: '#' },
    currentGame: null,
    library: {
      totalGames: 84,
      totalPlaytimeMinutes: games.reduce((sum, g) => sum + (g.playtimeForeverMinutes ?? 0), 0),
      recentPlaytimeMinutes: games.reduce((sum, g) => sum + (g.playtimeRecentMinutes ?? 0), 0),
      mostPlayed: games,
      allGames: games,
    },
    recentlyPlayed: [games[0], games[1], games[3]],
    achievements: {
      appId: 1245620, gameName: 'ELDEN RING', unlockedCount: 28, totalCount: 42,
      recentUnlocks: [
        { apiName: 'ACH_MALENIA', displayName: 'Maiden of Ashen Ruin', description: 'Defeated Malenia, Blade of Miquella.', unlockedAt: iso(now, -20), globalUnlockedPercent: 8.4 },
        { apiName: 'ACH_RADAHN', displayName: "Starscourge Radahn", description: 'Defeated Starscourge Radahn.', unlockedAt: iso(now, -70), globalUnlockedPercent: 22.1 },
        { apiName: 'ACH_GODRICK', displayName: 'Godrick the Grafted', description: 'Defeated Godrick the Grafted.', unlockedAt: iso(now, -200), globalUnlockedPercent: 61.3 },
      ],
      rarest: [
        { apiName: 'ACH_MALENIA', displayName: 'Maiden of Ashen Ruin', description: 'Defeated Malenia, Blade of Miquella.', unlockedAt: iso(now, -20), globalUnlockedPercent: 8.4 },
        { apiName: 'ACH_RADAHN', displayName: "Starscourge Radahn", description: 'Defeated Starscourge Radahn.', unlockedAt: iso(now, -70), globalUnlockedPercent: 22.1 },
      ],
      nextEasiest: [
        { apiName: 'ACH_LANDS_BETWEEN', displayName: 'Lands Between', description: 'Reached the Lands Between.', globalUnlockedPercent: 94.2 },
        { apiName: 'ACH_FLASK', displayName: 'Flask of Wondrous Physick', description: 'Acquired the Flask of Wondrous Physick.', globalUnlockedPercent: 88.7 },
      ],
    },
    friendsInGame: [
      { steamId: 'friend1', personaName: 'Alex', appId: 730, gameName: 'Counter-Strike 2' },
    ],
    playtimeHistory,
    friendsLeaderboard: {
      status: 'available',
      entries: [
        { steamId: '76561197960287930', personaName: 'yourname', totalPlaytimeMinutes: games.reduce((sum, g) => sum + (g.playtimeForeverMinutes ?? 0), 0), recentPlaytimeMinutes: 620, sharedGames: 84, isYou: true },
        { steamId: 'friend1', personaName: 'Alex', totalPlaytimeMinutes: 52_000, recentPlaytimeMinutes: 900, sharedGames: 61, isYou: false },
        { steamId: 'friend2', personaName: 'Jordan', totalPlaytimeMinutes: 21_400, recentPlaytimeMinutes: 120, sharedGames: 34, isYou: false },
        { steamId: 'friend3', personaName: 'Casey', sharedGames: 12, isYou: false },
      ],
    },
    availability: { library: 'available', achievements: 'available', friends: 'available' },
  };
}

// ── Roblox ───────────────────────────────────────────────────────────────────────────────────

function roblox(now: Date): RobloxData {
  return {
    presence: { status: 'offline', lastOnline: iso(now, -14) },
    availability: 'available',
  };
}

// ── Clash Royale ─────────────────────────────────────────────────────────────────────────────

function clashRoyaleCard(id: number, name: string, level: number, maxLevel: number, rarity: string) {
  return { id, name, level, maxLevel, rarity };
}

function clashRoyale(now: Date): ClashRoyaleData {
  const deck = [
    clashRoyaleCard(26000000, 'Knight', 14, 14, 'common'),
    clashRoyaleCard(26000012, 'Musketeer', 13, 13, 'common'),
    clashRoyaleCard(26000015, 'Baby Dragon', 11, 13, 'epic'),
    clashRoyaleCard(26000024, 'Mini P.E.K.K.A', 13, 13, 'common'),
    clashRoyaleCard(28000000, 'Fireball', 12, 13, 'rare'),
    clashRoyaleCard(28000008, 'Zap', 13, 13, 'common'),
    clashRoyaleCard(27000006, 'Tesla', 12, 13, 'common'),
    clashRoyaleCard(26000037, 'Hog Rider', 13, 13, 'rare'),
  ];
  const battles: ClashRoyaleData['recentBattles'] = [];
  const rng = mulberry32(4242);
  for (let i = 0; i < 12; i++) {
    const won = rng() > 0.42;
    battles.push({
      battleTime: isoDaysAgo(now, i * 0.6),
      type: 'PvP', result: won ? 'win' : 'loss',
      crownsFor: won ? 1 + Math.round(rng() * 2) : Math.round(rng() * 1),
      crownsAgainst: won ? Math.round(rng() * 1) : 1 + Math.round(rng() * 2),
      opponentName: ['Ragnar', 'Freya', 'Bjorn', 'Astrid', 'Leif'][i % 5],
      trophyChange: won ? 24 + Math.round(rng() * 8) : -(24 + Math.round(rng() * 8)),
    });
  }
  return {
    profile: {
      tag: '#YOURTAG', name: 'yourname', expLevel: 47, trophies: 6842, bestTrophies: 7010,
      wins: 3420, losses: 3180, threeCrownWins: 890, battleCount: 6600,
      arenaName: 'Legendary Arena', clanName: 'Northern Lights', clanTag: '#CLANTAG', clanScore: 52_300,
      pathOfLegends: { leagueNumber: 7, trophies: 4820, rank: 1240 },
    },
    currentDeck: deck,
    towerTroop: clashRoyaleCard(26000050, 'Cannoneer', 6, 9, 'common'),
    recentBattles: battles,
  };
}

// ── Valorant ─────────────────────────────────────────────────────────────────────────────────

function valorant(now: Date): ValorantData {
  const rng = mulberry32(777);
  const agents = ['Jett', 'Omen', 'Sova', 'Reyna', 'Killjoy'];
  const maps = ['Ascent', 'Bind', 'Haven', 'Lotus', 'Pearl', 'Sunset'];
  const recentMatches: ValorantData['recentMatches'] = [];
  for (let i = 0; i < 10; i++) {
    const won = rng() > 0.45;
    const kills = 12 + Math.round(rng() * 16);
    recentMatches.push({
      matchId: `match-${i}`, map: maps[i % maps.length], mode: 'Competitive',
      startedAt: isoDaysAgo(now, i * 0.9),
      result: won ? 'win' : 'loss',
      roundsWon: won ? 13 : 8 + Math.round(rng() * 4),
      roundsLost: won ? 8 + Math.round(rng() * 4) : 13,
      agentName: agents[i % agents.length],
      score: kills * 27 + Math.round(rng() * 40),
      kills, deaths: 10 + Math.round(rng() * 8), assists: 3 + Math.round(rng() * 6),
      headshots: Math.round(kills * 0.3), bodyshots: Math.round(kills * 0.6), legshots: Math.round(kills * 0.1),
      damageDealt: kills * 145 + Math.round(rng() * 800), damageReceived: 1800 + Math.round(rng() * 900),
      actShort: 'e10a2', isMatchMvp: i === 0, isTeamMvp: i === 0 || i === 3,
    });
  }
  return {
    profile: { name: 'yourname', tag: 'NA1', region: 'eu', accountLevel: 187 },
    rank: { tierId: 21, tierName: 'Ascendant 2', rr: 62, lastChange: 18, leaderboardRank: null },
    peak: { tierName: 'Immortal 1', seasonShort: 'e8a1' },
    currentSeason: { wins: 34, games: 61 },
    recentMatches,
    history: { matches: recentMatches, totalMatchesAvailable: 412, fetchedAt: iso(now, 0), currentActShort: 'e10a2' },
  };
}

// ── Hue ──────────────────────────────────────────────────────────────────────────────────────

function hue(): HueData {
  return {
    lights: [
      { id: 'l1', name: 'Living room lamp', on: true, brightness: 72, reachable: true },
      { id: 'l2', name: 'Desk lamp', on: true, brightness: 55, reachable: true },
      { id: 'l3', name: 'Bedroom ceiling', on: false, brightness: 40, reachable: true },
      { id: 'l4', name: 'Hallway', on: false, brightness: 20, reachable: true },
    ],
    rooms: [
      { id: 'r1', name: 'Living room', anyOn: true },
      { id: 'r2', name: 'Bedroom', anyOn: false },
    ],
    scenes: [
      { id: 's1', name: 'Relax', room: 'Living room', colors: ['#f7b955', '#f2914a'] },
      { id: 's2', name: 'Focus', room: 'Living room', colors: ['#bfe4ff', '#ffffff'] },
      { id: 's3', name: 'Night', room: 'Bedroom', colors: ['#5a3ea8', '#28204f'] },
    ],
  };
}

// ── Transit ──────────────────────────────────────────────────────────────────────────────────

function transit(now: Date): TransitData {
  const departure = (minutesFromNow: number, realtime: boolean) => {
    const aimed = new Date(now.getTime() + minutesFromNow * 60_000);
    const expected = realtime ? new Date(aimed.getTime() + (minutesFromNow % 2 === 0 ? 60_000 : 0)) : aimed;
    return { aimedTime: aimed.toISOString(), expectedTime: expected.toISOString(), realtime };
  };
  return {
    stops: [
      {
        id: 'NSR:StopPlace:41613', name: 'Jernbanetorget', distanceMeters: 180,
        departures: [
          { line: '12', destination: 'Majorstuen', mode: 'tram', color: '#0072ce', ...departure(3, true) },
          { line: '2', destination: 'Ellingsrudåsen', mode: 'metro', color: '#e6231e', ...departure(7, true) },
          { line: '17', destination: 'Rikshospitalet', mode: 'tram', color: '#0072ce', ...departure(12, false) },
        ],
      },
      {
        id: 'NSR:StopPlace:43501', name: 'Stortinget', distanceMeters: 420,
        departures: [
          { line: '31', destination: 'Fornebu', mode: 'bus', color: '#e6231e', ...departure(5, true) },
          { line: '4', destination: 'Bergkrystallen', mode: 'metro', color: '#e6231e', ...departure(9, true) },
        ],
      },
    ],
  };
}

// ── Power ────────────────────────────────────────────────────────────────────────────────────

function powerHours(now: Date, dayOffset: number, rng: () => number) {
  return Array.from({ length: 24 }, (_, hour) => {
    const time = new Date(now);
    time.setDate(time.getDate() + dayOffset);
    time.setHours(hour, 0, 0, 0);
    const base = hour >= 7 && hour <= 9 ? 1.4 : hour >= 17 && hour <= 20 ? 1.6 : hour >= 0 && hour <= 5 ? 0.4 : 0.8;
    return { time: time.toISOString(), hourLabel: String(hour).padStart(2, '0'), priceNokPerKwh: Math.max(0.05, Math.round((base + (rng() - 0.5) * 0.3) * 100) / 100) };
  });
}

function power(now: Date): PowerData {
  const rng = mulberry32(555);
  return { area: 'NO1', today: powerHours(now, 0, rng), tomorrow: now.getHours() >= 13 ? powerHours(now, 1, rng) : [] };
}

// ── System ───────────────────────────────────────────────────────────────────────────────────

function system(now: Date): SystemData {
  return {
    hostname: 'demo-mac', platform: 'darwin', nodeVersion: 'v22.11.0',
    uptimeSeconds: 3 * 86_400 + 4 * 3_600, timezone: 'Europe/Oslo',
    serverTime: hhmm(now),
  };
}

// ── Command center (hand-composed hero/secondary/tiles referencing the fixtures above) ─────────

function commandCenter(now: Date, cal: CalendarData, hlth: HealthData): CommandCenterData {
  const heroEvent = cal.events.find((e) => Date.parse(e.end) > now.getTime()) ?? cal.events[0];
  return {
    hero: {
      id: 'calendar:hero', source: 'calendar', kind: 'calendar', kicker: 'Coming up', title: heroEvent.title,
      detail: heroEvent.description ?? heroEvent.location ?? '', href: '#/personal', score: 100,
      render: { type: 'calendar-event', eventId: heroEvent.id },
    },
    secondary: [
      {
        id: 'spotify:now-playing', source: 'spotify', kind: 'spotify', kicker: 'Now playing', title: 'Levitating',
        detail: 'Dua Lipa', href: '#/spotify', score: 90, render: { type: 'spotify-now-playing' },
      },
      {
        id: 'weather:signal', source: 'weather', kind: 'weather', kicker: 'Weather', title: '18°C, partly cloudy',
        detail: 'Light rain expected this evening', href: '#/weather', score: 70,
        render: { type: 'weather-signal', kind: 'rain' },
      },
      {
        id: 'gmail:threads', source: 'gmail', kind: 'gmail', kicker: 'Inbox', title: '5 unread',
        detail: 'Newsletter, GitHub review request and 3 more', href: '#/personal', score: 60,
        render: { type: 'gmail-threads', threadIds: ['t1', 't2', 't4'] },
      },
    ],
    tiles: [
      {
        id: 'health:rings', source: 'health', kind: 'health', kicker: 'Today', title: `${hlth.today?.steps ?? 0} steps`,
        detail: 'On track for your goals', href: '#/health', score: 80, render: { type: 'health-rings' },
      },
      {
        id: 'github:contributions', source: 'github', kind: 'github', kicker: 'GitHub', title: '3 commits today',
        detail: 'personal-dashboard', href: '#/github', score: 75, render: { type: 'github-contributions' },
      },
      {
        id: 'ai-usage:claude', source: 'ai-usage', kind: 'ai-usage', kicker: 'Claude', title: '54% of 5h window',
        detail: 'Resets in 2h', href: '#/ai', score: 65, accent: 'claude', meter: 54,
        render: { type: 'ai-usage-tool', toolIds: ['claude'], metric: 'fiveHour' },
      },
    ],
  };
}

// ── Assembly ─────────────────────────────────────────────────────────────────────────────────

export function buildDemoEnvelopes(now: Date): Record<string, WidgetEnvelope> {
  const cal = calendar(now);
  const hlth = health(now);
  const { claude, codex } = aiUsage(now);

  return {
    system: envelope('system', system(now), now, 60_000),
    weather: envelope('weather', weather(now), now, 10 * 60_000),
    calendar: envelope('calendar', cal, now, 5 * 60_000),
    gmail: envelope('gmail', gmail(now), now, 5 * 60_000),
    imessage: envelope('imessage', imessage(now), now, 60_000),
    news: envelope('news', news(now), now, 15 * 60_000),
    'ai-news': envelope('ai-news', aiNews(now), now, 15 * 60_000),
    hue: envelope('hue', hue(), now, 30_000),
    transit: envelope('transit', transit(now), now, 30_000),
    power: envelope('power', power(now), now, 15 * 60_000),
    health: envelope('health', hlth, now, 5 * 60_000),
    github: envelope('github', github(now), now, 5 * 60_000),
    'sonar-cloud': envelope('sonar-cloud', sonarCloud(now), now, 15 * 60_000),
    'ai-usage-claude': envelope('ai-usage-claude', claude, now, 15 * 60_000),
    'ai-usage-codex': envelope('ai-usage-codex', codex, now, 30_000),
    spotify: envelope('spotify', spotify(now), now, 30_000),
    steam: envelope('steam', steam(now), now, 5 * 60_000),
    roblox: envelope('roblox', roblox(now), now, 60_000),
    'clash-royale': envelope('clash-royale', clashRoyale(now), now, 5 * 60_000),
    valorant: envelope('valorant', valorant(now), now, 5 * 60_000),
    'command-center': envelope('command-center', commandCenter(now, cal, hlth), now, 60_000),
  };
}
