import { describe, expect, it } from 'vitest';
import { createOwnedReposCache, describeEvent, type RawEvent } from './github.js';

function pushEvent(commits: RawEvent['payload']['commits']): RawEvent {
  return {
    id: '1',
    type: 'PushEvent',
    repo: { name: 'octo/dashboard' },
    created_at: '2026-07-12T12:00:00Z',
    payload: { ref: 'refs/heads/dev', commits },
  };
}

describe('describeEvent', () => {
  it('preserves commit titles, bodies, and SHAs from push events', () => {
    expect(
      describeEvent(
        pushEvent([
          { sha: 'abc123', message: 'feat: show commits\n\nInclude each commit body in activity.' },
          { sha: 'def456', message: 'fix: retain full commit message' },
        ]),
      ),
    ).toEqual({
      summary: '2 commits',
      branch: 'dev',
      commits: [
        {
          sha: 'abc123',
          title: 'feat: show commits',
          description: 'Include each commit body in activity.',
        },
        { sha: 'def456', title: 'fix: retain full commit message' },
      ],
    });
  });
});

describe('owned repository cache', () => {
  const auth = { token: 'test-token', username: 'octo' };

  it('serves the last successful list when GitHub is temporarily unavailable', async () => {
    let available = true;
    const getRepos = createOwnedReposCache(async () => {
      if (!available) throw new Error('GitHub unavailable');
      return ['octo/dashboard'];
    });

    await expect(getRepos(auth)).resolves.toEqual({ repos: ['octo/dashboard'], stale: false });
    available = false;
    await expect(getRepos(auth)).resolves.toEqual({ repos: ['octo/dashboard'], stale: true });
  });

  it('keeps an initial failure visible when there is no cached list', async () => {
    const getRepos = createOwnedReposCache(async () => {
      throw new Error('GitHub unavailable');
    });

    await expect(getRepos(auth)).rejects.toThrow('GitHub unavailable');
  });
});
