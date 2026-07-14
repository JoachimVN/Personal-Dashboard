import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { aiUsageToolSchema, type AiUsageToolData } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';
import type { UsageHistoryStore } from '../usageHistory.js';

/** What the snapshot readers produce; the provider fetch adds the store-managed `history`. */
type UsageSnapshot = Omit<AiUsageToolData, 'history'>;
type LimitStatus = AiUsageToolData['fiveHourStatus'];

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

function limit(usedPercent: number, resetsAt: number | string) {
  const reset =
    typeof resetsAt === 'number' ? new Date(resetsAt * 1_000) : new Date(resetsAt);
  if (!Number.isFinite(usedPercent) || Number.isNaN(reset.getTime())) return undefined;
  return {
    usedPercent: Math.max(0, Math.min(100, usedPercent)),
    resetsAt: reset.toISOString(),
  };
}

export function limitStatus(hasLimit: boolean, hasQuotaReport: boolean): LimitStatus {
  if (hasLimit) return 'limited';
  return hasQuotaReport ? 'unlimited' : 'unknown';
}

async function jsonlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return jsonlFiles(entryPath);
      return entry.isFile() && entry.name.endsWith('.jsonl') ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

function asIso(timestamp: string): string | undefined {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** 5h = 300 minutes, weekly = 10080 minutes; classify with slack rather than exact-matching. */
function windowBucket(windowMinutes: number): 'fiveHour' | 'weekly' | undefined {
  if (windowMinutes > 0 && windowMinutes <= 600) return 'fiveHour';
  if (windowMinutes >= 5000 && windowMinutes <= 20000) return 'weekly';
  return undefined;
}

type TimestampedCodexLimit = { timestamp: string; entry: z.infer<typeof codexLimitSchema> };

interface CodexLimits {
  fiveHour?: TimestampedCodexLimit;
  weekly?: TimestampedCodexLimit;
  latestReport?: { timestamp: string; buckets: Array<'fiveHour' | 'weekly'> };
}

function recordLatestLimit(
  limits: CodexLimits,
  timestamp: string,
  entry: z.infer<typeof codexLimitSchema>,
): 'fiveHour' | 'weekly' | undefined {
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
      if (!limits.latestReport || event.timestamp > limits.latestReport.timestamp) {
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
 * `window_minutes` rather than trusting the slot. The latest rate-limit event is authoritative:
 * if it omits a window, the dashboard reports that window as temporarily unlimited instead of
 * showing a stale cap from an older session event.
 */
async function codexSnapshot(): Promise<UsageSnapshot> {
  const sessionsDir = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'sessions');
  try {
    const files = (await jsonlFiles(sessionsDir)).sort((a, b) => a.localeCompare(b)).slice(-12);
    const latest: CodexLimits = {};

    for (const file of files) {
      const lines = (await readFile(file, 'utf8')).trim().split('\n');
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

const claudeTranscriptEntrySchema = z.object({
  type: z.literal('assistant'),
  timestamp: z.string(),
  message: z.object({
    usage: z.object({
      input_tokens: z.number(),
      output_tokens: z.number().optional(),
      cache_creation_input_tokens: z.number().optional(),
      cache_read_input_tokens: z.number().optional(),
    }),
  }),
});

const FIVE_HOUR_MS = 5 * 60 * 60_000;
const WEEKLY_MS = 7 * 24 * 60 * 60_000;

/**
 * Claude Code writes every turn's token usage into local session transcripts
 * (`~/.claude/projects/**\/*.jsonl`) as it works — reading those locally gives a genuinely live,
 * zero-network total of tokens actually used in the same rolling 5-hour/weekly windows the
 * account-wide quota below tracks, without an extra rate-limited network call. Only files modified
 * within the weekly window are read at all: an untouched file's newest entry can't be newer than
 * its own mtime, so anything older is guaranteed out of range.
 */
async function claudeTokenTotals(): Promise<{ fiveHour: number; weekly: number }> {
  const projectsDir = path.join(
    process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'),
    'projects',
  );
  const now = Date.now();
  let fiveHour = 0;
  let weekly = 0;
  try {
    const files = await jsonlFiles(projectsDir);
    const recentFiles = (
      await Promise.all(files.map(async (file) => ({ file, mtime: (await stat(file)).mtimeMs })))
    ).filter(({ mtime }) => now - mtime < WEEKLY_MS);

    await Promise.all(
      recentFiles.map(async ({ file }) => {
        const lines = (await readFile(file, 'utf8')).trim().split('\n');
        for (const line of lines) {
          let entry;
          try {
            entry = claudeTranscriptEntrySchema.parse(JSON.parse(line));
          } catch {
            continue; // Transcripts also contain non-assistant / tool entries; skip anything else.
          }
          const at = Date.parse(entry.timestamp);
          const age = now - at;
          if (!Number.isFinite(at) || age > WEEKLY_MS) continue;
          const { usage } = entry.message;
          const tokens =
            usage.input_tokens +
            (usage.output_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0);
          weekly += tokens;
          if (age <= FIVE_HOUR_MS) fiveHour += tokens;
        }
      }),
    );
  } catch {
    // No local transcripts available; totals stay at zero.
  }
  return { fiveHour, weekly };
}

type ClaudeQuota = Pick<UsageSnapshot, 'fiveHour' | 'weekly' | 'modelWeekly' | 'fiveHourStatus' | 'weeklyStatus' | 'asOf'>;

const execFileAsync = promisify(execFile);

const MONTH_ABBREVIATIONS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** `claude -p "/usage"` prints e.g. "Current session: 41% used · resets Jul 13 at 1:59am (Europe/Oslo)". */
const QUOTA_TAIL = String.raw`(\d+)%\s*used.*?resets\s+([a-z]{3})\s+(\d{1,2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)`;
const SESSION_LINE = new RegExp(String.raw`Current session:\s*${QUOTA_TAIL}`, 'i');
const WEEKLY_LINE = new RegExp(String.raw`Current week \(all models\):\s*${QUOTA_TAIL}`, 'i');
/** Model-specific weekly cap, e.g. "Current week (Fable): 49% used · …" — the model name varies by plan/era. */
const MODEL_WEEK_LINE = new RegExp(String.raw`Current week \((?!all models)([^)]+)\):\s*${QUOTA_TAIL}`, 'i');
const NO_LIMITS_PATTERNS = [
  /no\s+(?:active\s+)?(?:usage\s+)?limits?/i,
  /unlimited/i,
  /limits?\s+(?:are\s+)?not\s+(?:currently\s+)?enforced/i,
  /limits?\s+(?:are\s+)?temporarily\s+(?:disabled|removed|lifted)/i,
];

const cliResultSchema = z.object({
  is_error: z.boolean(),
  result: z.string().optional(),
});

/**
 * The CLI reports reset times in the machine's own local time with no year, e.g. "Jul 13 at
 * 1:59am" — both windows reset within days, so resolving against the current year and rolling
 * forward if that lands in the past handles the one edge case (a Dec→Jan reset) correctly.
 */
function parseResetsAt(monthAbbr: string, day: string, hour: string, minute: string | undefined, meridiem: string): string | undefined {
  const monthIndex = MONTH_ABBREVIATIONS.indexOf(monthAbbr.toLowerCase());
  if (monthIndex === -1) return undefined;
  let hour24 = Number(hour) % 12;
  if (meridiem.toLowerCase() === 'pm') hour24 += 12;
  const now = new Date();
  const candidate = new Date(now.getFullYear(), monthIndex, Number(day), hour24, minute ? Number(minute) : 0);
  if (candidate.getTime() < now.getTime() - 24 * 60 * 60_000) candidate.setFullYear(candidate.getFullYear() + 1);
  return Number.isNaN(candidate.getTime()) ? undefined : candidate.toISOString();
}

/** `groups` is the QUOTA_TAIL captures: percent, month, day, hour, minute?, am/pm. */
function parseQuota(groups: string[]) {
  const [percent, monthAbbr, day, hour, minute, meridiem] = groups;
  const resetsAt = parseResetsAt(monthAbbr, day, hour, minute, meridiem);
  return resetsAt ? limit(Number(percent), resetsAt) : undefined;
}

function parseLine(result: string, pattern: RegExp) {
  const match = pattern.exec(result);
  return match ? parseQuota(match.slice(1)) : undefined;
}

function parseModelWeekLine(result: string) {
  const match = MODEL_WEEK_LINE.exec(result);
  if (!match) return undefined;
  const quota = parseQuota(match.slice(2));
  return quota && { ...quota, model: match[1].trim() };
}

/**
 * `claude -p "/usage"` is a local command the CLI short-circuits before it ever reaches the
 * model — zero token cost, and it doesn't touch the `/api/oauth/usage` endpoint this used to call
 * directly, which turned out to be rate-limited to the point of never returning a good reading on
 * this machine (see git history). It does write a small local session transcript per invocation,
 * which is why this provider's refresh cadence stays coarse (see `aiUsage.claudeRefreshMs`).
 */
async function claudeCliUsageSnapshot(): Promise<ClaudeQuota> {
  try {
    // The native installer puts `claude` in ~/.local/bin, which interactive-shell-only PATH
    // customizations (.zshrc etc.) may add but a non-interactive launchd process won't inherit.
    const localBin = path.join(os.homedir(), '.local/bin');
    // Strip any Anthropic auth env vars this server process happens to carry (e.g. a leftover
    // CLAUDE_CODE_OAUTH_TOKEN in server/.env): inheriting one makes the child authenticate
    // differently than an interactive `claude` session and switches /usage to a different,
    // non-percentage report.
    const { CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY, ...cleanEnv } = process.env;
    const { stdout } = await execFileAsync('claude', ['-p', '/usage', '--output-format', 'json'], {
      timeout: 20_000,
      killSignal: 'SIGKILL',
      env: { ...cleanEnv, PATH: `${localBin}:${cleanEnv.PATH ?? ''}` },
    });
    const parsed = cliResultSchema.parse(JSON.parse(stdout));
    if (parsed.is_error || !parsed.result) {
      return { fiveHourStatus: 'unknown', weeklyStatus: 'unknown' };
    }
    const result = parsed.result;
    const fiveHour = parseLine(result, SESSION_LINE);
    const weekly = parseLine(result, WEEKLY_LINE);
    const modelWeekly = parseModelWeekLine(result);
    // Unlike Codex (where the latest rate-limit event is authoritative about which windows
    // exist), Claude's /usage simply omits "Current session" when no 5-hour session is active —
    // so only an explicit no-limits line justifies reporting a window as unlimited.
    const noLimits = NO_LIMITS_PATTERNS.some((pattern) => pattern.test(result));
    const hasQuotaReport = Boolean(fiveHour || weekly || modelWeekly || noLimits);
    return {
      fiveHour,
      weekly,
      modelWeekly,
      fiveHourStatus: limitStatus(Boolean(fiveHour), noLimits),
      weeklyStatus: limitStatus(Boolean(weekly), noLimits),
      asOf: hasQuotaReport ? new Date().toISOString() : undefined,
    };
  } catch {
    // Do not log stdout: the usage report includes account-specific numbers.
    console.warn('[ai-usage] Claude CLI usage snapshot unavailable');
    return { fiveHourStatus: 'unknown', weeklyStatus: 'unknown' };
  }
}

export function createClaudeUsageProvider(refreshMs: number, history: UsageHistoryStore): Provider<AiUsageToolData> {
  return {
    id: 'ai-usage-claude',
    schema: aiUsageToolSchema,
    refreshMs,
    timeoutMs: 25_000,
    isConfigured: () => true,
    fetch: async () => {
      const [tokenTotals, quota] = await Promise.all([claudeTokenTotals(), claudeCliUsageSnapshot()]);
      const snapshot: UsageSnapshot = {
        available: Boolean(quota.asOf || tokenTotals.fiveHour || tokenTotals.weekly),
        fiveHour: quota.fiveHour,
        weekly: quota.weekly,
        modelWeekly: quota.modelWeekly,
        fiveHourStatus: quota.fiveHourStatus,
        weeklyStatus: quota.weeklyStatus,
        tokens: tokenTotals,
        asOf: quota.asOf ?? new Date().toISOString(),
      };
      return { ...snapshot, history: await history.record('ai-usage-claude', snapshot) };
    },
  };
}

/** Codex just re-reads local session files, so its cadence is configurable — see config.json. */
export function createCodexUsageProvider(
  refreshMs: number,
  history: UsageHistoryStore,
): Provider<AiUsageToolData> {
  return {
    id: 'ai-usage-codex',
    schema: aiUsageToolSchema,
    refreshMs,
    timeoutMs: 10_000,
    isConfigured: () => true,
    fetch: async () => {
      const snapshot = await codexSnapshot();
      return { ...snapshot, history: await history.record('ai-usage-codex', snapshot) };
    },
  };
}
