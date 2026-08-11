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
