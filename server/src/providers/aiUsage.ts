import { chmod, readdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { spawn as spawnPty } from 'node-pty';
import { aiUsageToolSchema, type AiUsageToolData } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';
import type { UsageHistoryStore } from '../usageHistory.js';

const require = createRequire(import.meta.url);

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

export async function jsonlFiles(directory: string): Promise<string[]> {
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

/**
 * Fallback for when the local session log has nothing newer than the cached weekly reset: launch
 * a short-lived interactive `codex` session and read its `/status` panel directly, the same
 * PTY-probe approach used for Claude's `/usage`. Codex boots its configured MCP servers before
 * accepting input (can take 10s+), so nudge `/status` repeatedly rather than guess a fixed delay.
 * Slow, so it's a fallback for the fast local read, never a replacement for it.
 */
export async function codexInteractiveStatusSnapshot(): Promise<
  Pick<UsageSnapshot, 'fiveHour' | 'weekly' | 'fiveHourStatus' | 'weeklyStatus' | 'asOf'>
> {
  try {
    const localBin = path.join(os.homedir(), '.local/bin');
    // See the matching comment in claudeInteractiveUsageSnapshot: node-pty's macOS prebuilt helper
    // can lose its executable bit in npm installs that suppress lifecycle scripts.
    if (process.platform === 'darwin') {
      const packageRoot = path.resolve(path.dirname(require.resolve('node-pty')), '..');
      await chmod(path.join(packageRoot, 'prebuilds', `darwin-${process.arch}`, 'spawn-helper'), 0o755).catch(() => undefined);
    }
    const output = await new Promise<string>((resolve, reject) => {
      const pty = spawnPty(path.join(localBin, 'codex'), [], {
        name: 'xterm-256color',
        cols: 160,
        rows: 48,
        cwd: process.cwd(),
        env: { ...process.env, TERM: 'xterm-256color', PATH: `${localBin}:${process.env.PATH ?? ''}` },
      });
      let terminal = '';
      let settled = false;
      let settleTimer: NodeJS.Timeout | undefined;
      const finish = (result?: string, error?: Error) => {
        if (settled) return;
        settled = true;
        clearInterval(nudgeStatus);
        clearTimeout(timeout);
        clearTimeout(settleTimer);
        try {
          pty.kill();
        } catch {
          // The process may already have exited after rendering the status panel.
        }
        if (error) reject(error);
        else resolve(result ?? terminal);
      };
      const nudgeStatus = setInterval(() => pty.write('/status\r'), 4_000);
      const timeout = setTimeout(() => finish(undefined, new Error('Codex status panel timed out')), 50_000);
      pty.onData((chunk) => {
        terminal += chunk;
        if (/Weekly\s*limit\s*:/i.test(terminal)) {
          clearTimeout(settleTimer);
          settleTimer = setTimeout(() => finish(terminal), 750);
        }
      });
      pty.onExit(({ exitCode }) => {
        if (!settled) finish(undefined, new Error(`Codex exited before status rendered (${exitCode})`));
      });
    });
    return parseCodexStatusScreen(output);
  } catch {
    return { fiveHourStatus: 'unknown', weeklyStatus: 'unknown' };
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

export type ClaudeQuota = Pick<UsageSnapshot, 'fiveHour' | 'weekly' | 'modelWeekly' | 'fiveHourStatus' | 'weeklyStatus' | 'asOf'>;

/**
 * Recent Claude Code versions can return only run statistics from `claude -p "/usage"` when
 * an account is at its cap. That is not an authoritative zero-quota report, so retain the last
 * report that did include quota data. An explicit no-limits report has `asOf` and still replaces it.
 *
 * The retained report only holds while its own windows haven't reset yet: once a window's
 * `resetsAt` has passed, that percentage is provably wrong (the real window has moved on), not
 * merely stale, so it's dropped rather than kept forever — without this a single missed live read
 * (the interactive probe times out, transcripts are empty) could pin the widget to an old reading
 * indefinitely, since nothing else ever re-validates it.
 */
export function retainKnownClaudeQuota(live: ClaudeQuota, previous?: ClaudeQuota, now = Date.now()): ClaudeQuota {
  if (!previous) return live;
  const stillCurrent = <T extends { resetsAt: string }>(window: T | undefined) =>
    window && Date.parse(window.resetsAt) > now ? window : undefined;

  // Backfill per window, not per report: a live read can genuinely capture one window (e.g. the
  // 5-hour block) while missing another (e.g. weekly didn't render in time), and that partial read
  // still stamps `asOf`. Gating backfill on "the whole report has no asOf" would let a real 5-hour
  // reading silently blow away a still-valid weekly one merely because weekly didn't parse this tick.
  const retainedFiveHour = live.fiveHourStatus === 'unknown' ? stillCurrent(previous.fiveHour) : undefined;
  const retainedWeekly = live.weeklyStatus === 'unknown' ? stillCurrent(previous.weekly) : undefined;
  const retainedModelWeekly = live.weeklyStatus === 'unknown' ? stillCurrent(previous.modelWeekly) : undefined;
  if (!retainedFiveHour && !retainedWeekly && !retainedModelWeekly) return live;

  return {
    fiveHour: retainedFiveHour ?? live.fiveHour,
    weekly: retainedWeekly ?? live.weekly,
    modelWeekly: retainedModelWeekly ?? live.modelWeekly,
    fiveHourStatus: retainedFiveHour ? previous.fiveHourStatus : live.fiveHourStatus,
    weeklyStatus: retainedWeekly ? previous.weeklyStatus : live.weeklyStatus,
    asOf: live.asOf ?? previous.asOf,
  };
}

const MONTH_ABBREVIATIONS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * The interactive Usage screen reports reset times in the machine's own local time with no year,
 * e.g. "Jul 13 at 1:59am". Both windows reset within days, so resolving against the current year
 * and rolling forward if that lands in the past handles the Dec→Jan edge case correctly.
 */
function parseDatedResetAt(monthAbbr: string, day: string, hour: string, minute: string | undefined, meridiem: string, now = new Date()): string | undefined {
  const monthIndex = MONTH_ABBREVIATIONS.indexOf(monthAbbr.toLowerCase());
  if (monthIndex === -1) return undefined;
  let hour24 = Number(hour) % 12;
  if (meridiem.toLowerCase() === 'pm') hour24 += 12;
  const candidate = new Date(now.getFullYear(), monthIndex, Number(day), hour24, minute ? Number(minute) : 0);
  if (candidate.getTime() < now.getTime() - 24 * 60 * 60_000) candidate.setFullYear(candidate.getFullYear() + 1);
  return Number.isNaN(candidate.getTime()) ? undefined : candidate.toISOString();
}

/** The five-hour screen says only "Resets 5:20pm", so infer today or tomorrow locally. */
function parseTimeOnlyResetAt(hour: string, minute: string | undefined, meridiem: string, now = new Date()): string | undefined {
  let hour24 = Number(hour) % 12;
  if (meridiem.toLowerCase() === 'pm') hour24 += 12;
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour24, minute ? Number(minute) : 0);
  if (candidate.getTime() < now.getTime()) candidate.setDate(candidate.getDate() + 1);
  return Number.isNaN(candidate.getTime()) ? undefined : candidate.toISOString();
}

const WS = String.raw`\s*`;
const CURRENT_WEEK = String.raw`Current${WS}week${WS}\(`;
const ALL_MODELS_CLOSE = String.raw`all${WS}models${WS}\)`;
const ESC = '\u001B';
const BEL = '\u0007';
const OSC_SEQUENCE = new RegExp(String.raw`${ESC}\][^${BEL}]*(?:${BEL}|${ESC}\\)`, 'g'); // OSC title/hyperlink sequences.
const CSI_SEQUENCE = new RegExp(String.raw`${ESC}\[[0-?]*[ -/]*[@-~]`, 'g'); // CSI cursor/style sequences.

function stripTerminalControls(value: string): string {
  return value.replace(OSC_SEQUENCE, '').replace(CSI_SEQUENCE, '').replaceAll('\r', '');
}

/**
 * When Anthropic's usage endpoint itself is rate-limited, the Usage screen still renders the last
 * numbers it had under a "Showing last-known usage as of 50m ago (rate limited — try again in a
 * moment)" banner. Those numbers are real but old; without this, `asOf` would be stamped "now" on
 * every poll and the widget would look perfectly fresh while quietly serving an hours-stale reading.
 */
const STALE_USAGE_BANNER = new RegExp(String.raw`last-known${WS}usage${WS}as${WS}of${WS}(\d+)${WS}(m|h|d)${WS}ago`, 'i');

function staleBannerAgeMs(amount: string, unit: string): number {
  const msPerUnit: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(amount) * (msPerUnit[unit.toLowerCase()] ?? 60_000);
}

function parseUsageWindow(section: string, now: Date) {
  const used = /(\d{1,3}(?:\.\d{1,2})?)%\s*used/i.exec(section);
  const datedReset = /Resets\s*([a-z]{3})\s*(\d{1,2})\s*at\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(section);
  const timeOnlyReset = /Resets\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(section);
  if (!used || (!datedReset && !timeOnlyReset)) return undefined;
  const resetsAt = datedReset
    ? parseDatedResetAt(datedReset[1], datedReset[2], datedReset[3], datedReset[4], datedReset[5], now)
    : parseTimeOnlyResetAt(timeOnlyReset![1], timeOnlyReset![2], timeOnlyReset![3], now);
  return resetsAt ? limit(Number(used[1]), resetsAt) : undefined;
}

/**
 * The interactive Usage screen renders in place, redrawing the same header lines with updated
 * numbers as data comes in (e.g. an approximate figure first, then a corrected one once local
 * sessions finish scanning). The captured PTY stream is append-only, so an earlier, stale render
 * of "Current session" is still sitting in the buffer alongside the final one — parse only from
 * the last occurrence onward so a non-global `.exec` can't latch onto superseded numbers.
 */
function latestScreen(text: string): string {
  const headerRegex = new RegExp(`Current${WS}session`, 'gi');
  let lastIndex: number | undefined;
  let match: RegExpExecArray | null;
  while ((match = headerRegex.exec(text))) {
    lastIndex = match.index;
  }
  return lastIndex === undefined ? text : text.slice(lastIndex);
}

/**
 * `/usage` is an interactive Claude Code command. Print mode (`claude -p '/usage'`) treats it as
 * prompt text and returns run statistics rather than quota data, so launch a short, isolated
 * pseudo-terminal session. It sends only `/usage`, never a model prompt.
 */
/** Parse Claude Code's current multiline interactive Usage screen. */
export function parseClaudeUsageScreen(screen: string, now = new Date()): ClaudeQuota {
  const text = latestScreen(stripTerminalControls(screen));
  // Terminal cursor updates can erase visual spaces from the captured stream, so accept both
  // the readable UI labels and their compact `Currentsession` / `Currentweek(allmodels)` form.
  const sessionMatch = new RegExp(String.raw`Current${WS}session([\s\S]*?)(?=${CURRENT_WEEK}${WS}${ALL_MODELS_CLOSE}|$)`, 'i').exec(text);
  const weeklyMatch = new RegExp(String.raw`${CURRENT_WEEK}${WS}${ALL_MODELS_CLOSE}([\s\S]*)`, 'i').exec(text);
  const fiveHour = parseUsageWindow(sessionMatch?.[1] ?? '', now);
  const week = parseUsageWindow(weeklyMatch?.[1] ?? '', now);
  const modelMatch = new RegExp(
    String.raw`${CURRENT_WEEK}${WS}(?!${ALL_MODELS_CLOSE})([^)]+)\)([\s\S]*?)(?=${CURRENT_WEEK}|What's${WS}contributing|$)`,
    'i',
  ).exec(text);
  const modelLimit = modelMatch ? parseUsageWindow(modelMatch[2], now) : undefined;
  const modelWeekly = modelLimit && modelMatch ? { ...modelLimit, model: modelMatch[1].trim() } : undefined;
  const hasQuotaReport = Boolean(fiveHour || week || modelWeekly);
  const staleBanner = STALE_USAGE_BANNER.exec(text);
  const staleAgeMs = staleBanner ? staleBannerAgeMs(staleBanner[1], staleBanner[2]) : 0;
  const asOf = hasQuotaReport ? new Date(now.getTime() - staleAgeMs).toISOString() : undefined;
  return {
    fiveHour,
    weekly: week,
    modelWeekly,
    // Status is per-window, not per-report: whether *that window's own header* rendered at all,
    // not whether some other window (e.g. session) happened to parse. Otherwise a 5-hour reading
    // that lands fine would mark a weekly window that simply failed to capture this tick as an
    // explicit "unlimited" instead of "unknown" — see retainKnownClaudeQuota, which relies on this
    // distinction to know when it's safe to backfill from the last known-good weekly reading.
    fiveHourStatus: limitStatus(Boolean(fiveHour), Boolean(sessionMatch)),
    weeklyStatus: limitStatus(Boolean(week), Boolean(weeklyMatch)),
    asOf,
  };
}

export async function claudeInteractiveUsageSnapshot(): Promise<ClaudeQuota> {
  try {
    const localBin = path.join(os.homedir(), '.local/bin');
    const { CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY, ...cleanEnv } = process.env;
    // node-pty's macOS prebuilt helper can lose its executable bit in npm installations that
    // suppress lifecycle scripts. Restoring it is local, idempotent, and required to open a PTY.
    if (process.platform === 'darwin') {
      const packageRoot = path.resolve(path.dirname(require.resolve('node-pty')), '..');
      await chmod(path.join(packageRoot, 'prebuilds', `darwin-${process.arch}`, 'spawn-helper'), 0o755).catch(() => undefined);
    }
    const output = await new Promise<string>((resolve, reject) => {
      const pty = spawnPty(path.join(localBin, 'claude'), [], {
        name: 'xterm-256color',
        cols: 160,
        rows: 48,
        cwd: process.cwd(),
        env: { ...cleanEnv, TERM: 'xterm-256color', PATH: `${localBin}:${cleanEnv.PATH ?? ''}` },
      });
      let terminal = '';
      let settled = false;
      let settleTimer: NodeJS.Timeout | undefined;
      const finish = (result?: string, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(sendUsage);
        clearTimeout(timeout);
        clearTimeout(settleTimer);
        try {
          pty.kill();
        } catch {
          // The process may already have exited after rendering the Usage screen.
        }
        if (error) reject(error);
        else resolve(result ?? terminal);
      };
      const sendUsage = setTimeout(() => pty.write('/usage\r'), 2_000);
      const timeout = setTimeout(() => finish(undefined, new Error('Claude Usage screen timed out')), 35_000);
      pty.onData((chunk) => {
        terminal += chunk;
        // Re-arm on every chunk, not just ones that parse cleanly. The Usage screen redraws in
        // place as data streams in, and a redraw's header line can land in an earlier chunk than
        // its percentage line; debouncing only on successful parses left a stale timer free to
        // fire mid-redraw, capturing a header with no digits yet — which the parser reads as an
        // explicit "no limit" instead of "still rendering" (see parseClaudeUsageScreen/limitStatus).
        // Waiting for genuine quiet, then re-checking, avoids freezing on that half-drawn state.
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          const quota = parseClaudeUsageScreen(terminal);
          if (quota.fiveHour && quota.weekly) finish(terminal);
        }, 750);
      });
      pty.onExit(({ exitCode }) => {
        if (!settled) finish(undefined, new Error(`Claude exited before Usage rendered (${exitCode})`));
      });
    });
    return parseClaudeUsageScreen(output);
  } catch {
    return { fiveHourStatus: 'unknown', weeklyStatus: 'unknown' };
  }
}

function usageReportsIn(value: unknown, reports: string[]): void {
  if (typeof value === 'string') {
    if (/Current\s*session/i.test(value) && /Current\s*week\s*\(\s*all\s*models\s*\)/i.test(value)) reports.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => usageReportsIn(entry, reports));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => usageReportsIn(entry, reports));
  }
}

/** The interactive CLI persists its rendered Usage report in session transcripts. This is a
 * fallback for a transient PTY failure, not a substitute for the live interactive probe. */
async function claudeTranscriptUsageSnapshot(): Promise<ClaudeQuota> {
  try {
    const projectsDir = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'projects');
    const files = await jsonlFiles(projectsDir);
    let latest: { at: Date; report: string } | undefined;
    await Promise.all(files.map(async (file) => {
      const fileInfo = await stat(file);
      if (Date.now() - fileInfo.mtimeMs > WEEKLY_MS) return;
      for (const line of (await readFile(file, 'utf8')).split('\n')) {
        try {
          const entry = JSON.parse(line) as { timestamp?: string };
          if (!entry.timestamp) continue;
          const at = new Date(entry.timestamp);
          if (Number.isNaN(at.getTime())) continue;
          const reports: string[] = [];
          usageReportsIn(entry, reports);
          for (const report of reports) {
            if (!latest || at > latest.at) latest = { at, report };
          }
        } catch {
          // A concurrently-written transcript can have one incomplete final line.
        }
      }
    }));
    return latest ? parseClaudeUsageScreen(latest.report, latest.at) : { fiveHourStatus: 'unknown', weeklyStatus: 'unknown' };
  } catch {
    return { fiveHourStatus: 'unknown', weeklyStatus: 'unknown' };
  }
}

export function claudeNextRefreshMs(data: UsageSnapshot | undefined, refreshMs: number, now = Date.now()): number {
  const cappedResets = [data?.fiveHour, data?.weekly]
    .filter((window): window is NonNullable<typeof window> => Boolean(window && window.usedPercent >= 100))
    .map((window) => Date.parse(window.resetsAt) - now)
    .filter((delay) => Number.isFinite(delay) && delay > 0);
  return cappedResets.length > 0 ? Math.max(...cappedResets) + 5_000 : refreshMs;
}

export function createClaudeUsageProvider(refreshMs: number, history: UsageHistoryStore): Provider<AiUsageToolData> {
  let rememberedQuota: ClaudeQuota | undefined;
  let loadedRememberedQuota = false;

  const loadRememberedQuota = async (): Promise<ClaudeQuota | undefined> => {
    if (loadedRememberedQuota) return rememberedQuota;
    loadedRememberedQuota = true;
    try {
      const snapshot = await history.getSnapshot('ai-usage-claude');
      if (snapshot?.asOf && (snapshot.fiveHour || snapshot.weekly || snapshot.modelWeekly)) {
        rememberedQuota = {
          fiveHour: snapshot.fiveHour,
          weekly: snapshot.weekly,
          modelWeekly: snapshot.modelWeekly,
          fiveHourStatus: snapshot.fiveHourStatus ?? (snapshot.fiveHour ? 'limited' : 'unknown'),
          weeklyStatus: snapshot.weeklyStatus ?? (snapshot.weekly ? 'limited' : 'unknown'),
          asOf: snapshot.asOf,
        };
      }
    } catch {
      // A history lookup must not turn a usable token-total snapshot into a provider failure.
    }
    return rememberedQuota;
  };

  return {
    id: 'ai-usage-claude',
    schema: aiUsageToolSchema,
    refreshMs,
    timeoutMs: 40_000,
    isConfigured: () => true,
    fetch: async () => {
      const [tokenTotals, liveQuota, transcriptQuota] = await Promise.all([
        claudeTokenTotals(), claudeInteractiveUsageSnapshot(), claudeTranscriptUsageSnapshot(),
      ]);
      const observedQuota = liveQuota.asOf ? liveQuota : transcriptQuota;
      const previousQuota = observedQuota.asOf ? rememberedQuota : rememberedQuota ?? await loadRememberedQuota();
      const quota = retainKnownClaudeQuota(observedQuota, previousQuota);
      if (observedQuota.asOf) rememberedQuota = observedQuota;
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
    nextRefreshMs: (data) => claudeNextRefreshMs(data, refreshMs),
  };
}

/** How often a stale-by-clock reading may retry the slow interactive `/status` fallback. */
const CODEX_STATUS_FALLBACK_COOLDOWN_MS = 5 * 60_000;

type CodexFallback = Pick<UsageSnapshot, 'fiveHour' | 'weekly' | 'fiveHourStatus' | 'weeklyStatus' | 'asOf'>;

/** Overwrite one stale window (`bucket`) in `snapshot` with the fallback's reading, if the fallback
 * itself isn't also stale. Applied separately per window since Codex's `/status` panel today only
 * ever reports the weekly one — the 5-hour bucket stays untouched (and local-only) until it does. */
function applyCodexFallbackWindow(
  bucket: 'fiveHour' | 'weekly',
  snapshot: UsageSnapshot,
  fallback: CodexFallback,
): void {
  const statusKey = bucket === 'fiveHour' ? 'fiveHourStatus' : 'weeklyStatus';
  if (!isCodexLimitStale(snapshot[bucket], snapshot.asOf)) return;
  if (isCodexLimitStale(fallback[bucket], fallback.asOf)) return;
  snapshot[bucket] = fallback[bucket];
  snapshot[statusKey] = fallback[statusKey];
  snapshot.asOf = fallback.asOf ?? snapshot.asOf;
  snapshot.available = true;
}

/** Codex just re-reads local session files, so its cadence is configurable — see config.json. That
 * read is only ever as fresh as the last real Codex CLI turn, though — see isCodexLimitStale for
 * why a quiet local log doesn't just mean "no change." Only once a window is judged stale do we
 * fall back to the slow interactive `/status` probe, throttled so a quiet stretch doesn't spawn it
 * every tick; a successful live read is itself remembered and reused until it goes stale in turn. */
export function createCodexUsageProvider(
  refreshMs: number,
  history: UsageHistoryStore,
): Provider<AiUsageToolData> {
  let fallback: CodexFallback = { fiveHourStatus: 'unknown', weeklyStatus: 'unknown' };
  let lastFallbackAttemptAt = 0;

  return {
    id: 'ai-usage-codex',
    schema: aiUsageToolSchema,
    refreshMs,
    timeoutMs: 60_000,
    isConfigured: () => true,
    fetch: async (_signal, force) => {
      const snapshot = await codexSnapshot();
      const needsFallback = (['fiveHour', 'weekly'] as const).some(
        (bucket) => isCodexLimitStale(snapshot[bucket], snapshot.asOf) && isCodexLimitStale(fallback[bucket], fallback.asOf),
      );
      if (needsFallback && (force || Date.now() - lastFallbackAttemptAt > CODEX_STATUS_FALLBACK_COOLDOWN_MS)) {
        lastFallbackAttemptAt = Date.now();
        const status = await codexInteractiveStatusSnapshot();
        if (status.fiveHour || status.weekly) fallback = status;
      }
      applyCodexFallbackWindow('fiveHour', snapshot, fallback);
      applyCodexFallbackWindow('weekly', snapshot, fallback);
      return { ...snapshot, history: await history.record('ai-usage-codex', snapshot) };
    },
  };
}
