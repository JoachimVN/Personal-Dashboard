import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { activityPushSchema, clashRoyaleSchema, type ActivityPushData, type ClashRoyaleData } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';
import { jsonlFiles } from './aiUsage.js';

const execFileAsync = promisify(execFile);
const CLAUDE_ACTIVITY_WINDOW_MS = 10 * 60_000;

/** `pgrep -f` matches against the full command line, so this also catches the launcher when it's
 * backgrounded under Login Items rather than run interactively. */
async function isProcessRunning(pattern: string): Promise<boolean> {
  try {
    await execFileAsync('pgrep', ['-f', pattern]);
    return true;
  } catch {
    // pgrep exits 1 when nothing matches — indistinguishable here from "not installed", which is
    // the correct behavior either way (nothing to report).
    return false;
  }
}

async function newestMtime(directory: string): Promise<Date | undefined> {
  try {
    const files = await jsonlFiles(directory);
    const mtimes = await Promise.all(files.map(async (file) => (await stat(file)).mtime));
    return mtimes.sort((a, b) => b.getTime() - a.getTime())[0];
  } catch {
    return undefined;
  }
}

/** Claude continues appending housekeeping records (for example `away_summary`) after a person
 * stops interacting with a session. File mtime therefore represents Claude's bookkeeping, not
 * coding activity. Only a real user turn should refresh the public activity signal. */
async function newestClaudeUserPromptAt(directory: string): Promise<Date | undefined> {
  try {
    const files = await jsonlFiles(directory);
    const recentFiles = (await Promise.all(files.map(async (file) => {
      const info = await stat(file);
      return Date.now() - info.mtimeMs <= CLAUDE_ACTIVITY_WINDOW_MS ? file : undefined;
    }))).filter((file): file is string => file !== undefined);
    const timestamps = await Promise.all(recentFiles.map(async (file) => {
      const entries = (await readFile(file, 'utf8')).split('\n');
      let newest: Date | undefined;
      for (const line of entries) {
        try {
          const entry = JSON.parse(line) as { type?: unknown; timestamp?: unknown };
          if (entry.type !== 'user' || typeof entry.timestamp !== 'string') continue;
          const at = new Date(entry.timestamp);
          if (!Number.isNaN(at.getTime()) && (!newest || at > newest)) newest = at;
        } catch {
          // A live transcript can have one incomplete final line.
        }
      }
      return newest;
    }));
    return timestamps.filter((at): at is Date => at !== undefined).sort((a, b) => b.getTime() - a.getTime())[0];
  } catch {
    return undefined;
  }
}

async function claudeLastActiveAt(): Promise<string | null> {
  const dir = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'projects');
  const userPromptAt = await newestClaudeUserPromptAt(dir);
  return userPromptAt?.toISOString() ?? null;
}

async function codexLastActiveAt(): Promise<string | null> {
  const dir = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'sessions');
  const mtime = await newestMtime(dir);
  return mtime?.toISOString() ?? null;
}

export interface PushedClashRoyaleActivity {
  result: 'win' | 'loss' | 'draw';
  crownsFor: number;
  crownsAgainst: number;
  timestamp: string;
}

/** The dashboard scheduler has already fetched and validated this data using the home machine's
 * IP-allowlisted Supercell key. Batabiboing receives only the display-safe latest battle summary. */
export function latestClashRoyaleActivity(data: Pick<ClashRoyaleData, 'recentBattles'> | undefined): PushedClashRoyaleActivity | null {
  const battle = data?.recentBattles[0];
  return battle
    ? {
        result: battle.result,
        crownsFor: battle.crownsFor,
        crownsAgainst: battle.crownsAgainst,
        timestamp: battle.battleTime,
      }
    : null;
}

export function createActivityPushProvider(
  push: { url: string; secret: string } | undefined,
  getClashRoyaleData: () => unknown = () => undefined,
): Provider<ActivityPushData> {
  return {
    id: 'activity-push',
    schema: activityPushSchema,
    refreshMs: 60_000,
    timeoutMs: 10_000,
    isConfigured: () => push !== undefined,
    async fetch(signal) {
      if (!push) throw new Error('activity push is not configured');
      const [epicRunning, claudeActiveAt, codexActiveAt] = await Promise.all([
        isProcessRunning('Epic Games Launcher'),
        claudeLastActiveAt(),
        codexLastActiveAt(),
      ]);
      const clashRoyale = clashRoyaleSchema.safeParse(getClashRoyaleData());

      const res = await fetch(push.url, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${push.secret}`,
        },
        body: JSON.stringify({
          epicRunning,
          claudeActiveAt,
          codexActiveAt,
          clashRoyale: latestClashRoyaleActivity(clashRoyale.success ? clashRoyale.data : undefined),
        }),
      });
      if (!res.ok) throw new Error(`activity push failed: HTTP ${res.status}`);

      return { lastPushedAt: new Date().toISOString(), lastPushOk: true };
    },
  };
}
