import { describe, expect, it } from 'vitest';
import { parsePresence, playlistLabel, readCompletedMatches, readTail, sessionStartedAt, toLive } from './rocketLeaguePresence.js';

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

describe('sessionStartedAt', () => {
  const header = 'Log: Log file open, 26/08/2026 16:03:04';

  it('reads the launch off the header and dates it from the file', () => {
    expect(sessionStartedAt(header, new Date(2026, 7, 26, 18, 13, 38, 935)))
      .toEqual(new Date(2026, 7, 26, 16, 3, 4, 0));
  });

  // The reason this is read from the header at all: the reaction key on the dashboard card is this
  // timestamp, and the estimate it replaced moved by a few milliseconds on every single reading.
  it('answers the same thing however long the session has been running', () => {
    const early = sessionStartedAt(header, new Date(2026, 7, 26, 16, 10, 2, 118));
    const late = sessionStartedAt(header, new Date(2026, 7, 26, 18, 49, 53, 802));
    expect(early).toEqual(late);
  });

  it('ignores the ambiguous day/month order beside the time', () => {
    const american = 'Log: Log file open, 08/26/2026 16:03:04';
    expect(sessionStartedAt(american, new Date(2026, 7, 26, 18, 13, 38, 935)))
      .toEqual(sessionStartedAt(header, new Date(2026, 7, 26, 18, 13, 38, 935)));
  });

  it('dates a session that ran past midnight to the day it began', () => {
    const beforeMidnight = 'Log: Log file open, 26/08/2026 23:50:10';
    expect(sessionStartedAt(beforeMidnight, new Date(2026, 7, 27, 0, 30, 0, 0)))
      .toEqual(new Date(2026, 7, 26, 23, 50, 10, 0));
  });

  // Nothing found means the caller falls back to working the launch out from the timestamps.
  it('reports nothing found for a line that is not the header', () => {
    expect(sessionStartedAt('Log: GPsyonixBuildID 260811.1257.524913', new Date())).toBeUndefined();
    expect(sessionStartedAt('', new Date())).toBeUndefined();
  });
});

describe('readCompletedMatches', () => {
  const startedAt = new Date('2026-08-22T00:00:00Z');

  it('catches a match whose scoreboard already scrolled off screen by the time this is read', () => {
    // The whole point: a "what's on screen right now" reading would land on the menu line and
    // miss the match entirely. Scanning the tail catches it anyway.
    const tail = [
      '[0010.00] DevOnline: Set rich presence to: Duel in Beckwith Park 0:05 (1 - 0) data: Playlist-10',
      '[0015.00] DevOnline: Set rich presence to: Duel in Beckwith Park (2 - 3) data: Playlist-10',
      '[0018.00] DevOnline: Set rich presence to: Main Menu data: Menu',
    ].join('\n');

    expect(readCompletedMatches(tail, startedAt)).toEqual([
      { goalsFor: 2, goalsAgainst: 3, playlist: 'Ranked Duel', map: 'Beckwith Park', endedAt: '2026-08-22T00:00:15.000Z' },
    ]);
  });

  it('collapses the scoreboard repeating itself on its refresh timer into one match', () => {
    const tail = [
      '[0015.00] DevOnline: Set rich presence to: Duel in Beckwith Park (2 - 3) data: Playlist-10',
      '[0025.00] DevOnline: Set rich presence to: Duel in Beckwith Park (2 - 3) data: Playlist-10',
      '[0035.00] DevOnline: Set rich presence to: Duel in Beckwith Park (2 - 3) data: Playlist-10',
    ].join('\n');

    expect(readCompletedMatches(tail, startedAt)).toHaveLength(1);
  });

  it('catches every match in the slice, oldest first, even back to back', () => {
    const tail = [
      '[0015.00] DevOnline: Set rich presence to: Duel in Beckwith Park (2 - 3) data: Playlist-10',
      '[0040.00] DevOnline: Set rich presence to: Duel in Farmstead (Pitched) 4:00 (0 - 0) data: Playlist-10',
      '[0090.00] DevOnline: Set rich presence to: Duel in Farmstead (Pitched) (5 - 4) data: Playlist-10',
    ].join('\n');

    expect(readCompletedMatches(tail, startedAt)).toEqual([
      { goalsFor: 2, goalsAgainst: 3, playlist: 'Ranked Duel', map: 'Beckwith Park', endedAt: '2026-08-22T00:00:15.000Z' },
      { goalsFor: 5, goalsAgainst: 4, playlist: 'Ranked Duel', map: 'Farmstead (Pitched)', endedAt: '2026-08-22T00:01:30.000Z' },
    ]);
  });

  it('reports nothing when no match ever reached the post-match screen', () => {
    const tail = '[0010.00] DevOnline: Set rich presence to: Duel in Beckwith Park 4:49 (1 - 0) data: Playlist-10';
    expect(readCompletedMatches(tail, startedAt)).toEqual([]);
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
