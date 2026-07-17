import { describe, expect, it } from 'vitest';
import type { AiUsageToolData, GitHubData, HealthData, NewsData, SpotifyData, SteamData, WeatherData } from '@personal-dashboard/shared';
import { aiCandidates, githubCandidates, gmailCandidates, healthCandidates, newsCandidates, spotifyCandidates, steamCandidates, weatherCandidates } from './sources.js';

describe('githubCandidates', () => {
  const quietDay: GitHubData = {
    activity: [],
    pullRequests: [],
    issues: [],
    contributions: { total: 2019, days: [{ date: '2026-07-16', count: 0 }] },
    repoHealth: [],
  };

  it('does not surface a quiet contribution graph', () => {
    expect(githubCandidates(quietDay, 7, 50)).not.toContainEqual(expect.objectContaining({ id: 'github:contributions' }));
  });

  it('allows an active contribution day into the secondary carousel', () => {
    const data = {
      ...quietDay,
      contributions: { ...quietDay.contributions, days: [{ date: '2026-07-16', count: 1 }] },
    };
    const candidate = githubCandidates(data, 7, 50).find((item) => item.id === 'github:contributions');

    expect(candidate).toMatchObject({ title: '1 contribution today', shapes: ['tile'] });
  });

  it('keeps a recent weekly contribution graph available when today is quiet', () => {
    const data = {
      ...quietDay,
      contributions: { ...quietDay.contributions, days: [
        { date: '2026-07-10', count: 3 }, { date: '2026-07-16', count: 0 },
      ] },
    };

    expect(githubCandidates(data, 7, 50)).toContainEqual(expect.objectContaining({
      id: 'github:recent-contributions', title: '3 contributions this week', shapes: ['tile'],
    }));
  });
});

describe('gmailCandidates', () => {
  it('does not surface unread mail that has become stale', () => {
    const candidates = gmailCandidates({
      unreadThreads: 1,
      threads: [{ id: 'thread', subject: 'Old message', sender: 'Sender', date: '2026-07-15', unread: true }],
    }, 25 * 3_600_000, 24 * 3_600_000, 30 * 60_000);

    expect(candidates).toEqual([]);
  });
});

describe('healthCandidates', () => {
  it('uses the most recent saved day while today has not synced yet', () => {
    const data: HealthData = {
      today: null,
      history: [{ date: '2026-07-15', steps: 6_800, activeEnergyKcal: 500, exerciseMinutes: 30, standHours: 10 }],
      updatedAt: '2026-07-15T23:50:00.000Z',
      goals: { steps: 10_000, activeEnergyKcal: 600, exerciseMinutes: 30, standHours: 12 },
    };

    expect(healthCandidates(data)).toContainEqual(expect.objectContaining({
      id: 'health:activity', kicker: 'Last synced activity', title: '6,800 steps', detail: 'From 2026-07-15', shapes: ['tile'],
    }));
  });

  it('ignores an empty today placeholder in favor of the latest real activity', () => {
    const data: HealthData = {
      today: { date: '2026-07-16' },
      history: [
        { date: '2026-07-15', steps: 6_800, activeEnergyKcal: 500, exerciseMinutes: 30, standHours: 10 },
        { date: '2026-07-16' },
      ],
      updatedAt: '2026-07-16T01:00:00.000Z',
      goals: { steps: 10_000, activeEnergyKcal: 600, exerciseMinutes: 30, standHours: 12 },
    };

    expect(healthCandidates(data)).toContainEqual(expect.objectContaining({
      id: 'health:activity', kicker: 'Last synced activity', title: '6,800 steps', detail: 'From 2026-07-15', shapes: ['tile'],
    }));
  });

  it('describes partial activity by the metric that actually arrived', () => {
    const data: HealthData = {
      today: { date: '2026-07-16', activeEnergyKcal: 9 }, history: [{ date: '2026-07-16', activeEnergyKcal: 9 }],
      updatedAt: '2026-07-16T01:00:00.000Z', goals: { steps: 10_000, activeEnergyKcal: 290, exerciseMinutes: 30, standHours: 12 },
    };

    expect(healthCandidates(data)).toContainEqual(expect.objectContaining({
      id: 'health:activity', title: '9 active kcal', detail: 'Open Health for the full activity rings',
    }));
  });

  it('shows the actual metric for a genuine health baseline anomaly', () => {
    const data: HealthData = {
      today: { date: '2026-07-16', restingHeartRate: 80 },
      history: [],
      updatedAt: '2026-07-16T12:00:00.000Z',
      goals: { steps: 10_000, activeEnergyKcal: 290, exerciseMinutes: 30, standHours: 12 },
      baseline: {
        windowDays: 7,
        minimumSamples: 3,
        metrics: {
          restingHeartRate: { average: 60, current: 80, deviationPercent: 33, samples: 7, direction: 'above', anomalous: true },
        },
      },
    };

    expect(healthCandidates(data)).toContainEqual(expect.objectContaining({
      id: 'health:baseline:restingHeartRate',
      title: 'Resting Heart Rate 33% above',
      render: { type: 'text' },
    }));
  });
});

describe('weatherCandidates', () => {
  const weather: WeatherData = {
    location: { lat: 59.9, lon: 10.7, name: 'Oslo' }, current: { temperature: 12, windSpeed: 4, symbol: 'cloudy' }, hours: [],
    days: [
      { date: '2026-07-16', dayLabel: 'Thu', minTemperature: 10, maxTemperature: 18, precipitationMm: 0, symbol: 'cloudy' },
      { date: '2026-07-17', dayLabel: 'Fri', minTemperature: 11, maxTemperature: 19, precipitationMm: 1, symbol: 'partlycloudy_day' },
    ],
  };

  it('uses today rather than the following date for an overnight fallback forecast', () => {
    const [candidate] = weatherCandidates(weather, 25, -10, new Date('2026-07-16T01:00:00').getTime());

    expect(candidate).toMatchObject({ id: 'weather:later-today:2026-07-16', kicker: 'Later today', title: '10° to 18°' });
  });
});

describe('newsCandidates', () => {
  it('keeps the latest headline available as a low-priority tile', () => {
    const data: NewsData = { items: [{ title: 'A useful headline', source: 'Source', url: 'https://example.com/news', publishedAt: '2026-07-16T00:00:00Z' }] };

    expect(newsCandidates(data)).toContainEqual(expect.objectContaining({
      kicker: 'Source', title: 'A useful headline', shapes: ['tile'],
    }));
  });
});

describe('aiCandidates', () => {
  it('identifies the tightest tool and limit window in the runway detail', () => {
    const data: AiUsageToolData = {
      available: true,
      fiveHour: { usedPercent: 80, resetsAt: '2026-07-16T21:59:00.000Z' },
      weekly: { usedPercent: 50, resetsAt: '2026-07-20T21:59:00.000Z' },
      history: [],
    };

    const runway = aiCandidates([{ id: 'codex', label: 'Codex', data }], 7, 50)
      .find((candidate) => candidate.id === 'ai-usage:runway');

    expect(runway).toMatchObject({ title: '20% available', accent: 'codex' });
    expect(runway?.detail).toContain('Codex · 5-hour limit');
  });
});

describe('spotifyCandidates', () => {
  it('uses the primary artist for a newly surfaced album', () => {
    const data: SpotifyData = {
      nowPlaying: null,
      recentlyPlayed: [],
      topArtists: { shortTerm: [], mediumTerm: [], longTerm: [] },
      topTracks: { shortTerm: [], mediumTerm: [], longTerm: [] },
      allTime: {
        artists: [],
        tracks: [],
        albums: [{
          id: 'album-id',
          name: 'Album Title',
          artist: 'Primary Artist, Featured Artist',
          playCount: 12,
          topTracks: [],
        }],
      },
    };

    const candidates = spotifyCandidates(data, {
      trackShort: false, trackMedium: false, trackLong: false,
      trackAllTime: false,
      artistShort: false, artistMedium: false, artistLong: false, artistAllTime: false,
      albumAllTime: true,
    });

    expect(candidates.find((candidate) => candidate.id === 'spotify:new-album:album-id')).toMatchObject({
      detail: 'Primary Artist',
      score: 90,
    });
  });

  it('labels a long-term top-track change as a past-year signal', () => {
    const data: SpotifyData = {
      nowPlaying: null,
      recentlyPlayed: [],
      topArtists: { shortTerm: [], mediumTerm: [], longTerm: [] },
      topTracks: {
        shortTerm: [],
        mediumTerm: [],
        longTerm: [{ track: 'Baptized In Fear', artist: 'The Weeknd' }],
      },
      allTime: { artists: [], tracks: [], albums: [] },
    };

    const candidates = spotifyCandidates(data, {
      trackShort: false, trackMedium: false, trackLong: true,
      trackAllTime: false,
      artistShort: false, artistMedium: false, artistLong: false, artistAllTime: false,
      albumAllTime: false,
    });

    expect(candidates.find((candidate) => candidate.id === 'spotify:new-track:long:Baptized In Fear')?.kicker)
      .toBe('New top track this past year');
  });

  it('allows a genuinely new monthly top artist to use secondary', () => {
    const data: SpotifyData = {
      nowPlaying: null,
      recentlyPlayed: [],
      topArtists: { shortTerm: [{ id: 'artist-id', name: 'Monthly Artist', genres: [] }], mediumTerm: [], longTerm: [] },
      topTracks: { shortTerm: [], mediumTerm: [], longTerm: [] },
      allTime: { artists: [], tracks: [], albums: [] },
    };

    const candidates = spotifyCandidates(data, {
      trackShort: false, trackMedium: false, trackLong: false, trackAllTime: false,
      artistShort: true, artistMedium: false, artistLong: false, artistAllTime: false,
      albumAllTime: false,
    });

    expect(candidates.find((candidate) => candidate.id === 'spotify:new-artist:short:artist-id')).toMatchObject({
      kicker: 'New #1 artist · this month',
      detail: '',
      render: { type: 'spotify-artist', artistId: 'artist-id', timeframe: 'short' },
      shapes: ['secondary', 'tile'],
    });
  });

  it('gives true all-time track and artist changes a higher priority than annual changes', () => {
    const data: SpotifyData = {
      nowPlaying: null,
      recentlyPlayed: [],
      topArtists: { shortTerm: [], mediumTerm: [], longTerm: [] },
      topTracks: { shortTerm: [], mediumTerm: [], longTerm: [] },
      allTime: {
        artists: [{ id: 'artist-id', name: 'All Time Artist', genres: [], playCount: 20 }],
        tracks: [{ id: 'track-id', track: 'All Time Track', artist: 'All Time Artist', playCount: 20 }],
        albums: [],
      },
    };

    const candidates = spotifyCandidates(data, {
      trackShort: false, trackMedium: false, trackLong: false, trackAllTime: true,
      artistShort: false, artistMedium: false, artistLong: false, artistAllTime: true,
      albumAllTime: false,
    });

    expect(candidates.find((candidate) => candidate.id === 'spotify:new-track:allTime:track-id')).toMatchObject({
      kicker: 'New top track of all time',
      score: 90,
    });
    expect(candidates.find((candidate) => candidate.id === 'spotify:new-artist:allTime:artist-id')).toMatchObject({
      kicker: 'New #1 artist · of all time',
      score: 90,
    });
  });
});

describe('steamCandidates', () => {
  const ACHIEVEMENT_FRESH_MS = 7 * 24 * 60 * 60_000;

  const baseline: SteamData = {
    profile: { steamId: '76561198000000000', personaName: 'Alex', profileUrl: 'https://steamcommunity.com/id/alex' },
    currentGame: null,
    library: null,
    recentlyPlayed: [],
    achievements: null,
    friendsInGame: [],
    availability: { library: 'unavailable', achievements: 'unavailable', friends: 'unavailable' },
  };

  it('returns nothing when there is no data', () => {
    expect(steamCandidates(undefined, ACHIEVEMENT_FRESH_MS)).toEqual([]);
  });

  it('prioritizes a fresh achievement unlock over everything else', () => {
    const data: SteamData = {
      ...baseline,
      currentGame: { appId: 10, name: 'Half-Life' },
      friendsInGame: [{ steamId: '2', personaName: 'Sam', gameName: 'Half-Life' }],
      achievements: {
        appId: 10, gameName: 'Half-Life', unlockedCount: 1, totalCount: 10,
        recentUnlocks: [{
          apiName: 'ACH_1', displayName: 'Freeman', unlockedAt: new Date(Date.now() - 60_000).toISOString(), globalUnlockedPercent: 2.4,
        }],
      },
    };

    expect(steamCandidates(data, ACHIEVEMENT_FRESH_MS)).toEqual([
      expect.objectContaining({
        id: 'steam:achievement:10:ACH_1', score: 80, kicker: 'Achievement unlocked', title: 'Freeman',
        detail: 'Half-Life · 2.4% of players', shapes: ['hero', 'secondary', 'tile'],
        render: { type: 'steam-achievement', appId: 10, apiName: 'ACH_1' },
      }),
    ]);
  });

  it('falls back to current game once the achievement unlock ages past the freshness threshold', () => {
    const data: SteamData = {
      ...baseline,
      currentGame: { appId: 10, name: 'Half-Life', playtimeForeverMinutes: 600 },
      achievements: {
        appId: 10, gameName: 'Half-Life', unlockedCount: 1, totalCount: 10,
        recentUnlocks: [{
          apiName: 'ACH_1', displayName: 'Freeman', unlockedAt: new Date(Date.now() - ACHIEVEMENT_FRESH_MS - 60_000).toISOString(),
        }],
      },
    };

    expect(steamCandidates(data, ACHIEVEMENT_FRESH_MS)).toEqual([
      expect.objectContaining({
        id: 'steam:now-playing:10', score: 58, kicker: 'Playing now', title: 'Half-Life', detail: '10h played',
        shapes: ['secondary', 'tile'], render: { type: 'steam-now-playing', appId: 10 },
      }),
    ]);
  });

  it('falls back to friends playing when nothing is currently running', () => {
    const data: SteamData = {
      ...baseline,
      friendsInGame: [
        { steamId: '2', personaName: 'Sam', gameName: 'Portal 2' },
        { steamId: '3', personaName: 'Jo', gameName: 'Portal 2' },
      ],
    };

    expect(steamCandidates(data, ACHIEVEMENT_FRESH_MS)).toEqual([
      expect.objectContaining({
        id: 'steam:friends', score: 25, kicker: 'Friends online', title: '2 friends playing', detail: 'Portal 2', shapes: ['tile'],
      }),
    ]);
  });

  it('falls back to recent playtime as the lowest-priority signal', () => {
    const data: SteamData = {
      ...baseline,
      library: { totalGames: 12, totalPlaytimeMinutes: 6_000, recentPlaytimeMinutes: 300, mostPlayed: [{ appId: 20, name: 'Portal' }], allGames: [{ appId: 20, name: 'Portal' }] },
    };

    expect(steamCandidates(data, ACHIEVEMENT_FRESH_MS)).toEqual([
      expect.objectContaining({
        id: 'steam:recent-playtime', score: 22, kicker: 'This week on Steam', title: '5.0h this week', detail: 'Portal', shapes: ['tile'],
      }),
    ]);
  });

  it('returns nothing when there is no current activity, no fresh achievement, no friends, and no recent playtime', () => {
    expect(steamCandidates(baseline, ACHIEVEMENT_FRESH_MS)).toEqual([]);
  });
});
