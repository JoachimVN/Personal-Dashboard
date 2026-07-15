import { describe, expect, it } from 'vitest';
import type { GitHubData, HealthData, NewsData, SpotifyData, WeatherData } from '@personal-dashboard/shared';
import { githubCandidates, gmailCandidates, healthCandidates, newsCandidates, spotifyCandidates, weatherCandidates } from './sources.js';

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

    expect(candidate?.shapes).toEqual(['tile']);
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
      detail: 'Took the #1 spot in your recent listening',
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
