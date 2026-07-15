import type {
  AiUsageToolData,
  CalendarData,
  GitHubData,
  GmailData,
  HealthData,
  SpotifyData,
  WeatherData,
  WidgetStatus,
} from '@personal-dashboard/shared';
import { computeDeviation } from '../deviation.js';
import type { Candidate } from './types.js';

const allShapes = ['hero', 'secondary', 'tile'] as const;

export function calendarCandidates(data: CalendarData | undefined, now: number): Candidate[] {
  const events = data?.events.filter((event) => Date.parse(event.end) >= now) ?? [];
  const next = events[0];
  const agenda = events.slice(1, 5);
  const candidates: Candidate[] = [];
  if (next) {
    candidates.push({
      id: `calendar:event:${next.id}`, source: 'calendar', kind: 'calendar', score: 96, shapes: [...allShapes],
      kicker: 'Next on deck', title: next.title,
      detail: next.location || (next.allDay ? 'An all-day marker on your calendar' : `${next.startLabel}–${next.endLabel}`),
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
      title: reviews[0].title, detail: reviews[0].repo, href: '#/github', render: { type: 'text' },
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
  let contributionTitle = 'No contributions yet today';
  if (today) contributionTitle = `${today} contributions today`;
  if (reviews.length) contributionTitle = `${reviews.length} reviews waiting`;
  candidates.push({
    id: 'github:contributions', source: 'github', kind: 'github', score: reviews.length ? 47 : 36,
    shapes: ['secondary', 'tile'], kicker: 'This week on GitHub',
    title: contributionTitle,
    detail: `${data.pullRequests.length} open pull requests`, href: '#/github', render: { type: 'github-contributions' },
  });
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
  let score = hasUnread ? 53 : 20;
  let kicker = 'Inbox';
  let detail = oldestUnread?.subject ?? 'No unread thread needs attention';
  let shapes: Candidate['shapes'] = ['tile'];
  if (fresh) {
    score = 78;
    kicker = 'New mail';
    shapes = [...allShapes];
  } else if (stale) {
    score = 15;
    detail = `Sitting untouched for ${Math.floor((changedForMs ?? 0) / 3_600_000)}h — probably nothing urgent`;
  }
  return [{
    id: 'gmail:inbox', source: 'gmail', kind: 'gmail', score,
    shapes, kicker, title: `${data.unreadThreads} unread`, detail,
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
      href: '#/health', render: { type: 'health-rings' },
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
  if (data.today) {
    candidates.push({
      id: 'health:activity', source: 'health', kind: 'health', score: 32, shapes: ['secondary', 'tile'],
      kicker: "Today's activity", title: steps === undefined ? 'Activity is syncing' : `${Math.round(steps).toLocaleString()} steps`,
      detail: 'Open Health for the full activity rings', href: '#/health', render: { type: 'health-rings' },
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
  artistShort: boolean;
  artistMedium: boolean;
  artistLong: boolean;
  album: boolean;
}

type Timeframe = 'short' | 'medium' | 'long';

/** long_term (years) is the rarest, most notable change; short_term (weeks) churns naturally and
 * shouldn't compete for hero the way a genuinely new all-time favorite should. */
const TIMEFRAME_SCORE: Record<Timeframe, number> = { long: 85, medium: 65, short: 50 };
const TIMEFRAME_SHAPES: Record<Timeframe, Candidate['shapes']> = {
  long: [...allShapes],
  medium: ['secondary', 'tile'],
  short: ['tile'],
};
const TIMEFRAME_PERIOD: Record<Timeframe, string> = {
  long: 'of all time', medium: 'these last few months', short: 'this month',
};

export function spotifyCandidates(data: SpotifyData | undefined, fresh: SpotifyFreshness): Candidate[] {
  if (!data) return [];
  const candidates: Candidate[] = [];

  const trackTiers: { key: Timeframe; track: SpotifyData['topTracks']['shortTerm'][number] | undefined; isFresh: boolean }[] = [
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
    { key: 'long', artist: data.topArtists.longTerm[0], isFresh: fresh.artistLong },
    { key: 'medium', artist: data.topArtists.mediumTerm[0], isFresh: fresh.artistMedium },
    { key: 'short', artist: data.topArtists.shortTerm[0], isFresh: fresh.artistShort },
  ];
  for (const tier of artistTiers) {
    if (!tier.artist || !tier.isFresh) continue;
    candidates.push({
      id: `spotify:new-artist:${tier.key}:${tier.artist.id ?? tier.artist.name}`, source: 'spotify', kind: 'spotify',
      score: TIMEFRAME_SCORE[tier.key], shapes: TIMEFRAME_SHAPES[tier.key],
      kicker: `New top artist ${TIMEFRAME_PERIOD[tier.key]}`, title: tier.artist.name,
      detail: tier.artist.genres[0] ?? `Your top artist ${TIMEFRAME_PERIOD[tier.key]}`,
      href: '#/spotify', render: { type: 'text' },
    });
  }

  const topAlbum = data.allTime.albums[0];
  if (topAlbum && fresh.album) {
    candidates.push({
      id: `spotify:new-album:${topAlbum.id ?? topAlbum.name}`, source: 'spotify', kind: 'spotify',
      score: TIMEFRAME_SCORE.long, shapes: TIMEFRAME_SHAPES.long,
      kicker: 'New favorite album', title: topAlbum.name, detail: topAlbum.artist,
      href: '#/spotify', render: { type: 'text' },
    });
  }

  // No fresh change to headline — still worth a quiet tile naming your current favorite.
  const favorite = data.topTracks.shortTerm[0];
  if (favorite && !candidates.length) {
    candidates.push({
      id: `spotify:favorite:${favorite.id ?? favorite.track}`, source: 'spotify', kind: 'spotify', score: 25, shapes: ['tile'],
      kicker: 'Current favorite', title: favorite.track, detail: favorite.artist,
      href: '#/spotify', render: { type: 'spotify-track', trackId: favorite.id ?? favorite.track },
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

/** A weekly window that just rolled over reads as a big same-sample drop, not a gradual decline. */
const RESET_DROP_PERCENT = 40;

export function aiCandidates(
  tools: AiTool[],
  baselineWindowDays: number,
  baselineDeviationPercent: number,
): Candidate[] {
  const available = tools.filter((tool) => tool.data?.available);
  const candidates: Candidate[] = [];

  const limits = available.flatMap((tool) => {
    const data = tool.data!;
    return [data.fiveHour, data.weekly].filter((window): window is NonNullable<typeof window> => Boolean(window));
  });
  if (limits.length) {
    const tightest = limits.reduce(
      (lowest, window) => window.usedPercent > lowest.usedPercent ? window : lowest,
      limits[0]!,
    );
    const remaining = Math.max(0, Math.round(100 - tightest.usedPercent));
    candidates.push({
      id: 'ai-usage:runway', source: 'ai-usage', kind: 'ai-usage', score: remaining <= 15 ? 86 : 30,
      shapes: remaining <= 15 ? [...allShapes] : ['tile'], kicker: remaining <= 15 ? 'Running low' : 'AI runway',
      title: `${remaining}% available`, detail: `Resets ${new Date(tightest.resetsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
      href: '#/ai', meter: remaining, render: { type: 'text' },
    });
  }

  for (const tool of available) {
    const history = tool.data!.history;
    const last = history.at(-1);
    const prev = history.at(-2);
    if (
      last?.weeklyUsedPercent !== undefined && prev?.weeklyUsedPercent !== undefined
      && prev.weeklyUsedPercent - last.weeklyUsedPercent >= RESET_DROP_PERCENT
    ) {
      candidates.push({
        id: `ai-usage:reset:${tool.id}`, source: 'ai-usage', kind: 'ai-usage', score: 65,
        shapes: ['secondary', 'tile'], kicker: 'Fresh allowance', title: `${tool.label} usage just reset`,
        detail: `Back down to ${last.weeklyUsedPercent.toFixed(0)}% of the weekly limit`, href: '#/ai', render: { type: 'text' },
      });
    }

    // fiveHour, not weekly: a cumulative weekly % naturally climbs through the week regardless of
    // pace, so comparing it against trailing samples would flag every Friday as "anomalous."
    const currentFiveHour = tool.data!.fiveHour?.usedPercent;
    if (currentFiveHour === undefined) continue;
    const priorFiveHour = history
      .map((point) => point.fiveHourUsedPercent)
      .filter((value): value is number => value !== undefined)
      .slice(-baselineWindowDays);
    const deviation = computeDeviation(currentFiveHour, priorFiveHour, baselineDeviationPercent);
    if (deviation?.anomalous && deviation.direction === 'above') {
      candidates.push({
        id: `ai-usage:anomaly:${tool.id}`, source: 'ai-usage', kind: 'ai-usage', score: 75, shapes: [...allShapes],
        kicker: 'Heavy usage', title: `${tool.label} running well above usual`,
        detail: `${deviation.deviationPercent.toFixed(0)}% above your usual pace`, href: '#/ai', render: { type: 'text' },
      });
    }
  }

  return candidates;
}

/**
 * A fixed comfortable-range threshold, not a rolling personal baseline — WeatherData only carries
 * a forecast, no history to compare against, so "extreme" here just means "past a configured
 * line" rather than "unusual for you".
 */
export function weatherCandidates(data: WeatherData | undefined, hotThresholdC: number, coldThresholdC: number): Candidate[] {
  const today = data?.days[0];
  if (!today) return [];
  if (today.maxTemperature >= hotThresholdC) {
    return [{
      id: 'weather:hot', source: 'weather', kind: 'weather', score: 62, shapes: ['secondary', 'tile'],
      kicker: 'Heat today', title: `${Math.round(today.maxTemperature)}° expected`,
      detail: `Above your configured comfortable range`, href: '#/personal', render: { type: 'text' },
    }];
  }
  if (today.minTemperature <= coldThresholdC) {
    return [{
      id: 'weather:cold', source: 'weather', kind: 'weather', score: 62, shapes: ['secondary', 'tile'],
      kicker: 'Cold today', title: `${Math.round(today.minTemperature)}° expected`,
      detail: `Below your configured comfortable range`, href: '#/personal', render: { type: 'text' },
    }];
  }
  return [];
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

function combineAiStatus(claude: WidgetStatus, codex: WidgetStatus): WidgetStatus {
  if (claude === 'disabled' && codex === 'disabled') return 'disabled';
  if (claude === 'loading' || codex === 'loading') return 'loading';
  if (claude === 'error' && codex === 'error') return 'error';
  return 'ready';
}

export function fallbackCandidates(status: {
  calendar: WidgetStatus;
  gmail: WidgetStatus;
  github: WidgetStatus;
  aiClaude: WidgetStatus;
  aiCodex: WidgetStatus;
}): Candidate[] {
  const horizon = fallbackCopy(
    status.calendar,
    { title: 'Building your command center', detail: 'Waiting for the first ranked snapshot.' },
    { title: 'Nothing urgent right now', detail: 'Your command center will adapt as new signals arrive.' },
  );
  const agenda = fallbackCopy(
    status.calendar,
    { title: 'Syncing your day', detail: 'Calendar and activity signals are loading.' },
    { title: 'Your day is clear', detail: 'No upcoming calendar items.' },
  );
  const inbox = fallbackCopy(
    status.gmail,
    { title: 'Syncing mail', detail: 'Waiting for the first snapshot.' },
    { title: 'Inbox quiet', detail: 'Nothing new to flag.' },
  );
  const code = fallbackCopy(
    status.github,
    { title: 'Syncing GitHub', detail: 'Waiting for the first snapshot.' },
    { title: 'Code queue quiet', detail: 'Nothing new to flag.' },
  );
  const ai = fallbackCopy(
    combineAiStatus(status.aiClaude, status.aiCodex),
    { title: 'Awaiting snapshot', detail: 'Waiting for allowance data.' },
    { title: 'No allowance data', detail: 'Neither tool reported a quota just now.' },
  );
  // Each fallback shares its real counterpart's `source` so rankCandidates' dedup-by-source logic
  // excludes it once that source's real candidate already fills a slot elsewhere — otherwise a
  // sparse board (few real signals) reaches for "Inbox: syncing" as filler right next to a real,
  // already-placed "Inbox: 3 unread" tile, showing the same topic twice under different disguises.
  return [
    { id: 'fallback:horizon', source: 'calendar', kind: 'fallback', score: 1, shapes: ['hero'], kicker: 'Open horizon', title: horizon.title, detail: horizon.detail, href: '#/personal', render: { type: 'text' } },
    { id: 'fallback:agenda', source: 'calendar', kind: 'fallback', score: 1, shapes: ['secondary'], kicker: 'Coming up', title: agenda.title, detail: agenda.detail, href: '#/personal', render: { type: 'text' } },
    { id: 'fallback:inbox', source: 'gmail', kind: 'fallback', score: 1, shapes: ['tile'], kicker: 'Inbox', title: inbox.title, detail: inbox.detail, href: '#/personal', render: { type: 'text' } },
    { id: 'fallback:code', source: 'github', kind: 'fallback', score: 1, shapes: ['tile'], kicker: 'Code queue', title: code.title, detail: code.detail, href: '#/github', render: { type: 'text' } },
    { id: 'fallback:ai', source: 'ai-usage', kind: 'fallback', score: 1, shapes: ['tile'], kicker: 'AI runway', title: ai.title, detail: ai.detail, href: '#/ai', render: { type: 'text' } },
  ];
}
