import { describe, expect, it } from 'vitest';
import { extractPalette, FALLBACK_PALETTE } from './albumPalette.js';

type Rgb = [number, number, number];

/** A 64x64 RGBA image made of horizontal bands, each covering `share` of the rows. */
function bands(...parts: { rgb: Rgb; share: number }[]): Uint8Array {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  let row = 0;
  for (const part of parts) {
    const rows = Math.round(part.share * size);
    for (let y = row; y < Math.min(size, row + rows); y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        data.set([...part.rgb, 255], i);
      }
    }
    row += rows;
  }
  return data;
}

function hueOf(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

describe('extractPalette', () => {
  it('finds both colors of a two-color cover', () => {
    const palette = extractPalette(bands({ rgb: [200, 30, 40], share: 0.5 }, { rgb: [30, 60, 200], share: 0.5 }), 64, 64);
    const hues = palette.map((color) => hueOf(color.hex));
    expect(palette).toHaveLength(2);
    expect(hues.some((h) => h < 15 || h > 345)).toBe(true); // red
    expect(hues.some((h) => h > 200 && h < 250)).toBe(true); // blue
  });

  it('falls back to warm whites for a black-and-white cover', () => {
    const palette = extractPalette(
      bands({ rgb: [10, 10, 10], share: 0.5 }, { rgb: [128, 128, 128], share: 0.25 }, { rgb: [240, 240, 240], share: 0.25 }),
      64,
      64,
    );
    expect(palette).toBe(FALLBACK_PALETTE);
  });

  it('ignores a black background and keeps a small vivid element', () => {
    const palette = extractPalette(bands({ rgb: [5, 5, 8], share: 0.9 }, { rgb: [180, 20, 150], share: 0.1 }), 64, 64);
    const hue = hueOf(palette[0].hex);
    expect(hue).toBeGreaterThan(290);
    expect(hue).toBeLessThan(330); // magenta
  });

  it('gives a single-color cover a related second color so lights never match', () => {
    const palette = extractPalette(bands({ rgb: [240, 110, 20], share: 1 }), 64, 64);
    expect(palette).toHaveLength(2);
    expect(palette[0].hex).not.toBe(palette[1].hex);
    expect(Math.abs(hueOf(palette[0].hex) - hueOf(palette[1].hex))).toBeLessThan(40);
  });

  it('saturates a muted color so it reads as a color on a lamp', () => {
    const [color] = extractPalette(bands({ rgb: [150, 125, 160], share: 1 }), 64, 64); // dusty lilac
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.hex.slice(i, i + 2), 16));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(60);
  });

  it('emits chromaticities inside the visible range', () => {
    for (const color of extractPalette(bands({ rgb: [20, 200, 60], share: 0.5 }, { rgb: [250, 220, 0], share: 0.5 }), 64, 64)) {
      const [x, y] = color.xy;
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(0);
      expect(x + y).toBeLessThanOrEqual(1);
    }
  });

  it('keeps a gradient whose slices are each too small to count on their own', () => {
    // A gold helmet on black: three gold shades of 50 px (1.2%) each, 3.7% together.
    const image = bands({ rgb: [8, 8, 8], share: 1 });
    [[250, 205, 90], [215, 165, 50], [170, 120, 30]].forEach((rgb, shade) => {
      for (let p = 0; p < 50; p++) image.set([...rgb, 255], (shade * 50 + p) * 4);
    });
    const palette = extractPalette(image, 64, 64);
    expect(palette).not.toBe(FALLBACK_PALETTE);
    const hue = hueOf(palette[0].hex);
    expect(hue).toBeGreaterThan(30);
    expect(hue).toBeLessThan(60); // gold
  });

  it('keeps a small vivid accent next to a large backdrop', () => {
    // Red tights on a big blue backdrop.
    const palette = extractPalette(bands({ rgb: [50, 60, 190], share: 0.94 }, { rgb: [210, 20, 30], share: 0.06 }), 64, 64);
    const hues = palette.map((color) => hueOf(color.hex));
    expect(hues.some((h) => h < 15 || h > 345)).toBe(true);
  });

  it('includes a white when the cover is mostly white', () => {
    const palette = extractPalette(bands({ rgb: [245, 243, 238], share: 0.8 }, { rgb: [200, 130, 90], share: 0.2 }), 64, 64);
    expect(palette.at(-1)!.hex.startsWith('#ff')).toBe(true);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(palette.at(-1)!.hex.slice(i, i + 2), 16));
    expect(Math.min(r, g, b)).toBeGreaterThan(150); // a white, not a color
  });

  it('is deterministic for the same cover', () => {
    const image = bands({ rgb: [30, 160, 200], share: 0.6 }, { rgb: [240, 200, 60], share: 0.4 });
    expect(extractPalette(image, 64, 64)).toEqual(extractPalette(image, 64, 64));
  });
});
