import type {
  AiNewsData,
  AiUsageToolData,
  CalendarData,
  ClashRoyaleBattle,
  ClashRoyaleData,
  GitHubData,
  GmailData,
  HealthData,
  HueData,
  IMessageData,
  NewsData,
  PowerData,
  PowerHour,
  RobloxData,
  SpotifyData,
  SteamData,
  TransitData,
  UsageHistoryPoint,
  WeatherData,
  WidgetStatus,
} from '@personal-dashboard/shared';
import { pathOfLegendsDisplayLeagueNumber } from '@personal-dashboard/shared';
import { computeDeviation } from '../deviation.js';

import type { Candidate, ClashRoyaleMoments, SteamMoments } from './types.js';

const allShapes = ['hero', 'secondary', 'tile'] as const;

// forecast.dayLabel is abbreviated for the widget's narrow column; card copy reads better with the full name.
const weekdayFullFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' });

function hasActivityData(day: HealthData['history'][number]): boolean {
  return [day.steps, day.activeEnergyKcal, day.exerciseMinutes, day.standHours]
    .some((value) => value !== undefined && value > 0);
}

function activitySummary(day: HealthData['history'][number]): { title: string; detail: string } {
  if (day.steps !== undefined) {
    return {
      title: `${Math.round(day.steps).toLocaleString()} steps`,
      detail: 'Open Health for the full activity rings',
    };
  }
  if (day.activeEnergyKcal !== undefined) {
    return {
      title: `${Math.round(day.activeEnergyKcal)} active kcal`,
      detail: [
        day.exerciseMinutes !== undefined && `${Math.round(day.exerciseMinutes)} min exercise`,
        day.standHours !== undefined && `${Math.round(day.standHours)} stand hrs`,
      ].filter((value): value is string => Boolean(value)).join(' · ') || 'Open Health for the full activity rings',
    };
  }
  if (day.exerciseMinutes !== undefined) return { title: `${Math.round(day.exerciseMinutes)} min exercise`, detail: 'Open Health for the full activity rings' };
  return { title: `${Math.round(day.standHours ?? 0)} stand hrs`, detail: 'Open Health for the full activity rings' };
}

export function calendarCandidates(data: CalendarData | undefined, now: number): Candidate[] {
  const events = data?.events.filter((event) => Date.parse(event.end) >= now) ?? [];
  const next = events[0];
  const agenda = events.slice(1, 5);
  const candidates: Candidate[] = [];
  if (next) {
    candidates.push({
      id: `calendar:event:${next.id}`, source: 'calendar', kind: 'calendar', score: 96, shapes: [...allShapes],
      kicker: 'Next on deck', title: next.title,
      detail: [next.location, next.description].filter((detail): detail is string => Boolean(detail)).join(' · ')
        || (next.allDay ? 'An all-day marker on your calendar' : `${next.startLabel}–${next.endLabel}`),
      href: '#/personal/calendar', render: { type: 'calendar-event', eventId: next.id },
    });
  }
  if (agenda.length) {
    candidates.push({
      id: `calendar:agenda:${agenda.map((event) => event.id).join(',')}`, source: 'calendar', kind: 'calendar', score: 78,
      shapes: ['secondary', 'tile'], kicker: 'Coming up', title: `${agenda.length} more on your calendar`,
      detail: agenda[0].title, href: '#/personal/calendar', render: { type: 'calendar-agenda', eventIds: agenda.map((event) => event.id) },
    });
  }
  return candidates;
}

export function githubCandidates(
  data: GitHubData | undefined,
  baselineWindowDays: number,
  baselineDeviationPercent: number,
): Candidate[] {
  if (!data) return [];
  const reviews = data.pullRequests.filter((pr) => pr.role === 'review-requested');
  const days = data.contributions.days;
  const today = days.at(-1)?.count ?? 0;
  const candidates: Candidate[] = [];
  if (reviews.length) {
    candidates.push({
      id: `github:review:${reviews[0].repo}:${reviews[0].number}`, source: 'github', kind: 'github', score: 91,
      shapes: [...allShapes], kicker: reviews.length > 1 ? `${reviews.length} reviews waiting` : 'Review requested',
      title: reviews[0].title, detail: reviews[0].repo, href: '#/github', render: { type: 'github-reviews' },
    });
  }
  // Only an unusually HIGH day is a signal — a quiet day isn't a "code anomaly" worth surfacing.
  const priorCounts = days.slice(-(baselineWindowDays + 1), -1).map((day) => day.count);
  const deviation = computeDeviation(today, priorCounts, baselineDeviationPercent);
  if (deviation?.anomalous && deviation.direction === 'above') {
    candidates.push({
      id: 'github:contributions-anomaly', source: 'github', kind: 'github', score: 80, shapes: [...allShapes],
      kicker: 'Big day on GitHub', title: `${today} contributions today`,
      detail: `${deviation.deviationPercent.toFixed(0)}% above your usual ${deviation.average.toFixed(1)}/day`,
      href: '#/github', render: { type: 'github-contributions' },
    });
  }
  if (today > 0) {
    candidates.push({
      id: 'github:contributions', source: 'github', kind: 'github', score: 36,
      shapes: ['tile'], kicker: 'This week on GitHub',
      title: `${today} contribution${today === 1 ? '' : 's'} today`,
      detail: `${data.pullRequests.length} open pull requests`, href: '#/github', render: { type: 'github-contributions' },
    });
  } else {
    const recentWeek = days.slice(-7).reduce((total, day) => total + day.count, 0);
    if (recentWeek > 0) {
      candidates.push({
        id: 'github:recent-contributions', source: 'github', kind: 'github', score: 27, shapes: ['tile'],
        kicker: 'This week on GitHub', title: `${recentWeek} contribution${recentWeek === 1 ? '' : 's'} this week`,
        detail: 'Your recent contribution history', href: '#/github', render: { type: 'github-contributions' },
      });
    }
  }
  return candidates;
}

/**
 * Freshness/staleness are judged from the newest *unread* thread's own message date, not from
 * watching `unreadThreads` change across polls: that count alone can't tell "one arrived, one was
 * read" (net-zero, but genuinely new mail) apart from "nothing happened", and it can't tell
 * "count dropped because you read something" apart from "count rose because mail arrived" — both
 * looked identical as "the number changed" to an earlier version of this function. The Gmail API
 * returns threads newest-first, so the first unread entry in the list is the most recent one.
 * "Stale" means even that newest unread thread is old — a sign to stop nagging about it, not
 * promote it: most surviving unread mail (receipts, newsletters) was never going to be replied to.
 */
export function gmailCandidates(
  data: GmailData | undefined,
  freshThresholdMs: number,
  staleThresholdMs: number,
  now = Date.now(),
): Candidate[] {
  if (!data) return [];
  const newestUnread = data.threads.find((thread) => thread.unread);
  const hasUnread = data.unreadThreads > 0;
  const newestUnreadAgeMs = newestUnread ? now - Date.parse(newestUnread.date) : undefined;
  const fresh = hasUnread && newestUnreadAgeMs !== undefined && newestUnreadAgeMs < freshThresholdMs;
  const stale = hasUnread && newestUnreadAgeMs !== undefined && newestUnreadAgeMs >= staleThresholdMs;
  if (stale) return [];
  let score = hasUnread ? 53 : 20;
  let kicker = 'Inbox';
  const detail = newestUnread?.subject ?? 'No unread thread needs attention';
  let shapes: Candidate['shapes'] = ['tile'];
  if (fresh) {
    score = 78;
    kicker = 'New mail';
    shapes = [...allShapes];
  }
  const unreadIds = data.threads.filter((thread) => thread.unread).slice(0, 3).map((thread) => thread.id);
  return [{
    id: 'gmail:inbox', source: 'gmail', kind: 'gmail', score,
    shapes, kicker, title: `${data.unreadThreads} unread`, detail,
    href: '#/personal/gmail',
    render: unreadIds.length ? { type: 'gmail-threads', threadIds: unreadIds } : { type: 'text' },
  }];
}

export function imessageCandidates(data: IMessageData | undefined, freshMs: number): Candidate[] {
  const unread = data?.conversations.filter((conversation) => conversation.unreadCount > 0) ?? [];
  if (!unread.length) return [];
  const totalUnread = unread.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const latest = unread.reduce(
    (mostRecent, conversation) => (Date.parse(conversation.timestamp) > Date.parse(mostRecent.timestamp) ? conversation : mostRecent),
    unread[0]!,
  );
  const fresh = Date.now() - Date.parse(latest.timestamp) < freshMs;
  return [{
    id: 'imessage:unread', source: 'imessage', kind: 'imessage', score: fresh ? 76 : 40,
    shapes: fresh ? [...allShapes] : ['tile'], kicker: fresh ? 'New message' : 'Messages',
    title: `${totalUnread} unread`, detail: `${latest.label}: ${latest.lastMessage}`,
    href: '#/personal/imessage', render: { type: 'text' },
  }];
}

export function healthCandidates(data: HealthData | undefined): Candidate[] {
  if (!data) return [];
  const candidates: Candidate[] = [];
  const anomaly = Object.entries(data.baseline?.metrics ?? {}).find(([, metric]) => metric.anomalous);
  if (anomaly) {
    const [metric, value] = anomaly;
    candidates.push({
      id: `health:baseline:${metric}`, source: 'health', kind: 'health', score: 82, shapes: [...allShapes],
      kicker: 'Personal baseline', title: `${metric.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()} ${value.deviationPercent.toFixed(0)}% ${value.direction}`,
      detail: `${value.current.toFixed(0)} today · usual ${value.average.toFixed(0)} across ${value.samples} days`,
      href: '#/health', render: { type: 'text' },
    });
  }
  const steps = data.today?.steps;
  if (steps !== undefined && steps >= data.goals.steps) {
    candidates.push({
      id: 'health:steps-goal', source: 'health', kind: 'health', score: 63, shapes: ['secondary', 'tile'],
      kicker: 'Goal reached', title: `${Math.round(steps).toLocaleString()} steps`,
      detail: `${Math.round((steps / data.goals.steps) * 100)}% of your daily goal`, href: '#/health', render: { type: 'health-rings' },
    });
  }
  const hasTodayActivity = data.today !== null && hasActivityData(data.today);
  const activityDay = hasTodayActivity ? data.today : [...data.history].reverse().find(hasActivityData);
  if (activityDay) {
    const activity = activitySummary(activityDay);
    candidates.push({
      id: 'health:activity', source: 'health', kind: 'health', score: hasTodayActivity ? 32 : 34, shapes: ['tile'],
      kicker: hasTodayActivity ? "Today's activity" : 'Last synced activity',
      title: activity.title,
      detail: hasTodayActivity ? activity.detail : `From ${activityDay.date}`,
      href: '#/health', render: { type: 'health-rings' },
    });
  }
  return candidates;
}

/** Which top-N timeframe changed #1 recently — a personal dashboard cares whenever your music
 * taste shifts, not only on days GitHub is quiet. */
export interface SpotifyFreshness {
  trackShort: boolean;
  trackMedium: boolean;
  trackLong: boolean;
  trackAllTime: boolean;
  artistShort: boolean;
  artistMedium: boolean;
  artistLong: boolean;
  artistAllTime: boolean;
  albumAllTime: boolean;
}

type Timeframe = 'short' | 'medium' | 'long' | 'allTime';

/** Spotify's long_term window is approximately one year; short_term churns naturally and
 * shouldn't compete for hero with a meaningful annual shift. */
const TIMEFRAME_SCORE: Record<Timeframe, number> = { allTime: 90, long: 75, medium: 65, short: 60 };
const TIMEFRAME_SHAPES: Record<Timeframe, Candidate['shapes']> = {
  allTime: [...allShapes],
  long: [...allShapes],
  medium: ['secondary', 'tile'],
  short: ['secondary', 'tile'],
};
const TIMEFRAME_PERIOD: Record<Timeframe, string> = {
  allTime: 'of all time', long: 'this past year', medium: 'these last few months', short: 'this month',
};

export function spotifyCandidates(
  data: SpotifyData | undefined,
  fresh: SpotifyFreshness,
  recentPlayedMaxAgeMs: number,
): Candidate[] {
  if (!data) return [];
  const candidates: Candidate[] = [];

  const trackTiers: { key: Timeframe; track: SpotifyData['topTracks']['shortTerm'][number] | undefined; isFresh: boolean }[] = [
    { key: 'allTime', track: data.allTime.tracks[0], isFresh: fresh.trackAllTime },
    { key: 'long', track: data.topTracks.longTerm[0], isFresh: fresh.trackLong },
    { key: 'medium', track: data.topTracks.mediumTerm[0], isFresh: fresh.trackMedium },
    { key: 'short', track: data.topTracks.shortTerm[0], isFresh: fresh.trackShort },
  ];
  for (const tier of trackTiers) {
    if (!tier.track || !tier.isFresh) continue;
    candidates.push({
      id: `spotify:new-track:${tier.key}:${tier.track.id ?? tier.track.track}`, source: 'spotify', kind: 'spotify',
      score: TIMEFRAME_SCORE[tier.key], shapes: TIMEFRAME_SHAPES[tier.key],
      kicker: `New top track ${TIMEFRAME_PERIOD[tier.key]}`, title: tier.track.track, detail: tier.track.artist,
      href: '#/spotify', render: { type: 'spotify-track', trackId: tier.track.id ?? tier.track.track },
    });
  }

  const artistTiers: { key: Timeframe; artist: SpotifyData['topArtists']['shortTerm'][number] | undefined; isFresh: boolean }[] = [
    { key: 'allTime', artist: data.allTime.artists[0], isFresh: fresh.artistAllTime },
    { key: 'long', artist: data.topArtists.longTerm[0], isFresh: fresh.artistLong },
    { key: 'medium', artist: data.topArtists.mediumTerm[0], isFresh: fresh.artistMedium },
    { key: 'short', artist: data.topArtists.shortTerm[0], isFresh: fresh.artistShort },
  ];
  for (const tier of artistTiers) {
    if (!tier.artist || !tier.isFresh) continue;
    candidates.push({
      id: `spotify:new-artist:${tier.key}:${tier.artist.id ?? tier.artist.name}`, source: 'spotify', kind: 'spotify',
      score: TIMEFRAME_SCORE[tier.key], shapes: TIMEFRAME_SHAPES[tier.key],
      kicker: `New #1 artist · ${TIMEFRAME_PERIOD[tier.key]}`, title: tier.artist.name,
      detail: '',
      href: '#/spotify', render: { type: 'spotify-artist', artistId: tier.artist.id ?? tier.artist.name, timeframe: tier.key },
    });
  }

  const topAlbum = data.allTime.albums[0];
  if (topAlbum && fresh.albumAllTime) {
    candidates.push({
      id: `spotify:new-album:${topAlbum.id ?? topAlbum.name}`, source: 'spotify', kind: 'spotify',
      score: TIMEFRAME_SCORE.allTime, shapes: TIMEFRAME_SHAPES.allTime,
      kicker: 'New favorite album', title: topAlbum.name, detail: topAlbum.artist.split(',')[0]!.trim(),
      href: '#/spotify', render: { type: 'spotify-album', albumId: topAlbum.id ?? topAlbum.name },
    });
  }

  // No fresh change to headline — still worth a quiet tile naming your current favorite, but
  // only while the play itself is recent enough to still be "last played" and not a fixture.
  const recent = data.recentlyPlayed[0];
  const recentIsFresh = recent !== undefined && Date.now() - new Date(recent.playedAt).getTime() < recentPlayedMaxAgeMs;
  if (recent && recentIsFresh && !candidates.length) {
    candidates.push({
      id: `spotify:recent:${recent.id ?? recent.track}`, source: 'spotify', kind: 'spotify', score: 28, shapes: ['tile'],
      kicker: 'Last played', title: recent.track, detail: recent.artist,
      href: '#/spotify', render: { type: 'spotify-track', trackId: recent.id ?? recent.track },
    });
  }

  if (data.nowPlaying?.isPlaying) {
    candidates.push({
      id: 'spotify:now-playing', source: 'spotify', kind: 'spotify', score: 58, shapes: ['secondary', 'tile'],
      kicker: 'Now playing', title: data.nowPlaying.track, detail: data.nowPlaying.artist,
      href: '#/spotify', render: { type: 'spotify-now-playing' },
    });
  }
  return candidates;
}

export interface AiTool {
  id: string;
  label: string;
  data: AiUsageToolData | undefined;
}

type AiAccent = 'claude' | 'codex';

function aiAccent(tool: AiTool): AiAccent | undefined {
  return tool.id === 'claude' || tool.id === 'codex' ? tool.id : undefined;
}

/** A weekly window that just rolled over reads as a big same-sample drop, not a gradual decline. */
const RESET_DROP_PERCENT = 40;

/**
 * "09:00" when it lands today, "Thu 09:00" later in the week, "Wed 23 Jul" when it's near a full
 * week out — a bare weekday that far ahead reads as tomorrow, not seven days from now.
 */
function resetLabel(resetsAt: string, now = Date.now()): string {
  const reset = new Date(resetsAt);
  const time = reset.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (reset.toDateString() === new Date(now).toDateString()) return time;
  if (reset.getTime() - now >= 6 * 24 * 60 * 60_000) {
    return reset.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  return `${reset.toLocaleDateString('en-GB', { weekday: 'short' })} ${time}`;
}

function aiUsageRender(accents: (AiAccent | undefined)[], metric: 'fiveHour' | 'weekly'): Candidate['render'] {
  const toolIds = accents.filter((accent): accent is AiAccent => accent !== undefined);
  return toolIds.length ? { type: 'ai-usage-tool', toolIds, metric } : { type: 'text' };
}

function aiRunwayCandidate(available: AiTool[]): Candidate | undefined {
  const limits = available.flatMap((tool) => {
    const data = tool.data!;
    return [
      data.fiveHour && { label: tool.label, period: '5-hour limit', metric: 'fiveHour' as const, window: data.fiveHour, accent: aiAccent(tool) },
      data.weekly && { label: tool.label, period: 'weekly limit', metric: 'weekly' as const, window: data.weekly, accent: aiAccent(tool) },
      data.modelWeekly && { label: `${tool.label} ${data.modelWeekly.model}`, period: 'weekly limit', metric: 'weekly' as const, window: data.modelWeekly, accent: aiAccent(tool) },
    ].filter((limit): limit is { label: string; period: string; metric: 'fiveHour' | 'weekly'; window: NonNullable<typeof data.fiveHour>; accent: AiAccent | undefined } => Boolean(limit));
  });
  if (!limits.length) return undefined;

  const tightest = limits.reduce(
    (lowest, limit) => limit.window.usedPercent > lowest.window.usedPercent ? limit : lowest,
    limits[0]!,
  );
  const remaining = Math.max(0, Math.round(100 - tightest.window.usedPercent));
  return {
    id: 'ai-usage:runway', source: 'ai-usage', kind: 'ai-usage', score: remaining <= 15 ? 86 : 30,
    shapes: remaining <= 15 ? [...allShapes] : ['tile'], kicker: remaining <= 15 ? 'Running low' : 'AI runway',
    title: `${remaining}% available`, detail: `${tightest.label} · ${tightest.period} · resets ${resetLabel(tightest.window.resetsAt)}`,
    href: '#/ai', accent: tightest.accent, meter: remaining, render: aiUsageRender([tightest.accent], tightest.metric),
  };
}

interface WeeklyReset {
  tool: AiTool;
  /** Post-reset weekly percent. */
  usedPercent: number;
  drop: number;
  resetsAt: string | undefined;
}

function weeklyReset(tool: AiTool): WeeklyReset | undefined {
  const data = tool.data!;
  const last = data.history.at(-1);
  const prev = data.history.at(-2);
  if (last?.weeklyUsedPercent === undefined || prev?.weeklyUsedPercent === undefined) return undefined;
  const drop = prev.weeklyUsedPercent - last.weeklyUsedPercent;
  if (drop < RESET_DROP_PERCENT) return undefined;
  // Some providers zero the percentage before rolling resetsAt forward — an expired timestamp
  // isn't a clean-slate horizon, so treat it as unknown rather than saying "until <yesterday>".
  const resetsAt = data.weekly && Date.parse(data.weekly.resetsAt) > Date.now() ? data.weekly.resetsAt : undefined;
  return { tool, usedPercent: last.weeklyUsedPercent, drop, resetsAt };
}

/**
 * Weekly windows roll over on fixed schedules, so both tools resetting in the same sample is
 * systematic, not coincidence — and the ranker only ever seats one ai-usage candidate per board.
 * Merging keeps the second tool's reset from being silently dropped every week.
 */
function aiResetCandidates(available: AiTool[]): Candidate[] {
  const resets = available
    .map(weeklyReset)
    .filter((reset): reset is WeeklyReset => reset !== undefined);
  if (!resets.length) return [];
  if (resets.length === 1) {
    const reset = resets[0]!;
    return [{
      id: `ai-usage:reset:${reset.tool.id}`, source: 'ai-usage', kind: 'ai-usage', score: 65,
      shapes: ['secondary', 'tile'], kicker: 'Fresh allowance', title: `${reset.tool.label} usage just reset`,
      detail: reset.resetsAt
        ? `Back down to ${reset.usedPercent.toFixed(0)}% · clean slate until ${resetLabel(reset.resetsAt)}`
        : `Back down to ${reset.usedPercent.toFixed(0)}% of the weekly limit`,
      href: '#/ai', accent: aiAccent(reset.tool), render: aiUsageRender([aiAccent(reset.tool)], 'weekly'),
    }];
  }
  // Both resets landed within one sampling gap, so the next weekly resets normally all but
  // coincide — one shared "until X" reads cleanest. After a long gap (machine asleep) they can
  // genuinely diverge; then each tool gets its own time.
  const resetTimes = resets
    .map((reset) => reset.resetsAt)
    .filter((resetsAt): resetsAt is string => resetsAt !== undefined)
    .map((resetsAt) => Date.parse(resetsAt));
  const sharedReset = resetTimes.length === resets.length
    && Math.max(...resetTimes) - Math.min(...resetTimes) <= 60 * 60_000;
  const usageLabel = (reset: (typeof resets)[number]) => `${reset.tool.label} ${reset.usedPercent.toFixed(0)}%`;
  const detail = sharedReset
    ? `${resets.map(usageLabel).join(' · ')} · clean slates until ${resetLabel(resets[0]!.resetsAt!)}`
    : resets
      .map((reset) => {
        const untilSuffix = reset.resetsAt ? ` until ${resetLabel(reset.resetsAt)}` : '';
        return `${usageLabel(reset)}${untilSuffix}`;
      })
      .join(' · ');
  return [{
    id: `ai-usage:reset:${resets.map((reset) => reset.tool.id).sort((a, b) => a.localeCompare(b)).join('+')}`,
    source: 'ai-usage', kind: 'ai-usage', score: 66, shapes: ['secondary', 'tile'],
    kicker: 'Fresh allowance', title: `${resets.map((reset) => reset.tool.label).join(' & ')} usage just reset`,
    detail,
    href: '#/ai', render: aiUsageRender(resets.map((reset) => aiAccent(reset.tool)), 'weekly'),
  }];
}

/**
 * One average `fiveHourUsedPercent` per calendar day (UTC), oldest first. History points are
 * sampled every ~15 minutes (see `usageHistory.ts`), so slicing the raw array by `baselineWindowDays`
 * would take the last few hours, not the last few days — bucketing first keeps the unit the caller
 * actually asked for, matching how `githubCandidates` compares against trailing daily counts.
 */
function dailyFiveHourAverages(history: UsageHistoryPoint[]): number[] {
  const byDay = new Map<string, { sum: number; count: number }>();
  for (const point of history) {
    if (point.fiveHourUsedPercent === undefined) continue;
    const day = point.at.slice(0, 10);
    const bucket = byDay.get(day) ?? { sum: 0, count: 0 };
    bucket.sum += point.fiveHourUsedPercent;
    bucket.count += 1;
    byDay.set(day, bucket);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, { sum, count }]) => sum / count);
}

function aiToolCandidates(
  tool: AiTool,
  baselineWindowDays: number,
  baselineDeviationPercent: number,
): Candidate[] {
  const data = tool.data!;
  const candidates: Candidate[] = [];

  // fiveHour, not weekly: a cumulative weekly % naturally climbs through the week regardless of
  // pace, so comparing it against trailing samples would flag every Friday as "anomalous."
  const currentFiveHour = data.fiveHour?.usedPercent;
  if (currentFiveHour === undefined) return candidates;
  // Excludes today's (partial, still-forming) bucket, mirroring githubCandidates' own trailing window.
  const priorFiveHour = dailyFiveHourAverages(data.history).slice(-(baselineWindowDays + 1), -1);
  const deviation = computeDeviation(currentFiveHour, priorFiveHour, baselineDeviationPercent);
  if (deviation?.anomalous && deviation.direction === 'above') {
    candidates.push({
      id: `ai-usage:anomaly:${tool.id}`, source: 'ai-usage', kind: 'ai-usage', score: 75, shapes: [...allShapes],
      kicker: 'Heavy usage', title: `${tool.label} running well above usual`,
      detail: `${deviation.deviationPercent.toFixed(0)}% above your usual pace`, href: '#/ai', accent: aiAccent(tool), render: aiUsageRender([aiAccent(tool)], 'fiveHour'),
    });
  }
  return candidates;
}

export function aiCandidates(
  tools: AiTool[],
  baselineWindowDays: number,
  baselineDeviationPercent: number,
): Candidate[] {
  const available = tools.filter((tool) => tool.data?.available);
  const candidates: Candidate[] = [];

  const runway = aiRunwayCandidate(available);
  if (runway) candidates.push(runway);
  candidates.push(...aiResetCandidates(available));
  for (const tool of available) candidates.push(...aiToolCandidates(tool, baselineWindowDays, baselineDeviationPercent));

  return candidates;
}

/**
 * A fixed comfortable-range threshold, not a rolling personal baseline — WeatherData only carries
 * a forecast, no history to compare against, so "extreme" here just means "past a configured
 * line" rather than "unusual for you".
 */
const SEVERE_HORIZON_MS = 3 * 60 * 60_000;
const SEVERE_SYMBOLS: readonly [prefix: string, label: string][] = [
  ['thunder', 'Thunderstorms expected'],
  ['heavyrain', 'Heavy rain expected'],
  ['heavysnow', 'Heavy snow expected'],
  ['heavysleet', 'Heavy sleet expected'],
];

/** Same "strip the day/night/twilight suffix" convention as the client's `glyph()`. */
function baseSymbol(symbol: string): string {
  return symbol.replace(/_(day|night|polartwilight)$/, '');
}

function severeLabel(symbol: string): string | undefined {
  return SEVERE_SYMBOLS.find(([prefix]) => baseSymbol(symbol).startsWith(prefix))?.[1];
}

function severeCandidate(data: WeatherData, now: number): Candidate | undefined {
  const upcoming = data.hours.filter((hour) => {
    const delta = Date.parse(hour.time) - now;
    return delta >= -60_000 && delta <= SEVERE_HORIZON_MS;
  });
  const hit = upcoming
    .map((hour) => ({ hour, label: severeLabel(hour.symbol) }))
    .find((entry): entry is { hour: WeatherData['hours'][number]; label: string } => entry.label !== undefined);
  if (!hit) return undefined;
  const isNow = Date.parse(hit.hour.time) - now < 60 * 60_000;
  return {
    id: 'weather:severe', source: 'weather', kind: 'weather', score: 90, shapes: [...allShapes],
    kicker: 'Severe weather', title: hit.label,
    detail: isNow ? 'Happening now — check before heading out' : `Arriving around ${hit.hour.hourLabel}:00`,
    href: '#/weather', render: { type: 'weather-signal', kind: 'severe' },
  };
}

function hotCandidate(today: WeatherData['days'][number], hotThresholdC: number): Candidate | undefined {
  if (today.maxTemperature < hotThresholdC) return undefined;
  return {
    id: 'weather:hot', source: 'weather', kind: 'weather', score: 62, shapes: ['secondary', 'tile'],
    kicker: 'Heat today', title: `${Math.round(today.maxTemperature)}° expected`,
    detail: 'Above your configured comfortable range', href: '#/weather', render: { type: 'weather-signal', kind: 'hot' },
  };
}

function coldCandidate(today: WeatherData['days'][number], coldThresholdC: number): Candidate | undefined {
  if (today.minTemperature > coldThresholdC) return undefined;
  return {
    id: 'weather:cold', source: 'weather', kind: 'weather', score: 62, shapes: ['secondary', 'tile'],
    kicker: 'Cold today', title: `${Math.round(today.minTemperature)}° expected`,
    detail: 'Below your configured comfortable range', href: '#/weather', render: { type: 'weather-signal', kind: 'cold' },
  };
}

/** Only fires when it isn't already obviously wet — a genuinely upcoming change, not the current forecast. */
function rainSoonCandidate(data: WeatherData): Candidate | undefined {
  if ((data.current.precipitationMm ?? 0) > 0.1) return undefined;
  const hit = data.hours.slice(0, 6).find((hour) => hour.precipitationMm >= 0.2);
  if (!hit) return undefined;
  return {
    id: 'weather:rain-soon', source: 'weather', kind: 'weather', score: 58, shapes: ['secondary', 'tile'],
    kicker: 'Rain ahead', title: `Rain by ${hit.hourLabel}:00`,
    detail: `${hit.precipitationMm.toFixed(1)} mm expected`, href: '#/weather', render: { type: 'weather-signal', kind: 'rain' },
  };
}

function windCandidate(today: WeatherData['days'][number], windThresholdMs: number): Candidate | undefined {
  if (today.maxWindSpeed === undefined || today.maxWindSpeed < windThresholdMs) return undefined;
  return {
    id: 'weather:wind', source: 'weather', kind: 'weather', score: 50, shapes: ['secondary', 'tile'],
    kicker: 'Windy today', title: `${Math.round(today.maxWindSpeed)} m/s peak`,
    detail: 'Above your configured wind threshold', href: '#/weather', render: { type: 'weather-signal', kind: 'wind' },
  };
}

function uvCandidate(today: WeatherData['days'][number], uvThresholdHigh: number): Candidate | undefined {
  if (today.maxUvIndex === undefined || today.maxUvIndex < uvThresholdHigh) return undefined;
  return {
    id: 'weather:uv', source: 'weather', kind: 'weather', score: 46, shapes: ['secondary', 'tile'],
    kicker: 'High UV', title: `UV ${today.maxUvIndex.toFixed(1)} today`,
    detail: 'Sun protection recommended', href: '#/weather', render: { type: 'weather-signal', kind: 'uv' },
  };
}

const SUNSET_WINDOW_MS = 45 * 60_000;

function sunsetCandidate(sun: WeatherData['sun'], now: number): Candidate | undefined {
  if (!sun?.sunset) return undefined;
  const minsToSunset = (Date.parse(sun.sunset) - now) / 60_000;
  if (minsToSunset < 0 || minsToSunset > SUNSET_WINDOW_MS / 60_000) return undefined;
  return {
    id: 'weather:sunset', source: 'weather', kind: 'weather', score: 30, shapes: ['tile'],
    kicker: 'Golden hour', title: 'Sunset soon',
    detail: `Sets in ${Math.round(minsToSunset)} min`, href: '#/weather', render: { type: 'weather-signal', kind: 'sunset' },
  };
}

const MOON_PHASE_TOLERANCE_DEG = 5;

function circularDistanceDeg(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

function moonCandidate(moon: WeatherData['moon']): Candidate | undefined {
  if (!moon) return undefined;
  const isNew = circularDistanceDeg(moon.phaseDeg, 0) <= MOON_PHASE_TOLERANCE_DEG;
  const isFull = circularDistanceDeg(moon.phaseDeg, 180) <= MOON_PHASE_TOLERANCE_DEG;
  if (!isNew && !isFull) return undefined;
  const illumination = Math.round(((1 - Math.cos((moon.phaseDeg * Math.PI) / 180)) / 2) * 100);
  return {
    id: 'weather:moon', source: 'weather', kind: 'weather', score: 28, shapes: ['tile'],
    kicker: "Tonight's sky", title: isFull ? 'Full moon tonight' : 'New moon tonight',
    detail: `${illumination}% lit`, href: '#/weather', render: { type: 'weather-signal', kind: 'moon' },
  };
}

function forecastCandidate(data: WeatherData, today: WeatherData['days'][number], now: number): Candidate | undefined {
  const overnight = new Date(now).getHours() < 6;
  const forecast = overnight ? today : data.days[1];
  if (!forecast) return undefined;
  const forecastDate = new Date(`${forecast.date}T12:00:00Z`);
  const precipitationDetail = `${forecast.precipitationMm.toFixed(1)} mm precipitation expected`;
  const dryDetail = `${weekdayFullFmt.format(forecastDate)} looks dry`;
  return {
    id: `weather:${overnight ? 'later-today' : 'tomorrow'}:${forecast.date}`, source: 'weather', kind: 'weather', score: 26, shapes: ['tile'],
    kicker: overnight ? 'Later today' : "Tomorrow's forecast", title: `${Math.round(forecast.minTemperature)}° to ${Math.round(forecast.maxTemperature)}°`,
    detail: forecast.precipitationMm > 0 ? precipitationDetail : dryDetail,
    href: '#/weather', render: { type: 'text' },
  };
}

export function weatherCandidates(
  data: WeatherData | undefined,
  hotThresholdC: number,
  coldThresholdC: number,
  windThresholdMs: number,
  uvThresholdHigh: number,
  now = Date.now(),
): Candidate[] {
  const today = data?.days[0];
  if (!data || !today) return [];
  return [
    severeCandidate(data, now),
    hotCandidate(today, hotThresholdC),
    coldCandidate(today, coldThresholdC),
    rainSoonCandidate(data),
    windCandidate(today, windThresholdMs),
    uvCandidate(today, uvThresholdHigh),
    sunsetCandidate(data.sun, now),
    moonCandidate(data.moon),
    forecastCandidate(data, today, now),
  ].filter((candidate): candidate is Candidate => candidate !== undefined);
}

function formatSteamHours(minutes: number): string {
  const hours = minutes / 60;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
}

const DEFAULT_STEAM_MOMENTS: SteamMoments = { completedGame: false };

function steamCompletedGameCandidate(data: SteamData, moments: SteamMoments): Candidate | undefined {
  if (!moments.completedGame || !data.achievements) return undefined;
  const { appId, gameName, totalCount } = data.achievements;
  return {
    id: `steam:completed:${appId}`, source: 'steam', kind: 'steam', score: 92, shapes: [...allShapes],
    kicker: 'Game completed', title: gameName, detail: `All ${totalCount} achievements unlocked`,
    href: '#/steam', render: { type: 'text' },
  };
}

function steamAchievementCandidate(data: SteamData, achievementFreshMs: number, rareAchievementPercent: number): Candidate | undefined {
  const recentUnlock = data.achievements?.recentUnlocks[0];
  if (!recentUnlock || Date.now() - Date.parse(recentUnlock.unlockedAt) >= achievementFreshMs) return undefined;
  const rare = recentUnlock.globalUnlockedPercent !== undefined && recentUnlock.globalUnlockedPercent <= rareAchievementPercent;
  const rarity = recentUnlock.globalUnlockedPercent !== undefined
    ? `${recentUnlock.globalUnlockedPercent.toFixed(1)}% of players`
    : undefined;
  return {
    id: `steam:achievement:${data.achievements!.appId}:${recentUnlock.apiName}`, source: 'steam', kind: 'steam',
    score: rare ? 85 : 80, shapes: [...allShapes], kicker: rare ? 'Rare achievement unlocked' : 'Achievement unlocked', title: recentUnlock.displayName,
    detail: [data.achievements!.gameName, rarity].filter((value): value is string => Boolean(value)).join(' · '),
    href: '#/steam', render: { type: 'steam-achievement', appId: data.achievements!.appId, apiName: recentUnlock.apiName },
  };
}

function steamPlaytimeMilestoneCandidate(data: SteamData, moments: SteamMoments): Candidate | undefined {
  if (moments.playtimeMilestoneHours === undefined) return undefined;
  const trackedGame = data.currentGame ?? data.recentlyPlayed[0] ?? data.library?.mostPlayed[0];
  if (!trackedGame) return undefined;
  return {
    id: `steam:playtime-milestone:${trackedGame.appId}:${moments.playtimeMilestoneHours}`, source: 'steam', kind: 'steam',
    score: 65, shapes: ['secondary', 'tile'], kicker: 'Playtime milestone', title: `${moments.playtimeMilestoneHours}h in ${trackedGame.name}`,
    detail: 'Open Steam for the full breakdown', href: '#/steam', render: { type: 'text' },
  };
}

function steamNowPlayingCandidate(data: SteamData): Candidate | undefined {
  if (!data.currentGame) return undefined;
  const minutes = data.currentGame.playtimeForeverMinutes;
  return {
    id: `steam:now-playing:${data.currentGame.appId}`, source: 'steam', kind: 'steam', score: 58,
    shapes: ['secondary', 'tile'], kicker: 'Playing now', title: data.currentGame.name,
    detail: minutes !== undefined ? `${formatSteamHours(minutes)} played` : 'Open Steam',
    href: '#/steam', render: { type: 'steam-now-playing', appId: data.currentGame.appId },
  };
}

function steamLeaderboardClimbCandidate(moments: SteamMoments): Candidate | undefined {
  if (!moments.leaderboardClimb) return undefined;
  const { rank, delta } = moments.leaderboardClimb;
  return {
    id: `steam:leaderboard-climb:${rank}`, source: 'steam', kind: 'steam', score: 45, shapes: ['tile'],
    kicker: 'Friends leaderboard', title: `Up to #${rank + 1}`, detail: `Climbed ${delta} spot${delta === 1 ? '' : 's'}`,
    href: '#/steam', render: { type: 'text' },
  };
}

function steamFriendsOnlineCandidate(data: SteamData): Candidate | undefined {
  if (!data.friendsInGame.length) return undefined;
  const first = data.friendsInGame[0]!;
  return {
    id: 'steam:friends', source: 'steam', kind: 'steam', score: 25, shapes: ['tile'],
    kicker: 'Friends online',
    title: `${data.friendsInGame.length} friend${data.friendsInGame.length === 1 ? '' : 's'} playing`,
    detail: first.gameName, href: '#/steam', render: { type: 'text' },
  };
}

function steamRecentPlaytimeCandidate(data: SteamData): Candidate | undefined {
  const recentMinutes = data.library?.recentPlaytimeMinutes;
  const recentGameName = data.library?.mostPlayed[0]?.name ?? data.recentlyPlayed[0]?.name;
  if (!recentMinutes || !recentGameName) return undefined;
  return {
    id: 'steam:recent-playtime', source: 'steam', kind: 'steam', score: 22, shapes: ['tile'],
    kicker: 'This week on Steam', title: `${formatSteamHours(recentMinutes)} this week`, detail: recentGameName,
    href: '#/steam', render: { type: 'text' },
  };
}

/**
 * Only the first matching candidate is returned — a completion, an achievement unlock, a playtime
 * milestone, current game, friend activity, a leaderboard climb, and recent playtime would
 * otherwise all compete for slots from the same source. Order here doubles as the priority: a
 * fresh game completion beats a rare unlock, which beats a routine unlock, which beats a playtime
 * milestone, which beats just "playing now", down through the ambient filler signals.
 */
export function steamCandidates(
  data: SteamData | undefined,
  achievementFreshMs: number,
  moments: SteamMoments = DEFAULT_STEAM_MOMENTS,
  rareAchievementPercent = 10,
): Candidate[] {
  if (!data) return [];

  const candidate =
    steamCompletedGameCandidate(data, moments)
    ?? steamAchievementCandidate(data, achievementFreshMs, rareAchievementPercent)
    ?? steamPlaytimeMilestoneCandidate(data, moments)
    ?? steamNowPlayingCandidate(data)
    ?? steamLeaderboardClimbCandidate(moments)
    ?? steamFriendsOnlineCandidate(data)
    ?? steamRecentPlaytimeCandidate(data);

  return candidate ? [candidate] : [];
}

/** Battles that actually affect the ladder — friendlies/challenges shouldn't count toward a streak
 * or session record. Filtering on `type` rather than `trophyChange` presence: Path of Legends
 * only reports `trophyChange` on a win, so a `trophyChange !== undefined` filter silently dropped
 * every PoL loss too, letting non-consecutive wins masquerade as one unbroken streak. */
const NON_LADDER_BATTLE_TYPES = new Set(['friendly', 'challenge', 'tournament', 'clanMate', 'boatBattle']);
function ladderBattles(battles: ClashRoyaleBattle[]): ClashRoyaleBattle[] {
  return battles.filter((battle) => !NON_LADDER_BATTLE_TYPES.has(battle.type));
}

function clashRoyaleArenaCandidate(moments: ClashRoyaleMoments, data: ClashRoyaleData): Candidate | undefined {
  if (!moments.newArena) return undefined;
  return {
    id: `clash-royale:arena:${moments.newArena}`, source: 'clash-royale', kind: 'clash-royale', score: 88, shapes: [...allShapes],
    kicker: 'New arena', title: moments.newArena,
    detail: `${data.profile.trophies.toLocaleString()} trophies`,
    href: '#/clash-royale', render: { type: 'clash-royale-moment', kind: 'arena', arenaName: moments.newArena },
  };
}

function clashRoyaleLeagueCandidate(moments: ClashRoyaleMoments): Candidate | undefined {
  if (!moments.newLeague) return undefined;
  return {
    id: `clash-royale:league:${moments.newLeague.leagueNumber}`, source: 'clash-royale', kind: 'clash-royale', score: 85, shapes: [...allShapes],
    kicker: 'Path of Legends', title: `League ${pathOfLegendsDisplayLeagueNumber(moments.newLeague.leagueNumber)}`,
    detail: `${moments.newLeague.trophies.toLocaleString()} Path of Legends trophies`,
    href: '#/clash-royale', render: { type: 'clash-royale-moment', kind: 'league', leagueNumber: moments.newLeague.leagueNumber },
  };
}

function clashRoyaleBestTrophiesCandidate(moments: ClashRoyaleMoments): Candidate | undefined {
  if (moments.newBestTrophies === undefined) return undefined;
  return {
    id: `clash-royale:best-trophies:${moments.newBestTrophies}`, source: 'clash-royale', kind: 'clash-royale', score: 80, shapes: [...allShapes],
    kicker: 'New personal best', title: `${moments.newBestTrophies.toLocaleString()} trophies`,
    detail: 'Your highest trophy count yet', href: '#/clash-royale', render: { type: 'clash-royale-moment', kind: 'best-trophies' },
  };
}

function clashRoyaleWinStreakCandidate(data: ClashRoyaleData, winStreakMin: number, freshMs: number, now: number): Candidate | undefined {
  const ladder = ladderBattles(data.recentBattles);
  let streak = 0;
  for (const battle of ladder) {
    if (battle.result !== 'win') break;
    streak += 1;
  }
  const latest = ladder[0];
  if (streak < winStreakMin || !latest || now - Date.parse(latest.battleTime) >= freshMs) return undefined;
  return {
    id: `clash-royale:win-streak:${streak}:${latest.battleTime}`, source: 'clash-royale', kind: 'clash-royale', score: 70, shapes: [...allShapes],
    kicker: 'Win streak', title: `${streak} wins in a row`,
    detail: `Currently ${data.profile.trophies.toLocaleString()} trophies`,
    href: '#/clash-royale', render: { type: 'clash-royale-moment', kind: 'win-streak' },
  };
}

/** Groups the newest ladder battles into one "session" — consecutive battles less than
 * `sessionGapMs` apart, walking backward from the most recent. A gap that wide means play
 * stopped, so an older, unrelated battle from earlier in the day doesn't get folded in. */
function clashRoyaleSession(battles: ClashRoyaleBattle[], sessionGapMs: number): ClashRoyaleBattle[] {
  const ladder = ladderBattles(battles);
  const first = ladder[0];
  if (!first) return [];
  const session = [first];
  let cursor = Date.parse(first.battleTime);
  for (const battle of ladder.slice(1)) {
    const time = Date.parse(battle.battleTime);
    if (cursor - time > sessionGapMs) break;
    session.push(battle);
    cursor = time;
  }
  return session;
}

/** The low-priority "you played" signal: a plain win/loss tally for whatever session the newest
 * battle belongs to, rather than a single battle result — several battles can land between polls,
 * so reporting just the latest one could hide a losing run right before a win, or vice versa. */
function clashRoyaleSessionCandidate(data: ClashRoyaleData, sessionGapMs: number, freshMs: number, now: number): Candidate | undefined {
  const session = clashRoyaleSession(data.recentBattles, sessionGapMs);
  const latest = session[0];
  if (!latest || now - Date.parse(latest.battleTime) >= freshMs) return undefined;
  const wins = session.filter((battle) => battle.result === 'win').length;
  const losses = session.filter((battle) => battle.result === 'loss').length;
  const draws = session.length - wins - losses;
  const record = [wins ? `${wins}W` : undefined, losses ? `${losses}L` : undefined, draws ? `${draws}D` : undefined]
    .filter((part): part is string => Boolean(part)).join('–') || '0W';
  return {
    id: `clash-royale:session:${latest.battleTime}`, source: 'clash-royale', kind: 'clash-royale', score: wins >= losses ? 26 : 22, shapes: ['tile'],
    kicker: 'Clash Royale', title: `${record} last session`,
    detail: `${session.length} battle${session.length === 1 ? '' : 's'} · ${data.profile.arenaName}`,
    href: '#/clash-royale', render: { type: 'clash-royale-moment', kind: 'session' },
  };
}

/**
 * Milestones (new arena, new Path of Legends league, new personal best trophies) and a win streak
 * outrank the low-tier session tally — mirrors steamCandidates' priority ordering, but these are
 * independent facts rather than a single "pick the best one" chain, so several can be on the board
 * at once (e.g. a new arena reached mid win-streak).
 */
export function clashRoyaleCandidates(
  data: ClashRoyaleData | undefined,
  moments: ClashRoyaleMoments,
  winStreakMin: number,
  sessionGapMs: number,
  momentFreshMs: number,
  now = Date.now(),
): Candidate[] {
  if (!data) return [];
  return [
    clashRoyaleArenaCandidate(moments, data),
    clashRoyaleLeagueCandidate(moments),
    clashRoyaleBestTrophiesCandidate(moments),
    clashRoyaleWinStreakCandidate(data, winStreakMin, momentFreshMs, now),
    clashRoyaleSessionCandidate(data, sessionGapMs, momentFreshMs, now),
  ].filter((candidate): candidate is Candidate => candidate !== undefined);
}

const robloxCompactNumber = new Intl.NumberFormat('en', { notation: 'compact' });

/** Only surfaced while actually in a game — online/offline/in-studio presence isn't interesting
 * enough for the overview to compete for a slot. */
export function robloxCandidates(data: RobloxData | undefined): Candidate[] {
  if (data?.presence?.status !== 'in-game') return [];
  return [{
    id: 'roblox:now-playing', source: 'roblox', kind: 'roblox', score: 55,
    shapes: ['secondary', 'tile'], kicker: 'Playing now',
    title: data.presence.gameName ?? 'Roblox',
    detail: data.presence.playing !== undefined ? `${robloxCompactNumber.format(data.presence.playing)} playing now` : 'Open on Roblox',
    href: data.presence.placeId !== undefined ? `https://www.roblox.com/games/${data.presence.placeId}` : 'https://www.roblox.com/home',
    render: { type: 'roblox-now-playing' },
  }];
}

/** Next departure worth walking for: not so soon you'd miss it, not so far out it's noise. */
const TRANSIT_MIN_LEAD_MS = 2 * 60_000;
const TRANSIT_MAX_LEAD_MS = 45 * 60_000;

export function transitCandidates(data: TransitData | undefined, now = Date.now()): Candidate[] {
  for (const stop of data?.stops ?? []) {
    const departure = stop.departures.find((entry) => {
      const lead = Date.parse(entry.expectedTime) - now;
      return lead >= TRANSIT_MIN_LEAD_MS && lead <= TRANSIT_MAX_LEAD_MS;
    });
    if (!departure) continue;
    const minutes = Math.round((Date.parse(departure.expectedTime) - now) / 60_000);
    return [{
      id: `transit:${stop.id}:${departure.line}:${departure.expectedTime}`, source: 'transit', kind: 'transit',
      score: 21, shapes: ['tile'], kicker: `Next ${departure.mode}`,
      title: `${departure.line} · ${minutes} min`,
      detail: `${departure.destination} · from ${stop.name}`,
      href: '#/personal/transit', render: { type: 'text' },
    }];
  }
  return [];
}

const priceFmt = (price: number) => `${price.toFixed(2)} kr`;

function currentPowerHour(hours: PowerHour[], now: number): PowerHour | undefined {
  return hours.find((hour) => {
    const start = Date.parse(hour.time);
    return now >= start && now < start + 60 * 60_000;
  });
}

/**
 * Spot prices are known a day ahead, so power signals are about *acting* on the curve: a spike
 * says "put off the laundry", a much-cheaper hour ahead says when to run it. The ambient tile
 * keeps the current price on the board even when nothing is unusual.
 */
export function powerCandidates(
  data: PowerData | undefined,
  spikeRatio: number,
  spikeMinNok: number,
  now = Date.now(),
): Candidate[] {
  if (!data?.today.length) return [];
  const hours = [...data.today, ...data.tomorrow];
  const current = currentPowerHour(hours, now);
  if (!current) return [];
  const price = current.priceNokPerKwh;
  const average = data.today.reduce((sum, hour) => sum + hour.priceNokPerKwh, 0) / data.today.length;
  const upcoming = hours.filter((hour) => Date.parse(hour.time) > Date.parse(current.time)
    && Date.parse(hour.time) - now <= 12 * 60 * 60_000);
  const cheapest = upcoming.toSorted((a, b) => a.priceNokPerKwh - b.priceNokPerKwh)[0];
  const candidates: Candidate[] = [];

  if (price < 0) {
    candidates.push({
      id: `power:negative:${current.time}`, source: 'power', kind: 'power', score: 62, shapes: ['secondary', 'tile'],
      kicker: 'Negative power price', title: 'You get paid to use power',
      detail: `${priceFmt(price)}/kWh right now in ${data.area}`, href: '#/personal/power', render: { type: 'text' },
    });
  } else if (average > 0 && price >= average * spikeRatio && price >= spikeMinNok) {
    candidates.push({
      id: `power:spike:${current.time}`, source: 'power', kind: 'power', score: 60, shapes: ['secondary', 'tile'],
      kicker: 'Power price spike', title: `${priceFmt(price)}/kWh right now`,
      detail: cheapest
        ? `${(price / average).toFixed(1)}× today's average · down to ${priceFmt(cheapest.priceNokPerKwh)} at ${cheapest.hourLabel}:00`
        : `${(price / average).toFixed(1)}× today's average`,
      href: '#/personal/power', render: { type: 'text' },
    });
  } else if (cheapest && price >= spikeMinNok / 2 && cheapest.priceNokPerKwh <= price / 2) {
    // Halving an already-cheap price saves øre, not kroner — only worth a tile when the
    // current price is at least within sight of the spike floor.
    candidates.push({
      id: `power:cheap-ahead:${cheapest.time}`, source: 'power', kind: 'power', score: 30, shapes: ['tile'],
      kicker: 'Cheaper power ahead', title: `${priceFmt(cheapest.priceNokPerKwh)} at ${cheapest.hourLabel}:00`,
      detail: `vs ${priceFmt(price)}/kWh right now`, href: '#/personal/power', render: { type: 'text' },
    });
  }

  const range = [...data.today].sort((a, b) => a.priceNokPerKwh - b.priceNokPerKwh);
  candidates.push({
    id: `power:now:${current.time}`, source: 'power', kind: 'power', score: 20, shapes: ['tile'],
    kicker: `Power · ${data.area}`, title: `${priceFmt(price)}/kWh`,
    detail: `Today ${priceFmt(range[0]!.priceNokPerKwh)}–${priceFmt(range.at(-1)!.priceNokPerKwh)}`,
    href: '#/personal/power', render: { type: 'text' },
  });
  return candidates;
}

export function hueCandidates(data: HueData | undefined): Candidate[] {
  const onLights = data?.lights.filter((light) => light.on) ?? [];
  if (!onLights.length) return [];
  const onRooms = data?.rooms.filter((room) => room.anyOn).map((room) => room.name) ?? [];
  return [{
    id: 'hue:lights-on', source: 'hue', kind: 'hue', score: 24, shapes: ['tile'],
    kicker: 'Lights on', title: `${onLights.length} light${onLights.length === 1 ? '' : 's'} active`,
    detail: onRooms.slice(0, 2).join(' · ') || 'Open lights controls', href: '#/personal/hue', render: { type: 'text' },
  }];
}

export function newsCandidates(data: NewsData | undefined): Candidate[] {
  const headline = data?.items[0];
  if (!headline) return [];
  return [{
    id: `news:${headline.url}`, source: 'news', kind: 'news', score: 23, shapes: ['tile'],
    kicker: headline.source, title: headline.title, detail: 'Latest headline', href: '#/personal/news', render: { type: 'text' },
  }];
}

/** Same treatment as newsCandidates, but a distinct `source` so an AI headline competes for its
 * own slot alongside — not instead of — the general news headline. */
export function aiNewsCandidates(data: AiNewsData | undefined): Candidate[] {
  const headline = data?.items[0];
  if (!headline) return [];
  return [{
    id: `ai-news:${headline.url}`, source: 'ai-news', kind: 'news', score: 23, shapes: ['tile'],
    kicker: headline.source, title: headline.title, detail: 'Latest AI headline', href: '#/ai', render: { type: 'text' },
  }];
}

interface FallbackCopy {
  title: string;
  detail: string;
}

/**
 * Fallback candidates only fill a shape when the real source produced nothing — which can mean
 * "hasn't loaded yet" but can also mean "not configured" or "last fetch failed". Picking copy off
 * the source's own envelope status keeps a permanently-disabled widget from claiming forever that
 * a snapshot is still on its way.
 */
function fallbackCopy(status: WidgetStatus, loading: FallbackCopy, emptyWhenReady: FallbackCopy): FallbackCopy {
  if (status === 'disabled') return { title: 'Not configured', detail: 'See the README to set this widget up.' };
  if (status === 'error') return { title: "Couldn't load", detail: 'The last fetch failed — check the server logs.' };
  if (status === 'loading') return loading;
  return emptyWhenReady;
}

export function fallbackCandidates(status: {
  calendar: WidgetStatus;
}): Candidate[] {
  const horizon = fallbackCopy(
    status.calendar,
    { title: 'Building your command center', detail: 'Waiting for the first ranked snapshot.' },
    { title: 'Nothing urgent right now', detail: 'Your command center will adapt as new signals arrive.' },
  );
  return [
    { id: 'fallback:horizon', source: 'calendar', kind: 'fallback', score: 1, shapes: ['hero'], kicker: 'Open horizon', title: horizon.title, detail: horizon.detail, href: '#/personal', render: { type: 'text' } },
  ];
}
