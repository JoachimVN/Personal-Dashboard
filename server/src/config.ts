import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POWER_AREAS } from '@personal-dashboard/shared';
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
  aiNews: z
    .object({
      feeds: z
        .array(z.object({ name: z.string(), url: z.string(), provider: z.enum(['openai', 'anthropic']) }))
        .default([]),
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
      /** Trailing completed days used for personal physiological baselines. */
      baselineWindowDays: z.number().int().min(3).default(7),
      /** Minimum percentage away from the personal baseline before it becomes a signal. */
      baselineDeviationPercent: z.number().positive().default(15),
    })
    .default({ stepGoal: 10_000, moveGoalKcal: 290, exerciseGoalMinutes: 30, standGoalHours: 12, historyRetentionDays: 30, baselineWindowDays: 7, baselineDeviationPercent: 15 }),
  commandCenter: z.object({
    /** How old the newest unread thread's message must be before the inbox is deprioritized as ignored, not urgent. */
    gmailStaleMs: z.number().int().min(60_000).default(24 * 60 * 60_000),
    /** How recently the newest unread thread's message must have arrived to count as "new mail just arrived". */
    gmailFreshMs: z.number().int().min(60_000).default(30 * 60_000),
    /** Trailing days used for non-health "is this unusual for me" comparisons (GitHub, AI usage). */
    baselineWindowDays: z.number().int().min(3).default(14),
    /** Minimum percentage away from the rolling average before it becomes a signal. */
    baselineDeviationPercent: z.number().positive().default(50),
    /** How recently a #1 track/artist/album must have changed to count as a "new favorite" — generous because Spotify's own top-lists only refresh every ~12h. */
    spotifyFreshMs: z.number().int().min(60_000).default(48 * 60 * 60_000),
    /** Today's forecast max °C at or above this becomes a "heat today" signal. */
    weatherHotC: z.number().default(25),
    /** Today's forecast min °C at or below this becomes a "cold today" signal. */
    weatherColdC: z.number().default(-10),
    /** Today's forecast peak wind speed (m/s) at or above this becomes a "windy today" signal. */
    weatherWindMs: z.number().default(12),
    /** Today's forecast peak UV index at or above this becomes a "high UV" signal (8 = WHO "very high"). */
    weatherUvHigh: z.number().default(8),
    /** How recently an unread iMessage must have arrived to count as "new", vs. just sitting unread. */
    imessageFreshMs: z.number().int().min(60_000).default(30 * 60_000),
    /** How recently a Steam achievement must have unlocked to surface as a signal. Advanced tuning — leave at the default. */
    steamAchievementFreshMs: z.number().int().min(60_000).default(7 * 24 * 60 * 60_000),
    /** An unlocked achievement's global unlock % at or below this counts as "rare" and outranks a routine unlock. */
    steamRareAchievementPercent: z.number().positive().max(100).default(10),
    /** Total-hours-played thresholds for the tracked game that count as a milestone worth surfacing. */
    steamPlaytimeMilestoneHours: z.array(z.number().positive()).default([10, 25, 50, 100, 250, 500, 1000]),
    /** How recently a game-completion, playtime milestone, or friends-leaderboard rank change must have happened to still count as "just happened". */
    steamMomentFreshMs: z.number().int().min(60_000).default(3 * 24 * 60 * 60_000),
    /** Current spot price at or above this multiple of today's average becomes a "price spike" signal. */
    powerSpikeRatio: z.number().positive().default(1.5),
    /** ...but only when the price is also at least this many NOK/kWh — a spike off a near-zero average isn't worth surfacing. */
    powerSpikeMinNok: z.number().positive().default(1),
  }).default({
    gmailStaleMs: 24 * 60 * 60_000,
    gmailFreshMs: 30 * 60_000,
    baselineWindowDays: 14,
    baselineDeviationPercent: 50,
    imessageFreshMs: 30 * 60_000,
    spotifyFreshMs: 48 * 60 * 60_000,
    weatherHotC: 25,
    weatherColdC: -10,
    weatherWindMs: 12,
    weatherUvHigh: 8,
    steamAchievementFreshMs: 7 * 24 * 60 * 60_000,
    steamRareAchievementPercent: 10,
    steamPlaytimeMilestoneHours: [10, 25, 50, 100, 250, 500, 1000],
    steamMomentFreshMs: 3 * 24 * 60 * 60_000,
    powerSpikeRatio: 1.5,
    powerSpikeMinNok: 1,
  }),
  steam: z
    .object({
      /** How many days of daily playtime samples to retain for the trend chart. */
      historyRetentionDays: z.number().int().min(1).default(90),
      /** Cap on how many friends' libraries to fetch for the playtime leaderboard — each one is an extra Steam API call. */
      leaderboardMaxFriends: z.number().int().min(1).default(50),
      /** How long a computed friends leaderboard is cached before re-fetching every friend's library. */
      leaderboardTtlHours: z.number().int().min(1).default(12),
    })
    .default({ historyRetentionDays: 90, leaderboardMaxFriends: 50, leaderboardTtlHours: 12 }),
  transit: z
    .object({
      /** NSR stop place ids to pin (find yours at stoppested.entur.org); empty = the stops nearest the dashboard's coordinates. */
      stopIds: z.array(z.string()).default([]),
      /** How many nearby stops to show when none are pinned. */
      maxStops: z.number().int().min(1).max(5).default(2),
      departuresPerStop: z.number().int().min(1).max(10).default(5),
    })
    .default({ stopIds: [], maxStops: 2, departuresPerStop: 5 }),
  power: z
    .object({
      /** Norwegian electricity bidding area (NO1 Øst … NO5 Vest); unset = power widget off. */
      area: z.enum(POWER_AREAS).optional(),
    })
    .default({}),
  code: z
    .object({
      /** Local parent directory to scan for git repos, per OS. Each immediate subdirectory with a .git and a GitHub-remote origin becomes a launchable project. */
      reposRoot: z.object({ darwin: z.string().optional(), win32: z.string().optional() }).default({}),
    })
    .default({ reposRoot: {} }),
  /** Per-widget on/off switch, keyed by provider id (e.g. "hue"). Absent id or `enabled: true` = on. Explicit `enabled: false` hides the widget entirely, distinct from "not configured". */
  widgets: z.record(z.string(), z.object({ enabled: z.boolean() })).default({}),
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
