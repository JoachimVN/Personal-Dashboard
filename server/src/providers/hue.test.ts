import { describe, expect, it } from 'vitest';
import {
  assertNoBridgeError,
  buildLightStateBody,
  denormalizeBrightness,
  mapPalettes,
  mapRooms,
  mapScenes,
  normalizeBrightness,
  xyToHex,
} from './hue.js';

describe('normalizeBrightness', () => {
  it('maps Hue\'s 1-254 range onto 1-100', () => {
    expect(normalizeBrightness(1)).toBe(1);
    expect(normalizeBrightness(254)).toBe(100);
    expect(normalizeBrightness(127)).toBe(50);
  });

  it('defaults to full brightness when the bridge omits bri', () => {
    expect(normalizeBrightness(undefined)).toBe(100);
  });
});

describe('denormalizeBrightness', () => {
  it('maps 1-100 back onto Hue\'s 1-254 range and never emits 0', () => {
    expect(denormalizeBrightness(1)).toBe(3);
    expect(denormalizeBrightness(100)).toBe(254);
    expect(denormalizeBrightness(0)).toBe(1);
  });
});

describe('buildLightStateBody', () => {
  it('sends only on when toggling off, leaving brightness untouched', () => {
    expect(buildLightStateBody({ on: false, brightness: 40 })).toEqual({ on: false });
  });

  it('sends brightness when turning on with a level', () => {
    expect(buildLightStateBody({ on: true, brightness: 40 })).toEqual({ on: true, bri: 102 });
  });

  it('sends brightness alone when the light is already on', () => {
    expect(buildLightStateBody({ brightness: 40 })).toEqual({ bri: 102 });
  });
});

describe('mapRooms', () => {
  it('keeps only Room groups, sorted by name, defaulting any_on to false', () => {
    expect(
      mapRooms({
        '81': { name: 'Bedroom', type: 'Room', state: { any_on: true } },
        '83': { name: 'Bathroom', type: 'Room' },
        '200': { name: 'Music area', type: 'Entertainment', state: { any_on: true } },
      }),
    ).toEqual([
      { id: '83', name: 'Bathroom', anyOn: false },
      { id: '81', name: 'Bedroom', anyOn: true },
    ]);
  });
});

describe('mapScenes', () => {
  const groups = { '81': { name: 'Bedroom' }, '83': { name: 'Bathroom' } };

  it('keeps only non-recycled GroupScenes and resolves their room names', () => {
    expect(
      mapScenes(
        {
          a: { name: 'Blue', type: 'GroupScene', group: '81', recycle: false },
          b: { name: 'Internal', type: 'GroupScene', group: '81', recycle: true },
          c: { name: 'Legacy', type: 'LightScene' },
        },
        groups,
      ),
    ).toEqual([{ id: 'a', name: 'Blue', room: 'Bedroom', colors: [] }]);
  });

  it('sorts by room then name, and nulls the room of scenes whose group is gone', () => {
    expect(
      mapScenes(
        {
          a: { name: 'White', type: 'GroupScene', group: '81' },
          b: { name: 'Pines', type: 'GroupScene', group: '83' },
          c: { name: 'Blue', type: 'GroupScene', group: '81' },
          d: { name: 'Orphan', type: 'GroupScene', group: '99' },
        },
        groups,
      ),
    ).toEqual([
      { id: 'd', name: 'Orphan', room: null, colors: [] },
      { id: 'b', name: 'Pines', room: 'Bathroom', colors: [] },
      { id: 'c', name: 'Blue', room: 'Bedroom', colors: [] },
      { id: 'a', name: 'White', room: 'Bedroom', colors: [] },
    ]);
  });

  it('attaches palette swatches by scene id', () => {
    expect(
      mapScenes(
        { a: { name: 'Blue', type: 'GroupScene', group: '81' } },
        groups,
        { a: ['#0000ff'] },
      ),
    ).toEqual([{ id: 'a', name: 'Blue', room: 'Bedroom', colors: ['#0000ff'] }]);
  });
});

describe('xyToHex', () => {
  it('maps Hue red primary to a red-dominant color', () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(xyToHex(0.675, 0.322).slice(i, i + 2), 16));
    expect(r).toBe(255);
    expect(g).toBeLessThan(80);
    expect(b).toBeLessThan(80);
  });

  it('maps D65-ish white to a near-neutral color', () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(xyToHex(0.3161, 0.3271).slice(i, i + 2), 16));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(60);
  });
});

describe('mapPalettes', () => {
  it('keys swatches by v1 scene id, combining xy and color-temperature entries', () => {
    const palettes = mapPalettes({
      data: [
        {
          id_v1: '/scenes/abc',
          palette: {
            color: [{ color: { xy: { x: 0.675, y: 0.322 } } }],
            color_temperature: [{ color_temperature: { mirek: 365 } }],
          },
        },
        { id_v1: '/scenes/empty', palette: { color: [], color_temperature: [] } },
        { palette: { color: [{ color: { xy: { x: 0.3, y: 0.3 } } }] } },
      ],
    });
    expect(Object.keys(palettes)).toEqual(['abc']);
    expect(palettes.abc).toHaveLength(2);
    expect(palettes.abc[0]).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('assertNoBridgeError', () => {
  it('does nothing for a plain object response (e.g. GET /lights success)', () => {
    expect(() => assertNoBridgeError({ '1': { name: 'Lamp' } })).not.toThrow();
  });

  it('does nothing for an all-success result array', () => {
    expect(() => assertNoBridgeError([{ success: { '/lights/1/state/on': true } }])).not.toThrow();
  });

  it('throws when the bridge reports an error, even though the request itself returned 200', () => {
    expect(() =>
      assertNoBridgeError([
        { error: { type: 1, address: '/lights/1/state', description: 'unauthorized user' } },
      ]),
    ).toThrow('unauthorized user');
  });
});
