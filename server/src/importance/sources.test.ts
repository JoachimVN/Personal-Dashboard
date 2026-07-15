import { describe, expect, it } from 'vitest';
import type { SpotifyData } from '@personal-dashboard/shared';
import { spotifyCandidates } from './sources.js';

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
      artistShort: false, artistMedium: false, artistLong: false,
      album: true,
    });

    expect(candidates.find((candidate) => candidate.id === 'spotify:new-album:album-id')?.detail)
      .toBe('Primary Artist');
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
      artistShort: false, artistMedium: false, artistLong: false,
      album: false,
    });

    expect(candidates.find((candidate) => candidate.id === 'spotify:new-track:long:Baptized In Fear')?.kicker)
      .toBe('New top track this past year');
  });
});
