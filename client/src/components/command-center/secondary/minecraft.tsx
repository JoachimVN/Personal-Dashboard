import type { ReactNode } from 'react';
import type { CommandCenterSlot } from '@personal-dashboard/shared';
import { GameActivityText } from './gameActivity';

export function MinecraftNowPlayingSecondary({ slot }: Readonly<{ slot: CommandCenterSlot }>): ReactNode {
  if (slot.render.type !== 'minecraft-slot') return null;
  return <GameActivityText slot={slot} className="mt-4" />;
}
