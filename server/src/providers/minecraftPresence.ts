import { open, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Minecraft has no local API and no presence of any kind, so this is inferred from the log the
 * game writes as it runs: whether it is still being written to, and whether it has already logged
 * its shutdown. Presence and session length are all that can be known this way — there is no live
 * state (no world, no health, no score) without a mod running inside the game. */
export interface PushedMinecraftLive {
  startedAt: string;
  observedAt: string;
}

/** How quiet the log may go before the session is treated as over. Singleplayer writes an autosave
 * line every few minutes, but a client sitting on a multiplayer server can go quiet for longer —
 * so this trades "card lingers a few minutes after a crash" (a clean quit is caught immediately by
 * the shutdown marker) against "card vanishes while still playing", and prefers the former. */
const ACTIVE_WINDOW_MS = 10 * 60_000;

/** The last thing the game logs on its way out, from vanilla through Fabric and every launcher
 * that wraps them. Present in the tail means the session ended cleanly, however recently. */
const SHUTDOWN_MARKER = 'Stopping!';

/** Enough of the end of the file to be sure the shutdown marker is in it — it is followed by only
 * a couple of lines from shutdown hooks. */
const TAIL_BYTES = 8192;
const HEAD_BYTES = 512;

function minecraftRoots(): { vanilla: string; modrinthProfiles: string } {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return {
      vanilla: path.join(appData, '.minecraft'),
      modrinthProfiles: path.join(appData, 'ModrinthApp', 'profiles'),
    };
  }
  const appSupport = path.join(os.homedir(), 'Library', 'Application Support');
  return {
    vanilla: path.join(appSupport, 'minecraft'),
    modrinthProfiles: path.join(appSupport, 'ModrinthApp', 'profiles'),
  };
}

/** Every `latest.log` worth checking. The vanilla directory covers the official launcher and also
 * Badlion, which runs the game with `.minecraft` as its game directory; Modrinth keeps one game
 * directory per profile, so each of those has a log of its own. */
async function logPaths(): Promise<string[]> {
  const { vanilla, modrinthProfiles } = minecraftRoots();
  const paths = [path.join(vanilla, 'logs', 'latest.log')];
  try {
    const profiles = await readdir(modrinthProfiles, { withFileTypes: true });
    for (const profile of profiles) {
      if (profile.isDirectory()) paths.push(path.join(modrinthProfiles, profile.name, 'logs', 'latest.log'));
    }
  } catch {
    // Modrinth simply isn't installed.
  }
  return paths;
}

async function readSlice(file: string, from: 'head' | 'tail'): Promise<string> {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    const length = from === 'head' ? Math.min(HEAD_BYTES, size) : Math.min(TAIL_BYTES, size);
    const position = from === 'head' ? 0 : size - length;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, position);
    return buffer.toString('utf8');
  } finally {
    await handle.close();
  }
}

/** Log lines carry a time of day and no date (`[23:07:52]`), so the date has to come from the file
 * itself. A start that lands after the last write means the session began before midnight and ran
 * past it, so it belongs to the previous day. */
export function sessionStartedAt(firstLine: string, lastWrite: Date): Date | undefined {
  const match = /^\[(\d{2}):(\d{2}):(\d{2})\]/.exec(firstLine);
  if (!match) return undefined;
  const [, hours, minutes, seconds] = match;
  const startedAt = new Date(lastWrite);
  startedAt.setHours(Number(hours), Number(minutes), Number(seconds), 0);
  if (startedAt.getTime() > lastWrite.getTime()) startedAt.setDate(startedAt.getDate() - 1);
  return startedAt;
}

/** Minecraft truncates `latest.log` on every launch, so one file is exactly one session: the first
 * line is the launch and the shutdown marker, if it is there at all, is this session's. */
export function isSessionRunning(tail: string, lastWrite: Date, now: number): boolean {
  if (tail.includes(SHUTDOWN_MARKER)) return false;
  return now - lastWrite.getTime() <= ACTIVE_WINDOW_MS;
}

/** Whether Minecraft is being played right now, from whichever launcher's log was written most
 * recently. Null for every "not playing" case, including a game that was closed cleanly seconds
 * ago — the shutdown marker is believed over the file's freshness. */
export async function readMinecraftLive(): Promise<PushedMinecraftLive | null> {
  const candidates = await Promise.all((await logPaths()).map(async (file) => {
    try {
      return { file, mtime: (await stat(file)).mtime };
    } catch {
      // That launcher has never run, or has no log yet.
      return undefined;
    }
  }));

  const newest = candidates
    .filter((candidate): candidate is { file: string; mtime: Date } => candidate !== undefined)
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())[0];
  if (!newest) return null;

  const now = Date.now();
  // Cheap check first: a log last touched days ago needs no reading at all.
  if (now - newest.mtime.getTime() > ACTIVE_WINDOW_MS) return null;

  try {
    const [head, tail] = await Promise.all([readSlice(newest.file, 'head'), readSlice(newest.file, 'tail')]);
    if (!isSessionRunning(tail, newest.mtime, now)) return null;

    const startedAt = sessionStartedAt(head.split('\n')[0] ?? '', newest.mtime);
    if (!startedAt) return null;

    return { startedAt: startedAt.toISOString(), observedAt: new Date(now).toISOString() };
  } catch (err) {
    // The game rotating its log mid-read is routine, not a fault worth failing the whole push over.
    console.warn(`[activity-push] Minecraft log read failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    return null;
  }
}
