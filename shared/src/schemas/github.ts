import { z } from 'zod';

export const githubSchema = z.object({
  activity: z.array(
    z.object({
      id: z.string(),
      /** Human summary, e.g. "pushed 3 commits". */
      summary: z.string(),
      repo: z.string(),
      timestamp: z.string(),
      url: z.string().optional(),
    }),
  ),
  pullRequests: z.array(
    z.object({
      title: z.string(),
      repo: z.string(),
      number: z.number(),
      url: z.string(),
      role: z.enum(['author', 'review-requested']),
      draft: z.boolean(),
      updatedAt: z.string(),
    }),
  ),
  issues: z.array(
    z.object({
      title: z.string(),
      repo: z.string(),
      number: z.number(),
      url: z.string(),
      updatedAt: z.string(),
    }),
  ),
  contributions: z.object({
    total: z.number(),
    /** Date-only YYYY-MM-DD strings straight from GitHub — never timezone-shifted. */
    days: z.array(z.object({ date: z.string(), count: z.number() })),
  }),
  repoHealth: z.array(
    z.object({
      fullName: z.string(),
      stars: z.number(),
      ciStatus: z.enum(['success', 'failure', 'running', 'none']),
      ciUrl: z.string().optional(),
      latestRelease: z.string().optional(),
      url: z.string(),
    }),
  ),
});

export type GitHubData = z.infer<typeof githubSchema>;
