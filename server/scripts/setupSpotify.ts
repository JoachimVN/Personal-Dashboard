// One-time Spotify OAuth via the authorization-code flow. A throwaway local
// HTTP server on a FIXED loopback port receives the redirect — Spotify requires
// the redirect URI to match a value registered in the app's settings exactly.
import 'dotenv/config';
import http from 'node:http';
import { writeSpotifyToken } from '../src/spotifyToken.js';

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in server/.env first.');
  process.exit(1);
}

const PORT = 8888;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = 'user-read-currently-playing user-read-recently-played user-top-read';

const authUrl = new URL('https://accounts.spotify.com/authorize');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('redirect_uri', REDIRECT);

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? '/', REDIRECT);
  if (requestUrl.pathname !== '/callback') {
    res.writeHead(404).end();
    return;
  }
  const code = requestUrl.searchParams.get('code');
  try {
    if (!code) throw new Error(requestUrl.searchParams.get('error') ?? 'no code returned');
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT,
      }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status}`);
    const json = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    if (!json.refresh_token) throw new Error('no refresh_token returned');
    writeSpotifyToken({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Date.now() + json.expires_in * 1000,
    });
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Spotify connected — you can close this tab.');
    console.log('✓ Token saved to server/.tokens/spotify.json — restart the server to enable the widget.');
    server.close();
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Something went wrong — check the terminal.');
    console.error('✗ OAuth failed:', (err as Error).message);
    server.close();
    process.exitCode = 1;
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\nAdd this exact redirect URI to your Spotify app (developer.spotify.com → your app → Settings):\n\n  ${REDIRECT}\n`);
  console.log('Then open this URL in your browser and approve access:\n');
  console.log(authUrl.toString() + '\n');
});
