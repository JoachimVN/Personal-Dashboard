import { clashRoyaleSchema, type ClashRoyaleBattle, type ClashRoyaleCard, type ClashRoyaleData } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';

const CR_API_BASE = 'https://api.clashroyale.com/v1';
const RECENT_BATTLES_COUNT = 10;

export interface ClashRoyaleAuth {
  apiKey: string;
  playerTag: string;
}

interface RawCard {
  id: number;
  name: string;
  level: number;
  maxLevel: number;
  iconUrls?: { medium?: string };
}

interface RawPlayer {
  tag: string;
  name: string;
  expLevel: number;
  trophies: number;
  bestTrophies: number;
  wins: number;
  losses: number;
  threeCrownWins: number;
  battleCount: number;
  arena?: { name: string };
  currentDeck?: RawCard[];
}

interface RawBattleTeamMember {
  crowns: number;
  name?: string;
  startingTrophies?: number;
  trophyChange?: number;
}

interface RawBattle {
  battleTime: string;
  type: string;
  team: RawBattleTeamMember[];
  opponent: RawBattleTeamMember[];
}

/** Clash Royale tags are always upper-case and '#'-prefixed; the API rejects anything else. */
export function normalizeTag(tag: string): string {
  const trimmed = tag.trim().toUpperCase();
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

/** Supercell's battleTime is a compact, non-ISO timestamp (`20260721T120000.000Z`) that
 * `Date`/`new Date()` can't parse — insert the separators ISO 8601 requires. */
export function toIsoTimestamp(battleTime: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(battleTime);
  if (!match) return battleTime;
  const [, year, month, day, hour, minute, second, fraction] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${fraction ?? ''}Z`;
}

/** Never throws a message containing the URL — it carries the API key via the Authorization header,
 * but the path itself also encodes the player tag, personal enough to keep out of error text too.
 * A 403 here almost always means the key's IP allowlist doesn't include the server's current
 * public IP (dynamic IPs, or a machine that moves between networks, drift out of it silently) —
 * called out specifically since it's by far the most common failure mode and otherwise looks
 * identical to any other rejected request in the logs. */
async function crRequest<T>(signal: AbortSignal, apiKey: string, path: string, label: string): Promise<T> {
  const res = await fetch(`${CR_API_BASE}${path}`, {
    signal,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 403) {
    throw new Error(
      `Clash Royale ${label} failed: HTTP 403 — the API key's allowed IP list probably doesn't include this ` +
        'server\'s current public IP. Check developer.clashroyale.com and update it (run `curl ifconfig.me` here to get the current one).',
    );
  }
  if (!res.ok) throw new Error(`Clash Royale ${label} failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** One-off convenience log for developer.clashroyale.com's IP allowlist, called once from server
 * startup (not from the polling `fetch()` cycle, so it never fires during provider unit tests or
 * on every 10-minute refresh) — only worth calling when Clash Royale is actually configured.
 * Fetch failures are swallowed; this is a nice-to-have, not something worth failing startup over. */
export async function logClashRoyalePublicIp(): Promise<void> {
  try {
    const res = await fetch('https://api.ipify.org');
    const ip = await res.text();
    console.log(`[clash-royale] server's current public IP is ${ip} — keep this on the key's allowlist at developer.clashroyale.com`);
  } catch {
    // Best-effort; the provider's own fetch will surface the real failure if the IP is actually wrong.
  }
}

export function mapCard(card: RawCard): ClashRoyaleCard {
  return {
    id: card.id,
    name: card.name,
    level: card.level,
    maxLevel: card.maxLevel,
    iconUrl: card.iconUrls?.medium,
  };
}

export function battleResult(team: RawBattleTeamMember[], opponent: RawBattleTeamMember[]): 'win' | 'loss' | 'draw' {
  const crownsFor = team.reduce((sum, m) => sum + m.crowns, 0);
  const crownsAgainst = opponent.reduce((sum, m) => sum + m.crowns, 0);
  if (crownsFor > crownsAgainst) return 'win';
  if (crownsFor < crownsAgainst) return 'loss';
  return 'draw';
}

export function mapBattle(battle: RawBattle): ClashRoyaleBattle {
  const [self] = battle.team;
  const [opponent] = battle.opponent;
  return {
    battleTime: toIsoTimestamp(battle.battleTime),
    type: battle.type,
    result: battleResult(battle.team, battle.opponent),
    crownsFor: battle.team.reduce((sum, m) => sum + m.crowns, 0),
    crownsAgainst: battle.opponent.reduce((sum, m) => sum + m.crowns, 0),
    opponentName: opponent?.name,
    trophyChange: self?.trophyChange,
  };
}

export function createClashRoyaleProvider(auth: ClashRoyaleAuth | undefined): Provider<ClashRoyaleData> {
  return {
    id: 'clash-royale',
    schema: clashRoyaleSchema,
    refreshMs: 10 * 60_000,
    timeoutMs: 15_000,
    isConfigured: () => auth !== undefined,
    async fetch(signal) {
      if (!auth) throw new Error('clash-royale is not configured');
      const tag = normalizeTag(auth.playerTag);
      const encodedTag = encodeURIComponent(tag);

      const player = await crRequest<RawPlayer>(signal, auth.apiKey, `/players/${encodedTag}`, 'GetPlayer');
      const battleLog = await crRequest<RawBattle[]>(signal, auth.apiKey, `/players/${encodedTag}/battlelog`, 'GetBattleLog');
      const upcomingChests = await crRequest<{ items: { name: string }[] }>(
        signal,
        auth.apiKey,
        `/players/${encodedTag}/upcomingchests`,
        'GetUpcomingChests',
      );

      const data: ClashRoyaleData = {
        profile: {
          tag: player.tag,
          name: player.name,
          expLevel: player.expLevel,
          trophies: player.trophies,
          bestTrophies: player.bestTrophies,
          wins: player.wins,
          losses: player.losses,
          threeCrownWins: player.threeCrownWins,
          battleCount: player.battleCount,
          arenaName: player.arena?.name ?? 'Unknown arena',
        },
        currentDeck: (player.currentDeck ?? []).map(mapCard),
        upcomingChests: upcomingChests.items.map((item) => item.name),
        recentBattles: battleLog.slice(0, RECENT_BATTLES_COUNT).map(mapBattle),
      };

      return clashRoyaleSchema.parse(data);
    },
  };
}
