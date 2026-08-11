import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { IGNORED_GITHUB_EVENTS, shouldRefreshFor, verifyGithubSignature } from './githubWebhook.js';

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
