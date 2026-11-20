// Loads seeds/seed.sql into the borrowbuddy database.
import { fileURLToPath } from 'node:url';
import { assertSafeTarget, clientFor, readSql } from './dbTarget.js';

export async function seed(client) {
  await client.query('BEGIN');
  try {
    await client.query(readSql('seeds', 'seed.sql'));
    await client.query('COMMIT');
    console.log('  seeded demo users and items');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = assertSafeTarget('db:seed');
  const client = clientFor(target.url.toString());
  try {
    await client.connect();
    await seed(client);
  } catch (err) {
    console.error('db:seed failed:', err.message, '(run db:reset if data already exists)');
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
