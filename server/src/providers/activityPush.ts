import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { activityPushSchema, type ActivityPushData } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';
import { jsonlFiles } from './aiUsage.js';

const execFileAsync = promisify(execFile);

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

async function claudeLastActiveAt(): Promise<string | null> {
  const dir = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'projects');
  const mtime = await newestMtime(dir);
  return mtime?.toISOString() ?? null;
}

async function codexLastActiveAt(): Promise<string | null> {
  const dir = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'sessions');
  const mtime = await newestMtime(dir);
  return mtime?.toISOString() ?? null;
}

export function createActivityPushProvider(push: { url: string; secret: string } | undefined): Provider<ActivityPushData> {
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

      const res = await fetch(push.url, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${push.secret}`,
        },
        body: JSON.stringify({ epicRunning, claudeActiveAt, codexActiveAt }),
      });
      if (!res.ok) throw new Error(`activity push failed: HTTP ${res.status}`);

      return { lastPushedAt: new Date().toISOString(), lastPushOk: true };
    },
  };
}
