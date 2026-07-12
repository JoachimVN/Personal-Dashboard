import { Octokit } from 'octokit';
import { githubSchema, type GitHubData } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';

export interface RawEvent {
  id: string;
  type: string | null;
  repo: { name: string };
  created_at: string | null;
  payload: {
    commits?: { sha: string; message: string }[];
    action?: string;
    ref?: string | null;
    ref_type?: string;
    pull_request?: { number: number; html_url: string };
    issue?: { number: number; html_url: string };
    release?: { tag_name: string; html_url: string };
  };
}

export function describeEvent(
  event: RawEvent,
): {
  summary: string;
  url?: string;
  branch?: string;
  commits?: { sha: string; title: string; description?: string }[];
} | undefined {
  const p = event.payload;
  switch (event.type) {
    case 'PushEvent': {
      const branch = p.ref?.replace('refs/heads/', '');
      // The events API carries each full commit message inline.
      const commits = (p.commits ?? [])
        .map((commit) => {
          const [firstLine, ...remainingLines] = commit.message.split(/\r?\n/);
          const title = firstLine.trim();
          const description = remainingLines.join('\n').trim();
          return {
            sha: commit.sha,
            title,
            ...(description ? { description } : {}),
          };
        })
        .filter((commit) => commit.title);
      if (commits.length === 0) {
        return { summary: branch ? `pushed to ${branch}` : 'pushed', branch };
      }
      return {
        summary: `${commits.length} commit${commits.length === 1 ? '' : 's'}`,
        branch,
        commits,
      };
    }
    case 'PullRequestEvent':
      return {
        summary: `${p.action} PR #${p.pull_request?.number}`,
        url: p.pull_request?.html_url,
      };
    case 'IssuesEvent':
      return { summary: `${p.action} issue #${p.issue?.number}`, url: p.issue?.html_url };
    case 'IssueCommentEvent':
      return { summary: `commented on #${p.issue?.number}`, url: p.issue?.html_url };
    case 'CreateEvent':
      return { summary: `created ${p.ref_type}${p.ref ? ` ${p.ref}` : ''}` };
    case 'ReleaseEvent':
      return { summary: `released ${p.release?.tag_name}`, url: p.release?.html_url };
    default:
      return undefined;
  }
}

interface SearchItem {
  title: string;
  number: number;
  html_url: string;
  draft?: boolean;
  updated_at: string;
  repository_url: string;
}

const repoFromApiUrl = (url: string) => url.replace('https://api.github.com/repos/', '');

/** Owned, non-fork, non-archived repos — the live replacement for a hand-maintained pinned-repo allowlist. */
export async function listOwnedRepos(auth: { token: string; username: string }): Promise<string[]> {
  const octokit = new Octokit({ auth: auth.token });
  const repos = await octokit.paginate('GET /user/repos', {
    affiliation: 'owner',
    sort: 'updated',
    per_page: 100,
  });
  return repos.filter((repo) => !repo.fork && !repo.archived).map((repo) => repo.full_name);
}

const CONTRIBUTIONS_QUERY = `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

interface ContributionsResponse {
  user: {
    contributionsCollection: {
      contributionCalendar: {
        totalContributions: number;
        weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
      };
    };
  };
}

export function createGitHubProvider(
  auth: { token: string; username: string } | undefined,
): Provider<GitHubData> {
  return {
    id: 'github',
    schema: githubSchema,
    refreshMs: 10 * 60_000,
    timeoutMs: 20_000,
    isConfigured: () => auth !== undefined,
    async fetch(signal) {
      if (!auth) throw new Error('github is not configured');
      const octokit = new Octokit({ auth: auth.token });
      const request = { signal };

      const search = (q: string) =>
        octokit.request('GET /search/issues', {
          q,
          advanced_search: 'true',
          per_page: 15,
          sort: 'updated',
          request,
        });

      const [events, authored, reviewRequested, assignedIssues, contributions, ownedRepos] =
        await Promise.all([
          octokit.request('GET /users/{username}/events', {
            username: auth.username,
            per_page: 40,
            request,
          }),
          search(`is:pr is:open author:${auth.username} archived:false`),
          search(`is:pr is:open review-requested:${auth.username} archived:false`),
          search(`is:issue is:open assignee:${auth.username} archived:false`),
          octokit.graphql<ContributionsResponse>(CONTRIBUTIONS_QUERY, {
            login: auth.username,
            request,
          }),
          listOwnedRepos(auth),
        ]);

      const health = await Promise.all(
        ownedRepos.map(async (fullName) => {
          const [owner, repo] = fullName.split('/');
          const [repoInfo, runs, release] = await Promise.all([
            octokit.request('GET /repos/{owner}/{repo}', { owner, repo, request }),
            octokit.request('GET /repos/{owner}/{repo}/actions/runs', {
              owner,
              repo,
              per_page: 1,
              request,
            }),
            octokit
              .request('GET /repos/{owner}/{repo}/releases/latest', { owner, repo, request })
              .catch(() => undefined),
          ]);
          const run = runs.data.workflow_runs[0];
          const ciStatus = !run
            ? ('none' as const)
            : run.status !== 'completed'
              ? ('running' as const)
              : run.conclusion === 'success'
                ? ('success' as const)
                : ('failure' as const);
          return {
            fullName,
            stars: repoInfo.data.stargazers_count,
            ciStatus,
            ciUrl: run?.html_url,
            latestRelease: release?.data.tag_name,
            url: repoInfo.data.html_url,
          };
        }),
      );

      const activity = (events.data as RawEvent[])
        .map((event) => {
          const described = describeEvent(event);
          if (!described || !event.created_at) return undefined;
          return {
            id: event.id,
            summary: described.summary,
            repo: event.repo.name,
            timestamp: event.created_at,
            url: described.url,
            branch: described.branch,
            commits: described.commits,
          };
        })
        .filter((entry) => entry !== undefined)
        .slice(0, 12);

      const toPr = (item: SearchItem, role: 'author' | 'review-requested') => ({
        title: item.title,
        repo: repoFromApiUrl(item.repository_url),
        number: item.number,
        url: item.html_url,
        role,
        draft: item.draft ?? false,
        updatedAt: item.updated_at,
      });

      const calendar = contributions.user.contributionsCollection.contributionCalendar;

      return {
        activity,
        pullRequests: [
          ...(authored.data.items as SearchItem[]).map((item) => toPr(item, 'author')),
          ...(reviewRequested.data.items as SearchItem[]).map((item) =>
            toPr(item, 'review-requested'),
          ),
        ],
        issues: (assignedIssues.data.items as SearchItem[]).map((item) => ({
          title: item.title,
          repo: repoFromApiUrl(item.repository_url),
          number: item.number,
          url: item.html_url,
          updatedAt: item.updated_at,
        })),
        contributions: {
          total: calendar.totalContributions,
          days: calendar.weeks.flatMap((week) =>
            week.contributionDays.map((day) => ({
              date: day.date, // date-only string, passed through untouched
              count: day.contributionCount,
            })),
          ),
        },
        repoHealth: health,
      };
    },
  };
}
