import { createContext, useContext } from 'react';

/**
 * The clock the sky wash follows: real time normally, the debug slider's time when
 * SHOW_SKY_TIME_DEBUGGER is on. App.tsx provides it so time-of-day visuals deeper in
 * the tree (the weather section's daylight arc) scrub along with the sky preview.
 */
export const SkyTimeContext = createContext<Date | null>(null);

export function useSkyNow(): Date {
  return useContext(SkyTimeContext) ?? new Date();
}
