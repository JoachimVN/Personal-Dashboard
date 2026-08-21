import { readFile } from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';

/** What the account is doing in Valorant at this instant. HenrikDev's match history only lists
 * games that have already finished, so this is the one source that can say "right now" — it comes
 * from the Riot client running on this machine, not from any web API. */
export interface PushedValorantLive {
  /** `menus` covers the lobby, the queue and the post-game screens: Valorant is open, no round is
   * being played. `pregame` is agent select, `ingame` is a live match. */
  state: 'menus' | 'pregame' | 'ingame';
  mode: string;
  map?: string;
  roundsWon?: number;
  roundsLost?: number;
  partySize?: number;
  maxPartySize?: number;
  observedAt: string;
}

/** Riot writes this the moment the client starts and removes it on exit, so its absence is the
 * cheapest possible "Valorant isn't running" check — no request, no error to swallow. */
function lockfilePath(): string {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'Riot Games', 'Riot Client', 'Config', 'lockfile');
  }
  return path.join(os.homedir(), 'Library', 'Application Support', 'Riot Games', 'Riot Client', 'Config', 'lockfile');
}

/** `name:pid:port:password:protocol`. The password is a fresh random secret per client launch
 * rather than an account credential, but it still opens the local API — never log it. */
export function parseLockfile(contents: string): { port: number; password: string } | undefined {
  const [, , port, password] = contents.trim().split(':');
  const parsedPort = Number(port);
  return password && Number.isInteger(parsedPort) && parsedPort > 0 ? { port: parsedPort, password } : undefined;
}

/** Riot's own certificate authority, which they publish at
 * https://static.developer.riotgames.com/docs/lol/riotgames.pem and ship with every install. The
 * local API's certificate is issued by it rather than by anything in the system trust store, so
 * pinning this is what lets the request be verified normally instead of waiving verification. The
 * certificate it signs carries `127.0.0.1` in its SAN list, so the hostname check passes untouched
 * as well. */
const RIOT_CA_CERTIFICATE = [
  '-----BEGIN CERTIFICATE-----',
  'MIIEIDCCAwgCCQDJC+QAdVx4UDANBgkqhkiG9w0BAQUFADCB0TELMAkGA1UEBhMC',
  'VVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFTATBgNVBAcTDFNhbnRhIE1vbmljYTET',
  'MBEGA1UEChMKUmlvdCBHYW1lczEdMBsGA1UECxMUTG9MIEdhbWUgRW5naW5lZXJp',
  'bmcxMzAxBgNVBAMTKkxvTCBHYW1lIEVuZ2luZWVyaW5nIENlcnRpZmljYXRlIEF1',
  'dGhvcml0eTEtMCsGCSqGSIb3DQEJARYeZ2FtZXRlY2hub2xvZ2llc0ByaW90Z2Ft',
  'ZXMuY29tMB4XDTEzMTIwNDAwNDgzOVoXDTQzMTEyNzAwNDgzOVowgdExCzAJBgNV',
  'BAYTAlVTMRMwEQYDVQQIEwpDYWxpZm9ybmlhMRUwEwYDVQQHEwxTYW50YSBNb25p',
  'Y2ExEzARBgNVBAoTClJpb3QgR2FtZXMxHTAbBgNVBAsTFExvTCBHYW1lIEVuZ2lu',
  'ZWVyaW5nMTMwMQYDVQQDEypMb0wgR2FtZSBFbmdpbmVlcmluZyBDZXJ0aWZpY2F0',
  'ZSBBdXRob3JpdHkxLTArBgkqhkiG9w0BCQEWHmdhbWV0ZWNobm9sb2dpZXNAcmlv',
  'dGdhbWVzLmNvbTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKoJemF/',
  '6PNG3GRJGbjzImTdOo1OJRDI7noRwJgDqkaJFkwv0X8aPUGbZSUzUO23cQcCgpYj',
  '21ygzKu5dtCN2EcQVVpNtyPuM2V4eEGr1woodzALtufL3Nlyh6g5jKKuDIfeUBHv',
  'JNyQf2h3Uha16lnrXmz9o9wsX/jf+jUAljBJqsMeACOpXfuZy+YKUCxSPOZaYTLC',
  'y+0GQfiT431pJHBQlrXAUwzOmaJPQ7M6mLfsnpHibSkxUfMfHROaYCZ/sbWKl3lr',
  'ZA9DbwaKKfS1Iw0ucAeDudyuqb4JntGU/W0aboKA0c3YB02mxAM4oDnqseuKV/CX',
  '8SQAiaXnYotuNXMCAwEAATANBgkqhkiG9w0BAQUFAAOCAQEAf3KPmddqEqqC8iLs',
  'lcd0euC4F5+USp9YsrZ3WuOzHqVxTtX3hR1scdlDXNvrsebQZUqwGdZGMS16ln3k',
  'WObw7BbhU89tDNCN7Lt/IjT4MGRYRE+TmRc5EeIXxHkQ78bQqbmAI3GsW+7kJsoO',
  'q3DdeE+M+BUJrhWorsAQCgUyZO166SAtKXKLIcxa+ddC49NvMQPJyzm3V+2b1roP',
  'SvD2WV8gRYUnGmy/N0+u6ANq5EsbhZ548zZc+BI4upsWChTLyxt2RxR7+uGlS1+5',
  'EcGfKZ+g024k/J32XP4hdho7WYAS2xMiV83CfLR/MNi8oSMaVQTdKD8cpgiWJk3L',
  'XWehWA==',
  '-----END CERTIFICATE-----',
].join('\n');

/** The local API's certificate chains to Riot's own CA (see above) rather than a public one, so
 * that CA is supplied for this request instead of weakening the check. Verification stays fully on:
 * no `rejectUnauthorized: false`, no `checkServerIdentity` override, nothing process-wide. */
function localRiotRequest<T>(port: number, password: string, requestPath: string, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const credentials = Buffer.from(`riot:${password}`).toString('base64');
    const request = https.request(
      {
        host: '127.0.0.1',
        port,
        path: requestPath,
        signal,
        ca: RIOT_CA_CERTIFICATE,
        headers: {
          Authorization: `Basic ${credentials}`,
          Accept: 'application/json',
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          if (response.statusCode !== 200) {
            // The body can echo the request path and account identifiers — status code only.
            reject(new Error(`Riot local API request failed: HTTP ${response.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T);
          } catch {
            reject(new Error('Riot local API returned malformed JSON'));
          }
        });
      },
    );
    request.on('error', (err) => reject(err));
    request.end();
  });
}

interface RiotPresence {
  puuid?: string;
  product?: string;
  private?: string;
}

interface ValorantPrivateBlob {
  matchPresenceData?: { sessionLoopState?: string; matchMap?: string; queueId?: string };
  partyPresenceData?: { partySize?: number; maxPartySize?: number };
  partyOwnerMatchScoreAllyTeam?: number;
  partyOwnerMatchScoreEnemyTeam?: number;
  partySize?: number;
  maxPartySize?: number;
}

export interface ValorantPresenceState {
  state: PushedValorantLive['state'];
  /** Riot's internal map path, e.g. `/Game/Maps/Infinity/Infinity`. Absent outside a match. */
  mapUrl?: string;
  queueId: string;
  roundsWon?: number;
  roundsLost?: number;
  partySize?: number;
  maxPartySize?: number;
}

/** Riot's internal codenames, which is what presence reports. Resolved against valorant-api.com at
 * runtime so a new map works the day it ships; this table is the offline fallback. */
const MAP_NAMES: Readonly<Record<string, string>> = {
  '/Game/Maps/Ascent/Ascent': 'Ascent',
  '/Game/Maps/Bonsai/Bonsai': 'Split',
  '/Game/Maps/Canyon/Canyon': 'Fracture',
  '/Game/Maps/Duality/Duality': 'Bind',
  '/Game/Maps/Foxtrot/Foxtrot': 'Breeze',
  '/Game/Maps/HURM/HURM_Alley/HURM_Alley': 'District',
  '/Game/Maps/HURM/HURM_Bowl/HURM_Bowl': 'Kasbah',
  '/Game/Maps/HURM/HURM_Helix/HURM_Helix': 'Drift',
  '/Game/Maps/HURM/HURM_HighTide/HURM_HighTide': 'Glitch',
  '/Game/Maps/HURM/HURM_Yard/HURM_Yard': 'Piazza',
  '/Game/Maps/Infinity/Infinity': 'Abyss',
  '/Game/Maps/Jam/Jam': 'Lotus',
  '/Game/Maps/Juliett/Juliett': 'Sunset',
  '/Game/Maps/Pitt/Pitt': 'Pearl',
  '/Game/Maps/Plummet/Plummet': 'Summit',
  '/Game/Maps/Port/Port': 'Icebox',
  '/Game/Maps/Poveglia/Range': 'The Range',
  '/Game/Maps/PovegliaV2/RangeV2': 'The Range',
  '/Game/Maps/Rook/Rook': 'Corrode',
  '/Game/Maps/Triad/Triad': 'Haven',
};

/** Presence reports the queue as its internal id. Anything not listed (a brand-new queue, a custom
 * game, the empty id a private lobby reports) falls back to the generic label, never a raw id. */
const QUEUE_NAMES: Readonly<Record<string, string>> = {
  competitive: 'Competitive',
  custom: 'Custom',
  deathmatch: 'Deathmatch',
  ggteam: 'Escalation',
  hurm: 'Team Deathmatch',
  newmap: 'New Map',
  onefa: 'Replication',
  premier: 'Premier',
  seeding: 'Premier',
  spikerush: 'Spike Rush',
  swiftplay: 'Swiftplay',
  unrated: 'Unrated',
};

const SESSION_STATES: Readonly<Record<string, PushedValorantLive['state']>> = {
  MENUS: 'menus',
  PREGAME: 'pregame',
  INGAME: 'ingame',
};

let cachedMapNames: Record<string, string> | undefined;

async function fetchMapNames(signal: AbortSignal): Promise<Record<string, string>> {
  const res = await fetch('https://valorant-api.com/v1/maps', { signal });
  if (!res.ok) throw new Error(`valorant-api maps failed: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { mapUrl?: string; displayName?: string }[] };
  return Object.fromEntries(
    (body.data ?? [])
      .filter((entry): entry is { mapUrl: string; displayName: string } => Boolean(entry.mapUrl && entry.displayName))
      .map((entry) => [entry.mapUrl, entry.displayName]),
  );
}

/** Cached for the life of the process after the first success: the map list changes a couple of
 * times a year, and this runs on every tick. */
export async function resolveMapName(mapUrl: string, signal: AbortSignal): Promise<string | undefined> {
  if (!mapUrl) return undefined;
  if (!cachedMapNames) {
    try {
      cachedMapNames = await fetchMapNames(signal);
    } catch {
      // Offline, or valorant-api is down — the built-in table still names every map that existed
      // when this shipped, and a codename beats dropping the whole reading.
    }
  }
  return cachedMapNames?.[mapUrl] ?? MAP_NAMES[mapUrl] ?? mapUrl.split('/').pop();
}

/** Pulls this account's Valorant presence out of the roster the client keeps for every friend.
 * Returns undefined when Valorant isn't the running product (the Riot client publishes a presence
 * of its own) or the blob isn't decodable. Reads nothing about anyone else on the roster. */
export function parseValorantPresence(presences: RiotPresence[], puuid: string): ValorantPresenceState | undefined {
  const mine = presences.find((presence) => presence.puuid === puuid && presence.product === 'valorant' && presence.private);
  if (!mine?.private) return undefined;

  let blob: ValorantPrivateBlob;
  try {
    blob = JSON.parse(Buffer.from(mine.private, 'base64').toString('utf8')) as ValorantPrivateBlob;
  } catch {
    return undefined;
  }

  const state = SESSION_STATES[blob.matchPresenceData?.sessionLoopState ?? ''];
  if (!state) return undefined;

  // The score is only meaningful once rounds are being played; in the menus it holds a stale 0-0.
  const isLiveMatch = state === 'ingame';
  return {
    state,
    mapUrl: blob.matchPresenceData?.matchMap === '' ? undefined : blob.matchPresenceData?.matchMap,
    queueId: blob.matchPresenceData?.queueId ?? '',
    roundsWon: isLiveMatch ? blob.partyOwnerMatchScoreAllyTeam : undefined,
    roundsLost: isLiveMatch ? blob.partyOwnerMatchScoreEnemyTeam : undefined,
    partySize: blob.partySize ?? blob.partyPresenceData?.partySize,
    maxPartySize: blob.maxPartySize ?? blob.partyPresenceData?.maxPartySize,
  };
}

/** Reads the running Riot client for what this account is doing in Valorant right now. Null for
 * every ordinary "nothing to report" case — client closed, signed out, presence not published yet —
 * so the caller can pass the result along verbatim without telling them apart. */
export async function readValorantLive(signal: AbortSignal): Promise<PushedValorantLive | null> {
  let lockfile: string;
  try {
    lockfile = await readFile(lockfilePath(), 'utf8');
  } catch {
    return null;
  }

  const credentials = parseLockfile(lockfile);
  if (!credentials) return null;

  try {
    const { port, password } = credentials;
    const session = await localRiotRequest<{ puuid?: string }>(port, password, '/chat/v1/session', signal);
    if (!session.puuid) return null;

    const { presences } = await localRiotRequest<{ presences?: RiotPresence[] }>(port, password, '/chat/v4/presences', signal);
    const presence = parseValorantPresence(presences ?? [], session.puuid);
    if (!presence) return null;

    return {
      state: presence.state,
      mode: QUEUE_NAMES[presence.queueId] ?? 'Valorant',
      map: presence.mapUrl ? await resolveMapName(presence.mapUrl, signal) : undefined,
      roundsWon: presence.roundsWon,
      roundsLost: presence.roundsLost,
      partySize: presence.partySize,
      maxPartySize: presence.maxPartySize,
      observedAt: new Date().toISOString(),
    };
  } catch (err) {
    // The client shutting down mid-tick is routine, not a fault worth failing the whole push over.
    console.warn(`[activity-push] Valorant presence lookup failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    return null;
  }
}
