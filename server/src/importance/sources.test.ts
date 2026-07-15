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
      kicker: 'New top artist of all time',
      score: 90,
    });
  });
});
