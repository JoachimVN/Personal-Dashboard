import { z } from 'zod';

export const newsSchema = z.object({
  items: z.array(
    z.object({
      title: z.string(),
      source: z.string(),
      url: z.string(),
      publishedAt: z.string(),
    }),
  ),
});

export type NewsData = z.infer<typeof newsSchema>;
