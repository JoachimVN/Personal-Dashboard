import postgres from 'postgres';

/**
 * Deliberately does not build a drizzle instance. Every store in this codebase queries through
 * `client` (postgres.js) and nothing reads the query builder, so the only thing that ever needed
 * drizzle was the migrator — see `migrate.ts`, which constructs its own.
 *
 * That split is load-bearing for cost rather than tidiness: importing `drizzle-orm/postgres-js`
 * costs ~160 MB of resident memory, and the always-on Railway ingest service is billed by the
 * GB-month. Keeping it out of the long-running process shrinks that container from ~185 MB to
 * ~65 MB. Migrations run as their own short-lived process (`npm run db:migrate`) which exits
 * before the server starts.
 */
export function createDatabase(databaseUrl: string, max = 5) {
  const client = postgres(databaseUrl, {
    max,
    connect_timeout: 10,
    idle_timeout: 20,
    // Railway's public TCP proxy requires TLS; local/CI Postgres service containers do not.
    ssl: /railway|rlwy\.net/i.test(databaseUrl) ? 'require' : undefined,
  });
  return { client, databaseUrl };
}

export type Database = ReturnType<typeof createDatabase>;
