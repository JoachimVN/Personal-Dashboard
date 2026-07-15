import type { CommandCenterSlot } from '@personal-dashboard/shared';

export type SlotShape = 'hero' | 'secondary' | 'tile';

export interface Candidate extends CommandCenterSlot {
  shapes: SlotShape[];
}
