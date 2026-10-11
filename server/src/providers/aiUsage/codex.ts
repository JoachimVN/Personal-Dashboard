import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { aiUsageToolSchema, type AiUsageToolData, type UsageHistoryPoint } from '@personal-dashboard/shared';
import type { Provider } from '../../scheduler.js';
import type { UsageHistoryStore, UsageSnapshot as PersistedUsageSnapshot } from '../../usageHistory.js';
import { codexAccountSnapshot } from './codexAccount.js';
import {
  asIso,
  carryPastReset,
  FIVE_HOUR_MS,
  jsonlFiles,
  limit,
  limitStatus,
  loadUsageSnapshot,
  MONTH_ABBREVIATIONS,
  recordHistorySafely,
  stripTerminalControls,
  WEEKLY_MS,
  type UsageSnapshot,
} from './shared.js';

const codexLimitSchema = z.object({
  used_percent: z.number(),
  window_minutes: z.number(),
  resets_at: z.number(),
});

const codexEventSchema = z.object({
  timestamp: z.string(),
  type: z.literal('event_msg'),
  payload: z.object({
    rate_limits: z
      .object({
        primary: codexLimitSchema.nullish(),
        secondary: codexLimitSchema.nullish(),
      })
      .nullish(),
  }),
});

/** 5h = 300 minutes, weekly = 10080 minutes; classify with slack rather than exact-matching. */
function windowBucket(windowMinutes: number): CodexLimitBucket | undefined {
  if (windowMinutes > 0 && windowMinutes <= 600) return 'fiveHour';
  if (windowMinutes >= 5000 && windowMinutes <= 20000) return 'weekly';
  return undefined;
}

type CodexLimitBucket = 'fiveHour' | 'weekly';
type TimestampedCodexLimit = { timestamp: string; entry: z.infer<typeof codexLimitSchema> };

interface CodexLimits {
  fiveHour?: TimestampedCodexLimit;
  weekly?: TimestampedCodexLimit;
  latestReport?: { timestamp: string; buckets: CodexLimitBucket[] };
}

function recordLatestLimit(
  limits: CodexLimits,
  timestamp: string,
  entry: z.infer<typeof codexLimitSchema>,
): CodexLimitBucket | undefined {
  const bucket = windowBucket(entry.window_minutes);
  if (bucket === 'fiveHour' && (!limits.fiveHour || timestamp > limits.fiveHour.timestamp)) {
    limits.fiveHour = { timestamp, entry };
  }
  if (bucket === 'weekly' && (!limits.weekly || timestamp > limits.weekly.timestamp)) {
    limits.weekly = { timestamp, entry };
  }
  return bucket;
}

function readCodexLimits(lines: string[], limits: CodexLimits): void {
  for (const line of lines) {
    try {
      const event = codexEventSchema.parse(JSON.parse(line));
      const rateLimits = event.payload.rate_limits;
      if (!rateLimits) continue;
      const entries = [rateLimits.primary, rateLimits.secondary];
      const buckets = entries.flatMap((entry) => {
        if (!entry) return [];
        const bucket = recordLatestLimit(limits, event.timestamp, entry);
        return bucket ? [bucket] : [];
      });
      // An empty rate_limits object is also emitted when Codex cannot start a turn at its
      // cap. It is not evidence that both windows became unlimited. Keep the last report
      // with an actual quota reading until another one arrives.
      if (buckets.length > 0 && (!limits.latestReport || event.timestamp > limits.latestReport.timestamp)) {
        limits.latestReport = { timestamp: event.timestamp, buckets };
      }
    } catch {
      // Session streams also contain unrelated messages; ignore malformed/irrelevant lines.
    }
  }
}

/**
 * Codex appends the live account limits to its local session event stream. Read only the newest
 * few logs: limits are account-wide and a current session always writes into the latest files.
 *
 * Which window rides in `primary` vs `secondary` isn't fixed, so classify entries by
 * `window_minutes` rather than trusting the slot. The latest nonempty rate-limit event is
 * authoritative: an empty event can mean the account is capped and cannot start a turn.
 */
function codexSessionsDir(): string {
  return path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'sessions');
}

export async function codexSnapshot(sessionsDir = codexSessionsDir()): Promise<UsageSnapshot> {
  try {
    // A resumed session keeps its old filename but receives new quota events.
    const recent = await Promise.all((await jsonlFiles(sessionsDir)).map(async (file) => ({
      file, modified: await stat(file).then((info) => info.mtimeMs, () => 0),
    })));
    const files = recent.sort((a, b) => b.modified - a.modified).slice(0, 12).map(({ file }) => file);
    const latest: CodexLimits = {};

    const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')));
    for (const content of contents) {
      const lines = content.trim().split('\n');
      readCodexLimits(lines, latest);
    }

    const hasQuotaReport = Boolean(latest.latestReport);
    const fiveHour = latest.latestReport?.buckets.includes('fiveHour')
      ? latest.fiveHour && limit(latest.fiveHour.entry.used_percent, latest.fiveHour.entry.resets_at)
      : undefined;
    const weekly = latest.latestReport?.buckets.includes('weekly')
      ? latest.weekly && limit(latest.weekly.entry.used_percent, latest.weekly.entry.resets_at)
      : undefined;
    const asOf = latest.latestReport && asIso(latest.latestReport.timestamp);
    return {
      available: hasQuotaReport,
      fiveHour,
      weekly,
      fiveHourStatus: limitStatus(Boolean(fiveHour), hasQuotaReport),
      weeklyStatus: limitStatus(Boolean(weekly), hasQuotaReport),
      asOf,
    };
  } catch {
    return { available: false, fiveHourStatus: 'unknown', weeklyStatus: 'unknown' };
  }
}

/** A local read stops being trustworthy either when its own window has rolled past `resetsAt`, or
 * simply when it's old: Codex can grant an early, out-of-cycle "usage limit reset" (see the CLI's
 * own "Run /usage to use one" prompt) that has no relationship to the cached `resetsAt` at all —
 * the only local signal for that is a new session write, so a read that's gone a while without one
 * can no longer be trusted either. Bucket-agnostic so it applies to both the weekly window and
 * (should Codex's `/status` ever report it) the 5-hour one. */
const CODEX_LOCAL_READ_MAX_AGE_MS = 2 * 60 * 60_000;

export function isCodexLimitStale(
  window: UsageSnapshot['weekly'] | undefined,
  asOf: string | undefined,
  now = Date.now(),
  maxAgeMs = CODEX_LOCAL_READ_MAX_AGE_MS,
): boolean {
  if (!window || !asOf) return true;
  if (Date.parse(window.resetsAt) <= now) return true;
  return now - Date.parse(asOf) > maxAgeMs;
}

/** Matches the value portion of a "<label> limit: [bar] N% left (resets HH:MM on D Mon)"
 * `/status` row. The label and optional bar are separated structurally before this bounded parse. */
const CODEX_LIMIT_VALUE_REGEX =
  /^(\d{1,3})%\s*left\s*\(resets\s*(\d{1,2}):(\d{2})\s*on\s*(\d{1,2})\s*([a-z]{3})\)/i;

function classifyCodexLimitLabel(label: string): CodexLimitBucket | undefined {
  const normalized = label.toLowerCase();
  if (normalized.includes('week')) return 'weekly';
  if (normalized.includes('5h') || normalized.includes('hour') || normalized.includes('session')) return 'fiveHour';
  return undefined;
}

function parseCodexLimitLine(line: string): { label: string; match: RegExpExecArray } | undefined {
  const markerIndex = line.toLowerCase().indexOf('limit:');
  if (markerIndex === -1) return undefined;

  let value = line.slice(markerIndex + 'limit:'.length).trimStart();
  if (value.startsWith('[')) {
    const barEnd = value.indexOf(']');
    if (barEnd === -1) return undefined;
    value = value.slice(barEnd + 1).trimStart();
  }
  const match = CODEX_LIMIT_VALUE_REGEX.exec(value);
  return match ? { label: line.slice(0, markerIndex), match } : undefined;
}

/** `/status` reports resets in 24-hour local time with no year, e.g. "11:49 on 25 Jul". */
function parseCodexResetAt(hour: string, minute: string, day: string, monthAbbr: string, now = new Date()): string | undefined {
  const monthIndex = MONTH_ABBREVIATIONS.indexOf(monthAbbr.toLowerCase());
  if (monthIndex === -1) return undefined;
  const candidate = new Date(now.getFullYear(), monthIndex, Number(day), Number(hour), Number(minute));
  if (candidate.getTime() < now.getTime() - 24 * 60 * 60_000) candidate.setFullYear(candidate.getFullYear() + 1);
  return Number.isNaN(candidate.getTime()) ? undefined : candidate.toISOString();
}

/** Parse Codex CLI's interactive `/status` panel — each row as "N% left" rather than Claude's "N%
 * used". The panel redraws in place while MCP servers are still booting, so an earlier partial
 * render can sit in the captured stream alongside the final one; iterating matches in order and
 * overwriting per bucket naturally keeps only the last render of each row. */
export function parseCodexStatusScreen(
  screen: string,
  now = new Date(),
): Pick<UsageSnapshot, 'fiveHour' | 'weekly' | 'fiveHourStatus' | 'weeklyStatus' | 'asOf'> {
  const text = stripTerminalControls(screen);
  const windows: Partial<Record<CodexLimitBucket, ReturnType<typeof limit>>> = {};
  let sawAnyLimitLine = false;
  for (const line of text.split('\n')) {
    const parsed = parseCodexLimitLine(line);
    if (!parsed) continue;
    const bucket = classifyCodexLimitLabel(parsed.label);
    if (!bucket) continue;
    sawAnyLimitLine = true;
    const resetsAt = parseCodexResetAt(parsed.match[2], parsed.match[3], parsed.match[4], parsed.match[5], now);
    if (resetsAt) windows[bucket] = limit(100 - Number(parsed.match[1]), resetsAt);
  }
  const asOf = windows.fiveHour || windows.weekly ? now.toISOString() : undefined;
  return {
    fiveHour: windows.fiveHour,
    weekly: windows.weekly,
    fiveHourStatus: limitStatus(Boolean(windows.fiveHour), sawAnyLimitLine),
    weeklyStatus: limitStatus(Boolean(windows.weekly), sawAnyLimitLine),
    asOf,
  };
}

/** Minimum interval between automatic live account requests; manual Refresh bypasses it. */
const CODEX_ACCOUNT_REFRESH_MS = 5 * 60_000;


/** Keep the newest confirmed observation across local logs and persisted reads.
 * A newer partial report remains authoritative about the account's windows. */
export function retainKnownCodexQuota(snapshot: UsageSnapshot, previous?: PersistedUsageSnapshot): UsageSnapshot {
  if (!previous?.asOf) return snapshot;
  const previousIsNewer = !snapshot.asOf || Date.parse(previous.asOf) > Date.parse(snapshot.asOf);
  if (!previousIsNewer && (snapshot.fiveHourStatus !== 'unknown' || snapshot.weeklyStatus !== 'unknown')) return snapshot;
  if (!previous.fiveHour && !previous.weekly) return snapshot;
  return {
    ...snapshot,
    available: true,
    fiveHour: previous.fiveHour,
    weekly: previous.weekly,
    fiveHourStatus: previous.fiveHourStatus ?? (previous.fiveHour ? 'limited' : 'unknown'),
    weeklyStatus: previous.weeklyStatus ?? (previous.weekly ? 'limited' : 'unknown'),
    asOf: previous.asOf,
  };
}

export function createCodexUsageProvider(
  refreshMs: number,
  history: UsageHistoryStore,
): Provider<AiUsageToolData> {
  let lastAccountAttemptAt: number | undefined;
  let rememberedQuota: PersistedUsageSnapshot | undefined;
  let loadedRememberedQuota = false;
  const rememberedHistory: { points: UsageHistoryPoint[] } = { points: [] };

  const loadRememberedQuota = async (): Promise<PersistedUsageSnapshot | undefined> => {
    if (loadedRememberedQuota) return rememberedQuota;
    loadedRememberedQuota = true;
    try {
      const previous = await loadUsageSnapshot(history, 'ai-usage-codex');
      if (previous?.asOf && (previous.fiveHour || previous.weekly)) rememberedQuota = previous;
    } catch {
      // The persisted baseline is optional; a failed lookup must not fail the provider.
    }
    return rememberedQuota;
  };

  return {
    id: 'ai-usage-codex',
    schema: aiUsageToolSchema,
    refreshMs,
    timeoutMs: 25_000,
    isConfigured: () => true,
    fetch: async (signal, force) => {
      let snapshot = await codexSnapshot();
      const previous = rememberedQuota ?? await loadRememberedQuota();
      snapshot = retainKnownCodexQuota(snapshot, previous);
      // Recheck the account periodically even when no CLI turn has written a
      // session event. A manual Refresh always bypasses this local cooldown.
      if (force || lastAccountAttemptAt === undefined || Date.now() - lastAccountAttemptAt >= CODEX_ACCOUNT_REFRESH_MS) {
        lastAccountAttemptAt = Date.now();
        const account = await codexAccountSnapshot(signal);
        if (account.available) snapshot = account;
      }
      // Neither the local session log nor a failing account request is guaranteed to catch a window
      // rolling over — a quiet local log and a failing/cooling-down fallback both just leave
      // whatever was last read untouched. Left alone that reads as, say, a 5-hour window still
      // pinned at last night's 32% a full day later. Once a window's own reset has passed with
      // nothing fresher to confirm the real number, report 0% against a rolled-forward reset
      // instead of the stale, provably-wrong percentage.
      snapshot.fiveHour = carryPastReset(snapshot.fiveHour, FIVE_HOUR_MS);
      snapshot.weekly = carryPastReset(snapshot.weekly, WEEKLY_MS);
      if (snapshot.fiveHour || snapshot.weekly) rememberedQuota = { ...snapshot };
      return { ...snapshot, history: recordHistorySafely(history, 'ai-usage-codex', snapshot, rememberedHistory) };
    },
  };
}
