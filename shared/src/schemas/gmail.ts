import { z } from 'zod';

export const gmailSchema = z.object({
  unreadThreads: z.number(),
  /** Most recent inbox threads — headers only (gmail.metadata scope). */
  threads: z.array(
    z.object({
      id: z.string(),
      from: z.string(),
      subject: z.string(),
      date: z.string(),
      unread: z.boolean(),
      url: z.string(),
    }),
  ),
});

export type GmailData = z.infer<typeof gmailSchema>;
