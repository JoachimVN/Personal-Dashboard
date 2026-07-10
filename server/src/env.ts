import 'dotenv/config';

export interface ServerEnv {
  port: number;
  host: string;
  timezone: string;
  isProduction: boolean;
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
  };
}
