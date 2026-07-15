import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase, type Database } from './client.js';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');
const lockKey = 5_184_227_091;

/** Serializes auto-migration across independently-running dashboard installations. */
export async function migrateDatabase(database: Database): Promise<void> {
  // A one-connection client keeps the session-scoped advisory lock and migration statements on
  // the same PostgreSQL session. The normal application pool remains untouched.
  const migrationDatabase = createDatabase(database.databaseUrl, 1);
  try {
    await migrationDatabase.client`select pg_advisory_lock(${lockKey})`;
    await migrate(migrationDatabase.db, { migrationsFolder });
  } finally {
    try {
      await migrationDatabase.client`select pg_advisory_unlock(${lockKey})`;
    } finally {
      await migrationDatabase.client.end({ timeout: 5 });
    }
  }
}
