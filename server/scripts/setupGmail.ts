// One-time Gmail OAuth via the desktop-app loopback flow (RFC 8252):
// a throwaway local HTTP server receives the redirect — no copy/paste codes.
import 'dotenv/config';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { google } from 'googleapis';
import { writeGmailToken } from '../src/gmailToken.js';

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in server/.env first.');
  process.exit(1);
}

const server = http.createServer();
server.listen(0, '127.0.0.1', () => {
  const { port } = server.address() as AddressInfo;
  const auth = new google.auth.OAuth2(
    clientId,
    clientSecret,
    `http://127.0.0.1:${port}/callback`,
  );

  const url = auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.metadata'],
  });
  console.log('\nOpen this URL in your browser and approve access:\n');
  console.log(url + '\n');

  server.on('request', async (req, res) => {
    const requestUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    if (requestUrl.pathname !== '/callback') {
      res.writeHead(404).end();
      return;
    }
    const code = requestUrl.searchParams.get('code');
    try {
      if (!code) throw new Error(requestUrl.searchParams.get('error') ?? 'no code returned');
      const { tokens } = await auth.getToken(code);
      if (!tokens.refresh_token) {
        throw new Error('no refresh_token returned — remove the app\'s prior grant at myaccount.google.com/permissions and retry');
      }
      writeGmailToken(tokens);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Gmail connected — you can close this tab.');
      console.log('✓ Token saved to server/.tokens/gmail.json — restart the server to enable the widget.');
      server.close();
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Something went wrong — check the terminal.');
      console.error('✗ OAuth failed:', (err as Error).message);
      server.close();
      process.exitCode = 1;
    }
  });
});
