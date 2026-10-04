import jpeg from 'jpeg-js';

/**
 * Album-cover palette extraction for the Hue music sync.
 *
 * A lamp is not a screen: it shows chromaticity (Hue's `xy`) at whatever brightness the light is
 * set to, so a cover's lightness is mostly irrelevant and its *hue and saturation* are everything.
 * That drives every choice below — clustering happens in OKLab (perceptual, so "different" means
 * visibly different), near-black and grey clusters are demoted because a lamp can only render them
 * as dim or dingy white, and the chosen colors are re-saturated before they reach the bulbs, since
 * a faithful-but-muted cover color reads as "slightly off white" on a light.
 */

export interface LampColor {
  /** CIE 1931 chromaticity for Hue's v1 `xy` state. */
  xy: [number, number];
  /** What the lamp shows, as a display swatch for the dashboard. */
  hex: string;
  /** Share of the cover this color came from (0-1); synthesized colors inherit their source's. */
  weight: number;
}

interface Lab {
  L: number;
  a: number;
  b: number;
}

const MAX_SAMPLES = 6_400;
const CLUSTERS = 8;
const KMEANS_ITERATIONS = 12;
const MAX_COLORS = 4;
/** Clusters darker than this are background/shadow — a lamp can't show black. */
const MIN_LIGHTNESS = 0.16;
/** OKLab chroma below this is grey: no hue worth putting on a lamp. */
const MIN_CHROMA = 0.035;
/** Clusters whose hues are closer than this look like one color on a lamp and are merged. */
const MERGE_HUE_DEGREES = 20;
/** Tiny clusters are specks and JPEG noise, not the cover's color. */
const MIN_SHARE = 0.015;
/** A lead color scoring below this means a practically monochrome cover (a faint sepia or
 * film-grain tint); boosting it would invent a color, so those get the warm-white fallback. */
const MIN_LEAD_SCORE = 0.01;
/** Secondary colors must score at least this fraction of the lead color's score... */
const MIN_RELATIVE_SCORE = 0.3;
/** ...unless they're this saturated: a small vivid accent (red tights on a big blue backdrop) is
 * the cover's second color even though a large backdrop outscores it many times over. */
const VIVID_CHROMA = 0.09;
/** Only clusters within this saturation ratio of each other merge, so a vivid element isn't
 * averaged into a large dull area of the same hue (red lips into skin, a green title into olive). */
const MERGE_CHROMA_RATIO = 1.5;
/** Bright white/cream covering at least this much of a cover makes white one of its lamp colors. */
const WHITE_SHARE = 0.35;
/** Two lamp colors closer than this (OKLab a/b distance, after boosting) look the same on a bulb. */
const MIN_LAMP_DISTANCE = 0.09;

// Whites as blackbody chromaticities (2700 K / 3200 K / 4000 K / 5500 K). Monochrome covers get
// the warm pair; white-dominated covers get whichever matches the tint of their whites.
const WARM_WHITE: LampColor = { xy: [0.4599, 0.4106], hex: '#ffb46b', weight: 1 };
const CREAM_WHITE: LampColor = { xy: [0.4234, 0.3990], hex: '#ffc58f', weight: 1 };
const SOFT_WHITE: LampColor = { xy: [0.3805, 0.3768], hex: '#ffd1a3', weight: 1 };
const COOL_WHITE: LampColor = { xy: [0.3324, 0.3474], hex: '#ffecdf', weight: 1 };

export const FALLBACK_PALETTE: LampColor[] = [WARM_WHITE, SOFT_WHITE];

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

function linearRgbToOklab(r: number, g: number, b: number): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToLinearRgb({ L, a, b }: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function inGamut([r, g, b]: [number, number, number]): boolean {
  const eps = 1e-4;
  return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps;
}

function chroma(lab: Lab): number {
  return Math.hypot(lab.a, lab.b);
}

/** Largest in-sRGB chroma at this lightness and hue angle, by bisection. */
function maxChroma(L: number, hue: number): number {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklabToLinearRgb({ L, a: mid * Math.cos(hue), b: mid * Math.sin(hue) }))) lo = mid;
    else hi = mid;
  }
  return lo;
}

function linearRgbToXy([r, g, b]: [number, number, number]): [number, number] {
  const X = 0.4124 * r + 0.3576 * g + 0.1805 * b;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const sum = X + Y + Z;
  if (sum <= 0) return WARM_WHITE.xy;
  return [round4(X / sum), round4(Y / sum)];
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function toHex([r, g, b]: [number, number, number]): string {
  const channel = (c: number) =>
    Math.round(linearToSrgb(c) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

type SwatchedLampColor = LampColor & { lab: Lab };

/**
 * The lamp color at a hue angle and target OKLab chroma. Lightness is picked per hue: the
 * lightest level that still fits the chroma in gamut (blues only get vivid dark, yellows light).
 * It only affects the swatch, since the lamp's brightness is set separately from its `xy`.
 */
function lampColorAt(hue: number, targetChroma: number, weight: number): SwatchedLampColor {
  let L = 0.9;
  let cap = maxChroma(L, hue);
  let best = { L, cap };
  while (cap < targetChroma && L > 0.45) {
    L -= 0.05;
    cap = maxChroma(L, hue);
    if (cap > best.cap) best = { L, cap };
  }
  const chosen = cap >= targetChroma ? { L, cap } : best;
  const C = Math.min(targetChroma, chosen.cap * 0.98);
  const lab: Lab = { L: chosen.L, a: C * Math.cos(hue), b: C * Math.sin(hue) };
  const rgb = oklabToLinearRgb(lab);
  return { xy: linearRgbToXy(rgb), hex: toHex(rgb), weight, lab };
}

/**
 * Re-saturates a cover color for a lamp: muted colors get a floor so they still read as a color
 * rather than off-white, vivid ones are pushed toward the edge of what their hue allows.
 */
function toLampColor(lab: Lab, weight: number): SwatchedLampColor {
  return lampColorAt(Math.atan2(lab.b, lab.a), 0.08 + chroma(lab) * 1.3, weight);
}

/** Rotates a lamp color's hue at the same chroma — gives a single-color cover a related second color. */
function shiftHue(color: SwatchedLampColor, radians: number): SwatchedLampColor {
  return lampColorAt(Math.atan2(color.lab.b, color.lab.a) + radians, chroma(color.lab), color.weight);
}

function stripSwatch({ xy, hex, weight }: SwatchedLampColor): LampColor {
  return { xy, hex, weight };
}

/** The white whose color temperature matches a cover's whites, from their average OKLab b. */
function whiteMatching(tint: number): LampColor {
  if (tint > 0.02) return CREAM_WHITE;
  if (tint > 0.008) return SOFT_WHITE;
  return COOL_WHITE;
}

/** Deterministic PRNG so the same cover always yields the same palette. */
function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    // Keep the 32-bit wrap without relying on bitwise coercion for the running seed.
    t = (t + 0x6d2b79f5) % 4294967296;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function distanceSq(p: Float64Array, i: number, c: Lab): number {
  const dL = p[i] - c.L;
  const da = p[i + 1] - c.a;
  const db = p[i + 2] - c.b;
  return dL * dL + da * da + db * db;
}

type Cluster = { centroid: Lab; share: number };

function closestCentroid(points: Float64Array, pointIndex: number, centroids: Lab[]): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let c = 0; c < centroids.length; c++) {
    const distance = distanceSq(points, pointIndex, centroids[c]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = c;
    }
  }
  return best;
}

function updateCentroids(points: Float64Array, centroids: Lab[], assignment: Int32Array): void {
  const sums = centroids.map(() => ({ L: 0, a: 0, b: 0, count: 0 }));
  for (let i = 0; i < assignment.length; i++) {
    const best = closestCentroid(points, i * 3, centroids);
    assignment[i] = best;
    const sum = sums[best];
    sum.L += points[i * 3];
    sum.a += points[i * 3 + 1];
    sum.b += points[i * 3 + 2];
    sum.count++;
  }
  sums.forEach((sum, c) => {
    if (sum.count > 0) centroids[c] = { L: sum.L / sum.count, a: sum.a / sum.count, b: sum.b / sum.count };
  });
}

/** k-means++ seeded k-means over OKLab points (flat L,a,b triples). */
function kmeans(points: Float64Array, k: number): Cluster[] {
  const n = points.length / 3;
  if (n === 0) return [];
  const random = mulberry32(0x9e3779b9);
  const centroids: Lab[] = [];
  const first = Math.floor(random() * n) * 3;
  centroids.push({ L: points[first], a: points[first + 1], b: points[first + 2] });
  const nearest = new Float64Array(n).fill(Infinity);
  while (centroids.length < Math.min(k, n)) {
    const latest = centroids.at(-1)!;
    let total = 0;
    for (let i = 0; i < n; i++) {
      nearest[i] = Math.min(nearest[i], distanceSq(points, i * 3, latest));
      total += nearest[i];
    }
    if (total === 0) break;
    let pick = random() * total;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      pick -= nearest[i];
      if (pick <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.push({ L: points[chosen * 3], a: points[chosen * 3 + 1], b: points[chosen * 3 + 2] });
  }

  const assignment = new Int32Array(n);
  for (let iter = 0; iter < KMEANS_ITERATIONS; iter++) {
    updateCentroids(points, centroids, assignment);
  }

  const counts = new Array<number>(centroids.length).fill(0);
  for (let i = 0; i < n; i++) counts[assignment[i]]++;
  return centroids
    .map((centroid, c) => ({ centroid, share: counts[c] / n }))
    .filter((cluster) => cluster.share > 0);
}

function hueAngle(lab: Lab): number {
  return (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
}

function hueDistance(x: Lab, y: Lab): number {
  const d = Math.abs(hueAngle(x) - hueAngle(y)) % 360;
  return d > 180 ? 360 - d : d;
}

function closestHuePair(clusters: Cluster[]): [number, number] | undefined {
  let best: [number, number] | undefined;
  let bestDistance = MERGE_HUE_DEGREES;
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const distance = hueDistance(clusters[i].centroid, clusters[j].centroid);
      const [ci, cj] = [chroma(clusters[i].centroid), chroma(clusters[j].centroid)];
      if (Math.max(ci, cj) > Math.min(ci, cj) * MERGE_CHROMA_RATIO) continue;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = [i, j];
      }
    }
  }
  return best;
}

/**
 * Joins clusters a lamp would show as the same color. k-means happily slices one gradient (a gold
 * helmet, a sunset) into several light-to-dark bands; each band alone can fall under the minimum
 * share and be thrown away even though together they're the cover's main color. Lightness doesn't
 * reach the lamp, so hue (plus roughly equal saturation) decides "same color". Closest pairs first.
 */
function mergeSameHue(clusters: Cluster[]): Cluster[] {
  const merged = clusters.map((cluster) => ({ ...cluster }));
  for (;;) {
    const best = closestHuePair(merged);
    if (!best) return merged;
    const [i, j] = best;
    const x = merged[i];
    const y = merged[j];
    const share = x.share + y.share;
    merged[i] = {
      share,
      centroid: {
        L: (x.centroid.L * x.share + y.centroid.L * y.share) / share,
        a: (x.centroid.a * x.share + y.centroid.a * y.share) / share,
        b: (x.centroid.b * x.share + y.centroid.b * y.share) / share,
      },
    };
    merged.splice(j, 1);
  }
}

/**
 * How much a cluster deserves to be on a lamp: saturation matters most, coverage second
 * (square-rooted, so a vivid accent can beat a large dull background), and dark colors are
 * discounted because they're mostly shadow rather than the cover's intended color.
 */
function lampScore(lab: Lab, share: number): number {
  const saturation = Math.min(0.9, chroma(lab) / (lab.L + 0.1));
  const darkness = lab.L < 0.3 ? 0.6 + (lab.L - MIN_LIGHTNESS) * 2.8 : 1;
  return Math.sqrt(share) * saturation * darkness;
}

function sampleCover(rgba: Uint8Array | Uint8ClampedArray | Buffer, width: number, height: number) {
  const total = width * height;
  const stride = Math.max(1, Math.floor(Math.sqrt(total / MAX_SAMPLES)));
  // Only pixels a lamp could actually show get clustered. Black backgrounds and grey areas are
  // often most of a cover; left in, they eat the clusters and average small vivid elements (a red
  // jacket on a dark photo) into brown. They still count toward the total, so shares stay honest.
  const colored: number[] = [];
  let sampled = 0;
  let whites = 0;
  let whiteTint = 0;
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3] < 128) continue;
      sampled++;
      const lab = linearRgbToOklab(srgbToLinear(rgba[i]), srgbToLinear(rgba[i + 1]), srgbToLinear(rgba[i + 2]));
      if (lab.L >= MIN_LIGHTNESS && chroma(lab) >= MIN_CHROMA) colored.push(lab.L, lab.a, lab.b);
      else if (lab.L >= 0.6) {
        whites++;
        whiteTint += lab.b; // yellow (+) to blue (-): warm cream vs cool paper
      }
    }
  }
  return { colored, sampled, whites, whiteTint };
}

type ScoredCluster = Cluster & { score: number };

function chooseLampColors(candidates: ScoredCluster[]): SwatchedLampColor[] {
  const chosen: SwatchedLampColor[] = [];
  for (const candidate of candidates) {
    // A faint tint next to a strong lead color is noise that the chroma boost would exaggerate
    // into a color the cover doesn't really have. A vivid accent is real, however small.
    const faint = chroma(candidate.centroid) < VIVID_CHROMA;
    if (chosen.length > 0 && faint && candidate.score < candidates[0].score * MIN_RELATIVE_SCORE) continue;
    const lamp = toLampColor(candidate.centroid, candidate.share);
    const distinct = chosen.every(
      (other) => Math.hypot(other.lab.a - lamp.lab.a, other.lab.b - lamp.lab.b) >= MIN_LAMP_DISTANCE,
    );
    if (distinct) chosen.push(lamp);
    if (chosen.length === MAX_COLORS) break;
  }
  return chosen;
}

/** Picks up to four distinct lamp colors from RGBA pixels, strongest first. */
export function extractPalette(rgba: Uint8Array | Uint8ClampedArray | Buffer, width: number, height: number): LampColor[] {
  const { colored, sampled, whites, whiteTint } = sampleCover(rgba, width, height);
  const coloredShare = sampled > 0 ? colored.length / 3 / sampled : 0;
  if (coloredShare < MIN_SHARE * 2) return FALLBACK_PALETTE;

  const candidates = mergeSameHue(kmeans(Float64Array.from(colored), CLUSTERS))
    .map(({ centroid, share }) => ({ centroid, share: share * coloredShare }))
    .filter(({ centroid, share }) => share >= MIN_SHARE && chroma(centroid) >= MIN_CHROMA)
    .map((cluster) => ({ ...cluster, score: lampScore(cluster.centroid, cluster.share) }))
    .sort((x, y) => y.score - x.score);
  if (candidates.length === 0 || candidates[0].score < MIN_LEAD_SCORE) return FALLBACK_PALETTE;

  const chosen = chooseLampColors(candidates);
  const palette: LampColor[] = chosen.map(({ xy, hex, weight }) => ({ xy, hex, weight }));
  // A cover that is mostly white or cream (a white suit, a paper backdrop) is honestly shown with
  // a white among its colors, instead of only the small colored parts of it.
  const whiteShare = sampled > 0 ? whites / sampled : 0;
  if (whiteShare >= WHITE_SHARE && palette.length <= 2) {
    palette.push({ ...whiteMatching(whiteTint / whites), weight: whiteShare });
  }
  // A single-hue cover still gets two lamp colors: a neighbouring hue keeps the room from
  // looking like one flat wash while staying true to the art.
  if (palette.length === 1) palette.push(stripSwatch(shiftHue(chosen[0], (28 * Math.PI) / 180)));
  return palette;
}

const paletteCache = new Map<string, LampColor[]>();
const PALETTE_CACHE_LIMIT = 200;

/** Downloads and analyzes a cover, cached by URL (Spotify image URLs are content-addressed). */
export async function fetchAlbumPalette(url: string, signal?: AbortSignal): Promise<LampColor[]> {
  const cached = paletteCache.get(url);
  if (cached) return cached;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`cover download failed: ${res.status}`);
  const image = jpeg.decode(Buffer.from(await res.arrayBuffer()), { useTArray: true, formatAsRGBA: true });
  const palette = extractPalette(image.data, image.width, image.height);
  if (paletteCache.size >= PALETTE_CACHE_LIMIT) {
    const oldest = paletteCache.keys().next().value;
    if (oldest !== undefined) paletteCache.delete(oldest);
  }
  paletteCache.set(url, palette);
  return palette;
}
