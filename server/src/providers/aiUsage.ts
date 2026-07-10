import { readdir, readFile } from 'node:fs/promises';
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

const DEFAULT_COOLDOWN_MS = 20 * 60_000;

interface ClaudeUsageState {
  cooldownUntil: number;
  /** Last successfully fetched snapshot, kept so a cooldown/error serves it instead of blanking the widget. */
  lastGood?: UsageSnapshot;
}

/**
 * Claude Code uses this account endpoint for the same percentages shown in its own usage UI.
 * The OAuth token is intentionally opt-in: API keys do not have subscription-limit data.
 *
 * The endpoint's real quota is looser than our poll interval (observed ~23 min Retry-After on a
 * single request), so a fixed schedule alone will periodically 429. `state.cooldownUntil` is
 * mutated in place so once we're told to back off, every call short-circuits — no network request,
 * no log spam — until the server-given wait has elapsed. While backed off (or on any other fetch
 * failure), we keep serving `state.lastGood` rather than going blank: it's still the most accurate
 * number we have, tagged with the `asOf` moment it was actually captured so the UI can show its age.
 */
async function claudeSnapshot(
  oauthToken: string | undefined,
  signal: AbortSignal,
  state: ClaudeUsageState,
): Promise<UsageSnapshot> {
  if (!oauthToken) return { available: false };
  if (Date.now() < state.cooldownUntil) return state.lastGood ?? { available: false };
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
      state.cooldownUntil =
        Date.now() + (Number.isFinite(retryAfterSec) ? retryAfterSec * 1_000 : DEFAULT_COOLDOWN_MS);
      return state.lastGood ?? { available: false };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const usage = claudeUsageSchema.parse(await response.json());
    const fiveHour = usage.five_hour
      ? limit(usage.five_hour.utilization, usage.five_hour.resets_at)
      : undefined;
    const weekly = usage.seven_day
      ? limit(usage.seven_day.utilization, usage.seven_day.resets_at)
      : undefined;
    const snapshot: UsageSnapshot = {
      available: Boolean(fiveHour || weekly),
      fiveHour,
      weekly,
      asOf: new Date().toISOString(),
    };
    state.lastGood = snapshot;
    return snapshot;
  } catch {
    // Do not log a response body: it can include account-specific information.
    console.warn('[ai-usage] Claude limit snapshot unavailable');
    return state.lastGood ?? { available: false };
  }
}

/**
 * Claude limits come from a rate-limited external API, so this stays on a conservative,
 * fixed cadence regardless of the Codex refresh setting — plus self-imposed backoff, see claudeSnapshot.
 */
export function createClaudeUsageProvider(
  claudeOauthToken: string | undefined,
  history: UsageHistoryStore,
): Provider<AiUsageToolData> {
  const state: ClaudeUsageState = { cooldownUntil: 0 };
  return {
    id: 'ai-usage-claude',
    schema: aiUsageToolSchema,
    refreshMs: 60_000,
    timeoutMs: 60_000,
    isConfigured: () => true,
    fetch: async (signal) => {
      const snapshot = await claudeSnapshot(claudeOauthToken, signal, state);
      return { ...snapshot, history: history.record('ai-usage-claude', snapshot) };
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
