import { describe, expect, it } from 'vitest';
import { gmailCandidates } from './gmail.js';

describe('gmailCandidates', () => {
  const now = Date.parse('2026-07-16T12:00:00Z');

  it('does not surface unread mail whose newest thread has gone stale', () => {
    const candidates = gmailCandidates({
      unreadThreads: 1,
      threads: [{ id: 'thread', subject: 'Old message', from: 'Sender', date: '2026-07-15T10:00:00Z', unread: true, url: 'https://mail.google.com/x' }],
    }, 30 * 60_000, 24 * 3_600_000, now);

    expect(candidates).toEqual([]);
  });

  it('treats a newly arrived unread thread as fresh even when the total count is unchanged', () => {
    // e.g. one thread was read and another arrived in the same window — the total stays flat,
    // but the newest unread thread's own date still shows a genuine arrival.
    const candidates = gmailCandidates({
      unreadThreads: 5,
      threads: [
        { id: 'new', subject: 'Just landed', from: 'Sender', date: '2026-07-16T11:50:00Z', unread: true, url: 'https://mail.google.com/x' },
        { id: 'old', subject: 'Old', from: 'Sender', date: '2026-07-10T09:00:00Z', unread: true, url: 'https://mail.google.com/y' },
      ],
    }, 30 * 60_000, 24 * 3_600_000, now);

    expect(candidates).toContainEqual(expect.objectContaining({
      id: 'gmail:inbox', kicker: 'New mail', shapes: ['hero', 'secondary', 'tile'],
    }));
  });

  it('does not treat an old newest-unread thread as fresh, no matter how the total count moved', () => {
    const candidates = gmailCandidates({
      unreadThreads: 4,
      threads: [{ id: 'thread', subject: 'Newsletter', from: 'Sender', date: '2026-07-16T02:00:00Z', unread: true, url: 'https://mail.google.com/z' }],
    }, 30 * 60_000, 24 * 3_600_000, now);

    expect(candidates).toContainEqual(expect.objectContaining({ id: 'gmail:inbox', kicker: 'Inbox', shapes: ['tile'] }));
  });
});
