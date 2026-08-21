import { describe, expect, it } from 'vitest';
import { parsePresence, playlistLabel, readTail, toLive } from './rocketLeaguePresence.js';

describe('parsePresence', () => {
  it('reads mode, arena, clock and score off a live match', () => {
    expect(parsePresence('Duel in Beckwith Park 4:49 (1 - 0) data: Playlist-10')).toEqual({
      kind: 'match',
      mode: 'Duel',
      map: 'Beckwith Park',
      clock: '4:49',
      scoreFirst: 1,
      scoreSecond: 0,
      playlistId: 10,
    });
  });

  it('keeps an arena whose own name is parenthesised out of the score', () => {
    expect(parsePresence('Duel in Farmstead (Pitched) 3:12 (3 - 1) data: Playlist-11')).toMatchObject({
      map: 'Farmstead (Pitched)',
      clock: '3:12',
      scoreFirst: 3,
      scoreSecond: 1,
    });
  });

  it('treats a missing clock as the post-match scoreboard rather than a parse failure', () => {
    expect(parsePresence('Duel in Beckwith Park (2 - 5) data: Playlist-10')).toMatchObject({
      kind: 'match',
      clock: undefined,
      scoreFirst: 2,
      scoreSecond: 5,
    });
  });

  it('keeps the + on an overtime clock', () => {
    expect(parsePresence('Duel in Mannfield (Stormy) +0:12 (4 - 4) data: Playlist-10')).toMatchObject({
      clock: '+0:12',
      scoreFirst: 4,
      scoreSecond: 4,
    });
  });

  it('recognises the menus', () => {
    expect(parsePresence('Main Menu data: Menu')).toEqual({ kind: 'menu' });
  });

  it('ignores a presence string it does not recognise instead of half-reading it', () => {
    expect(parsePresence('Something entirely new')).toBeUndefined();
  });
});

describe('playlistLabel', () => {
  it('names the ranked and casual playlists it is sure of', () => {
    expect(playlistLabel('Duel', 10)).toBe('Ranked Duel');
    expect(playlistLabel('Doubles', 2)).toBe('Casual Doubles');
    expect(playlistLabel('Standard', 6)).toBe('Private match');
  });

  it('falls back to the mode the presence string already spells out', () => {
    expect(playlistLabel('Snow Day', 999)).toBe('Snow Day');
    expect(playlistLabel('Duel', undefined)).toBe('Duel');
  });
});

describe('readTail', () => {
  const tail = [
    '[0096.34] DevOnline: Set rich presence to: Duel in Boostfield Mall 5:00 (0 - 0) data: Playlist-10',
    '[0133.84] DevOnline: Set rich presence to: Duel in Boostfield Mall 4:39 (1 - 0) data: Playlist-10',
    '[0151.95] DevNet: something else entirely',
  ].join('\n');

  it('takes the newest presence line, not the first', () => {
    expect(readTail(tail).presence).toMatchObject({ clock: '4:39', scoreFirst: 1 });
  });

  it('takes the elapsed stamp off the last stamped line', () => {
    expect(readTail(tail).lastOffsetSeconds).toBe(151.95);
  });

  it('survives a slice that begins mid-line and ends mid-line', () => {
    const truncated = `presence to: Duel in Nowhere 1:00 (9 - 9) data: Playlist-10\n${tail}\n[0160`;
    const result = readTail(truncated);
    expect(result.presence).toMatchObject({ scoreFirst: 1, scoreSecond: 0 });
    expect(result.lastOffsetSeconds).toBe(151.95);
  });

  it('reports nothing found rather than guessing', () => {
    expect(readTail('')).toEqual({ presence: undefined, lastOffsetSeconds: undefined });
  });
});

describe('toLive', () => {
  const startedAt = new Date('2026-08-21T23:14:58Z');
  const observedAt = new Date('2026-08-22T00:22:30Z');

  it('reports a running clock as a live match', () => {
    expect(toLive(parsePresence('Duel in Beckwith Park 4:49 (1 - 0) data: Playlist-10'), startedAt, observedAt)).toEqual({
      state: 'ingame',
      playlist: 'Ranked Duel',
      map: 'Beckwith Park',
      goalsFor: 1,
      goalsAgainst: 0,
      clock: '4:49',
      startedAt: startedAt.toISOString(),
      observedAt: observedAt.toISOString(),
    });
  });

  it('reports a scoreboard with no clock as the post-match screen', () => {
    expect(toLive(parsePresence('Duel in Beckwith Park (2 - 5) data: Playlist-10'), startedAt, observedAt)).toMatchObject({
      state: 'postmatch',
      goalsFor: 2,
      goalsAgainst: 5,
      clock: undefined,
    });
  });

  // A log that is still being written to is a game that is still running, so the absence of a
  // recent presence line means "sitting in a menu", not "not playing".
  it('falls back to the menus when the tail carried no presence line at all', () => {
    expect(toLive(undefined, startedAt, observedAt)).toEqual({
      state: 'menus',
      startedAt: startedAt.toISOString(),
      observedAt: observedAt.toISOString(),
    });
  });
});
