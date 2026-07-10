import 'dotenv/config';

export interface ServerEnv {
  port: number;
  host: string;
  timezone: string;
  isProduction: boolean;
  weather?: { lat: number; lon: number };
  github?: { token: string; username: string };
  icloud?: { username: string; password: string };
}

function parseWeather(): ServerEnv['weather'] {
  const lat = Number(process.env.WEATHER_LAT);
  const lon = Number(process.env.WEATHER_LON);
  if (!process.env.WEATHER_LAT || !process.env.WEATHER_LON) return undefined;
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    console.warn('⚠️  WEATHER_LAT/WEATHER_LON are not valid numbers — weather disabled.');
    return undefined;
  }
  return { lat, lon };
}

export function loadEnv(): ServerEnv {
  const host = process.env.HOST ?? '127.0.0.1';
  if (host !== '127.0.0.1' && host !== 'localhost') {
    console.warn(
      `⚠️  HOST=${host} exposes the dashboard WITHOUT authentication on your network. ` +
        'The intended setup is loopback + `tailscale serve 4821`.',
    );
  }
  return {
    port: Number(process.env.PORT ?? 4821),
    host,
    timezone: process.env.DASHBOARD_TIMEZONE ?? 'Europe/Oslo',
    isProduction: process.env.NODE_ENV === 'production',
    weather: parseWeather(),
    github:
      process.env.GITHUB_TOKEN && process.env.GITHUB_USERNAME
        ? { token: process.env.GITHUB_TOKEN, username: process.env.GITHUB_USERNAME }
        : undefined,
    icloud:
      process.env.ICLOUD_USERNAME && process.env.ICLOUD_APP_PASSWORD
        ? {
            username: process.env.ICLOUD_USERNAME,
            password: process.env.ICLOUD_APP_PASSWORD,
          }
        : undefined,
  };
}
