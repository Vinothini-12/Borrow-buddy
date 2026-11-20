import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('Connected to PostgreSQL.');
  } catch (err) {
    console.error('ERROR: could not connect to PostgreSQL using DATABASE_URL.');
    console.error(`  ${err.message || err.code || err}`);
    console.error('  Is the database running? Try: docker compose up -d && npm run db:create');
    process.exit(1);
  }
  app.listen(config.port, () => {
    console.log(`BorrowBuddy API listening on http://localhost:${config.port}`);
  });
}

start();
