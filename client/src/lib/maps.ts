type Coordinates = { lat: number; lon: number; name?: string };

/** Apple Maps opens natively on macOS/iOS and falls back to its web map elsewhere. */
export function mapsSearchHref(query: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(query.trim())}`;
}

export function mapsCoordinatesHref({ lat, lon, name }: Coordinates): string {
  const params = new URLSearchParams({
    ll: `${lat},${lon}`,
    q: name || `${lat},${lon}`,
  });
  return `https://maps.apple.com/?${params.toString()}`;
}
