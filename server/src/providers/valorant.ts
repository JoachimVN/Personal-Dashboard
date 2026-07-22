import { valorantSchema, type ValorantData, type ValorantMatch } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';

const HD_API_BASE = 'https://api.henrikdev.xyz';
const RECENT_MATCHES_COUNT = 10;
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
  seasonal: { wins: number; games: number }[];
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
  };
}

export function createValorantProvider(auth: ValorantAuth | undefined): Provider<ValorantData> {
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
      const mmr = await hdRequest<RawMmr>(
        signal,
        apiKey,
        `/valorant/v3/mmr/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
        'GetMmr',
      );
      const matches = await hdRequest<RawMatch[]>(
        signal,
        apiKey,
        `/valorant/v4/matches/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?size=${RECENT_MATCHES_COUNT}`,
        'GetMatches',
      );

      const currentSeason = mmr.seasonal.at(-1);
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
        recentMatches: matches.map((match) => mapMatch(match, account.puuid)).filter((match): match is ValorantMatch => match !== undefined),
      };

      return valorantSchema.parse(data);
    },
  };
}
