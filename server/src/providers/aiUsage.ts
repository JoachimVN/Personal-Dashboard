import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { aiUsageSchema, type AiUsageData } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';

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

type Snapshot = AiUsageData['tools'][number];

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

/**
 * Codex appends the live account limits to its local session event stream. Read only the newest
 * few logs: limits are account-wide and a current session always writes into the latest files.
 */
async function codexSnapshot(): Promise<Snapshot> {
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
    return { tool: 'codex', available: Boolean(fiveHour || weekly), fiveHour, weekly };
  } catch {
    return { tool: 'codex', available: false };
  }
}

/**
 * Claude Code uses this account endpoint for the same percentages shown in its own usage UI.
 * The OAuth token is intentionally opt-in: API keys do not have subscription-limit data.
 */
async function claudeSnapshot(oauthToken: string | undefined, signal: AbortSignal): Promise<Snapshot> {
  if (!oauthToken) return { tool: 'claude', available: false };
  try {
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
      signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const usage = claudeUsageSchema.parse(await response.json());
    const fiveHour = usage.five_hour
      ? limit(usage.five_hour.utilization, usage.five_hour.resets_at)
      : undefined;
    const weekly = usage.seven_day
      ? limit(usage.seven_day.utilization, usage.seven_day.resets_at)
      : undefined;
    return { tool: 'claude', available: Boolean(fiveHour || weekly), fiveHour, weekly };
  } catch {
    // Do not log a response body: it can include account-specific information.
    console.warn('[ai-usage] Claude limit snapshot unavailable');
    return { tool: 'claude', available: false };
  }
}

export function createAiUsageProvider(claudeOauthToken?: string): Provider<AiUsageData> {
  return {
    id: 'ai-usage',
    schema: aiUsageSchema,
    refreshMs: 5 * 60_000,
    timeoutMs: 60_000,
    isConfigured: () => true,
    async fetch(signal) {
      const [claude, codex] = await Promise.all([
        claudeSnapshot(claudeOauthToken, signal),
        codexSnapshot(),
      ]);
      return { tools: [claude, codex] };
    },
  };
}
