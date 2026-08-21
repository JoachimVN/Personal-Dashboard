import type { ValorantData, ValorantLiveData } from '@personal-dashboard/shared';

import type { Candidate } from '../types.js';
import { allShapes } from './shapes.js';

/** A live reading is a claim about this instant, so an old one is worse than none — the pusher
 * re-reads every minute and this leaves room for a missed tick or two. */
const LIVE_FRESH_MS = 3 * 60_000;

/** Past this, "last match" stops being news and the ambient rank card is the more useful thing to
 * show instead. */
const LAST_MATCH_FRESH_MS = 6 * 60 * 60_000;

function isFresh(observedAt: string, now: number): boolean {
  const at = Date.parse(observedAt);
  return !Number.isNaN(at) && now - at <= LIVE_FRESH_MS;
}

function partyDetail(live: ValorantLiveData): string | undefined {
  return live.partySize !== undefined && live.partySize > 1 ? `${live.partySize}-stack` : undefined;
}

function joinDetail(...parts: (string | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join(' · ');
}

/** In a match, with the round score as it stands. The highest-value thing this source can say, so
 * it outranks everything else here and is allowed into any shape. */
function inGameCandidate(live: ValorantLiveData): Candidate | undefined {
  if (live.state !== 'ingame') return undefined;
  const score = live.roundsWon !== undefined && live.roundsLost !== undefined ? `${live.roundsWon}–${live.roundsLost}` : undefined;
  return {
    id: 'valorant:live:ingame', source: 'valorant', kind: 'valorant', score: 74, shapes: [...allShapes],
    kicker: live.idle ? 'In a Valorant match (away)' : 'In a Valorant match',
    title: joinDetail(live.map ?? 'Valorant', score),
    detail: joinDetail(live.mode, partyDetail(live)) || 'Playing now',
    href: '#/valorant', render: { type: 'valorant-slot', badge: 'valorant', artUrl: live.mapArtUrl },
  };
}

function agentSelectCandidate(live: ValorantLiveData): Candidate | undefined {
  if (live.state !== 'pregame') return undefined;
  return {
    id: 'valorant:live:pregame', source: 'valorant', kind: 'valorant', score: 70, shapes: [...allShapes],
    kicker: 'Valorant agent select', title: live.map ?? 'Picking an agent',
    detail: joinDetail(live.mode, partyDetail(live)) || 'Match starting',
    href: '#/valorant', render: { type: 'valorant-slot', badge: 'valorant', artUrl: live.mapArtUrl },
  };
}

function menusCandidate(live: ValorantLiveData): Candidate | undefined {
  if (live.state !== 'menus') return undefined;
  return {
    id: 'valorant:live:menus', source: 'valorant', kind: 'valorant', score: 48, shapes: ['secondary', 'tile'],
    kicker: live.idle ? 'Away in Valorant' : 'In the Valorant menus', title: 'Between matches',
    detail: joinDetail(live.mode, partyDetail(live)) || 'Valorant is open',
    href: '#/valorant', render: { type: 'valorant-slot', badge: 'valorant', artUrl: live.mapArtUrl },
  };
}

/** Signed into the Riot client without Valorant running. Deliberately labelled as the launcher
 * rather than as Valorant: the client is shared with League, so claiming Valorant here would be a
 * guess rather than a reading. */
function riotOnlineCandidate(live: ValorantLiveData): Candidate | undefined {
  if (live.state !== 'riot') return undefined;
  return {
    id: 'valorant:live:riot', source: 'valorant', kind: 'valorant', score: 30, shapes: ['tile'],
    kicker: 'Riot', title: live.idle ? 'Away on Riot Launcher' : 'Online on Riot Launcher',
    detail: '', href: '#/valorant', render: { type: 'valorant-slot', badge: 'riot' },
  };
}

function lastMatchCandidate(data: ValorantData | undefined, now: number): Candidate | undefined {
  const match = data?.recentMatches[0];
  if (!match) return undefined;
  const endedAt = Date.parse(match.startedAt) + (match.durationSeconds ?? 0) * 1000;
  if (Number.isNaN(endedAt) || now - endedAt > LAST_MATCH_FRESH_MS) return undefined;
  const outcome = { win: 'Victory', loss: 'Defeat', draw: 'Draw' }[match.result];
  const score = match.roundsWon !== undefined && match.roundsLost !== undefined ? `${match.roundsWon}–${match.roundsLost}` : undefined;
  return {
    id: `valorant:last-match:${match.matchId}`, source: 'valorant', kind: 'valorant',
    score: match.result === 'win' ? 56 : 52, shapes: ['secondary', 'tile'],
    kicker: 'Last Valorant match', title: joinDetail(`${outcome} on ${match.map}`, score),
    detail: joinDetail(match.mode, `${match.kills}/${match.deaths}/${match.assists}`, match.agentName),
    href: '#/valorant', render: { type: 'valorant-slot', badge: 'valorant', iconUrl: match.agentIconUrl },
  };
}

function rankCandidate(data: ValorantData | undefined): Candidate | undefined {
  if (!data || data.rank.tierId === 0) return undefined;
  const change = data.rank.lastChange;
  let movement: string | undefined;
  if (change !== 0) {
    const sign = change > 0 ? '+' : '';
    movement = `${sign}${change} RR last game`;
  }
  return {
    id: 'valorant:rank', source: 'valorant', kind: 'valorant', score: 24, shapes: ['tile'],
    kicker: 'Valorant rank', title: data.rank.tierName,
    detail: joinDetail(`${data.rank.rr} RR`, movement), href: '#/valorant',
    render: { type: 'valorant-slot', badge: 'valorant', iconUrl: data.rank.tierIconUrl },
  };
}

/**
 * Only the first match is returned — being in a game, agent select, sitting in the menus, being on
 * the launcher, the match that just finished and the ambient rank card would otherwise all compete
 * for slots from the same source. Order doubles as the priority: whatever is happening right now
 * beats whatever just happened, which beats the standing rank.
 */
export function valorantCandidates(
  data: ValorantData | undefined,
  live: ValorantLiveData | null | undefined,
  now: number = Date.now(),
): Candidate[] {
  const fresh = live && isFresh(live.observedAt, now) ? live : undefined;
  const candidate = (fresh && (
    inGameCandidate(fresh)
    ?? agentSelectCandidate(fresh)
    ?? menusCandidate(fresh)
    ?? riotOnlineCandidate(fresh)
  ))
    ?? lastMatchCandidate(data, now)
    ?? rankCandidate(data);

  return candidate ? [candidate] : [];
}
