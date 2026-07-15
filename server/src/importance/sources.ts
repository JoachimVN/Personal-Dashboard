import type {
  AiUsageToolData,
  CalendarData,
  GitHubData,
  GmailData,
  HealthData,
  SpotifyData,
} from '@personal-dashboard/shared';
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

export function githubCandidates(data: GitHubData | undefined): Candidate[] {
  if (!data) return [];
  const reviews = data.pullRequests.filter((pr) => pr.role === 'review-requested');
  const today = data.contributions.days.at(-1)?.count ?? 0;
  const candidates: Candidate[] = [];
  if (reviews.length) {
    candidates.push({
      id: `github:review:${reviews[0].repo}:${reviews[0].number}`, source: 'github', kind: 'github', score: 91,
      shapes: [...allShapes], kicker: reviews.length > 1 ? `${reviews.length} reviews waiting` : 'Review requested',
      title: reviews[0].title, detail: reviews[0].repo, href: '#/github', render: { type: 'text' },
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

export function gmailCandidates(data: GmailData | undefined, staleForMs: number | undefined, staleThresholdMs: number): Candidate[] {
  if (!data) return [];
  const oldestUnread = data.threads.find((thread) => thread.unread);
  const stale = staleForMs !== undefined && staleForMs >= staleThresholdMs;
  const unreadDetail = oldestUnread?.subject ?? 'No unread thread needs attention';
  const staleDetail = `No count change for ${Math.floor((staleForMs ?? 0) / 3_600_000)}h`;
  let inboxScore = 20;
  if (data.unreadThreads) inboxScore = 53;
  if (stale) inboxScore = 74;
  return [{
    id: 'gmail:inbox', source: 'gmail', kind: 'gmail', score: inboxScore,
    shapes: stale ? [...allShapes] : ['tile'], kicker: stale ? 'Inbox unchanged' : 'Inbox',
    title: `${data.unreadThreads} unread`,
    detail: stale ? staleDetail : unreadDetail,
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

export function spotifyCandidates(data: SpotifyData | undefined, github: GitHubData | undefined): Candidate[] {
  if (!data) return [];
  const todayContributions = github?.contributions.days.at(-1)?.count ?? 0;
  const favorite = data.topTracks.shortTerm[0];
  const candidates: Candidate[] = [];
  if (todayContributions === 0 && favorite) {
    candidates.push({
      id: `spotify:favorite:${favorite.id ?? favorite.track}`, source: 'spotify', kind: 'spotify', score: 72, shapes: [...allShapes],
      kicker: 'A quieter code day', title: favorite.track, detail: `Your current favorite · ${favorite.artist}`,
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

export function aiCandidates(tools: (AiUsageToolData | undefined)[]): Candidate[] {
  const limits = tools.flatMap((tool) => {
    if (!tool?.available) return [];
    return [tool.fiveHour, tool.weekly].filter((window): window is NonNullable<typeof window> => Boolean(window));
  });
  if (!limits.length) return [];
  const tightest = limits.reduce(
    (lowest, window) => window.usedPercent > lowest.usedPercent ? window : lowest,
    limits[0]!,
  );
  const remaining = Math.max(0, Math.round(100 - tightest.usedPercent));
  return [{
    id: 'ai-usage:runway', source: 'ai-usage', kind: 'ai-usage', score: remaining <= 15 ? 86 : 30,
    shapes: remaining <= 15 ? [...allShapes] : ['tile'], kicker: remaining <= 15 ? 'Running low' : 'AI runway',
    title: `${remaining}% available`, detail: `Resets ${new Date(tightest.resetsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    href: '#/ai', meter: remaining, render: { type: 'text' },
  }];
}

export function fallbackCandidates(): Candidate[] {
  return [
    { id: 'fallback:horizon', source: 'fallback-horizon', kind: 'fallback', score: 1, shapes: ['hero'], kicker: 'Open horizon', title: 'Nothing urgent right now', detail: 'Your command center will adapt as new signals arrive.', href: '#/personal', render: { type: 'text' } },
    { id: 'fallback:agenda', source: 'fallback-agenda', kind: 'fallback', score: 1, shapes: ['secondary'], kicker: 'Coming up', title: 'Your day is clear', detail: 'No upcoming calendar items.', href: '#/personal', render: { type: 'text' } },
    { id: 'fallback:inbox', source: 'fallback-inbox', kind: 'fallback', score: 1, shapes: ['tile'], kicker: 'Inbox', title: 'Syncing mail', detail: 'Waiting for the first snapshot.', href: '#/personal', render: { type: 'text' } },
    { id: 'fallback:code', source: 'fallback-code', kind: 'fallback', score: 1, shapes: ['tile'], kicker: 'Code queue', title: 'Syncing GitHub', detail: 'Waiting for the first snapshot.', href: '#/github', render: { type: 'text' } },
    { id: 'fallback:ai', source: 'fallback-ai', kind: 'fallback', score: 1, shapes: ['tile'], kicker: 'AI runway', title: 'Awaiting snapshot', detail: 'Waiting for allowance data.', href: '#/ai', render: { type: 'text' } },
  ];
}
