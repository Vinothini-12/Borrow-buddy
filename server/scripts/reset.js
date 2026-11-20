// Drops everything in the borrowbuddy database's public schema, then migrates and seeds.
import { assertSafeTarget, clientFor } from './dbTarget.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';

const target = assertSafeTarget('db:reset');
const client = clientFor(target.url.toString());
try {
  await client.connect();
  // Double-check against the live connection, not just the URL.
  const { rows } = await client.query('SELECT current_database() AS name');
  if (rows[0].name !== 'borrowbuddy') {
    throw new Error(`connected database is "${rows[0].name}", expected "borrowbuddy"`);
  }
  await client.query('DROP SCHEMA public CASCADE');
  await client.query('CREATE SCHEMA public');
  console.log('  dropped and recreated schema public');
  await migrate(client);
  await seed(client);
  console.log('Reset complete.');
} catch (err) {
  console.error('db:reset failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
