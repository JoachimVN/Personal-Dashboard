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

/** "Partlycloudy_day" → "Partly cloudy": a human label for a MET symbol code. */
export function symbolLabel(symbol: string): string {
  const base = symbol.replace(/_(day|night|polartwilight)$/, '');
  const labels: Record<string, string> = {
    clearsky: 'Clear sky',
    fair: 'Fair',
    partlycloudy: 'Partly cloudy',
    cloudy: 'Cloudy',
    fog: 'Fog',
    lightrain: 'Light rain',
    rain: 'Rain',
    heavyrain: 'Heavy rain',
    lightrainshowers: 'Light rain showers',
    rainshowers: 'Rain showers',
    heavyrainshowers: 'Heavy rain showers',
    lightsleet: 'Light sleet',
    sleet: 'Sleet',
    heavysleet: 'Heavy sleet',
    lightsnow: 'Light snow',
    snow: 'Snow',
    heavysnow: 'Heavy snow',
    lightsnowshowers: 'Light snow showers',
    snowshowers: 'Snow showers',
  };
  if (labels[base]) return labels[base];
  if (base.includes('thunder')) return 'Thunder';
  if (base.includes('sleet')) return 'Sleet';
  if (base.includes('snow')) return 'Snow';
  if (base.includes('rain')) return 'Rain';
  return 'Clouds';
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** Meteorological degrees (wind FROM) → compass point, e.g. 224 → "SW". */
export function windCompass(directionDeg: number): string {
  return COMPASS[Math.round(((directionDeg % 360) + 360) % 360 / 45) % 8];
}

export const WIND_COLOR = 'light-dark(#0f8a7f, #4dd9c4)';
export const HUMIDITY_COLOR = 'light-dark(#6d5fd6, #b8a6ff)';

export interface UvLevel {
  label: string;
  /** WHO UV-scale color for the gauge mark; always paired with the label, never color alone. */
  color: string;
}

/** WHO UV index bands. */
export function uvLevel(index: number): UvLevel {
  if (index < 3) return { label: 'Low', color: 'light-dark(#3f9142, #7bc47f)' };
  if (index < 6) return { label: 'Moderate', color: 'light-dark(#b88207, #f0c24b)' };
  if (index < 8) return { label: 'High', color: 'light-dark(#c4610c, #f2994a)' };
  if (index < 11) return { label: 'Very high', color: 'light-dark(#c43d3d, #f27a7a)' };
  return { label: 'Extreme', color: 'light-dark(#8f3fbf, #c17ef2)' };
}

/** Phase degrees (0 new → 180 full → 360 new) to the eight common phase names. */
export function moonPhaseName(phaseDeg: number): string {
  const names = [
    'New moon',
    'Waxing crescent',
    'First quarter',
    'Waxing gibbous',
    'Full moon',
    'Waning gibbous',
    'Last quarter',
    'Waning crescent',
  ];
  return names[Math.round(((phaseDeg % 360) + 360) % 360 / 45) % 8];
}

/** Fraction of the moon's disc that is lit, from the phase angle. */
export function moonIllumination(phaseDeg: number): number {
  return (1 - Math.cos((phaseDeg * Math.PI) / 180)) / 2;
}

/** Steadman-style apparent temperature (the BOM approximation): combines humidity's evaporative-cooling
 * loss and wind's convective loss in one formula, so it works across the whole temperature range
 * instead of switching between separate wind-chill and heat-index formulas. */
export function feelsLike(temperature: number, humidity: number | undefined, windSpeed: number): number {
  if (humidity == null) return temperature;
  const vapourPressure = (humidity / 100) * 6.105 * Math.exp((17.27 * temperature) / (237.7 + temperature));
  return temperature + 0.33 * vapourPressure - 0.7 * windSpeed - 4;
}

export function weatherLocation(location: { lat: number; lon: number; name?: string }): string {
  if (location.name) return location.name;
  const latitude = `${Math.abs(location.lat).toFixed(2)}° ${location.lat >= 0 ? 'N' : 'S'}`;
  const longitude = `${Math.abs(location.lon).toFixed(2)}° ${location.lon >= 0 ? 'E' : 'W'}`;
  return `${latitude} · ${longitude}`;
}
