import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  describeGithubWebhookEvent,
  githubActivityPushUrl,
  IGNORED_GITHUB_EVENTS,
  shouldRefreshFor,
  verifyGithubSignature,
} from './githubWebhook.js';

const SECRET = 'webhook-secret-long-enough-1234';
const body = Buffer.from(JSON.stringify({ ref: 'refs/heads/main' }));
const sign = (payload: Buffer, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

describe('verifyGithubSignature', () => {
  it('accepts a signature GitHub would have produced', () => {
    expect(verifyGithubSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a signature made with a different secret', () => {
    expect(verifyGithubSignature(body, sign(body, 'not-the-secret'), SECRET)).toBe(false);
  });

  it('rejects a body altered after signing', () => {
    const signature = sign(body);
    const tampered = Buffer.from(JSON.stringify({ ref: 'refs/heads/evil' }));
    expect(verifyGithubSignature(tampered, signature, SECRET)).toBe(false);
  });

  it('rejects a missing, malformed, or wrong-algorithm header', () => {
    expect(verifyGithubSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyGithubSignature(body, 'sha256=zzzz', SECRET)).toBe(false);
    expect(verifyGithubSignature(body, 'sha256=', SECRET)).toBe(false);
    // GitHub's deprecated SHA-1 header must not be accepted as if it were the SHA-256 one.
    expect(verifyGithubSignature(body, `sha1=${'a'.repeat(40)}`, SECRET)).toBe(false);
  });

  it('rejects a request whose raw body was never captured', () => {
    expect(verifyGithubSignature(undefined, sign(body), SECRET)).toBe(false);
  });
});

describe('shouldRefreshFor', () => {
  it('reacts to events that change what the dashboard shows', () => {
    for (const event of ['push', 'pull_request', 'issues', 'release', 'create', 'star']) {
      expect(shouldRefreshFor(event)).toBe(true);
    }
  });

  it('ignores CI chatter, which fires constantly and changes nothing on the dashboard', () => {
    for (const event of IGNORED_GITHUB_EVENTS) {
      expect(shouldRefreshFor(event)).toBe(false);
    }
  });

  it('ignores a request with no event header', () => {
    expect(shouldRefreshFor(undefined)).toBe(false);
  });
});

const repo = { full_name: 'JoachimVN/Personal-Dashboard' };

describe('describeGithubWebhookEvent', () => {
  it('describes a push by commit count and branch', () => {
    expect(
      describeGithubWebhookEvent('push', {
        repository: repo,
        ref: 'refs/heads/main',
        commits: [{}, {}],
        head_commit: { timestamp: '2026-08-11T17:15:00Z' },
      }),
    ).toEqual({
      action: 'pushed 2 commits to main',
      repo: 'JoachimVN/Personal-Dashboard',
      timestamp: '2026-08-11T17:15:00Z',
    });
  });

  it('singularizes a one-commit push', () => {
    const activity = describeGithubWebhookEvent('push', {
      repository: repo,
      ref: 'refs/heads/dev',
      commits: [{}],
    });
    expect(activity?.action).toBe('pushed 1 commit to dev');
  });

  it('skips a push carrying no commits, which a branch deletion sends', () => {
    expect(describeGithubWebhookEvent('push', { repository: repo, ref: 'refs/heads/x', commits: [] })).toBeUndefined();
  });

  it('describes pull requests, issues, comments, branches and releases', () => {
    expect(
      describeGithubWebhookEvent('pull_request', { repository: repo, action: 'opened', pull_request: { number: 41 } })
        ?.action,
    ).toBe('opened pull request #41');
    expect(
      describeGithubWebhookEvent('issues', { repository: repo, action: 'closed', issue: { number: 7 } })?.action,
    ).toBe('closed issue #7');
    expect(
      describeGithubWebhookEvent('issue_comment', { repository: repo, issue: { number: 7 } })?.action,
    ).toBe('commented on #7');
    expect(
      describeGithubWebhookEvent('create', { repository: repo, ref_type: 'branch', ref: 'feat/x' })?.action,
    ).toBe('created branch feat/x');
    expect(
      describeGithubWebhookEvent('release', { repository: repo, action: 'published', release: { tag_name: 'v2' } })
        ?.action,
    ).toBe('published release v2');
  });

  it('returns nothing for an unrecognized event or a payload with no repository', () => {
    expect(describeGithubWebhookEvent('fork', { repository: repo })).toBeUndefined();
    expect(describeGithubWebhookEvent('push', { commits: [{}] })).toBeUndefined();
  });
});

describe('githubActivityPushUrl', () => {
  it('derives the GitHub sink as a sibling of the push endpoint', () => {
    expect(githubActivityPushUrl('https://example.com/api/push')).toBe('https://example.com/api/push/github');
    expect(githubActivityPushUrl('https://example.com/api/push/')).toBe('https://example.com/api/push/github');
  });
});
