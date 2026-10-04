import { describe, expect, it } from 'vitest';
import type { LampColor } from '../albumPalette.js';
import type { HueLightSnapshot } from './hue.js';
import { assignColors, colorBody, mirekForXy, nextPollDelay, restoreBody } from './hueSync.js';

const color = (hex: string, xy: [number, number] = [0.3, 0.3]): LampColor => ({ hex, xy, weight: 1 });
const [A, B, C, D] = ['#a', '#b', '#c', '#d'].map((hex) => color(hex));

const light = (overrides: Partial<HueLightSnapshot> = {}): HueLightSnapshot => ({
  id: '1',
  on: true,
  color: true,
  ctRange: [153, 500],
  ...overrides,
});

const playing = (remainingMs: number) => ({
  track: { id: 't', name: 'Song', artist: 'Artist' },
  isPlaying: true,
  remainingMs,
});

describe('assignColors', () => {
  it('never gives two lights in a room the same color when the palette allows it', () => {
    for (let step = 0; step < 8; step++) {
      const [left, right] = assignColors([A, B, C, D], 2, step);
      expect(left).not.toBe(right);
    }
  });

  it('spreads two lights across a four-color palette and moves each one step along', () => {
    expect(assignColors([A, B, C, D], 2, 0)).toEqual([A, C]);
    expect(assignColors([A, B, C, D], 2, 1)).toEqual([B, D]);
  });

  it('swaps a two-color palette between two lights on every step', () => {
    expect(assignColors([A, B], 2, 0)).toEqual([A, B]);
    expect(assignColors([A, B], 2, 1)).toEqual([B, A]);
  });

  it('opens a track on its strongest color', () => {
    expect(assignColors([A, B, C], 1, 0)).toEqual([A]);
  });
});

describe('colorBody', () => {
  it('sends xy with the transition in deciseconds to a color light', () => {
    expect(colorBody(light(), color('#f00', [0.6, 0.3]), 8_000)).toEqual({ xy: [0.6, 0.3], transitiontime: 80 });
  });

  it('falls back to color temperature for a white-ambiance light', () => {
    const body = colorBody(light({ color: false }), color('#fb6', [0.46, 0.41]), 400);
    expect(body?.ct).toBeGreaterThan(300); // warm
    expect(body?.transitiontime).toBe(4);
  });

  it('leaves dimmable-only lights alone', () => {
    expect(colorBody(light({ color: false, ctRange: undefined }), A, 400)).toBeUndefined();
  });
});

describe('mirekForXy', () => {
  it('maps the D65 white point to about 6500 K', () => {
    expect(mirekForXy([0.3127, 0.329], [153, 500])).toBeCloseTo(154, -1);
  });

  it('clamps to the light\'s range', () => {
    expect(mirekForXy([0.6, 0.38], [153, 454])).toBeLessThanOrEqual(454);
  });
});

describe('restoreBody', () => {
  it('restores brightness and the color mode the light was in', () => {
    expect(restoreBody(light({ bri: 120, colormode: 'ct', ct: 366, xy: [0.4, 0.4] }))).toEqual({
      bri: 120,
      ct: 366,
      transitiontime: 10,
    });
  });

  it('switches a light back off if the sync turned it on', () => {
    expect(restoreBody(light({ on: false, bri: 120 }))).toEqual({ on: false, transitiontime: 10 });
  });
});

describe('nextPollDelay', () => {
  it('polls on the regular cadence mid-track', () => {
    expect(nextPollDelay(playing(120_000), 0, 2_500)).toBe(2_500);
  });

  it('polls just after the predicted end when that comes sooner', () => {
    expect(nextPollDelay(playing(1_000), 0, 2_500)).toBe(1_400);
  });

  it('never polls faster than the floor', () => {
    expect(nextPollDelay(playing(0), 0, 2_500)).toBe(700);
  });

  it('backs off the longer nothing is playing', () => {
    expect(nextPollDelay(null, 60_000, 2_500)).toBe(2_500);
    expect(nextPollDelay(null, 10 * 60_000, 2_500)).toBe(15_000);
    expect(nextPollDelay(null, 2 * 60 * 60_000, 2_500)).toBe(60_000);
  });
});
