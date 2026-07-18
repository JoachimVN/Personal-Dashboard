import { z } from 'zod';

export const aiNewsProviderSchema = z.enum(['openai', 'anthropic']);

export const aiNewsSchema = z.object({
  items: z.array(
    z.object({
      title: z.string(),
      source: z.string(),
      url: z.string(),
      publishedAt: z.string(),
      provider: aiNewsProviderSchema,
    }),
  ),
});

export type AiNewsProvider = z.infer<typeof aiNewsProviderSchema>;
export type AiNewsData = z.infer<typeof aiNewsSchema>;
