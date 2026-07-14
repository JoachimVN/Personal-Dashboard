import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

export function createDatabase(databaseUrl: string, max = 5) {
  const client = postgres(databaseUrl, {
    max,
    connect_timeout: 10,
    idle_timeout: 20,
    // Railway's public TCP proxy requires TLS; local/CI Postgres service containers do not.
    ssl: /railway|rlwy\.net/i.test(databaseUrl) ? 'require' : undefined,
  });
  const db = drizzle(client, { schema });
  return { client, db, databaseUrl };
}

export type Database = ReturnType<typeof createDatabase>;
