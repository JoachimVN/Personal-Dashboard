import { Octokit } from 'octokit';
import { z } from 'zod';

const inputSchema = z.object({
  repo: z.string().trim().min(3),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().max(10_000).optional(),
});

export function parseIssueInput(input: unknown, allowedRepos: string[]) {
  const issue = inputSchema.parse(input);
  if (!allowedRepos.includes(issue.repo)) throw new Error('repo-not-allowed');
  return issue;
}

export async function createIssue(token: string, issue: z.infer<typeof inputSchema>) {
  const [owner, repo] = issue.repo.split('/');
  if (!owner || !repo) throw new Error('repo-not-allowed');
  const octokit = new Octokit({ auth: token });
  const response = await octokit.request('POST /repos/{owner}/{repo}/issues', {
    owner,
    repo,
    title: issue.title,
    body: issue.body || undefined,
  });
  return { number: response.data.number, title: response.data.title, url: response.data.html_url };
}

export function issueErrorCode(error: unknown): string {
  if (error instanceof z.ZodError) return 'invalid-issue';
  if (error instanceof Error && error.message === 'repo-not-allowed') return 'repo-not-allowed';
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (status === 401 || status === 403) return 'github-write-not-authorized';
  }
  return 'github-write-failed';
}
