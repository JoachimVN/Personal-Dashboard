import { z } from 'zod';

export const hueLightSchema = z.object({
  id: z.string(),
  name: z.string(),
  on: z.boolean(),
  /** Normalized 1-100; Hue's own `bri` field is 1-254 and undefined while a light is off. */
  brightness: z.number().min(1).max(100),
  reachable: z.boolean(),
});

export const hueDataSchema = z.object({
  lights: z.array(hueLightSchema),
});

export type HueLight = z.infer<typeof hueLightSchema>;
export type HueData = z.infer<typeof hueDataSchema>;
