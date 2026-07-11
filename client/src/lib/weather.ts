export function glyph(symbol: string): string {
  const night = symbol.endsWith('_night');
  const base = symbol.replace(/_(day|night|polartwilight)$/, '');
  if (base.includes('thunder')) return '⛈️';
  if (base.includes('sleet')) return '🌨️';
  if (base.includes('snow')) return '❄️';
  if (base.includes('rainshowers')) return '🌦️';
  if (base.includes('rain')) return '🌧️';
  if (base === 'fog') return '🌫️';
  if (base === 'clearsky') return night ? '🌙' : '☀️';
  if (base === 'fair' || base === 'partlycloudy') return night ? '☁️' : '🌤️';
  return '☁️';
}

export const deg = (temp: number) => `${Math.round(temp)}°`;

export function weatherLocation(location: { lat: number; lon: number; name?: string }): string {
  if (location.name) return location.name;
  const latitude = `${Math.abs(location.lat).toFixed(2)}° ${location.lat >= 0 ? 'N' : 'S'}`;
  const longitude = `${Math.abs(location.lon).toFixed(2)}° ${location.lon >= 0 ? 'E' : 'W'}`;
  return `${latitude} · ${longitude}`;
}
