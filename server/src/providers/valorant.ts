import { valorantSchema, type ValorantData, type ValorantMatch } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';
import type { ValorantHistoryStore } from '../valorantHistory.js';

const HD_API_BASE = 'https://api.henrikdev.xyz';
const RECENT_MATCHES_COUNT = 10;
const HISTORY_MATCHES_PER_PAGE = 10;
const STORED_HISTORY_PAGE_SIZE = 100;
/** 3 normal calls + at most 3 match and 3 MMR archive pages stays well below a 30-RPM key. */
const MAX_STORED_HISTORY_PAGES_PER_SYNC = 3;
const STORED_HISTORY_REFRESH_MS = 24 * 60 * 60_000;
const MATCH_HISTORY_CACHE_VERSION = 2;
/** The standard rank scheme UUID all current episodes share (Ascendant onward) — tier ids 0-27
 * are stable against it, so the icon URL can be built directly without an extra reference call. */
const COMPETITIVE_TIERS_UUID = '03621f52-342b-cf4e-4f86-9350a49c6d04';

export interface ValorantAuth {
  apiKey: string;
  name: string;
  tag: string;
  region: string;
}

interface RawAccount {
  puuid: string;
  region: string;
  account_level: number;
  name: string;
  tag: string;
  card: string;
}

interface RawTier {
  id: number;
  name: string;
}

interface RawMmr {
  current: {
    tier: RawTier;
    rr: number;
    last_change: number;
    leaderboard_placement: { rank: number } | null;
  };
  peak: {
    tier: RawTier;
    season?: { short: string };
  };
  seasonal: { season?: { short?: string }; wins: number; games: number }[];
}

interface RawMmrHistoryEntry {
  match_id: string;
  season?: { short?: string };
}

interface RawMatchPlayer {
  puuid: string;
  team_id: string;
  agent: { id: string; name: string };
  stats: {
    score: number;
    kills: number;
    deaths: number;
    assists: number;
    headshots: number;
    bodyshots: number;
    legshots: number;
    damage: { dealt: number; received: number };
  };
}

interface RawMatchTeam {
  team_id: string;
  won: boolean;
  rounds: { won: number; lost: number };
}

interface RawMatch {
  metadata: {
    match_id: string;
    map: { name: string };
    queue: { name: string };
    started_at: string;
    season?: { short?: string };
  };
  teams: RawMatchTeam[];
  players: RawMatchPlayer[];
}

function tierIconUrl(tierId: number): string | undefined {
  return tierId > 0 ? `https://media.valorant-api.com/competitivetiers/${COMPETITIVE_TIERS_UUID}/${tierId}/smallicon.png` : undefined;
}

function agentIconUrl(agentId: string): string {
  return `https://media.valorant-api.com/agents/${agentId}/displayicon.png`;
}

function cardIconUrl(cardId: string): string {
  return `https://media.valorant-api.com/playercards/${cardId}/wideart.png`;
}

/** Auth failures never include the response body — HenrikDev's 401/403 text has echoed the
 * request path (which encodes the Riot ID) in the past, personal enough to keep out of logs. */
async function hdRequest<T>(signal: AbortSignal, apiKey: string, path: string, label: string): Promise<T> {
  const res = await fetch(`${HD_API_BASE}${path}`, {
    signal,
    headers: { Authorization: apiKey, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Valorant ${label} failed: HTTP ${res.status}`);
  const body = (await res.json()) as { data: T };
  return body.data;
}

interface HenrikPagedResponse<T> {
  data: T;
  results?: { total?: number };
  rateLimitRemaining?: number;
}

function rateLimitRemaining(headers: Headers): number | undefined {
  const legacyValue = headers.get('x-ratelimit-remaining');
  const legacy = legacyValue === null ? Number.NaN : Number(legacyValue);
  if (Number.isFinite(legacy)) return legacy;
  const draft = /(?:^|;)\s*r=(\d+)/.exec(headers.get('ratelimit') ?? '');
  return draft ? Number(draft[1]) : undefined;
}

async function hdPagedRequest<T>(signal: AbortSignal, apiKey: string, path: string, label: string): Promise<HenrikPagedResponse<T>> {
  const res = await fetch(`${HD_API_BASE}${path}`, {
    signal,
    headers: { Authorization: apiKey, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Valorant ${label} failed: HTTP ${res.status}`);
  return { ...(await res.json()) as HenrikPagedResponse<T>, rateLimitRemaining: rateLimitRemaining(res.headers) };
}

function appendQuery(path: string, params: Record<string, string | number>): string {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
  return `${path}?${query.toString()}`;
}

/** Backfill a small sequential slice of the stored archive. The cursor is persisted, so a large
 * career fills in over subsequent daily syncs instead of spending the whole API minute at once. */
async function fetchStoredPages<T>(
  signal: AbortSignal,
  apiKey: string,
  path: string,
  label: string,
  startPage: number,
): Promise<{ data: T[]; total: number; nextPage: number; rateLimitRemaining?: number }> {
  const first = await hdPagedRequest<T[]>(signal, apiKey, appendQuery(path, { size: STORED_HISTORY_PAGE_SIZE, page: startPage }), label);
  const data = [...first.data];
  const total = Math.max(first.results?.total ?? data.length, data.length);
  const pageCount = Math.max(Math.ceil(total / STORED_HISTORY_PAGE_SIZE), 1);
  const lastPage = Math.min(startPage + MAX_STORED_HISTORY_PAGES_PER_SYNC - 1, pageCount);
  let lastFetchedPage = startPage;
  let remaining = first.rateLimitRemaining;
  for (let page = startPage + 1; page <= lastPage && (remaining === undefined || remaining > 3); page += 1) {
    const next = await hdPagedRequest<T[]>(signal, apiKey, appendQuery(path, { size: STORED_HISTORY_PAGE_SIZE, page }), label);
    data.push(...next.data);
    lastFetchedPage = page;
    remaining = next.rateLimitRemaining;
  }
  return { data, total, nextPage: lastFetchedPage >= pageCount ? 1 : lastFetchedPage + 1, rateLimitRemaining: remaining };
}

/** The live v4 history endpoint is paginated but does not report a total. Fetch only a small
 * sequential slice per daily sync; the persisted cursor keeps expanding the local career view. */
async function fetchMatchHistoryPages(
  signal: AbortSignal,
  apiKey: string,
  region: string,
  name: string,
  tag: string,
  startPage: number,
): Promise<{ data: RawMatch[]; nextPage: number; rateLimitRemaining?: number }> {
  const data: RawMatch[] = [];
  let nextPage = startPage;
  let remaining: number | undefined;
  for (let page = startPage; page < startPage + MAX_STORED_HISTORY_PAGES_PER_SYNC; page += 1) {
    if (remaining !== undefined && remaining <= 3) break;
    const response = await hdPagedRequest<RawMatch[]>(
      signal,
      apiKey,
      appendQuery(`/valorant/v4/matches/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, {
        size: HISTORY_MATCHES_PER_PAGE,
        start: (page - 1) * HISTORY_MATCHES_PER_PAGE,
      }),
      'GetMatchHistory',
    );
    data.push(...response.data);
    remaining = response.rateLimitRemaining;
    nextPage = response.data.length < HISTORY_MATCHES_PER_PAGE ? 1 : page + 1;
    if (nextPage === 1) break;
  }
  return { data, nextPage, rateLimitRemaining: remaining };
}

export function mapMatch(match: RawMatch, puuid: string): ValorantMatch | undefined {
  const me = match.players.find((player) => player.puuid === puuid);
  if (!me) return undefined;
  const myTeam = match.teams.find((team) => team.team_id === me.team_id);
  const result: ValorantMatch['result'] = myTeam === undefined ? 'draw' : myTeam.won ? 'win' : 'loss';
  return {
    matchId: match.metadata.match_id,
    map: match.metadata.map.name,
    mode: match.metadata.queue?.name ?? 'Unknown',
    startedAt: match.metadata.started_at,
    result,
    roundsWon: myTeam?.rounds.won,
    roundsLost: myTeam?.rounds.lost,
    agentName: me.agent.name,
    agentIconUrl: agentIconUrl(me.agent.id),
    score: me.stats.score,
    kills: me.stats.kills,
    deaths: me.stats.deaths,
    assists: me.stats.assists,
    headshots: me.stats.headshots,
    bodyshots: me.stats.bodyshots,
    legshots: me.stats.legshots,
    damageDealt: me.stats.damage.dealt,
    damageReceived: me.stats.damage.received,
    actShort: match.metadata.season?.short,
  };
}

function mergeMatches(...groups: ValorantMatch[][]): ValorantMatch[] {
  const byId = new Map<string, ValorantMatch>();
  for (const match of groups.flat()) {
    const existing = byId.get(match.matchId);
    byId.set(match.matchId, existing ? { ...existing, ...match, actShort: match.actShort ?? existing.actShort } : match);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

function attachMmrActs(matches: ValorantMatch[], history: RawMmrHistoryEntry[]): ValorantMatch[] {
  const acts = new Map(history.map((entry) => [entry.match_id, entry.season?.short]));
  return matches.map((match) => ({ ...match, actShort: match.actShort ?? acts.get(match.matchId) }));
}

function isHistoryFresh(history: { fetchedAt: string; sourceVersion: number }): boolean {
  return history.sourceVersion === MATCH_HISTORY_CACHE_VERSION && Date.now() - Date.parse(history.fetchedAt) < STORED_HISTORY_REFRESH_MS;
}

export function createValorantProvider(auth: ValorantAuth | undefined, historyStore?: ValorantHistoryStore): Provider<ValorantData> {
  return {
    id: 'valorant',
    schema: valorantSchema,
    refreshMs: 10 * 60_000,
    timeoutMs: 20_000,
    isConfigured: () => auth !== undefined,
    async fetch(signal) {
      if (!auth) throw new Error('valorant is not configured');
      const { apiKey, name, tag, region } = auth;

      const account = await hdRequest<RawAccount>(signal, apiKey, `/valorant/v2/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, 'GetAccount');
      const [mmr, matches, cachedHistory] = await Promise.all([
        hdRequest<RawMmr>(
          signal,
          apiKey,
          `/valorant/v3/mmr/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
          'GetMmr',
        ),
        hdRequest<RawMatch[]>(
          signal,
          apiKey,
          `/valorant/v4/matches/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?size=${RECENT_MATCHES_COUNT}`,
          'GetMatches',
        ),
        historyStore?.get(),
      ]);

      const currentSeason = mmr.seasonal.at(-1);
      const currentActShort = currentSeason?.season?.short;
      const recentMatches = matches.map((match) => mapMatch(match, account.puuid)).filter((match): match is ValorantMatch => match !== undefined);
      let storedHistory = cachedHistory;

      if (!storedHistory || !isHistoryFresh(storedHistory)) {
        try {
          const startPage = storedHistory?.nextPage ?? 1;
          const storedMatches = await fetchMatchHistoryPages(
            signal,
            apiKey,
            region,
            name,
            tag,
            startPage,
          );
          let storedMmrHistory: RawMmrHistoryEntry[] = [];
          if (storedMatches.rateLimitRemaining === undefined || storedMatches.rateLimitRemaining > 3) {
            try {
              storedMmrHistory = (await fetchStoredPages<RawMmrHistoryEntry>(
                signal,
                apiKey,
                `/valorant/v2/stored-mmr-history/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
                'GetStoredMmrHistory',
                startPage,
              )).data;
            } catch {
              // Archive match data is still useful when HenrikDev has no stored MMR rows yet.
            }
          }
          const archivedMatches = attachMmrActs(
            storedMatches.data.map((match) => mapMatch(match, account.puuid)).filter((match): match is ValorantMatch => match !== undefined),
            storedMmrHistory,
          );
          storedHistory = await historyStore?.set({
            matches: mergeMatches(storedHistory?.matches ?? [], archivedMatches),
            totalMatchesAvailable: mergeMatches(storedHistory?.matches ?? [], archivedMatches).length,
            nextPage: storedMatches.nextPage,
            sourceVersion: MATCH_HISTORY_CACHE_VERSION,
          }) ?? {
            matches: mergeMatches(storedHistory?.matches ?? [], archivedMatches),
            totalMatchesAvailable: mergeMatches(storedHistory?.matches ?? [], archivedMatches).length,
            fetchedAt: new Date().toISOString(),
            nextPage: storedMatches.nextPage,
            sourceVersion: MATCH_HISTORY_CACHE_VERSION,
          };
        } catch {
          // The normal ten-match view remains useful when the optional archive is temporarily
          // unavailable; preserve the previous archive instead of failing the whole widget.
        }
      }

      const historyMatches = mergeMatches(storedHistory?.matches ?? [], recentMatches);
      const data: ValorantData = {
        profile: {
          name: account.name,
          tag: account.tag,
          region: account.region,
          accountLevel: account.account_level,
          cardIconUrl: account.card ? cardIconUrl(account.card) : undefined,
        },
        rank: {
          tierId: mmr.current.tier.id,
          tierName: mmr.current.tier.name,
          tierIconUrl: tierIconUrl(mmr.current.tier.id),
          rr: mmr.current.rr,
          lastChange: mmr.current.last_change,
          leaderboardRank: mmr.current.leaderboard_placement?.rank,
        },
        peak: {
          tierName: mmr.peak.tier.name,
          tierIconUrl: tierIconUrl(mmr.peak.tier.id),
          seasonShort: mmr.peak.season?.short,
        },
        currentSeason: currentSeason ? { wins: currentSeason.wins, games: currentSeason.games } : undefined,
        recentMatches,
        history: {
          matches: historyMatches,
          totalMatchesAvailable: Math.max(storedHistory?.totalMatchesAvailable ?? 0, historyMatches.length),
          fetchedAt: storedHistory?.fetchedAt ?? new Date().toISOString(),
          currentActShort,
        },
      };

      return valorantSchema.parse(data);
    },
  };
}
