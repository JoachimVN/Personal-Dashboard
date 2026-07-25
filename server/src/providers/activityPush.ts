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

/** Only the fields this file actually reads off GetPlayer — verified against a live response
 * rather than assumed, since Supercell does rename things (`league` is `leagueTier` as of this
 * writing, which memory alone got wrong once already). */
interface RawClashOfClansPlayer {
  tag: string;
  townHallLevel: number;
  builderHallLevel?: number;
  bestTrophies: number;
  bestBuilderBaseTrophies?: number;
  warStars: number;
  attackWins: number;
  donations: number;
  clanCapitalContributions: number;
  leagueTier?: { name: string };
  builderBaseLeague?: { name: string };
  clan?: { tag: string };
}

interface RawClashOfClansAttack {
  order: number;
  stars: number;
  destructionPercentage: number;
  defenderTag: string;
}

/** Both sides of a war report the same shape — `attacks` is just absent until that member has
 * actually attacked. Kept as one type (rather than separate "us"/"opponent" shapes) because CWL
 * fallback can swap which side is ours. */
interface RawClashOfClansWarMember {
  tag: string;
  townhallLevel: number;
  attacks?: RawClashOfClansAttack[];
}

interface RawClashOfClansWar {
  state?: string;
  clan: { tag?: string; members: RawClashOfClansWarMember[] };
  opponent: { tag?: string; members: RawClashOfClansWarMember[] };
}

interface RawClashOfClansLeagueGroup {
  rounds: { warTags: string[] }[];
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

async function fetchClashOfClansPlayer(signal: AbortSignal, apiKey: string, playerTag: string): Promise<RawClashOfClansPlayer> {
  const tag = normalizeClashOfClansTag(playerTag);
  return cocRequest<RawClashOfClansPlayer>(signal, apiKey, `/players/${encodeURIComponent(tag)}`, 'GetPlayer');
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

/** During Clan War League, `/currentwar` reports `notInWar` — the real battles live behind this
 * separate pair of calls: the league group lists each round's war tag, and each war tag resolves
 * to a war with the same shape as `/currentwar`. Only tried as a fallback when classic war
 * explicitly reports `notInWar`, so it costs nothing outside CWL weeks. Checks the most recent
 * round first and stops at the first one that involves our clan, so it's usually one extra call,
 * not one per round.
 *
 * Unverified: this clan wasn't in a league war when this was written, so — unlike everything else
 * in this file — this schema comes from community documentation, not a live response. Worth
 * double-checking the first time a CWL push looks wrong. */
async function currentClashOfClansLeagueWar(signal: AbortSignal, apiKey: string, clanTag: string): Promise<RawClashOfClansWar | null> {
  const groupRes = await fetch(`${COC_API_BASE}/clans/${encodeURIComponent(clanTag)}/currentwar/leaguegroup`, {
    signal,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (groupRes.status === 403 || groupRes.status === 404) return null;
  if (!groupRes.ok) throw new Error(`Clash of Clans GetLeagueGroup failed: HTTP ${groupRes.status}`);
  const group = (await groupRes.json()) as RawClashOfClansLeagueGroup;

  const warTags = group.rounds.flatMap((round) => round.warTags).filter((tag) => tag !== '#0').toReversed();
  for (const warTag of warTags) {
    const warRes = await fetch(`${COC_API_BASE}/clanwarleagues/wars/${encodeURIComponent(warTag)}`, {
      signal,
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!warRes.ok) continue;
    const war = (await warRes.json()) as RawClashOfClansWar;
    if (war.clan.tag === clanTag) return war;
    if (war.opponent.tag === clanTag) return { state: war.state, clan: war.opponent, opponent: war.clan };
  }
  return null;
}

/** Finds the player's most recent war attack — the last entry in their `attacks` array, since
 * Supercell doesn't timestamp individual attacks, only orders them — paired with a stable identity
 * (`defenderTag:order`) the caller uses to detect whether this is the same attack already pushed.
 * Falls back to the current Clan War League round when classic war reports `notInWar`. Returns null
 * for every "nothing to report" case (no clan, no war, no attacks yet) and only throws for a
 * genuine request failure. */
export async function latestClashOfClansAttack(
  signal: AbortSignal,
  apiKey: string,
  player: Pick<RawClashOfClansPlayer, 'tag' | 'clan'>,
): Promise<{ attack: PushedClashOfClansAttack; key: string } | null> {
  if (!player.clan?.tag) return null;
  const clanTag = player.clan.tag;

  let war = await currentClashOfClansWar(signal, apiKey, clanTag);
  if (war?.state === 'notInWar') war = await currentClashOfClansLeagueWar(signal, apiKey, clanTag);

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

interface RawClashOfClansRaidAttack {
  attacker: { tag: string };
  destructionPercent: number;
  stars: number;
}

interface RawClashOfClansRaidDistrict {
  id: number;
  name: string;
  attacks?: RawClashOfClansRaidAttack[];
}

interface RawClashOfClansRaidLogEntry {
  defender: { tag: string; name: string };
  districts: RawClashOfClansRaidDistrict[];
}

interface RawClashOfClansRaidSeason {
  attackLog: RawClashOfClansRaidLogEntry[];
}

export interface PushedClashOfClansRaidAttack {
  stars: number;
  destructionPercentage: number;
  defenderClanName: string;
  districtName: string;
  timestamp: string;
}

/** Capital Raid attacks carry no order or timestamp field at all (war at least has `order`). A
 * same-attacker, same-district attack sequence in a live response showed destruction climbing
 * towards the *end* of its `attacks` array (20% -> 47% -> 100%) — only sensible read newest-first —
 * so this treats `attacks[0]` as most recent, and assumes (unverified beyond that one sample) the
 * same newest-first convention holds for `attackLog`/`districts` ordering too. Worth re-checking
 * against a real raid weekend if a pushed "last raid attack" ever looks stale. */
export async function latestClashOfClansRaidAttack(
  signal: AbortSignal,
  apiKey: string,
  player: Pick<RawClashOfClansPlayer, 'tag' | 'clan'>,
): Promise<{ attack: PushedClashOfClansRaidAttack; key: string } | null> {
  if (!player.clan?.tag) return null;
  const res = await fetch(`${COC_API_BASE}/clans/${encodeURIComponent(player.clan.tag)}/capitalraidseasons?limit=1`, {
    signal,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Clash of Clans GetCapitalRaidSeasons failed: HTTP ${res.status}`);
  const body = (await res.json()) as { items: RawClashOfClansRaidSeason[] };
  const season = body.items[0];
  if (!season) return null;

  for (const entry of season.attackLog) {
    for (const district of entry.districts) {
      const attack = district.attacks?.find((candidate) => candidate.attacker.tag === player.tag);
      if (!attack) continue;
      return {
        attack: {
          stars: attack.stars,
          destructionPercentage: attack.destructionPercent,
          defenderClanName: entry.defender.name,
          districtName: district.name,
          timestamp: new Date().toISOString(),
        },
        key: `${entry.defender.tag}:${district.id}:${attack.destructionPercent}:${attack.stars}`,
      };
    }
  }
  return null;
}

interface ClashOfClansCounters {
  donations: number;
  clanCapitalContributions: number;
  attackWins: number;
  warStars: number;
}

function extractClashOfClansCounters(player: RawClashOfClansPlayer): ClashOfClansCounters {
  return {
    donations: player.donations,
    clanCapitalContributions: player.clanCapitalContributions,
    attackWins: player.attackWins,
    warStars: player.warStars,
  };
}

/** `donations`/`attackWins` reset each season and `clanCapitalContributions`/`warStars` never do,
 * but the same rule handles both: only an *increase* is activity. A drop is a season reset, not
 * evidence of nothing happening — trophies aren't in this set at all, since they move from being
 * defended against while offline just as easily as from a player's own attacks. */
function clashOfClansCountersIncreased(previous: ClashOfClansCounters, current: ClashOfClansCounters): boolean {
  return (Object.keys(current) as (keyof ClashOfClansCounters)[]).some((key) => current[key] > previous[key]);
}

interface ClashOfClansMilestoneBaseline {
  townHallLevel: number;
  builderHallLevel?: number;
  bestTrophies: number;
  bestBuilderBaseTrophies?: number;
  leagueTierName?: string;
  builderBaseLeagueName?: string;
}

export interface PushedClashOfClansMilestone {
  type: 'townHallLevel' | 'builderHallLevel' | 'bestTrophies' | 'bestBuilderBaseTrophies' | 'leagueTier' | 'builderBaseLeague';
  value: number | string;
  timestamp: string;
}

function extractClashOfClansMilestoneBaseline(player: RawClashOfClansPlayer): ClashOfClansMilestoneBaseline {
  return {
    townHallLevel: player.townHallLevel,
    builderHallLevel: player.builderHallLevel,
    bestTrophies: player.bestTrophies,
    bestBuilderBaseTrophies: player.bestBuilderBaseTrophies,
    leagueTierName: player.leagueTier?.name,
    builderBaseLeagueName: player.builderBaseLeague?.name,
  };
}

export function detectClashOfClansMilestones(
  previous: ClashOfClansMilestoneBaseline,
  current: ClashOfClansMilestoneBaseline,
): PushedClashOfClansMilestone[] {
  const timestamp = new Date().toISOString();
  const milestones: PushedClashOfClansMilestone[] = [];
  if (current.townHallLevel > previous.townHallLevel) milestones.push({ type: 'townHallLevel', value: current.townHallLevel, timestamp });
  if (current.builderHallLevel !== undefined && current.builderHallLevel > (previous.builderHallLevel ?? 0)) {
    milestones.push({ type: 'builderHallLevel', value: current.builderHallLevel, timestamp });
  }
  if (current.bestTrophies > previous.bestTrophies) milestones.push({ type: 'bestTrophies', value: current.bestTrophies, timestamp });
  if (current.bestBuilderBaseTrophies !== undefined && current.bestBuilderBaseTrophies > (previous.bestBuilderBaseTrophies ?? 0)) {
    milestones.push({ type: 'bestBuilderBaseTrophies', value: current.bestBuilderBaseTrophies, timestamp });
  }
  if (current.leagueTierName !== undefined && previous.leagueTierName !== undefined && current.leagueTierName !== previous.leagueTierName) {
    milestones.push({ type: 'leagueTier', value: current.leagueTierName, timestamp });
  }
  if (
    current.builderBaseLeagueName !== undefined
    && previous.builderBaseLeagueName !== undefined
    && current.builderBaseLeagueName !== previous.builderBaseLeagueName
  ) {
    milestones.push({ type: 'builderBaseLeague', value: current.builderBaseLeagueName, timestamp });
  }
  return milestones;
}

interface ClashOfClansActivitySnapshot {
  attack: PushedClashOfClansAttack | null;
  attackKey: string | undefined;
  raidAttack: PushedClashOfClansRaidAttack | null;
  raidKey: string | undefined;
  milestones: PushedClashOfClansMilestone[];
  newMilestoneBaseline: ClashOfClansMilestoneBaseline;
  counters: ClashOfClansCounters;
  activeAt: string | undefined;
}

/** Everything the provider's `fetch` needs from Clash of Clans, in one lookup — pulled out so a
 * hiccup here (auth, IP allowlist, network) can be caught in one place without inflating the
 * cognitive complexity of the tick that also handles Epic/Claude/Codex/Clash Royale. Returns null
 * on any failure; the caller then just keeps whatever state it already had. */
async function fetchClashOfClansActivity(
  signal: AbortSignal,
  clashOfClans: ClashOfClansAuth,
  previous: {
    counters: ClashOfClansCounters | undefined;
    milestoneBaseline: ClashOfClansMilestoneBaseline | undefined;
    attackKey: string | undefined;
    raidKey: string | undefined;
  },
): Promise<ClashOfClansActivitySnapshot | null> {
  try {
    const player = await fetchClashOfClansPlayer(signal, clashOfClans.apiKey, clashOfClans.playerTag);

    // Cheap, single-fetch signals first, so a later failure (war/raid lookups) never loses them.
    const counters = extractClashOfClansCounters(player);
    const activeAt = previous.counters && clashOfClansCountersIncreased(previous.counters, counters)
      ? new Date().toISOString()
      : undefined;

    // No baseline yet means this is the first tick ever — seed silently rather than reporting
    // every existing TH level/league/trophy record as a fresh "milestone" on startup.
    const newMilestoneBaseline = extractClashOfClansMilestoneBaseline(player);
    const milestones = previous.milestoneBaseline
      ? detectClashOfClansMilestones(previous.milestoneBaseline, newMilestoneBaseline)
      : [];

    const [attack, raidAttack] = await Promise.all([
      latestClashOfClansAttack(signal, clashOfClans.apiKey, player),
      latestClashOfClansRaidAttack(signal, clashOfClans.apiKey, player),
    ]);

    return {
      attack: attack && attack.key !== previous.attackKey ? attack.attack : null,
      attackKey: attack && attack.key !== previous.attackKey ? attack.key : undefined,
      raidAttack: raidAttack && raidAttack.key !== previous.raidKey ? raidAttack.attack : null,
      raidKey: raidAttack && raidAttack.key !== previous.raidKey ? raidAttack.key : undefined,
      milestones,
      newMilestoneBaseline,
      counters,
      activeAt,
    };
  } catch (err) {
    // A Clash of Clans hiccup (auth, IP allowlist, network) should never block the other signals
    // this provider pushes every minute.
    console.warn(`[activity-push] Clash of Clans lookup failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    return null;
  }
}

export function createActivityPushProvider(
  push: { url: string; secret: string } | undefined,
  getClashRoyaleData: () => unknown = () => undefined,
  clashOfClans?: ClashOfClansAuth,
): Provider<ActivityPushData> {
  // The attack/raid keys and milestone baseline are only committed after a push actually succeeds
  // (see below), so a failed POST doesn't cause the next event to be silently skipped as "already
  // sent". The counters and activity timestamp are persisted status, not one-shot events — every
  // tick resends whatever's current, so they're safe to update immediately.
  let lastPushedClashOfClansAttackKey: string | undefined;
  let lastPushedClashOfClansRaidKey: string | undefined;
  let clashOfClansMilestoneBaseline: ClashOfClansMilestoneBaseline | undefined;
  let clashOfClansCounters: ClashOfClansCounters | undefined;
  let clashOfClansLastActiveAt: string | null = null;

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

      const cocActivity = clashOfClans
        ? await fetchClashOfClansActivity(signal, clashOfClans, {
            counters: clashOfClansCounters,
            milestoneBaseline: clashOfClansMilestoneBaseline,
            attackKey: lastPushedClashOfClansAttackKey,
            raidKey: lastPushedClashOfClansRaidKey,
          })
        : null;
      if (cocActivity) {
        clashOfClansCounters = cocActivity.counters;
        if (cocActivity.activeAt) clashOfClansLastActiveAt = cocActivity.activeAt;
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
          clashOfClans: cocActivity?.attack ?? null,
          clashOfClansRaidAttack: cocActivity?.raidAttack ?? null,
          clashOfClansLastActiveAt,
          clashOfClansMilestones: cocActivity?.milestones ?? [],
        }),
      });
      if (!res.ok) throw new Error(`activity push failed: HTTP ${res.status}`);
      if (cocActivity?.attackKey) lastPushedClashOfClansAttackKey = cocActivity.attackKey;
      if (cocActivity?.raidKey) lastPushedClashOfClansRaidKey = cocActivity.raidKey;
      if (cocActivity) clashOfClansMilestoneBaseline = cocActivity.newMilestoneBaseline;

      return { lastPushedAt: new Date().toISOString(), lastPushOk: true };
    },
  };
}
