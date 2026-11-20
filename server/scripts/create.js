// Creates the "borrowbuddy" database if it does not exist.
// It connects to the server's "postgres" maintenance database only to issue CREATE DATABASE;
// it never reads or changes anything else there.
import { assertSafeTarget, clientFor, REQUIRED_DB_NAME } from './dbTarget.js';

const target = assertSafeTarget('db:create');
const adminUrl = new URL(target.url);
adminUrl.pathname = '/postgres';

const client = clientFor(adminUrl.toString());
try {
  await client.connect();
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    REQUIRED_DB_NAME,
  ]);
  if (rowCount > 0) {
    console.log(`Database "${REQUIRED_DB_NAME}" already exists. Nothing to do.`);
  } else {
    // Identifiers cannot be parameterized; the name is the hard-coded constant above.
    await client.query(`CREATE DATABASE ${REQUIRED_DB_NAME}`);
    console.log(`Created database "${REQUIRED_DB_NAME}".`);
  }
} catch (err) {
  console.error('db:create failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
