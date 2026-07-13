import { z } from 'zod';

export const hueLightSchema = z.object({
  id: z.string(),
  name: z.string(),
  on: z.boolean(),
  /** Normalized 1-100; Hue's own `bri` field is 1-254 and undefined while a light is off. */
  brightness: z.number().min(1).max(100),
  reachable: z.boolean(),
});

export const hueSceneSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Room the scene belongs to, resolved from the bridge's groups; null if the group is gone. */
  room: z.string().nullable(),
});

export const hueDataSchema = z.object({
  lights: z.array(hueLightSchema),
  scenes: z.array(hueSceneSchema),
});

export type HueLight = z.infer<typeof hueLightSchema>;
export type HueScene = z.infer<typeof hueSceneSchema>;
export type HueData = z.infer<typeof hueDataSchema>;
