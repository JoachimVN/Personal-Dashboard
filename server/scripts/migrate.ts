import 'dotenv/config';
import { createDatabase } from '../src/db/client.js';
import { migrateDatabase } from '../src/db/migrate.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run migrations.');
}

const database = createDatabase(databaseUrl);
try {
  await migrateDatabase(database);
  console.log('Database migrations are current.');
} finally {
  await database.client.end({ timeout: 5 });
}
