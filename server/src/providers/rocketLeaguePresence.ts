import { open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { newestExistingLogFile } from './newestLogFile.js';

/** What Rocket League is doing at this instant, read from the log the game writes as it runs.
 * Psyonix publish no API at all, but the game writes its Steam rich presence into the log every
 * time it changes — mode, arena, clock and score, refreshed on a timer while a match runs and
 * immediately on every goal. That makes this a far richer reading than the Minecraft one next
 * door, which can only ever say "yes, it is open". */
export interface PushedRocketLeagueLive {
  /** `menus` is the game open with no match on it (the main menu, matchmaking, the garage),
   * `ingame` is a match with a running clock, `postmatch` is the scoreboard afterwards — the
   * presence line keeps reporting the final score there, just without a clock. */
  state: 'menus' | 'ingame' | 'postmatch';
  /** "Ranked Duel", "Casual Doubles", "Private match", or just the mode when the playlist id is
   * one this does not recognise. Absent in the menus, where there is no playlist yet. */
  playlist?: string;
  /** The arena, as the game names it: "Beckwith Park", "Farmstead (Pitched)". */
  map?: string;
  goalsFor?: number;
  goalsAgainst?: number;
  /** Time left in the period as the game formats it — "4:49", or "+0:12" in overtime. Absent on
   * the post-match scoreboard, which is what distinguishes it from a live match. */
  clock?: string;
  /** When the game was launched. Derived from the log rather than guessed: see readRocketLeagueLive. */
  startedAt: string;
  /** When the pusher read this. Current state rather than an event, so a stale one is worthless —
   * the same role it plays for the Valorant and Minecraft readings. */
  observedAt: string;
  /** Every match that finished within the tail window, oldest first — not just whichever one
   * happens to still be on screen at poll time. See readCompletedMatches: a 60s poll can land
   * after the scoreboard has already been dismissed, so the single "current state" reading alone
   * silently drops matches the player didn't linger on. */
  recentMatches?: CompletedRocketLeagueMatch[];
}

/** One match's result, as read off a `postmatch` presence line rather than inferred from state
 * carried between polls — see readCompletedMatches. */
export interface CompletedRocketLeagueMatch {
  goalsFor: number;
  goalsAgainst: number;
  playlist?: string;
  map?: string;
  /** When this match's scoreboard first appeared, derived from the log line's own elapsed-seconds
   * stamp rather than from when the pusher happened to observe it — so the same match rediscovered
   * on a later poll (the tail window is generous) produces the exact same timestamp and downstream
   * dedup by `endedAt` collapses it into the one match it is. */
  endedAt: string;
}

/** How quiet the log may go before the game is treated as closed. Rocket League is extremely
 * chatty — EOS ticks, hitch warnings and presence updates land every few seconds, in menus as well
 * as in a match — so silence is a strong signal and this can be far tighter than the Minecraft
 * equivalent. There is no shutdown marker to lean on (the log simply stops, mid-line if the game
 * was killed), so this window is the only thing that ends a session, and it bounds how long the
 * card can linger after a quit. */
const ACTIVE_WINDOW_MS = 3 * 60_000;

/** Enough of the end of the log to be sure the most recent presence line is in it. The game writes
 * on the order of 10 KB a minute, so this covers roughly the last quarter of an hour — comfortably
 * more than the gap between presence updates during a match, and enough to still find the last one
 * after a long sit in a menu. */
const TAIL_BYTES = 128 * 1024;

const PRESENCE_PREFIX = 'DevOnline: Set rich presence to: ';

/** `<mode> in <arena>[ <clock>] (<for> - <against>) data: <token>`, for example
 * `Duel in Farmstead (Pitched) 4:39 (3 - 1) data: Playlist-10`. Arena names carry parentheses of
 * their own ("(Pitched)", "(Dawn)", "(Stormy)"), so the score is found by pinning it to the
 * ` data:` that always follows it rather than by matching "the bracketed part". The clock is
 * missing entirely on the post-match scoreboard and carries a `+` during overtime. */
const MATCH_PRESENCE = /^(.+?) in (.+?)(?: (\+?\d+:\d{2}))? \((\d+) - (\d+)\) data: (\S+)$/;

/** Unreal stamps every line with seconds since the log was opened, to two decimals. */
const LINE_OFFSET = /^\[(\d+\.\d+)\]/;

/** Enough to reach the end of the first line, which is where the launch is stamped. */
const HEAD_BYTES = 512;

/** The first line of the log: `Log: Log file open, 26/08/2026 16:03:04`. Only the time of day is
 * taken. The date beside it is written in the machine's own day/month order and cannot be read back
 * unambiguously — but a time of day has no such ordering to get wrong, and the file itself knows
 * which day it belongs to. */
const LOG_OPENED = /^Log: Log file open, \S+ (\d{1,2}):(\d{2}):(\d{2})/;

/** Which side of `(2 - 5)` is the account's own team.
 *
 * The log itself never says: it records the already-formatted presence string and does not name the
 * player's team, and nothing else in the file settles it either — end-of-match XP looks like it
 * might, but it tracks position in the session (the first matches of an evening carry challenge
 * bonuses) rather than the result.
 *
 * So it was checked against a real match instead: a game that the log reported as ending `(5 - 6)`
 * on DFH Stadium was a loss. The player's team comes first.
 *
 * Should that ever prove wrong, flipping this constant is the whole fix — it is deliberately the
 * single place the orientation is decided. */
const PLAYER_TEAM_SCORE_IS_FIRST = true;

/** Only the playlist ids worth naming with confidence. Anything else falls back to the mode the
 * presence string already spells out, which is never wrong — just less specific. */
const RANKED_PLAYLISTS: ReadonlySet<number> = new Set([10, 11, 13]);
const CASUAL_PLAYLISTS: ReadonlySet<number> = new Set([1, 2, 3, 4]);
const PRIVATE_MATCH_PLAYLIST = 6;

export type RocketLeaguePresence =
  | { kind: 'menu' }
  | { kind: 'match'; mode: string; map: string; clock?: string; scoreFirst: number; scoreSecond: number; playlistId?: number };

/** Turns the text after `Set rich presence to: ` into what it says about the account. Undefined for
 * a line this does not recognise, so an unfamiliar presence string is ignored rather than
 * half-read. */
export function parsePresence(payload: string): RocketLeaguePresence | undefined {
  if (payload.endsWith('data: Menu')) return { kind: 'menu' };

  const match = MATCH_PRESENCE.exec(payload);
  if (!match) return undefined;
  const [, mode, map, clock, scoreFirst, scoreSecond, data] = match;

  const playlist = /^Playlist-(\d+)$/.exec(data);
  return {
    kind: 'match',
    mode,
    map,
    clock,
    scoreFirst: Number(scoreFirst),
    scoreSecond: Number(scoreSecond),
    playlistId: playlist ? Number(playlist[1]) : undefined,
  };
}

export function playlistLabel(mode: string, playlistId: number | undefined): string {
  if (playlistId === undefined) return mode;
  if (playlistId === PRIVATE_MATCH_PLAYLIST) return 'Private match';
  if (RANKED_PLAYLISTS.has(playlistId)) return `Ranked ${mode}`;
  if (CASUAL_PLAYLISTS.has(playlistId)) return `Casual ${mode}`;
  return mode;
}

/** When the log was opened, which for this game is when it was launched — Rocket League starts a
 * fresh Launch.log every time and rotates the previous one away, so one file is exactly one session.
 *
 * Read out of the header rather than worked out from the file's own timestamps, because the card's
 * reactions are keyed on this: a start that lands a few milliseconds off the last one is a *new*
 * card as far as they are concerned, and a whole session of reactions disappears on every push.
 * The header is a fixed string written once at launch, so every reading of one session agrees.
 *
 * Only the time of day is in it, so the date comes from the file the way Minecraft's does: a start
 * that lands after the last write means the session began before midnight and ran past it. */
export function sessionStartedAt(firstLine: string, lastWrite: Date): Date | undefined {
  const match = LOG_OPENED.exec(firstLine);
  if (!match) return undefined;
  const [, hours, minutes, seconds] = match;
  const startedAt = new Date(lastWrite);
  startedAt.setHours(Number(hours), Number(minutes), Number(seconds), 0);
  if (startedAt.getTime() > lastWrite.getTime()) startedAt.setDate(startedAt.getDate() - 1);
  return startedAt;
}

/** The last presence line in the log, and how many seconds into the session the log's final line
 * was written. Both are found by walking backwards: the newest reading is the one that counts, and
 * a tail slice can begin mid-line, so scanning from the end also keeps that fragment out of the
 * way. */
export function readTail(tail: string): { presence?: RocketLeaguePresence; lastOffsetSeconds?: number } {
  const lines = tail.split('\n');
  let presence: RocketLeaguePresence | undefined;
  let lastOffsetSeconds: number | undefined;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (lastOffsetSeconds === undefined) {
      const offset = LINE_OFFSET.exec(line);
      if (offset) lastOffsetSeconds = Number(offset[1]);
    }
    if (presence === undefined) {
      const start = line.indexOf(PRESENCE_PREFIX);
      if (start !== -1) presence = parsePresence(line.slice(start + PRESENCE_PREFIX.length).trim());
    }
    if (presence !== undefined && lastOffsetSeconds !== undefined) break;
  }

  return { presence, lastOffsetSeconds };
}

/** How many finished matches to carry per push. Ten matches is already generous for one sitting,
 * and matches the cap the dashboard itself keeps — see Batabiboing's nextRocketLeagueHistory. */
const MAX_RECENT_MATCHES = 10;

/** Whether two presence readings are the same post-match scoreboard rather than two different
 * matches that happened to finish with the same score — the log keeps re-printing the same line
 * on its refresh timer while the scoreboard sits on screen. */
function samePostmatch(a: RocketLeaguePresence | undefined, b: RocketLeaguePresence): boolean {
  if (!a || a.kind !== 'match' || b.kind !== 'match') return false;
  if (a.clock !== undefined || b.clock !== undefined) return false;
  return a.mode === b.mode && a.map === b.map && a.scoreFirst === b.scoreFirst && a.scoreSecond === b.scoreSecond;
}

/** Every match that finished somewhere in this tail slice, not just the one reading a single
 * "current state" poll would land on. A 60s poll cadence against a scoreboard that can be
 * dismissed in a few seconds — faster, typically, right after a loss than after a win — means
 * relying on "what does the log say right now" silently drops results. This instead walks every
 * presence line in the slice looking for a transition into `postmatch`, so a match is caught as
 * long as its scoreboard line is still somewhere in the tail window, whether or not it is still
 * showing at the moment this is read.
 *
 * Reading the same tail again on the next poll will find the same matches again — that is by
 * design, not a bug to fix here. `endedAt` is derived from the log line's own elapsed-seconds
 * stamp, so a rediscovered match produces the exact same timestamp every time, and the caller
 * dedups on it. */
export function readCompletedMatches(tail: string, startedAt: Date): CompletedRocketLeagueMatch[] {
  const matches: CompletedRocketLeagueMatch[] = [];
  let previous: RocketLeaguePresence | undefined;

  for (const line of tail.split('\n')) {
    const offset = LINE_OFFSET.exec(line);
    const start = line.indexOf(PRESENCE_PREFIX);
    if (offset === null || start === -1) continue;

    const presence = parsePresence(line.slice(start + PRESENCE_PREFIX.length).trim());
    if (presence === undefined) continue;

    const isPostmatch = presence.kind === 'match' && presence.clock === undefined;
    if (isPostmatch && !samePostmatch(previous, presence)) {
      const { mode, map, scoreFirst, scoreSecond, playlistId } = presence;
      const [goalsFor, goalsAgainst] = PLAYER_TEAM_SCORE_IS_FIRST ? [scoreFirst, scoreSecond] : [scoreSecond, scoreFirst];
      matches.push({
        goalsFor,
        goalsAgainst,
        playlist: playlistLabel(mode, playlistId),
        map,
        endedAt: new Date(startedAt.getTime() + Number(offset[1]) * 1000).toISOString(),
      });
    }
    previous = presence;
  }

  return matches.slice(-MAX_RECENT_MATCHES);
}

/** Builds the reading from a parsed presence line. Kept separate from the file handling so the
 * interesting half is testable without a log on disk. */
export function toLive(
  presence: RocketLeaguePresence | undefined,
  startedAt: Date,
  observedAt: Date,
): PushedRocketLeagueLive {
  const base = { startedAt: startedAt.toISOString(), observedAt: observedAt.toISOString() };

  // A running log with no presence line in the tail means the game is open and has been sitting
  // somewhere long enough to push the last one out of the slice — a menu, in other words. Better
  // to say that than to drop the card for a game that is demonstrably running.
  if (!presence || presence.kind === 'menu') return { state: 'menus', ...base };

  const { mode, map, clock, scoreFirst, scoreSecond, playlistId } = presence;
  const [goalsFor, goalsAgainst] = PLAYER_TEAM_SCORE_IS_FIRST ? [scoreFirst, scoreSecond] : [scoreSecond, scoreFirst];
  return {
    // The clock is what separates a live match from the scoreboard it leaves on screen afterwards.
    state: clock === undefined ? 'postmatch' : 'ingame',
    playlist: playlistLabel(mode, playlistId),
    map,
    goalsFor,
    goalsAgainst,
    clock,
    ...base,
  };
}

/** Every Launch.log worth checking. Rocket League has not shipped for macOS since 2020, so this is
 * a Windows-only path by nature; the OneDrive variant is here because redirecting Documents into
 * OneDrive is the default on a lot of Windows installs and moves the whole tree with it. */
function logPaths(): string[] {
  if (process.platform !== 'win32') return [];
  const home = os.homedir();
  const oneDrive = process.env.OneDrive ?? path.join(home, 'OneDrive');
  return [path.join(home, 'Documents'), path.join(oneDrive, 'Documents')].map((root) =>
    path.join(root, 'My Games', 'Rocket League', 'TAGame', 'Logs', 'Launch.log'),
  );
}

/** The head and the tail of the log in one open: the header names the launch, the tail names what
 * the game is doing now. */
async function readEnds(file: string): Promise<{ head: string; tail: string }> {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    const read = async (position: number, length: number): Promise<string> => {
      if (length <= 0) return '';
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, position);
      return buffer.toString('utf8');
    };
    return {
      head: await read(0, Math.min(HEAD_BYTES, size)),
      tail: await read(Math.max(0, size - TAIL_BYTES), Math.min(TAIL_BYTES, size)),
    };
  } finally {
    await handle.close();
  }
}

/** What Rocket League is doing right now, or null when it is not running. */
export async function readRocketLeagueLive(): Promise<PushedRocketLeagueLive | null> {
  const newest = await newestExistingLogFile(logPaths());
  if (!newest) return null;

  const now = Date.now();
  // Cheap check first: a log that stopped growing is a game that is no longer running, and needs
  // no reading at all.
  if (now - newest.mtime.getTime() > ACTIVE_WINDOW_MS) return null;

  try {
    const { head, tail } = await readEnds(newest.file);
    const { presence, lastOffsetSeconds } = readTail(tail);
    // Every line is also stamped with its own age in seconds, so the launch can be worked out as the
    // final line's stamp subtracted from the moment that line was written. That still stands in when
    // the header is unreadable, but it is only ever an estimate: the game sits on a line for a moment
    // before flushing it, so it lands a few milliseconds off by a different amount every time — which
    // is the whole reason the header is preferred. See sessionStartedAt.
    if (lastOffsetSeconds === undefined) return null;
    const startedAt = sessionStartedAt(head.split('\n')[0] ?? '', newest.mtime)
      ?? new Date(newest.mtime.getTime() - lastOffsetSeconds * 1000);

    const live = toLive(presence, startedAt, new Date(now));
    const recentMatches = readCompletedMatches(tail, startedAt);
    return recentMatches.length > 0 ? { ...live, recentMatches } : live;
  } catch (err) {
    // The game rotating or truncating its log mid-read is routine, not a fault worth failing the
    // whole push over.
    console.warn(`[activity-push] Rocket League log read failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    return null;
  }
}
