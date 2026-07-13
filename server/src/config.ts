import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const configSchema = z.object({
  calendar: z
    .object({
      /** Calendar display names to show; empty = all event calendars. */
      allowlist: z.array(z.string()).default([]),
    })
    .default({ allowlist: [] }),
  news: z
    .object({
      feeds: z.array(z.object({ name: z.string(), url: z.string() })).default([]),
    })
    .default({ feeds: [] }),
  aiUsage: z
    .object({
      /** How often to re-read Codex's local session files, in ms. Cheap — no external API call. */
      codexRefreshMs: z.number().int().min(5_000).default(30_000),
      /** How often to shell out to `claude -p "/usage"`, in ms. Each call writes a small local session file, so this stays coarser than Codex's file-read cadence. */
      claudeRefreshMs: z.number().int().min(60_000).default(15 * 60_000),
      /** Minimum spacing between recorded usage-history points, in ms. */
      historySampleMs: z.number().int().min(60_000).default(15 * 60_000),
      /** How long recorded usage-history points are kept. */
      historyRetentionDays: z.number().int().min(1).default(7),
    })
    .default({ codexRefreshMs: 30_000, claudeRefreshMs: 15 * 60_000, historySampleMs: 15 * 60_000, historyRetentionDays: 7 }),
  health: z
    .object({
      /** Daily step goal the widget's progress bar fills toward. */
      stepGoal: z.number().int().positive().default(10_000),
      /** Daily active-energy goal for the Apple Fitness Move ring. */
      moveGoalKcal: z.number().int().positive().default(500),
      /** Daily exercise-minutes goal (Apple's Move ring default is 30). */
      exerciseGoalMinutes: z.number().int().positive().default(30),
      /** Daily completed-stand-hours goal for the Apple Fitness Stand ring. */
      standGoalHours: z.number().int().positive().default(12),
      /** How many recent days of samples to retain for the trend chart. */
      historyRetentionDays: z.number().int().min(1).default(30),
    })
    .default({ stepGoal: 10_000, moveGoalKcal: 290, exerciseGoalMinutes: 30, standGoalHours: 12, historyRetentionDays: 30 }),
  code: z
    .object({
      /** Local parent directory to scan for git repos, per OS. Each immediate subdirectory with a .git and a GitHub-remote origin becomes a launchable project. */
      reposRoot: z.object({ darwin: z.string().optional(), win32: z.string().optional() }).default({}),
    })
    .default({ reposRoot: {} }),
});

export type AppConfig = z.infer<typeof configSchema>;

/** Non-secret settings (pinned repos, feeds, …) from server/config.json. */
export function loadConfig(): AppConfig {
  const file = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../config.json',
  );
  try {
    return configSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('⚠️  Could not read config.json — using defaults.', err);
    }
    return configSchema.parse({});
  }
}
