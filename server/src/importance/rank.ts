import type { CommandCenterData } from '@personal-dashboard/shared';
import type { Candidate, SlotShape } from './types.js';

const slotShapes: SlotShape[] = ['hero', 'secondary', 'tile', 'tile', 'tile'];

/** Highest score wins each slot, avoiding duplicate sources unless that would leave a slot empty. */
export function rankCandidates(candidates: Candidate[]): CommandCenterData {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const usedSources = new Set<string>();
  const assigned = slotShapes.map((shape) => {
    const eligible = sorted.filter((candidate) => candidate.shapes.includes(shape));
    const unused = eligible.find((candidate) => !usedSources.has(candidate.source));
    const selected = unused ?? eligible[0];
    if (!selected) throw new Error(`No ${shape} command-center fallback candidate was supplied`);
    usedSources.add(selected.source);
    return selected;
  });
  const [hero, secondary, ...tiles] = assigned;
  return { hero, secondary, tiles: [tiles[0], tiles[1], tiles[2]] };
}
