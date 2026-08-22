import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/** Express does not keep the raw body, and the signature is over the exact bytes GitHub sent. */
export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Verifies GitHub's `X-Hub-Signature-256` header: HMAC-SHA256 of the raw request body, keyed by the
 * webhook secret. Compared with `timingSafeEqual` on equal-length digests, so a wrong signature
 * leaks nothing about how much of it was right.
 */
export function verifyGithubSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!rawBody || !signatureHeader?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  let presented: Buffer;
  try {
    presented = Buffer.from(signatureHeader.slice('sha256='.length), 'hex');
  } catch {
    return false;
  }
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}

/**
 * GitHub sends these constantly on any repo with CI, and none of them change what the dashboard
 * shows. Ignoring them here means a noisy webhook subscription still cannot cause a refresh storm,
 * regardless of which boxes are ticked in the repo's settings.
 */
export const IGNORED_GITHUB_EVENTS = new Set([
  'check_run',
  'check_suite',
  'workflow_job',
  'workflow_run',
  'status',
  'deployment',
  'deployment_status',
  'ping',
]);

export function shouldRefreshFor(eventName: string | undefined): boolean {
  return Boolean(eventName) && !IGNORED_GITHUB_EVENTS.has(eventName!);
}

/** One activity line, matching what the pushed-activity consumer renders. */
export interface GithubActivity {
  action: string;
  repo: string;
  timestamp: string;
}

interface WebhookPayload {
  action?: string;
  ref?: string;
  ref_type?: string;
  repository?: { full_name?: string };
  commits?: unknown[];
  head_commit?: { timestamp?: string };
  pull_request?: { number?: number; updated_at?: string };
  issue?: { number?: number; updated_at?: string };
  release?: { tag_name?: string; published_at?: string };
}

const branchOf = (ref: string | undefined) => ref?.replace(/^refs\/heads\//, '') ?? 'a branch';

/**
 * Maps a raw webhook payload to an activity line. This is the webhook shape, which differs from
 * the Events API shape `providers/github.ts` already handles — same concepts, different envelope.
 *
 * Returns `undefined` for anything unrecognized rather than inventing a line, so a newly subscribed
 * event type shows nothing instead of something wrong.
 */
export function describeGithubWebhookEvent(
  eventName: string,
  payload: unknown,
): GithubActivity | undefined {
  const p = (payload ?? {}) as WebhookPayload;
  const repo = p.repository?.full_name;
  if (!repo) return undefined;
  const at = (value: string | undefined) => value ?? new Date().toISOString();

  switch (eventName) {
    case 'push': {
      const count = p.commits?.length ?? 0;
      if (count === 0) return undefined; // branch deletions and no-op pushes carry no commits
      return {
        action: `pushed ${count} commit${count === 1 ? '' : 's'} to ${branchOf(p.ref)}`,
        repo,
        timestamp: at(p.head_commit?.timestamp),
      };
    }
    case 'pull_request':
      return {
        action: `${p.action ?? 'updated'} pull request #${p.pull_request?.number ?? '?'}`,
        repo,
        timestamp: at(p.pull_request?.updated_at),
      };
    case 'issues':
      return {
        action: `${p.action ?? 'updated'} issue #${p.issue?.number ?? '?'}`,
        repo,
        timestamp: at(p.issue?.updated_at),
      };
    case 'issue_comment':
      return {
        action: `commented on #${p.issue?.number ?? '?'}`,
        repo,
        timestamp: at(p.issue?.updated_at),
      };
    case 'create':
      return {
        action: `created ${p.ref_type ?? 'ref'} ${p.ref ?? ''}`.trim(),
        repo,
        timestamp: at(undefined),
      };
    case 'release':
      return {
        action: `${p.action ?? 'updated'} release ${p.release?.tag_name ?? ''}`.trim(),
        repo,
        timestamp: at(p.release?.published_at),
      };
    default:
      return undefined;
  }
}

/**
 * The GitHub activity sink sits alongside the existing push endpoint, so it is derived from
 * `DASHBOARD_PUSH_URL` rather than configured separately — one URL to keep correct, not two.
 */
export function githubActivityPushUrl(pushUrl: string): string {
  const url = new URL(pushUrl);
  let pathname = url.pathname;
  while (pathname.endsWith('/')) pathname = pathname.slice(0, -1);
  url.pathname = `${pathname}/github`;
  return url.toString();
}
