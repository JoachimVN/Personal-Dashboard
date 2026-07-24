/**
 * Spotify assigns a distinct album id to every reissue (Deluxe/Extended/Anniversary/Remastered/...),
 * which splits one album's plays across several "albums" in getAllTime — e.g. Kiss Land vs. Kiss
 * Land (Deluxe) never accumulate enough tracked tracks individually to clear
 * MIN_TRACKED_TRACKS_PER_ALBUM even though the underlying album is well-tracked. Stripping a
 * trailing edition marker gives editions of the same album a shared grouping key so they can be
 * merged before ranking.
 */
const EDITION_PREFIXES = [
  'deluxe',
  'extended',
  'expanded',
  'anniversary',
  'remaster',
  'remastered',
  'special',
  'super deluxe',
  'bonus',
  'bonus track',
  'bonus track version',
  'explicit',
  'clean',
  'international',
  'complete',
  'revisited',
  'reissue',
];

function isEditionLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return EDITION_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix} `));
}

function editionSuffixStart(name: string): number | undefined {
  const trimmed = name.trim();
  const close = trimmed.at(-1);
  if (close === ')' || close === ']') {
    const open = close === ')' ? '(' : '[';
    const start = trimmed.lastIndexOf(open);
    if (start >= 0 && isEditionLabel(trimmed.slice(start + 1, -1))) return start;
  }
  // Track titles more often carry their edition as a trailing " - Remastered 2015" / " - Explicit"
  // segment than a parenthetical — same vocabulary, different punctuation.
  const dashStart = trimmed.lastIndexOf(' - ');
  if (dashStart >= 0 && isEditionLabel(trimmed.slice(dashStart + 3))) return dashStart;
  return undefined;
}

/** Strips a trailing edition marker — "(Deluxe)", " - Remastered 2015", etc. — so editions of the
 * same album or track share a grouping key and their plays can be merged before ranking. */
export function canonicalTitle(name: string): string {
  let result = name;
  for (let suffixStart = editionSuffixStart(result); suffixStart !== undefined; suffixStart = editionSuffixStart(result)) {
    result = result.slice(0, suffixStart).trim();
  }
  return result;
}
