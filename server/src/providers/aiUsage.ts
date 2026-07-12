import { readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { aiUsageToolSchema, type AiUsageToolData } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';
import type { UsageHistoryStore } from '../usageHistory.js';

/** What the snapshot readers produce; the provider fetch adds the store-managed `history`. */
type UsageSnapshot = Omit<AiUsageToolData, 'history'>;

const codexLimitSchema = z.object({
  used_percent: z.number(),
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

const claudeLimitSchema = z.object({
  utilization: z.number(),
  resets_at: z.string(),
});

const claudeUsageSchema = z.object({
  five_hour: claudeLimitSchema.nullish(),
  seven_day: claudeLimitSchema.nullish(),
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

/**
 * Codex appends the live account limits to its local session event stream. Read only the newest
 * few logs: limits are account-wide and a current session always writes into the latest files.
 */
async function codexSnapshot(): Promise<UsageSnapshot> {
  const sessionsDir = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'sessions');
  try {
    const files = (await jsonlFiles(sessionsDir)).sort().slice(-12);
    let newest:
      | { timestamp: string; primary?: z.infer<typeof codexLimitSchema>; secondary?: z.infer<typeof codexLimitSchema> }
      | undefined;

    for (const file of files) {
      const lines = (await readFile(file, 'utf8')).trim().split('\n');
      for (const line of lines) {
        try {
          const event = codexEventSchema.parse(JSON.parse(line));
          const limits = event.payload.rate_limits;
          if (!limits || (!limits.primary && !limits.secondary)) continue;
          if (!newest || event.timestamp > newest.timestamp) {
            newest = {
              timestamp: event.timestamp,
              primary: limits.primary ?? undefined,
              secondary: limits.secondary ?? undefined,
            };
          }
        } catch {
          // Session streams also contain unrelated messages; ignore malformed/irrelevant lines.
        }
      }
    }

    const fiveHour = newest?.primary && limit(newest.primary.used_percent, newest.primary.resets_at);
    const weekly = newest?.secondary && limit(newest.secondary.used_percent, newest.secondary.resets_at);
    const asOf = newest && asIso(newest.timestamp);
    return { available: Boolean(fiveHour || weekly), fiveHour, weekly, asOf };
  } catch {
    return { available: false };
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

type ClaudeQuota = Pick<UsageSnapshot, 'fiveHour' | 'weekly' | 'asOf'>;

/**
 * Floor between background attempts even after a success. `/api/oauth/usage`'s real quota is
 * roughly hourly per account — observed real Retry-After values have run 35–40 min, and every
 * request (including our own) counts against the same shared budget, so this must sit safely
 * above that or the scheduler re-trips the real limit on its own. This is what a manual `/usage`
 * check in the CLI *doesn't* have to worry about — it's a single on-demand request, not a
 * recurring poller — so the dashboard's Refresh button (`force`) bypasses this floor the same way,
 * but never bypasses an actual 429 (`rateLimitedUntil`).
 */
const MIN_QUOTA_POLL_INTERVAL_MS = 65 * 60_000;
const DEFAULT_QUOTA_COOLDOWN_MS = 65 * 60_000;
/** Don't re-serve a persisted quota reading older than this across restarts. */
const MAX_QUOTA_SEED_AGE_MS = 24 * 60 * 60_000;

interface ClaudeQuotaState {
  /** Set only on a real 429 from Anthropic; surfaced to the client as `rateLimitedUntil`. */
  rateLimitedUntil: number;
  /** Self-imposed pacing floor, set after every attempt so background polling can't outrun the real quota. */
  nextAttemptAt: number;
  /** Last successfully fetched reading, served during cooldowns/pacing instead of going blank. */
  lastGood?: ClaudeQuota;
}

/**
 * Mirrors the account-wide 5-hour/weekly percentages shown by the `claude` CLI's own `/usage`
 * command — same endpoint, same OAuth token. The OAuth token is intentionally opt-in: API keys
 * don't carry subscription-limit data.
 */
async function claudeQuotaSnapshot(
  oauthToken: string | undefined,
  signal: AbortSignal,
  state: ClaudeQuotaState,
  force: boolean,
  history: Pick<UsageHistoryStore, 'setBackoff'>,
): Promise<ClaudeQuota> {
  if (!oauthToken) return {};
  if (Date.now() < state.rateLimitedUntil) return state.lastGood ?? {};
  if (!force && Date.now() < state.nextAttemptAt) return state.lastGood ?? {};
  try {
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
      signal,
    });
    if (response.status === 429) {
      const retryAfterSec = Number(response.headers.get('retry-after'));
      state.rateLimitedUntil =
        Date.now() + (Number.isFinite(retryAfterSec) ? retryAfterSec * 1_000 : DEFAULT_QUOTA_COOLDOWN_MS);
      state.nextAttemptAt = state.rateLimitedUntil;
      history.setBackoff('ai-usage-claude', new Date(state.rateLimitedUntil).toISOString());
      history.setBackoff('ai-usage-claude-pacing', new Date(state.nextAttemptAt).toISOString());
      return state.lastGood ?? {};
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const usage = claudeUsageSchema.parse(await response.json());
    const quota: ClaudeQuota = {
      fiveHour: usage.five_hour ? limit(usage.five_hour.utilization, usage.five_hour.resets_at) : undefined,
      weekly: usage.seven_day ? limit(usage.seven_day.utilization, usage.seven_day.resets_at) : undefined,
      asOf: new Date().toISOString(),
    };
    state.lastGood = quota;
    state.rateLimitedUntil = 0;
    state.nextAttemptAt = Date.now() + MIN_QUOTA_POLL_INTERVAL_MS;
    history.setBackoff('ai-usage-claude', undefined);
    history.setBackoff('ai-usage-claude-pacing', new Date(state.nextAttemptAt).toISOString());
    return quota;
  } catch {
    // Do not log a response body: it can include account-specific information.
    console.warn('[ai-usage] Claude quota snapshot unavailable');
    return state.lastGood ?? {};
  }
}

export function createClaudeUsageProvider(
  claudeOauthToken: string | undefined,
  history: UsageHistoryStore,
): Provider<AiUsageToolData> {
  // Seed the quota's lastGood from disk so a restart mid-cooldown still serves the previous
  // reading (with its honest asOf age) instead of blanking that half of the widget.
  const persisted = history.getSnapshot('ai-usage-claude');
  const isFresh = persisted?.asOf !== undefined && Date.now() - Date.parse(persisted.asOf) < MAX_QUOTA_SEED_AGE_MS;
  const savedBackoff = Date.parse(history.getBackoff('ai-usage-claude') ?? '');
  const savedPacing = Date.parse(history.getBackoff('ai-usage-claude-pacing') ?? '');
  const quotaState: ClaudeQuotaState = {
    rateLimitedUntil: Number.isFinite(savedBackoff) ? Math.max(0, savedBackoff) : 0,
    nextAttemptAt: Number.isFinite(savedPacing) ? Math.max(0, savedPacing) : 0,
    lastGood: isFresh && (persisted.fiveHour || persisted.weekly) ? { fiveHour: persisted.fiveHour, weekly: persisted.weekly, asOf: persisted.asOf } : undefined,
  };
  return {
    id: 'ai-usage-claude',
    schema: aiUsageToolSchema,
    refreshMs: 60_000,
    timeoutMs: 15_000,
    isConfigured: () => true,
    fetch: async (signal, force) => {
      const [tokenTotals, quota] = await Promise.all([
        claudeTokenTotals(),
        claudeQuotaSnapshot(claudeOauthToken, signal, quotaState, force, history),
      ]);
      const snapshot: UsageSnapshot = {
        available: Boolean(quota.fiveHour || quota.weekly || tokenTotals.fiveHour || tokenTotals.weekly),
        fiveHour: quota.fiveHour,
        weekly: quota.weekly,
        tokens: tokenTotals,
        asOf: quota.asOf ?? new Date().toISOString(),
      };
      const rateLimitedUntil =
        quotaState.rateLimitedUntil > Date.now() ? new Date(quotaState.rateLimitedUntil).toISOString() : undefined;
      return { ...snapshot, rateLimitedUntil, history: history.record('ai-usage-claude', snapshot) };
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
      return { ...snapshot, history: history.record('ai-usage-codex', snapshot) };
    },
  };
}
