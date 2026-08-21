import type { MinecraftLiveData } from '@personal-dashboard/shared';

import type { Candidate } from '../types.js';
import { allShapes } from './shapes.js';

/** Same reasoning as the Valorant live reading: a claim about this instant is worthless once it is
 * stale, and there is no finished-session card to fall back to. */
const LIVE_FRESH_MS = 3 * 60_000;

function formatSessionLength(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'just started';
  if (minutes < 60) return `${minutes}m in`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h in` : `${hours}h ${remainder}m in`;
}

/**
 * One candidate, because one is all Minecraft can support: the game publishes no presence and has
 * no local API, so the reading behind this is inferred from its log. Presence and session length
 * are genuinely everything knowable without a mod running inside the game, and the card says that
 * much rather than dressing it up.
 */
export function minecraftCandidates(live: MinecraftLiveData | null | undefined, now: number = Date.now()): Candidate[] {
  if (!live) return [];
  const observedAt = Date.parse(live.observedAt);
  if (Number.isNaN(observedAt) || now - observedAt > LIVE_FRESH_MS) return [];

  const startedAt = Date.parse(live.startedAt);
  const detail = Number.isNaN(startedAt) ? 'Playing now' : formatSessionLength(now - startedAt);
  return [{
    id: 'minecraft:live', source: 'minecraft', kind: 'minecraft', score: 60, shapes: [...allShapes],
    kicker: 'Playing now', title: 'Minecraft', detail,
    href: '#/', render: { type: 'text' },
  }];
}
