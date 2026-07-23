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
import {
  buildSpotifyRotation,
  daysFromNowAt,
  dateDaysAgo,
  healthDayFor,
  hhmm,
  iso,
  isoDaysAgo,
  mulberry32,
  usageHistoryFor,
  MANUAL_ARTIST_IMAGES,
  MANUAL_ALBUM_IMAGES,
  ARTIST_NAMES,
  TRACKS,
  ONE_OFFS,
} from '@personal-dashboard/shared';
import { clashRoyaleCardArt, CLASH_ROYALE_DEMO_CLAN_BADGE_URL } from '../lib/clashRoyale';
import { valorantAgentIconUrl, valorantTierIconUrl, VALORANT_DEMO_CARD_WIDE_ART, VALORANT_DEMO_CARD_LARGE_ART } from '../lib/valorant';

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

  // Each hour's condition, independent of what real clock hour it happens to land on — the
  // hourLabel and day/night symbol suffix below are derived from the real timestamp instead of
  // hardcoded, so the sky-preview slider (which scrubs by real time, not by this label) never
  // shows a label that disagrees with whether the sun is actually supposed to be up then.
  const hourConditions: { base: string; precipitationMm: number; uvIndex: number; windSpeed: number; humidity: number; tempDelta: number }[] = [
    { base: 'partlycloudy', precipitationMm: 0, uvIndex: 4.2, windSpeed: 2.4, humidity: 57, tempDelta: 0 },
    { base: 'clearsky', precipitationMm: 0, uvIndex: 4.6, windSpeed: 2.6, humidity: 55, tempDelta: 1 },
    { base: 'clearsky', precipitationMm: 0, uvIndex: 3.8, windSpeed: 2.9, humidity: 55, tempDelta: 1 },
    { base: 'fair', precipitationMm: 0.1, uvIndex: 2.4, windSpeed: 3.1, humidity: 60, tempDelta: -1 },
    { base: 'lightrain', precipitationMm: 0.3, uvIndex: 1.5, windSpeed: 3.4, humidity: 64, tempDelta: -2 },
    { base: 'rain', precipitationMm: 0.8, uvIndex: 0.7, windSpeed: 3.8, humidity: 70, tempDelta: -3 },
    { base: 'lightrain', precipitationMm: 0.4, uvIndex: 0.2, windSpeed: 3.2, humidity: 72, tempDelta: -4 },
    { base: 'partlycloudy', precipitationMm: 0, uvIndex: 0, windSpeed: 2.4, humidity: 71, tempDelta: -4 },
    { base: 'fair', precipitationMm: 0, uvIndex: 0, windSpeed: 2.0, humidity: 73, tempDelta: -5 },
    { base: 'clearsky', precipitationMm: 0, uvIndex: 0, windSpeed: 1.8, humidity: 75, tempDelta: -5 },
    { base: 'clearsky', precipitationMm: 0, uvIndex: 0, windSpeed: 1.6, humidity: 76, tempDelta: -6 },
    { base: 'clearsky', precipitationMm: 0, uvIndex: 0, windSpeed: 1.5, humidity: 77, tempDelta: -6 },
  ];
  const hours = hourConditions.map((condition, index) => {
    const at = new Date(now.getTime() + (index + 1) * 3_600_000);
    const isDay = at.getTime() >= sunrise.getTime() && at.getTime() <= sunset.getTime();
    return {
      time: at.toISOString(),
      hourLabel: String(at.getHours()).padStart(2, '0'),
      temperature: 18 + condition.tempDelta,
      precipitationMm: condition.precipitationMm,
      uvIndex: isDay ? condition.uvIndex : 0,
      windSpeed: condition.windSpeed,
      humidity: condition.humidity,
      symbol: `${condition.base}_${isDay ? 'day' : 'night'}`,
    };
  });
  return {
    location: { lat: 59.91, lon: 10.75, name: 'Oslo' },
    current: {
      temperature: 18, windSpeed: 2.6, windDirectionDeg: 224, humidity: 58, uvIndex: 4.2,
      precipitationMm: 0, symbol: 'partlycloudy_day',
    },
    hours,
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
  add('Grocery run', 'Personal', 0, 17, 30, 30, { location: 'Meny Grünerløkka', description: 'Restock the week — fridge, produce, coffee' });
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
      { id: 'c6', label: 'Jordan', lastMessage: 'Are we still on for the gym tomorrow?', isFromMe: false, timestamp: iso(now, -27), unreadCount: 1 },
      { id: 'c7', label: 'Casey', lastMessage: 'Thanks for the recommendation, loved it', isFromMe: false, timestamp: iso(now, -35), unreadCount: 0 },
      { id: 'c8', label: 'Landlord', lastMessage: 'Reminder: maintenance visit on Thursday', isFromMe: false, timestamp: iso(now, -48), unreadCount: 0 },
      { id: 'c9', label: 'Mom', lastMessage: 'Call me when you get a chance ❤️', isFromMe: false, timestamp: iso(now, -60), unreadCount: 1 },
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
      { title: 'Ask HN: What self-hosted tools have replaced a SaaS subscription for you?', source: 'Hacker News', url: '#', publishedAt: iso(now, -26) },
      { title: 'The case against infinite scroll', source: 'Hacker News', url: '#', publishedAt: iso(now, -33) },
      { title: 'Tailscale raises new funding round to expand mesh networking', source: 'Hacker News', url: '#', publishedAt: iso(now, -40) },
      { title: 'Why we moved off Kubernetes for a three-person team', source: 'Hacker News', url: '#', publishedAt: iso(now, -48) },
      { title: 'A weekend rebuilding my home network from scratch', source: 'Hacker News', url: '#', publishedAt: iso(now, -55) },
      { title: 'SQLite is probably the database you should have started with', source: 'Hacker News', url: '#', publishedAt: iso(now, -63) },
      { title: 'The quiet resurgence of desktop apps', source: 'Hacker News', url: '#', publishedAt: iso(now, -70) },
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
      { title: 'Claude Agent SDK adds durable subagent scheduling', source: 'Anthropic', url: '#', publishedAt: iso(now, -54), provider: 'anthropic' },
      { title: 'OpenAI details new evals for long-horizon agent tasks', source: 'OpenAI', url: '#', publishedAt: iso(now, -18), provider: 'openai' },
      { title: 'Anthropic publishes new interpretability research on agentic planning', source: 'Anthropic', url: '#', publishedAt: iso(now, -66), provider: 'anthropic' },
      { title: 'OpenAI opens up fine-tuning for the latest Codex models', source: 'OpenAI', url: '#', publishedAt: iso(now, -78), provider: 'openai' },
    ],
  };
}

// ── Health ───────────────────────────────────────────────────────────────────────────────────

function health(now: Date): HealthData {
  const rng = mulberry32(20260714);
  const history = Array.from({ length: 30 }, (_, i) => healthDayFor(now, 29 - i, rng));
  const today = { ...healthDayFor(now, 0, rng), date: dateDaysAgo(now, 0), exerciseMinutes: 23 };
  const restingAvg = history.reduce((sum, d) => sum + d.restingHeartRate!, 0) / history.length;
  const todayResting = today.restingHeartRate!;
  return {
    today, history, updatedAt: iso(now, 0),
    goals: { steps: 9000, activeEnergyKcal: 500, exerciseMinutes: 30, standHours: 12 },
    baseline: {
      windowDays: 30, minimumSamples: 7,
      metrics: {
        restingHeartRate: {
          average: Math.round(restingAvg * 10) / 10, current: todayResting,
          deviationPercent: Math.round(((todayResting - restingAvg) / restingAvg) * 1000) / 10,
          samples: history.length, direction: todayResting >= restingAvg ? 'above' : 'below', anomalous: false,
        },
      },
    },
  };
}

// ── AI usage (Claude / Codex) ────────────────────────────────────────────────────────────────

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

function spotify(now: Date): SpotifyData {
  const artistImages = Object.fromEntries(ARTIST_NAMES.map((name) => [name, MANUAL_ARTIST_IMAGES[name]]));
  const albumImages = new Map<string, string>();
  for (const t of [...TRACKS, ...ONE_OFFS]) {
    if (!albumImages.has(t.album)) albumImages.set(t.album, MANUAL_ALBUM_IMAGES[t.album] ?? fallbackArt(t.album));
  }
  return buildSpotifyRotation(now, artistImages, albumImages);
}

/** The three tracks the command-center "now playing" secondary cycles through, with real track
 * lengths so the rotation timing looks plausible. Kept small and separate from the full
 * TRACKS/ONE_OFFS rotation above — this only needs to answer "what's playing right now", computed
 * fresh on every poll from the real clock (see api.ts), not baked into the fixture snapshot once
 * at page load, which is what let the old static nowPlaying freeze at 100% once the track "ended"
 * and never advance. */
const NOW_PLAYING_ROTATION = [
  { track: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', durationMs: 200_040 },
  { track: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', durationMs: 203_064 },
  { track: 'HUMBLE.', artist: 'Kendrick Lamar', album: 'DAMN.', durationMs: 177_000 },
];

export function spotifyNowPlayingAt(now: Date): SpotifyData['nowPlaying'] {
  const totalMs = NOW_PLAYING_ROTATION.reduce((sum, track) => sum + track.durationMs, 0);
  let elapsed = now.getTime() % totalMs;
  for (const track of NOW_PLAYING_ROTATION) {
    if (elapsed < track.durationMs) {
      return {
        track: track.track, artist: track.artist, album: track.album,
        imageUrl: MANUAL_ALBUM_IMAGES[track.album] ?? fallbackArt(track.album),
        isPlaying: true, progressMs: Math.round(elapsed), durationMs: track.durationMs,
      };
    }
    elapsed -= track.durationMs;
  }
  const [first] = NOW_PLAYING_ROTATION;
  return {
    track: first.track, artist: first.artist, album: first.album,
    imageUrl: MANUAL_ALBUM_IMAGES[first.album] ?? fallbackArt(first.album),
    isPlaying: true, progressMs: 0, durationMs: first.durationMs,
  };
}

// ── Steam ────────────────────────────────────────────────────────────────────────────────────

const steamHeaderUrl = (appId: number) => `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
// The real iconUrl Steam's API returns is derived from appid + an account-specific img_icon_url
// hash that doesn't exist for a fake account — the library cover art is a real, hash-free asset
// keyed only by appId, so it stands in for the per-account icon everywhere iconUrl is used
// (achievement progress ring, library grid tiles) instead of leaving those spots blank.
const steamIconUrl = (appId: number) => `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;

function steamGame(appId: number, name: string, foreverMin: number, recentMin: number) {
  return { appId, name, headerUrl: steamHeaderUrl(appId), iconUrl: steamIconUrl(appId), playtimeForeverMinutes: foreverMin, playtimeRecentMinutes: recentMin };
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
        { apiName: 'ACH_MALENIA', displayName: 'Shardbearer Malenia', description: 'Defeated Malenia, Blade of Miquella.', iconUrl: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/1245620/f704fcd82daf933dd3ce81c4d8ffea3ec65f26f4.jpg', unlockedAt: iso(now, -20), globalUnlockedPercent: 8.4 },
        { apiName: 'ACH_RADAHN', displayName: 'Shardbearer Radahn', description: 'Defeated Starscourge Radahn.', iconUrl: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/1245620/f5f1f41ef749459d9ac45750cd1f069d05fe1dd8.jpg', unlockedAt: iso(now, -70), globalUnlockedPercent: 22.1 },
        { apiName: 'ACH_GODRICK', displayName: 'Shardbearer Godrick', description: 'Defeated Godrick the Grafted.', iconUrl: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/1245620/1e230f1a87d7139e854c47e52337f9d50856ac64.jpg', unlockedAt: iso(now, -200), globalUnlockedPercent: 61.3 },
      ],
      rarest: [
        { apiName: 'ACH_MALENIA', displayName: 'Shardbearer Malenia', description: 'Defeated Malenia, Blade of Miquella.', iconUrl: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/1245620/f704fcd82daf933dd3ce81c4d8ffea3ec65f26f4.jpg', unlockedAt: iso(now, -20), globalUnlockedPercent: 8.4 },
        { apiName: 'ACH_RADAHN', displayName: 'Shardbearer Radahn', description: 'Defeated Starscourge Radahn.', iconUrl: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/1245620/f5f1f41ef749459d9ac45750cd1f069d05fe1dd8.jpg', unlockedAt: iso(now, -70), globalUnlockedPercent: 22.1 },
      ],
      nextEasiest: [
        { apiName: 'ACH_ROUNDTABLE', displayName: 'Roundtable Hold', description: 'Arrived at the Roundtable Hold.', iconUrl: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/1245620/f4e5fd19d3410470709632cd02b3136b5baca33d.jpg', globalUnlockedPercent: 94.2 },
        { apiName: 'ACH_GREATRUNE', displayName: 'Great Rune', description: 'Acquired a Great Rune.', iconUrl: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/1245620/3881b1c355ffcc122655c134f988d6c1265cd8c9.jpg', globalUnlockedPercent: 88.7 },
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
    presence: {
      status: 'in-game', gameName: 'Jailbreak', lastOnline: iso(now, 0),
      iconUrl: 'https://pbs.twimg.com/media/GClJFhnWIAAoJek.jpg',
      thumbnailUrl: 'https://pbs.twimg.com/media/GClJFhnWIAAoJek.jpg',
      playing: 214_000, visits: 42_800_000_000,
    },
    availability: 'available',
  };
}

// ── Clash Royale ─────────────────────────────────────────────────────────────────────────────

function clashRoyaleCard(id: number, name: string, level: number, maxLevel: number, rarity: string) {
  return { id, name, level, maxLevel, rarity, iconUrl: clashRoyaleCardArt(name) };
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
    // A battle's crown score is never a draw in Clash Royale ladder play — keep crownsFor/
    // crownsAgainst strictly on the winning side's side of the result, or a "win" can roll a
    // scoreline like 1-1 that reads as a tie even though the result field says otherwise.
    let crownsFor = won ? 1 + Math.round(rng() * 2) : Math.round(rng() * 1);
    let crownsAgainst = won ? Math.round(rng() * 1) : 1 + Math.round(rng() * 2);
    if (won) crownsAgainst = Math.min(crownsAgainst, crownsFor - 1);
    else crownsFor = Math.min(crownsFor, crownsAgainst - 1);
    battles.push({
      battleTime: isoDaysAgo(now, i * 0.6),
      type: 'PvP', result: won ? 'win' : 'loss',
      crownsFor, crownsAgainst,
      opponentName: ['Ragnar', 'Freya', 'Bjorn', 'Astrid', 'Leif'][i % 5],
      trophyChange: won ? 24 + Math.round(rng() * 8) : -(24 + Math.round(rng() * 8)),
    });
  }
  return {
    profile: {
      tag: '#YOURTAG', name: 'yourname', expLevel: 47, trophies: 9127, bestTrophies: 9127,
      wins: 3420, losses: 3180, threeCrownWins: 890, battleCount: 6600,
      arenaName: 'Legendary Arena', clanName: 'Northern Lights', clanTag: '#CLANTAG', clanScore: 52_300,
      clanBadgeUrl: CLASH_ROYALE_DEMO_CLAN_BADGE_URL,
      pathOfLegends: { leagueNumber: 1, trophies: 4820, rank: 1240 },
    },
    currentDeck: deck,
    towerTroop: clashRoyaleCard(26000050, 'Cannoneer', 6, 9, 'common'),
    recentBattles: battles,
  };
}

// ── Valorant ─────────────────────────────────────────────────────────────────────────────────

function valorantMatchesFor(
  now: Date,
  rng: () => number,
  count: number,
  daysAgoStart: number,
  daysAgoStep: number,
  actShort: string,
  idPrefix: string,
): ValorantData['recentMatches'] {
  const agents = ['Jett', 'Omen', 'Sova', 'Reyna', 'Killjoy'];
  const maps = ['Ascent', 'Bind', 'Haven', 'Lotus', 'Pearl', 'Sunset'];
  const matches: ValorantData['recentMatches'] = [];
  for (let i = 0; i < count; i++) {
    const won = rng() > 0.45;
    const kills = 12 + Math.round(rng() * 16);
    matches.push({
      matchId: `${idPrefix}-${i}`, map: maps[i % maps.length], mode: 'Competitive',
      startedAt: isoDaysAgo(now, daysAgoStart + i * daysAgoStep),
      result: won ? 'win' : 'loss',
      roundsWon: won ? 13 : 8 + Math.round(rng() * 4),
      roundsLost: won ? 8 + Math.round(rng() * 4) : 13,
      agentName: agents[i % agents.length],
      agentIconUrl: valorantAgentIconUrl(agents[i % agents.length]),
      score: kills * 27 + Math.round(rng() * 40),
      kills, deaths: 10 + Math.round(rng() * 8), assists: 3 + Math.round(rng() * 6),
      headshots: Math.round(kills * 0.3), bodyshots: Math.round(kills * 0.6), legshots: Math.round(kills * 0.1),
      damageDealt: kills * 145 + Math.round(rng() * 800), damageReceived: 1800 + Math.round(rng() * 900),
      actShort, isMatchMvp: i === 0, isTeamMvp: i === 0 || i === 3,
    });
  }
  return matches;
}

function valorant(now: Date): ValorantData {
  const rng = mulberry32(777);
  // Current-act matches stay inside the last two weeks so the "2 weeks" / "Current act" period
  // options genuinely differ from "Career" once the previous act's matches are added below —
  // with everything crammed into one act inside 14 days, every period showed the same matches
  // and the period dropdown looked broken even though it was working correctly.
  const currentActMatches = valorantMatchesFor(now, rng, 10, 0.5, 0.9, 'e10a2', 'match');
  const previousActMatches = valorantMatchesFor(now, rng, 8, 26, 2.1, 'e9a3', 'archive');
  const wins = currentActMatches.filter((match) => match.result === 'win').length;
  return {
    profile: {
      name: 'yourname', tag: 'EUW', region: 'eu', accountLevel: 433,
      cardIconUrl: VALORANT_DEMO_CARD_WIDE_ART, cardBannerUrl: VALORANT_DEMO_CARD_LARGE_ART,
    },
    rank: { tierId: 22, tierName: 'Ascendant 2', tierIconUrl: valorantTierIconUrl(22), rr: 62, lastChange: 18, leaderboardRank: null },
    peak: { tierName: 'Immortal 1', tierIconUrl: valorantTierIconUrl(24), seasonShort: 'e8a1' },
    currentSeason: { wins, games: currentActMatches.length },
    recentMatches: currentActMatches,
    history: {
      matches: [...currentActMatches, ...previousActMatches],
      totalMatchesAvailable: 18, fetchedAt: iso(now, 0), currentActShort: 'e10a2',
    },
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
    const delayMs = minutesFromNow % 2 === 0 ? 60_000 : 0;
    const expected = realtime ? new Date(aimed.getTime() + delayMs) : aimed;
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

function powerPriceBase(hour: number): number {
  if (hour >= 7 && hour <= 9) return 1.4;
  if (hour >= 17 && hour <= 20) return 1.6;
  if (hour >= 0 && hour <= 5) return 0.4;
  return 0.8;
}

function powerHours(now: Date, dayOffset: number, rng: () => number) {
  return Array.from({ length: 24 }, (_, hour) => {
    const time = new Date(now);
    time.setDate(time.getDate() + dayOffset);
    time.setHours(hour, 0, 0, 0);
    const base = powerPriceBase(hour);
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
        id: 'roblox:now-playing', source: 'roblox', kind: 'roblox', kicker: 'Roblox', title: 'Jailbreak',
        detail: 'In game right now', href: 'https://www.roblox.com/home', score: 70,
        render: { type: 'roblox-now-playing' },
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
