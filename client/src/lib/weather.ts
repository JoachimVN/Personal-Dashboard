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
