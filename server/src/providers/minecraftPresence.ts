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
  activity?: 'singleplayer' | 'realm' | 'server';
  destination?: string;
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

type MinecraftActivity = Pick<PushedMinecraftLive, 'activity' | 'destination'> & { index: number };

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

/** Returns the final match for a log pattern. A single latest.log can record several destinations
 * after disconnect/reconnect; the last transition is the only one that can describe the live
 * session. */
function lastMatch(text: string, pattern: RegExp): RegExpExecArray | undefined {
  let latest: RegExpExecArray | undefined;
  for (const match of text.matchAll(pattern)) latest = match;
  return latest;
}

function cleanDestination(value: string | undefined): string | undefined {
  const destination = value?.trim().replace(/[.,;)]$/, '');
  if (!destination || destination.length > 96) return undefined;
  return destination;
}

/** Minecraft's log formats differ across vanilla, Fabric, and launcher generations. These patterns
 * intentionally only surface explicit destinations and otherwise leave the activity unlabeled — a
 * generic live card is preferable to guessing a world or server name. */
export function minecraftActivity(tail: string): Omit<PushedMinecraftLive, 'startedAt' | 'observedAt'> {
  const candidates: MinecraftActivity[] = [];
  const singleplayer = lastMatch(tail, /Starting integrated minecraft server(?: version)?[^\n]*/gi);
  if (singleplayer?.index !== undefined) candidates.push({ activity: 'singleplayer', index: singleplayer.index });

  const realm = lastMatch(tail, /(?:Connecting to|Joining|Joined) (?:a )?realm(?:\s*[:=]\s*|\s+)([^\n]+)/gi);
  if (realm?.index !== undefined) candidates.push({ activity: 'realm', destination: cleanDestination(realm[1]), index: realm.index });

  // Modern client logs write `Connecting to host, 25565`; preserve a non-standard port because it
  // distinguishes otherwise-identical local/server names without leaking any credentials.
  const server = lastMatch(tail, /Connecting to ([^,\n]+),\s*(\d{1,5})/gi);
  if (server?.index !== undefined) {
    const host = cleanDestination(server[1]);
    const port = server[2];
    const destination = host && port && port !== '25565' ? `${host}:${port}` : host;
    candidates.push({ activity: 'server', destination, index: server.index });
  }

  const latest = candidates.toSorted((a, b) => b.index - a.index)[0];
  if (!latest) return {};
  const { index: _index, ...activity } = latest;
  return activity;
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

    return { startedAt: startedAt.toISOString(), observedAt: new Date(now).toISOString(), ...minecraftActivity(tail) };
  } catch (err) {
    // The game rotating its log mid-read is routine, not a fault worth failing the whole push over.
    console.warn(`[activity-push] Minecraft log read failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    return null;
  }
}
