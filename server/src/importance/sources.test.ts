import { describe, expect, it } from 'vitest';
import type { AiNewsData, AiUsageToolData, GitHubData, HealthData, NewsData, PowerData, SpotifyData, SteamData, TransitData, WeatherData } from '@personal-dashboard/shared';
import { aiCandidates, aiNewsCandidates, githubCandidates, gmailCandidates, healthCandidates, newsCandidates, powerCandidates, spotifyCandidates, steamCandidates, transitCandidates, weatherCandidates } from './sources.js';

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
    const [candidate] = weatherCandidates(weather, 25, -10, 12, 8, new Date('2026-07-16T01:00:00').getTime());

    expect(candidate).toMatchObject({ id: 'weather:later-today:2026-07-16', kicker: 'Later today', title: '10° to 18°' });
  });

  it('surfaces a hero-eligible severe candidate when thunder is in the next 3 hours', () => {
    const now = new Date('2026-07-16T12:00:00Z').getTime();
    const data: WeatherData = {
      ...weather,
      hours: [{ time: '2026-07-16T13:00:00Z', hourLabel: '13', temperature: 16, precipitationMm: 3, symbol: 'thunder' }],
    };

    const candidates = weatherCandidates(data, 25, -10, 12, 8, now);

    expect(candidates).toContainEqual(expect.objectContaining({ id: 'weather:severe', shapes: ['hero', 'secondary', 'tile'] }));
  });

  it('does not surface rain-soon when it is already wet right now', () => {
    const data: WeatherData = {
      ...weather,
      current: { ...weather.current, precipitationMm: 2 },
      hours: [{ time: '2026-07-16T13:00:00Z', hourLabel: '13', temperature: 16, precipitationMm: 2, symbol: 'rain' }],
    };

    expect(weatherCandidates(data, 25, -10, 12, 8).map((c) => c.id)).not.toContain('weather:rain-soon');
  });

  it('surfaces rain-soon when currently dry but rain is expected within 6 hours', () => {
    const data: WeatherData = {
      ...weather,
      hours: [{ time: '2026-07-16T13:00:00Z', hourLabel: '13', temperature: 16, precipitationMm: 0.5, symbol: 'rain' }],
    };

    expect(weatherCandidates(data, 25, -10, 12, 8)).toContainEqual(expect.objectContaining({ id: 'weather:rain-soon', title: 'Rain by 13:00' }));
  });

  it('surfaces a windy-today candidate once the peak crosses the configured threshold', () => {
    const data: WeatherData = { ...weather, days: [{ ...weather.days[0]!, maxWindSpeed: 14 }, weather.days[1]!] };

    expect(weatherCandidates(data, 25, -10, 12, 8)).toContainEqual(expect.objectContaining({ id: 'weather:wind', title: '14 m/s peak' }));
  });

  it('surfaces a high-UV candidate once the peak crosses the configured threshold', () => {
    const data: WeatherData = { ...weather, days: [{ ...weather.days[0]!, maxUvIndex: 9 }, weather.days[1]!] };

    expect(weatherCandidates(data, 25, -10, 12, 8)).toContainEqual(expect.objectContaining({ id: 'weather:uv', title: 'UV 9.0 today' }));
  });

  it('surfaces a full-moon candidate when the phase is within tolerance of 180°', () => {
    const data: WeatherData = { ...weather, moon: { phaseDeg: 178, moonrise: null, moonset: null } };

    expect(weatherCandidates(data, 25, -10, 12, 8)).toContainEqual(expect.objectContaining({ id: 'weather:moon', title: 'Full moon tonight' }));
  });

  it('surfaces a sunset-soon candidate within 45 minutes of sunset', () => {
    const now = new Date('2026-07-16T20:00:00Z').getTime();
    const data: WeatherData = { ...weather, sun: { sunrise: null, sunset: '2026-07-16T20:30:00Z' } };

    expect(weatherCandidates(data, 25, -10, 12, 8, now)).toContainEqual(expect.objectContaining({ id: 'weather:sunset', detail: 'Sets in 30 min' }));
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

describe('aiNewsCandidates', () => {
  it('surfaces the latest AI headline under its own source, distinct from general news', () => {
    const data: AiNewsData = { items: [{ title: 'New model released', source: 'OpenAI', url: 'https://example.com/ai-news', publishedAt: '2026-07-16T00:00:00Z', provider: 'openai' }] };

    expect(aiNewsCandidates(data)).toContainEqual(expect.objectContaining({
      source: 'ai-news', kicker: 'OpenAI', title: 'New model released', shapes: ['tile'], href: '#/ai',
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

  it('does not flag heavy usage from a few hours of same-day samples right after a window reset', () => {
    // All samples land on the same UTC day as "now" and are excluded as the partial, still-forming
    // bucket — mirroring githubCandidates' own trailing window — so there's no prior-day baseline yet.
    const data: AiUsageToolData = {
      available: true,
      fiveHour: { usedPercent: 70, resetsAt: '2026-07-20T18:00:00.000Z' },
      history: [
        { at: '2026-07-20T10:00:00.000Z', fiveHourUsedPercent: 0 },
        { at: '2026-07-20T10:15:00.000Z', fiveHourUsedPercent: 1 },
        { at: '2026-07-20T10:30:00.000Z', fiveHourUsedPercent: 2 },
        { at: '2026-07-20T13:00:00.000Z', fiveHourUsedPercent: 70 },
      ],
    };

    const anomaly = aiCandidates([{ id: 'claude', label: 'Claude', data }], 14, 50)
      .find((candidate) => candidate.id === 'ai-usage:anomaly:claude');

    expect(anomaly).toBeUndefined();
  });

  it('flags heavy usage against a trailing daily-average baseline, not a raw sample-count slice', () => {
    const priorDay = (date: string, percent: number): AiUsageToolData['history'][number] => (
      { at: `${date}T12:00:00.000Z`, fiveHourUsedPercent: percent }
    );
    const data: AiUsageToolData = {
      available: true,
      fiveHour: { usedPercent: 90, resetsAt: '2026-07-20T18:00:00.000Z' },
      history: [
        priorDay('2026-07-15', 10),
        priorDay('2026-07-16', 12),
        priorDay('2026-07-17', 8),
        priorDay('2026-07-18', 11),
        { at: '2026-07-20T09:00:00.000Z', fiveHourUsedPercent: 90 },
      ],
    };

    const anomaly = aiCandidates([{ id: 'claude', label: 'Claude', data }], 14, 50)
      .find((candidate) => candidate.id === 'ai-usage:anomaly:claude');

    expect(anomaly).toMatchObject({ kicker: 'Heavy usage', title: 'Claude running well above usual' });
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
    playtimeHistory: [],
    friendsLeaderboard: { status: 'unavailable', entries: [] },
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
        id: 'steam:achievement:10:ACH_1', score: 85, kicker: 'Rare achievement unlocked', title: 'Freeman',
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

  it('boosts a rare fresh unlock above a routine one', () => {
    const data: SteamData = {
      ...baseline,
      achievements: {
        appId: 10, gameName: 'Half-Life', unlockedCount: 1, totalCount: 10,
        recentUnlocks: [{
          apiName: 'ACH_1', displayName: 'Freeman', unlockedAt: new Date(Date.now() - 60_000).toISOString(), globalUnlockedPercent: 3.2,
        }],
      },
    };

    expect(steamCandidates(data, ACHIEVEMENT_FRESH_MS, { completedGame: false }, 10)).toEqual([
      expect.objectContaining({ id: 'steam:achievement:10:ACH_1', score: 85, kicker: 'Rare achievement unlocked' }),
    ]);
  });

  it('surfaces a fresh game completion over an achievement unlock', () => {
    const data: SteamData = {
      ...baseline,
      achievements: {
        appId: 10, gameName: 'Half-Life', unlockedCount: 10, totalCount: 10,
        recentUnlocks: [{ apiName: 'ACH_LAST', displayName: 'Finale', unlockedAt: new Date(Date.now() - 60_000).toISOString() }],
      },
    };

    expect(steamCandidates(data, ACHIEVEMENT_FRESH_MS, { completedGame: true })).toEqual([
      expect.objectContaining({
        id: 'steam:completed:10', score: 92, kicker: 'Game completed', title: 'Half-Life',
        detail: 'All 10 achievements unlocked', shapes: ['hero', 'secondary', 'tile'],
      }),
    ]);
  });

  it('surfaces a fresh playtime milestone for the tracked game', () => {
    const data: SteamData = { ...baseline, currentGame: { appId: 10, name: 'Half-Life', playtimeForeverMinutes: 3_000 } };

    expect(steamCandidates(data, ACHIEVEMENT_FRESH_MS, { completedGame: false, playtimeMilestoneHours: 50 })).toEqual([
      expect.objectContaining({
        id: 'steam:playtime-milestone:10:50', score: 65, kicker: 'Playtime milestone', title: '50h in Half-Life', shapes: ['secondary', 'tile'],
      }),
    ]);
  });

  it('surfaces a friends-leaderboard climb below now-playing but above friends online', () => {
    const data: SteamData = { ...baseline, friendsInGame: [{ steamId: '2', personaName: 'Sam', gameName: 'Portal 2' }] };

    expect(steamCandidates(data, ACHIEVEMENT_FRESH_MS, { completedGame: false, leaderboardClimb: { rank: 1, delta: 2 } })).toEqual([
      expect.objectContaining({
        id: 'steam:leaderboard-climb:1', score: 45, kicker: 'Friends leaderboard', title: 'Up to #2', detail: 'Climbed 2 spots', shapes: ['tile'],
      }),
    ]);
  });
});

describe('transitCandidates', () => {
  const now = Date.parse('2026-07-18T12:00:00+02:00');
  const departure = (expectedTime: string, overrides: Partial<TransitData['stops'][number]['departures'][number]> = {}) => ({
    line: '2', destination: 'Strindheim via Lade', mode: 'bus',
    aimedTime: expectedTime, expectedTime, realtime: true, ...overrides,
  });

  it('surfaces the first departure inside the walkable window as a tile', () => {
    const data: TransitData = {
      stops: [{
        id: 'NSR:StopPlace:41613', name: 'Prinsens gate', distanceMeters: 165,
        departures: [
          departure('2026-07-18T12:01:00+02:00'), // too soon to catch
          departure('2026-07-18T12:07:00+02:00'),
        ],
      }],
    };

    expect(transitCandidates(data, now)).toEqual([expect.objectContaining({
      kicker: 'Next bus', title: '2 · 7 min', detail: 'Strindheim via Lade · from Prinsens gate', shapes: ['tile'],
    })]);
  });

  it('stays quiet when every departure is outside the window', () => {
    const data: TransitData = {
      stops: [{
        id: 'NSR:StopPlace:41613', name: 'Prinsens gate',
        departures: [departure('2026-07-18T13:30:00+02:00')],
      }],
    };

    expect(transitCandidates(data, now)).toEqual([]);
  });
});

describe('powerCandidates', () => {
  const now = Date.parse('2026-07-18T18:30:00+02:00');
  const hour = (isoHour: string, price: number): PowerData['today'][number] => ({
    time: `2026-07-18T${isoHour}:00:00+02:00`, hourLabel: isoHour, priceNokPerKwh: price,
  });
  const flatDay = (price: number): PowerData => ({
    area: 'NO3',
    today: Array.from({ length: 24 }, (_, index) => hour(String(index).padStart(2, '0'), price)),
    tomorrow: [],
  });

  it('emits only the ambient tile on an ordinary flat day', () => {
    const candidates = powerCandidates(flatDay(0.85), 1.5, 1, now);

    expect(candidates).toEqual([expect.objectContaining({
      id: expect.stringContaining('power:now'), kicker: 'Power · NO3', title: '0.85 kr/kWh', shapes: ['tile'],
    })]);
  });

  it('flags a spike above the ratio and the floor, pointing at the cheapest upcoming hour', () => {
    const data = flatDay(0.8);
    data.today[18] = hour('18', 2.4);
    data.today[23] = hour('23', 0.4);
    const spike = powerCandidates(data, 1.5, 1, now).find((candidate) => candidate.id.startsWith('power:spike'));

    expect(spike).toMatchObject({
      title: '2.40 kr/kWh right now',
      detail: expect.stringContaining('down to 0.40 kr at 23:00'),
      shapes: ['secondary', 'tile'],
    });
  });

  it('stays quiet on cheap days below the NOK floor — no spike, no cheap-ahead nudge', () => {
    const data = flatDay(0.1);
    data.today[18] = hour('18', 0.4);

    expect(powerCandidates(data, 1.5, 1, now).map((candidate) => candidate.id))
      .toEqual([expect.stringContaining('power:now')]);
  });

  it('points at a much cheaper upcoming hour', () => {
    const data = flatDay(1.2);
    data.today[22] = hour('22', 0.5);
    const cheap = powerCandidates(data, 1.5, 1, now).find((candidate) => candidate.id.startsWith('power:cheap-ahead'));

    expect(cheap).toMatchObject({ title: '0.50 kr at 22:00', shapes: ['tile'] });
  });

  it('celebrates a negative price', () => {
    const data = flatDay(0.5);
    data.today[18] = hour('18', -0.12);

    expect(powerCandidates(data, 1.5, 1, now)[0]).toMatchObject({
      kicker: 'Negative power price', title: 'You get paid to use power',
    });
  });
});
