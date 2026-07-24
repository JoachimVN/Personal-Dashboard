import { useEffect, useState } from 'react';

type RobloxArtColor = readonly [number, number, number];
type RobloxArtPalette = readonly [RobloxArtColor, RobloxArtColor];

const robloxArtPaletteCache = new Map<string, RobloxArtPalette | null>();

function colorDistance(left: RobloxArtColor, right: RobloxArtColor): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function saturation(color: RobloxArtColor): number {
  const highest = Math.max(...color);
  const lowest = Math.min(...color);
  return highest === 0 ? 0 : (highest - lowest) / highest;
}

/** Keep artwork hues recognisable, but prevent naturally dark game icons from making the card muddy. */
function liftBackgroundColor(color: RobloxArtColor): RobloxArtColor {
  const lightness = (Math.max(...color) + Math.min(...color)) / 2;
  const minimumLightness = 76;
  if (lightness >= minimumLightness) return color;
  const amount = (minimumLightness - lightness) / (255 - lightness);
  return [
    Math.round(color[0] + (255 - color[0]) * amount),
    Math.round(color[1] + (255 - color[1]) * amount),
    Math.round(color[2] + (255 - color[2]) * amount),
  ];
}

function paletteFromIcon(icon: HTMLImageElement): RobloxArtPalette | null {
  const canvas = document.createElement('canvas');
  canvas.width = 40;
  canvas.height = 40;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(icon, 0, 0, canvas.width, canvas.height);
  const colors = new Map<string, { color: RobloxArtColor; count: number }>();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 200) continue;
    const color: RobloxArtColor = [pixels[index] & 0xf8, pixels[index + 1] & 0xf8, pixels[index + 2] & 0xf8];
    const lightness = (Math.max(...color) + Math.min(...color)) / 2;
    if (lightness < 12 || lightness > 238 || saturation(color) < 0.18) continue;
    const key = color.join(',');
    const existing = colors.get(key);
    if (existing) existing.count += 1;
    else colors.set(key, { color, count: 1 });
  }

  const candidates = [...colors.values()]
    .sort((left, right) => right.count * (0.65 + saturation(right.color)) - left.count * (0.65 + saturation(left.color)));
  const primary = candidates[0]?.color;
  if (!primary) return null;
  const secondary = candidates.find(({ color }) => colorDistance(primary, color) > 72)?.color;
  return secondary ? [liftBackgroundColor(primary), liftBackgroundColor(secondary)] : null;
}

export function useRobloxArtPalette(iconUrl: string | undefined): RobloxArtPalette | null {
  const [palette, setPalette] = useState<RobloxArtPalette | null>(() => iconUrl ? robloxArtPaletteCache.get(iconUrl) ?? null : null);

  useEffect(() => {
    if (!iconUrl) {
      setPalette(null);
      return;
    }
    const cachedPalette = robloxArtPaletteCache.get(iconUrl);
    if (cachedPalette !== undefined) {
      setPalette(cachedPalette);
      return;
    }

    let disposed = false;
    const icon = new Image();
    icon.crossOrigin = 'anonymous';
    icon.onload = () => {
      let nextPalette: RobloxArtPalette | null = null;
      try {
        nextPalette = paletteFromIcon(icon);
      } catch {
        // Some image hosts do not allow canvas sampling. Keep the Roblox fallback in that case.
      }
      robloxArtPaletteCache.set(iconUrl, nextPalette);
      if (!disposed) setPalette(nextPalette);
    };
    icon.onerror = () => {
      robloxArtPaletteCache.set(iconUrl, null);
      if (!disposed) setPalette(null);
    };
    icon.src = iconUrl;
    return () => { disposed = true; };
  }, [iconUrl]);

  return palette;
}
