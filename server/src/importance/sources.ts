import type {
  AiUsageToolData,
  CalendarData,
  GitHubData,
  GmailData,
  HealthData,
  HueData,
  IMessageData,
  NewsData,
  SpotifyData,
  WeatherData,
  WidgetStatus,
} from '@personal-dashboard/shared';
import { computeDeviation } from '../deviation.js';
import type { Candidate } from './types.js';

const allShapes = ['hero', 'secondary', 'tile'] as const;

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
      href: '#/personal', render: { type: 'calendar-event', eventId: next.id },
    });
  }
  if (agenda.length) {
    candidates.push({
      id: `calendar:agenda:${agenda.map((event) => event.id).join(',')}`, source: 'calendar', kind: 'calendar', score: 78,
      shapes: ['secondary', 'tile'], kicker: 'Coming up', title: `${agenda.length} more on your calendar`,
      detail: agenda[0].title, href: '#/personal', render: { type: 'calendar-agenda', eventIds: agenda.map((event) => event.id) },
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
 * "Stale" here means the unread count hasn't moved in a long time — that's a sign to stop
 * surfacing it, not promote it: most unread mail (receipts, one-time codes) was never going to be
 * replied to, and an inbox count that's been sitting untouched for a day isn't news. Only a
 * *recently changed* count (new mail actually arriving) is worth raising priority for.
 */
export function gmailCandidates(
  data: GmailData | undefined,
  changedForMs: number | undefined,
  staleThresholdMs: number,
  freshThresholdMs: number,
): Candidate[] {
  if (!data) return [];
  const oldestUnread = data.threads.find((thread) => thread.unread);
  const hasUnread = data.unreadThreads > 0;
  const fresh = hasUnread && changedForMs !== undefined && changedForMs < freshThresholdMs;
  const stale = hasUnread && changedForMs !== undefined && changedForMs >= staleThresholdMs;
  if (stale) return [];
  let score = hasUnread ? 53 : 20;
  let kicker = 'Inbox';
  const detail = oldestUnread?.subject ?? 'No unread thread needs attention';
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
    href: '#/personal',
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
    href: '#/personal', render: { type: 'text' },
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

export function spotifyCandidates(data: SpotifyData | undefined, fresh: SpotifyFreshness): Candidate[] {
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

  // No fresh change to headline — still worth a quiet tile naming your current favorite.
  const recent = data.recentlyPlayed[0];
  if (recent && !candidates.length) {
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
  const detail = sharedReset
    ? `${resets.map((reset) => `${reset.tool.label} ${reset.usedPercent.toFixed(0)}%`).join(' · ')} · clean slates until ${resetLabel(resets[0]!.resetsAt!)}`
    : resets
      .map((reset) => `${reset.tool.label} ${reset.usedPercent.toFixed(0)}%${reset.resetsAt ? ` until ${resetLabel(reset.resetsAt)}` : ''}`)
      .join(' · ');
  return [{
    id: `ai-usage:reset:${resets.map((reset) => reset.tool.id).sort((a, b) => a.localeCompare(b)).join('+')}`,
    source: 'ai-usage', kind: 'ai-usage', score: 66, shapes: ['secondary', 'tile'],
    kicker: 'Fresh allowance', title: `${resets.map((reset) => reset.tool.label).join(' & ')} usage just reset`,
    detail,
    href: '#/ai', render: aiUsageRender(resets.map((reset) => aiAccent(reset.tool)), 'weekly'),
  }];
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
  const priorFiveHour = data.history
    .map((point) => point.fiveHourUsedPercent)
    .filter((value): value is number => value !== undefined)
    .slice(-baselineWindowDays);
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
export function weatherCandidates(
  data: WeatherData | undefined,
  hotThresholdC: number,
  coldThresholdC: number,
  now = Date.now(),
): Candidate[] {
  const today = data?.days[0];
  if (!today) return [];
  if (today.maxTemperature >= hotThresholdC) {
    return [{
      id: 'weather:hot', source: 'weather', kind: 'weather', score: 62, shapes: ['secondary', 'tile'],
      kicker: 'Heat today', title: `${Math.round(today.maxTemperature)}° expected`,
      detail: `Above your configured comfortable range`, href: '#/personal', render: { type: 'weather-hours' },
    }];
  }
  if (today.minTemperature <= coldThresholdC) {
    return [{
      id: 'weather:cold', source: 'weather', kind: 'weather', score: 62, shapes: ['secondary', 'tile'],
      kicker: 'Cold today', title: `${Math.round(today.minTemperature)}° expected`,
      detail: `Below your configured comfortable range`, href: '#/personal', render: { type: 'weather-hours' },
    }];
  }
  const overnight = new Date(now).getHours() < 6;
  const forecast = overnight ? today : data.days[1];
  if (forecast) {
    return [{
      id: `weather:${overnight ? 'later-today' : 'tomorrow'}:${forecast.date}`, source: 'weather', kind: 'weather', score: 26, shapes: ['tile'],
      kicker: overnight ? 'Later today' : "Tomorrow's forecast", title: `${Math.round(forecast.minTemperature)}° to ${Math.round(forecast.maxTemperature)}°`,
      detail: forecast.precipitationMm > 0 ? `${forecast.precipitationMm.toFixed(1)} mm precipitation expected` : `${forecast.dayLabel} looks dry`,
      href: '#/personal', render: { type: 'text' },
    }];
  }
  return [];
}

export function hueCandidates(data: HueData | undefined): Candidate[] {
  const onLights = data?.lights.filter((light) => light.on) ?? [];
  if (!onLights.length) return [];
  const onRooms = data?.rooms.filter((room) => room.anyOn).map((room) => room.name) ?? [];
  return [{
    id: 'hue:lights-on', source: 'hue', kind: 'hue', score: 24, shapes: ['tile'],
    kicker: 'Lights on', title: `${onLights.length} light${onLights.length === 1 ? '' : 's'} active`,
    detail: onRooms.slice(0, 2).join(' · ') || 'Open lights controls', href: '#/personal', render: { type: 'text' },
  }];
}

export function newsCandidates(data: NewsData | undefined): Candidate[] {
  const headline = data?.items[0];
  if (!headline) return [];
  return [{
    id: `news:${headline.url}`, source: 'news', kind: 'news', score: 23, shapes: ['tile'],
    kicker: headline.source, title: headline.title, detail: 'Latest headline', href: '#/personal', render: { type: 'text' },
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
