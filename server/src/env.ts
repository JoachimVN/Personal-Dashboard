import 'dotenv/config';

export interface ServerEnv {
  port: number;
  host: string;
  timezone: string;
  isProduction: boolean;
  /** Required: all persistent dashboard state is shared through Railway Postgres. */
  databaseUrl: string;
  weather?: { lat: number; lon: number };
  github?: { token: string; username: string };
  githubIssuesToken?: string;
  icloud?: { username: string; password: string };
  google?: { clientId: string; clientSecret: string };
  spotify?: { clientId: string; clientSecret: string };
  hue?: { clientId: string; clientSecret: string };
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
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Add the Railway Postgres connection URL to server/.env before starting the dashboard.',
    );
  }
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
    databaseUrl,
    weather: parseWeather(),
    github:
      process.env.GITHUB_TOKEN && process.env.GITHUB_USERNAME
        ? { token: process.env.GITHUB_TOKEN, username: process.env.GITHUB_USERNAME }
        : undefined,
    githubIssuesToken: process.env.GITHUB_ISSUES_TOKEN || undefined,
    icloud:
      process.env.ICLOUD_USERNAME && process.env.ICLOUD_APP_PASSWORD
        ? {
            username: process.env.ICLOUD_USERNAME,
            password: process.env.ICLOUD_APP_PASSWORD,
          }
        : undefined,
    google:
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }
        : undefined,
    spotify:
      process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET
        ? {
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
          }
        : undefined,
    hue:
      process.env.HUE_CLIENT_ID && process.env.HUE_CLIENT_SECRET
        ? { clientId: process.env.HUE_CLIENT_ID, clientSecret: process.env.HUE_CLIENT_SECRET }
        : undefined,
  };
}
