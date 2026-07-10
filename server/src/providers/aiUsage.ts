import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { aiUsageSchema, type AiUsageData } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';

const execFileAsync = promisify(execFile);

// ccusage's JSON output is an external contract — the dependency is pinned
// exactly. `claude` days carry totalCost + modelBreakdowns; `codex` days carry
// costUSD + a models map without per-model cost.
const dailySchema = z.object({
  daily: z.array(
    z.object({
      date: z.string(),
      totalTokens: z.number(),
      totalCost: z.number().optional(),
      costUSD: z.number().optional(),
      modelBreakdowns: z
        .array(
          z.object({
            modelName: z.string(),
            cost: z.number(),
            inputTokens: z.number(),
            outputTokens: z.number(),
            cacheCreationTokens: z.number(),
            cacheReadTokens: z.number(),
          }),
        )
        .optional(),
      models: z.record(z.string(), z.object({ totalTokens: z.number() })).optional(),
    }),
  ),
});

type Day = z.infer<typeof dailySchema>['daily'][number];
type Tool = 'claude' | 'codex';

function ccusageBin(): string {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve('ccusage/package.json');
  const pkg = require('ccusage/package.json') as { bin: Record<string, string> };
  return path.join(path.dirname(pkgPath), pkg.bin.ccusage);
}

const dayCost = (day: Day) => day.totalCost ?? day.costUSD ?? 0;

/** Last `count` dates ending today, as YYYY-MM-DD in the given timezone. */
function recentDates(timezone: string, count: number): string[] {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  return Array.from({ length: count }, (_, i) =>
    fmt.format(new Date(Date.now() - (count - 1 - i) * 86_400_000)),
  );
}

function summarizeTool(tool: Tool, days: Day[], timezone: string): AiUsageData['tools'][number] {
  const dates = recentDates(timezone, 14);
  const today = dates[dates.length - 1];
  const weekDates = new Set(dates.slice(-7));
  const byDate = new Map(days.map((day) => [day.date, day]));

  const todayEntry = byDate.get(today);
  const weekEntries = days.filter((day) => weekDates.has(day.date));

  const models = new Map<string, { tokens: number; cost?: number }>();
  for (const day of weekEntries) {
    for (const breakdown of day.modelBreakdowns ?? []) {
      const entry = models.get(breakdown.modelName) ?? { tokens: 0, cost: 0 };
      entry.tokens +=
        breakdown.inputTokens +
        breakdown.outputTokens +
        breakdown.cacheCreationTokens +
        breakdown.cacheReadTokens;
      entry.cost = (entry.cost ?? 0) + breakdown.cost;
      models.set(breakdown.modelName, entry);
    }
    for (const [name, usage] of Object.entries(day.models ?? {})) {
      const entry = models.get(name) ?? { tokens: 0 };
      entry.tokens += usage.totalTokens;
      models.set(name, entry);
    }
  }

  return {
    tool,
    available: days.length > 0,
    today: {
      cost: todayEntry ? dayCost(todayEntry) : 0,
      tokens: todayEntry?.totalTokens ?? 0,
    },
    week: {
      cost: weekEntries.reduce((sum, day) => sum + dayCost(day), 0),
      tokens: weekEntries.reduce((sum, day) => sum + day.totalTokens, 0),
    },
    models: [...models.entries()]
      .map(([name, entry]) => ({ name, ...entry }))
      .sort((a, b) => b.tokens - a.tokens),
    days: dates.map((date) => {
      const day = byDate.get(date);
      return { date, cost: day ? dayCost(day) : 0 };
    }),
  };
}

export function createAiUsageProvider(timezone: string): Provider<AiUsageData> {
  const bin = ccusageBin();

  const runTool = async (tool: Tool, signal: AbortSignal): Promise<Day[]> => {
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [bin, tool, 'daily', '--json', '--timezone', timezone],
        { signal, maxBuffer: 64 * 1024 * 1024 },
      );
      return dailySchema.parse(JSON.parse(stdout)).daily;
    } catch (err) {
      if (signal.aborted) throw err;
      // No usage data on this machine (or ccusage failed for this tool only).
      console.warn(`[ai-usage] ccusage ${tool} unavailable:`, (err as Error).message);
      return [];
    }
  };

  return {
    id: 'ai-usage',
    schema: aiUsageSchema,
    refreshMs: 5 * 60_000,
    timeoutMs: 60_000,
    isConfigured: () => true,
    async fetch(signal) {
      const [claude, codex] = await Promise.all([
        runTool('claude', signal),
        runTool('codex', signal),
      ]);
      return {
        tools: [
          summarizeTool('claude', claude, timezone),
          summarizeTool('codex', codex, timezone),
        ],
      };
    },
  };
}
