// Applies migrations/*.sql in filename order, each once, tracked in schema_migrations.
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { assertSafeTarget, clientFor, readSql, serverRoot } from './dbTarget.js';

export async function migrate(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const files = fs
    .readdirSync(path.join(serverRoot, 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const { rows } = await client.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip    ${file} (already applied)`);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(readSql('migrations', file));
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`${file}: ${err.message}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = assertSafeTarget('db:migrate');
  const client = clientFor(target.url.toString());
  try {
    await client.connect();
    await migrate(client);
    console.log('Migrations complete.');
  } catch (err) {
    console.error('db:migrate failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
