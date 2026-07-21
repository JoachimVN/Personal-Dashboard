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
  steam?: { apiKey: string; steamId: string };
  clashRoyale?: { apiKey: string; playerTag: string };
  roblox?: { idOrUsername: string; robloSecurity?: string };
  sonarCloud?: { token: string; orgKey: string };
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

export function parseSteam(): ServerEnv['steam'] {
  const apiKey = process.env.STEAM_API_KEY;
  const steamId = process.env.STEAM_ID;
  if (!apiKey || !steamId) return undefined;
  if (!/^\d{17}$/.test(steamId)) {
    console.warn('⚠️  STEAM_ID is not a numeric SteamID64 (17 digits) — Steam disabled.');
    return undefined;
  }
  return { apiKey, steamId };
}

export function parseClashRoyale(): ServerEnv['clashRoyale'] {
  const apiKey = process.env.CLASH_ROYALE_API_KEY;
  const playerTag = process.env.CLASH_ROYALE_ID;
  if (!apiKey || !playerTag) return undefined;
  return { apiKey, playerTag };
}

export function parseRoblox(): ServerEnv['roblox'] {
  const idOrUsername = process.env.ROBLOX_ID;
  if (!idOrUsername) return undefined;
  return { idOrUsername, robloSecurity: process.env.ROBLOSECURITY || undefined };
}

export function parseSonarCloud(): ServerEnv['sonarCloud'] {
  const token = process.env.SONARCLOUD_TOKEN;
  const orgKey = process.env.SONARCLOUD_ORG;
  if (!token || !orgKey) return undefined;
  return { token, orgKey };
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
    steam: parseSteam(),
    clashRoyale: parseClashRoyale(),
    roblox: parseRoblox(),
    sonarCloud: parseSonarCloud(),
  };
}
