import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { activityPushSchema, clashRoyaleSchema, type ActivityPushData, type ClashRoyaleData } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';
import { jsonlFiles } from './aiUsage/index.js';

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

const COC_API_BASE = 'https://api.clashofclans.com/v1';

export interface ClashOfClansAuth {
  apiKey: string;
  playerTag: string;
}

interface RawClashOfClansPlayer {
  tag: string;
  clan?: { tag: string };
}

interface RawClashOfClansAttack {
  order: number;
  stars: number;
  destructionPercentage: number;
  defenderTag: string;
}

interface RawClashOfClansWarMember {
  tag: string;
  attacks?: RawClashOfClansAttack[];
}

interface RawClashOfClansOpponentMember {
  tag: string;
  townhallLevel: number;
}

interface RawClashOfClansWar {
  clan: { members: RawClashOfClansWarMember[] };
  opponent: { members: RawClashOfClansOpponentMember[] };
}

export interface PushedClashOfClansAttack {
  stars: number;
  destructionPercentage: number;
  defenderTownHall?: number;
  timestamp: string;
}

/** Clash of Clans tags use the same '#'-prefixed, upper-case convention as Clash Royale's. */
function normalizeClashOfClansTag(tag: string): string {
  const trimmed = tag.trim().toUpperCase();
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

/** Mirrors clashRoyale.ts's crRequest — the Clash of Clans key is also IP-allowlisted at
 * developer.clashofclans.com, and a 403 here almost always means the server's current public IP
 * has drifted off that allowlist. */
async function cocRequest<T>(signal: AbortSignal, apiKey: string, path: string, label: string): Promise<T> {
  const res = await fetch(`${COC_API_BASE}${path}`, {
    signal,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 403) {
    throw new Error(
      `Clash of Clans ${label} failed: HTTP 403 — the API key's allowed IP list probably doesn't include this ` +
        'server\'s current public IP. Check developer.clashofclans.com and update it.',
    );
  }
  if (!res.ok) throw new Error(`Clash of Clans ${label} failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Unlike GetPlayer, a missing current war is routine (not in a war, private war log) rather than
 * a configuration problem — Supercell reports it as a 403 or 404 depending on the reason, and
 * either should be treated as "nothing to report", not surfaced as an error. */
async function currentClashOfClansWar(signal: AbortSignal, apiKey: string, clanTag: string): Promise<RawClashOfClansWar | null> {
  const res = await fetch(`${COC_API_BASE}/clans/${encodeURIComponent(clanTag)}/currentwar`, {
    signal,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Clash of Clans GetCurrentWar failed: HTTP ${res.status}`);
  return (await res.json()) as RawClashOfClansWar;
}

/** Finds the player's most recent war attack — the last entry in their `attacks` array, since
 * Supercell doesn't timestamp individual attacks, only orders them — paired with a stable identity
 * (`defenderTag:order`) the caller uses to detect whether this is the same attack already pushed.
 * Returns null for every "nothing to report" case (no clan, no current war, no attacks yet) and
 * only throws for a genuine request failure. */
export async function latestClashOfClansAttack(
  signal: AbortSignal,
  auth: ClashOfClansAuth,
): Promise<{ attack: PushedClashOfClansAttack; key: string } | null> {
  const playerTag = normalizeClashOfClansTag(auth.playerTag);
  const player = await cocRequest<RawClashOfClansPlayer>(signal, auth.apiKey, `/players/${encodeURIComponent(playerTag)}`, 'GetPlayer');
  if (!player.clan?.tag) return null;

  const war = await currentClashOfClansWar(signal, auth.apiKey, player.clan.tag);
  const member = war?.clan.members.find((candidate) => candidate.tag === player.tag);
  const attack = member?.attacks?.at(-1);
  if (!attack) return null;

  const defenderTownHall = war?.opponent.members.find((candidate) => candidate.tag === attack.defenderTag)?.townhallLevel;
  return {
    attack: {
      stars: attack.stars,
      destructionPercentage: attack.destructionPercentage,
      defenderTownHall,
      // CoC's war API never timestamps individual attacks — this is "when the poller noticed it",
      // not when the attack happened. Same limitation as Clash Royale's battleTime reliance, just
      // one step further removed from the source.
      timestamp: new Date().toISOString(),
    },
    key: `${attack.defenderTag}:${attack.order}`,
  };
}

export function createActivityPushProvider(
  push: { url: string; secret: string } | undefined,
  getClashRoyaleData: () => unknown = () => undefined,
  clashOfClans?: ClashOfClansAuth,
): Provider<ActivityPushData> {
  // Only committed after a push actually succeeds (see below), so a failed POST doesn't cause the
  // next attack to be silently skipped as "already sent".
  let lastPushedClashOfClansKey: string | undefined;

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

      let clashOfClansAttack: PushedClashOfClansAttack | null = null;
      let clashOfClansKey: string | undefined;
      if (clashOfClans) {
        try {
          const latest = await latestClashOfClansAttack(signal, clashOfClans);
          if (latest && latest.key !== lastPushedClashOfClansKey) {
            clashOfClansAttack = latest.attack;
            clashOfClansKey = latest.key;
          }
        } catch (err) {
          // A Clash of Clans hiccup (auth, IP allowlist, network) should never block the other
          // signals this provider pushes every minute.
          console.warn(`[activity-push] Clash of Clans lookup failed: ${err instanceof Error ? err.message : 'unknown error'}`);
        }
      }

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
          clashOfClans: clashOfClansAttack,
        }),
      });
      if (!res.ok) throw new Error(`activity push failed: HTTP ${res.status}`);
      if (clashOfClansKey) lastPushedClashOfClansKey = clashOfClansKey;

      return { lastPushedAt: new Date().toISOString(), lastPushOk: true };
    },
  };
}
