// One-off migration: the original seedIfNeeded backfill used to inject a fake rank-based
// playCount (weight = topListLength - rank) for every long_term top track, which then kept
// accumulating real +1s from recordPlays on top of that fake starting number forever. That bug is
// fixed going forward (seedIfNeeded now seeds at playCount 0), but tracks seeded before the fix
// still carry the inflated number in the database. This recomputes every *unverified* track's
// playCount from spotify_observed_plays — the ground-truth log of every real organic play — and
// discards whatever old fake-plus-organic total was there before. Verified tracks (set via
// applyRealStreamCounts, e.g. from a CSV import) are left untouched since their number is already
// a real, trusted count. Safe to re-run.
import 'dotenv/config';
import { createDatabase } from '../src/db/client.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Set DATABASE_URL in server/.env first.');
  process.exit(1);
}

async function main() {
  const database = createDatabase(databaseUrl!);
  const sql = database.client;

  const counts = await sql<{ track_id: string; plays: string }[]>`
    select track_id, count(*)::text as plays from spotify_observed_plays group by track_id
  `;
  const observedCountByTrack = new Map(counts.map((row) => [row.track_id, Number(row.plays)]));

  const tracks = await sql<{ id: string; track: string; verified: boolean | null; play_count: number }[]>`
    select id, track, verified, play_count from spotify_tracks
  `;

  let updated = 0;
  for (const row of tracks) {
    if (row.verified) continue;
    const realCount = observedCountByTrack.get(row.id) ?? 0;
    if (realCount === row.play_count) continue;
    await sql`update spotify_tracks set play_count = ${realCount} where id = ${row.id}`;
    console.log(`  ${row.track}: ${row.play_count} -> ${realCount}`);
    updated++;
  }

  await sql.end({ timeout: 5 });
  console.log(`\nRebuilt playCount for ${updated}/${tracks.length} unverified tracks from observed plays.`);
  console.log('If the dashboard server is currently running, restart it to pick up the change.');
}

main().catch((err) => {
  console.error('✗ Rebuild failed:', (err as Error).message);
  process.exitCode = 1;
});
