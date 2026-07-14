// One-off import: applies real per-track stream counts (hand-entered into an Exportify-style CSV
// of a personal Spotify playlist) into the SpotifyHistoryStore as authoritative playCounts,
// overriding the long_term-rank seed weight for any track that appears in the CSV. Only the
// "Track URI" and "Streams" columns are read — everything else in the export is for your own
// reference. Track/album/artist metadata is fetched fresh from Spotify by ID rather than parsed
// from the CSV text, so matching is exact. Safe to re-run with updated numbers: it's a set, not
// an increment.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { accessToken, toPlayedTrackInput, type RawTrack } from '../src/providers/spotify.js';
import { SpotifyHistoryStore, type PlayedTrackInput } from '../src/spotifyHistory.js';

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in server/.env first.');
  process.exit(1);
}

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.data');
const csvPath = process.argv[2] ?? path.join(dataDir, 'spotify-top-120.csv');

interface CsvRow {
  trackId: string;
  streams: number;
}

function parseCsv(filePath: string): CsvRow[] {
  const text = readFileSync(filePath, 'utf8');
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  const [header, ...rows] = lines;
  const columns = header.split('\t');
  const uriIndex = columns.indexOf('Track URI');
  const streamsIndex = columns.indexOf('Streams');
  if (uriIndex === -1 || streamsIndex === -1) {
    throw new Error(`Expected tab-separated "Track URI" and "Streams" columns, got: ${columns.join(', ')}`);
  }
  return rows.map((row) => {
    const cells = row.split('\t');
    const trackId = (cells[uriIndex] ?? '').replace('spotify:track:', '').trim();
    return { trackId, streams: Number(cells[streamsIndex]) };
  });
}

async function fetchTrack(id: string, bearer: string): Promise<RawTrack | undefined> {
  const res = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!res.ok) {
    console.warn(`  ✗ ${id}: fetch failed (${res.status})`);
    return undefined;
  }
  return (await res.json()) as RawTrack;
}

async function main() {
  const rows = parseCsv(csvPath);
  console.log(`Parsed ${rows.length} rows from ${csvPath}\n`);

  const historyStore = new SpotifyHistoryStore(path.join(dataDir, 'spotify-history.json'));
  const bearer = await accessToken({ clientId: clientId!, clientSecret: clientSecret! }, new AbortController().signal);

  const entries: { track: PlayedTrackInput; streams: number }[] = [];
  for (const [i, row] of rows.entries()) {
    if (!row.trackId || !Number.isFinite(row.streams)) {
      console.warn(`  ✗ row ${i + 1}: missing track id or invalid streams value, skipping`);
      continue;
    }
    const raw = await fetchTrack(row.trackId, bearer);
    const track = raw ? toPlayedTrackInput(raw) : undefined;
    if (!track) {
      console.warn(`  ✗ row ${i + 1} (${row.trackId}): could not resolve track, skipping`);
      continue;
    }
    entries.push({ track, streams: row.streams });
    console.log(`  ✓ ${track.name} — ${row.streams} streams`);
  }

  historyStore.applyRealStreamCounts(entries);
  console.log(`\nApplied real stream counts for ${entries.length}/${rows.length} tracks.`);
  console.log('If the dashboard server is currently running, restart it to pick up the change.');
}

main().catch((err) => {
  console.error('✗ Import failed:', (err as Error).message);
  process.exitCode = 1;
});
