import { describe, expect, it } from 'vitest';
import {
  assertNoBridgeError,
  buildLightStateBody,
  denormalizeBrightness,
  normalizeBrightness,
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
