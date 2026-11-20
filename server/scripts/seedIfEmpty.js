// Used by the Docker container on startup: seeds demo data only when the users table is empty.
// Set SEED_DEMO=false to skip.
import { assertSafeTarget, clientFor } from './dbTarget.js';
import { seed } from './seed.js';

if (process.env.SEED_DEMO === 'false') {
  console.log('[db:seed-if-empty] SEED_DEMO=false, skipping.');
  process.exit(0);
}

const target = assertSafeTarget('db:seed-if-empty');
const client = clientFor(target.url.toString());
try {
  await client.connect();
  const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM users');
  if (rows[0].n > 0) {
    console.log(`  database already has ${rows[0].n} user(s), not seeding`);
  } else {
    await seed(client);
  }
} catch (err) {
  console.error('db:seed-if-empty failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
