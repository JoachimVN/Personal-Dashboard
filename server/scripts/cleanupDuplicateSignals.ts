import 'dotenv/config';
import { createDatabase } from '../src/db/client.js';

/**
 * Collapses runs of identical consecutive values in `signal_history` down to their first occurrence
 * — exactly the shape the fixed dedupe in `SignalHistoryStore.record` would have produced all along.
 *
 * Background: the unchanged-check used to compare a stringified jsonb round trip against a fresh
 * JSON.stringify, which never matched because jsonb reorders object keys. Every poll archived a
 * full copy, and the table reached 1 GB with over half its rows byte-identical to their
 * predecessor. The code fix stops new ones; this removes the backlog.
 *
 * Safety, in order:
 *   - Runs read-only by default. Pass `--apply` to actually delete.
 *   - Everything happens in one REPEATABLE READ transaction, so concurrently running dashboards
 *     cannot skew the counts between the survey and the delete.
 *   - The rows to be removed are copied into `signal_history_dupe_backup` inside the same database
 *     first (no egress, and restorable with a plain INSERT ... SELECT).
 *   - Before deleting it fingerprints every (source, metric)'s ordered sequence of distinct
 *     consecutive values, and re-checks it afterwards. Any mismatch aborts the transaction, so a
 *     failed verification leaves the table untouched.
 *
 * Usage:
 *   npm run db:cleanup-duplicates -w server            # report only
 *   npm run db:cleanup-duplicates -w server -- --apply # delete, then VACUUM to return the space
 */

const apply = process.argv.includes('--apply');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const database = createDatabase(databaseUrl, 1);
const sql = database.client;

try {
  const [survey] = await sql<{ dupes: string; total: string; size: string }[]>`
    WITH seq AS (
      SELECT md5(value::text) h,
             lag(md5(value::text)) OVER (PARTITION BY source, metric ORDER BY recorded_at, id) prev
      FROM signal_history)
    SELECT count(*) FILTER (WHERE h = prev)::text dupes, count(*)::text total,
           pg_size_pretty(pg_total_relation_size('signal_history')) size
    FROM seq`;
  console.log(
    `signal_history: ${survey.total} rows, ${survey.size}, ${survey.dupes} redundant ` +
      `(${((Number(survey.dupes) / Number(survey.total)) * 100).toFixed(1)}%)`,
  );

  if (!apply) {
    console.log('\nRead-only run. Re-run with --apply to delete them.');
  } else {
    const result = await sql.begin('isolation level repeatable read', async (tx) => {
      const before = await tx<{ source: string; metric: string; fp: string }[]>`
        WITH seq AS (
          SELECT source, metric, md5(value::text) h, recorded_at,
                 lag(md5(value::text)) OVER (PARTITION BY source, metric ORDER BY recorded_at, id) prev
          FROM signal_history)
        SELECT source, metric, md5(string_agg(h, ',' ORDER BY recorded_at)) fp
        FROM seq WHERE h IS DISTINCT FROM prev GROUP BY source, metric`;

      await tx`DROP TABLE IF EXISTS signal_history_dupe_backup`;
      await tx`
        CREATE TABLE signal_history_dupe_backup AS
        WITH seq AS (
          SELECT id, md5(value::text) h,
                 lag(md5(value::text)) OVER (PARTITION BY source, metric ORDER BY recorded_at, id) prev
          FROM signal_history)
        SELECT sh.* FROM signal_history sh JOIN seq ON seq.id = sh.id WHERE seq.h = seq.prev`;

      const deleted = await tx`
        DELETE FROM signal_history WHERE id IN (SELECT id FROM signal_history_dupe_backup)`;

      const after = await tx<{ source: string; metric: string; fp: string }[]>`
        SELECT source, metric, md5(string_agg(md5(value::text), ',' ORDER BY recorded_at)) fp
        FROM signal_history GROUP BY source, metric`;

      const expected = new Map(before.map((r) => [`${r.source}|${r.metric}`, r.fp]));
      const mismatched = after.filter((r) => expected.get(`${r.source}|${r.metric}`) !== r.fp);
      if (mismatched.length > 0 || after.length !== before.length) {
        // Throwing rolls the whole thing back, table included.
        throw new Error(
          `verification failed: ${mismatched.length} signals changed, ` +
            `${before.length} -> ${after.length} signals. Nothing was deleted.`,
        );
      }
      return { deleted: deleted.count, signals: after.length };
    });

    console.log(`\nDeleted ${result.deleted} rows.`);
    console.log(`Verified: all ${result.signals} signals have a byte-identical value sequence.`);

    // Postgres only marks deleted rows dead; VACUUM FULL is what hands the space back to the OS,
    // which is the point of the exercise. It takes an exclusive lock, but this table is only ever
    // appended to by the archiver, which retries on the next poll.
    console.log('\nRunning VACUUM FULL to release the space...');
    await sql`VACUUM FULL signal_history`;
    const [after] = await sql<{ size: string; n: string }[]>`
      SELECT pg_size_pretty(pg_total_relation_size('signal_history')) size,
             (SELECT count(*)::text FROM signal_history) n`;
    console.log(`signal_history is now ${after.n} rows, ${after.size}`);
    console.log(
      '\nThe removed rows are still in signal_history_dupe_backup. Once you are happy:\n' +
        '  DROP TABLE signal_history_dupe_backup;\n' +
        'To restore instead:\n' +
        '  INSERT INTO signal_history SELECT * FROM signal_history_dupe_backup;',
    );
  }
} finally {
  await sql.end({ timeout: 10 });
}
