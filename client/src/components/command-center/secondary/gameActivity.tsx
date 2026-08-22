import type { CommandCenterSlot } from '@personal-dashboard/shared';

type ActivitySlot = CommandCenterSlot & {
  render: Extract<CommandCenterSlot['render'], { type: 'minecraft-slot' | 'rocket-league-slot' }>;
};

/** A game's name, current mode, and session length are separate facts, so give each its own line
 * instead of squeezing two facts into the duration line. */
export function GameActivityText({ slot, className = '' }: Readonly<{ slot: ActivitySlot; className?: string }>) {
  return <div className={className}>
    <p className="text-sm font-semibold text-ink">{slot.title}</p>
    {slot.render.activity && <p className="mt-0.5 text-sm text-ink-muted">{slot.render.activity}</p>}
    <p className="mt-0.5 text-sm text-ink-muted">{slot.detail}</p>
  </div>;
}
