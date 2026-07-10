// Ordinal blue ramp, validated per mode; index 0 is the neutral zero cell.
const LIGHT_RAMP = ['#e2e8f0', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b'];
const DARK_RAMP = ['#334155', '#184f95', '#2a78d6', '#6da7ec', '#b7d3f6'];

/** Mode-adaptive cell color for a day's contribution count relative to the visible max. */
export function rampColor(count: number, max: number): string {
  const bucket = count === 0 ? 0 : Math.min(4, Math.ceil((count / Math.max(1, max)) * 4));
  return `light-dark(${LIGHT_RAMP[bucket]}, ${DARK_RAMP[bucket]})`;
}
