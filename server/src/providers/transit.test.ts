import { describe, expect, it } from 'vitest';
import { mapDepartures, selectNearestStops } from './transit.js';

function feature(id: string, name: string, distance?: number) {
  return { properties: { id, name, distance } };
}

describe('selectNearestStops', () => {
  it('keeps only the closest platform when a stop name repeats, in km-to-m', () => {
    const stops = selectNearestStops(
      [
        feature('NSR:StopPlace:41613', 'Prinsens gate', 0.165),
        feature('NSR:StopPlace:41614', 'Prinsens gate', 0.201),
        feature('NSR:StopPlace:43501', 'Dronningens gate', 0.194),
      ],
      3,
    );
    expect(stops).toEqual([
      { id: 'NSR:StopPlace:41613', distanceMeters: 165 },
      { id: 'NSR:StopPlace:43501', distanceMeters: 194 },
    ]);
  });

  it('stops at maxStops and skips non-StopPlace venues', () => {
    const stops = selectNearestStops(
      [
        feature('OSM:TopographicPlace:1', 'Torvet', 0.1),
        feature('NSR:StopPlace:1', 'A', 0.2),
        feature('NSR:StopPlace:2', 'B', 0.3),
        feature('NSR:StopPlace:3', 'C', 0.4),
      ],
      2,
    );
    expect(stops.map((stop) => stop.id)).toEqual(['NSR:StopPlace:1', 'NSR:StopPlace:2']);
  });
});

describe('mapDepartures', () => {
  const call = (overrides: Partial<Parameters<typeof mapDepartures>[0][number]> = {}) => ({
    realtime: true,
    cancellation: false,
    aimedDepartureTime: '2026-07-18T22:54:00+02:00',
    expectedDepartureTime: '2026-07-18T22:56:14+02:00',
    destinationDisplay: { frontText: 'Strindheim via Lade' },
    serviceJourney: { line: { publicCode: '2', transportMode: 'bus', presentation: { colour: null } } },
    ...overrides,
  });

  it('maps a realtime call and drops cancelled ones', () => {
    const departures = mapDepartures([call(), call({ cancellation: true })]);
    expect(departures).toEqual([{
      line: '2',
      destination: 'Strindheim via Lade',
      mode: 'bus',
      aimedTime: '2026-07-18T22:54:00+02:00',
      expectedTime: '2026-07-18T22:56:14+02:00',
      realtime: true,
      color: undefined,
    }]);
  });

  it('normalizes a published line colour to a #-prefixed hex', () => {
    const [departure] = mapDepartures([
      call({ serviceJourney: { line: { publicCode: '1', transportMode: 'tram', presentation: { colour: 'E32D22' } } } }),
    ]);
    expect(departure.color).toBe('#E32D22');
  });

  it('falls back when the line has no public code or destination', () => {
    const [departure] = mapDepartures([
      call({
        destinationDisplay: null,
        serviceJourney: { line: { publicCode: null, transportMode: null, presentation: null } },
      }),
    ]);
    expect(departure).toMatchObject({ line: '•', destination: 'Unknown destination', mode: 'bus' });
  });
});
