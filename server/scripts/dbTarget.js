// Shared helpers for the db:* scripts. Every script goes through assertSafeTarget(),
// so nothing ever runs against a database other than "borrowbuddy".
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

dotenv.config({ quiet: true });

export const REQUIRED_DB_NAME = 'borrowbuddy';
export const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseTarget() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error('DATABASE_URL is not set. Copy server/.env.example to server/.env.');
    process.exit(1);
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    console.error('DATABASE_URL is not a valid URL.');
    process.exit(1);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  return { url, host: `${url.hostname}:${url.port || 5432}`, database };
}

export function assertSafeTarget(action) {
  const target = parseTarget();
  console.log(`[${action}] target host: ${target.host}`);
  console.log(`[${action}] target database: ${target.database}`);
  if (target.database !== REQUIRED_DB_NAME) {
    console.error(
      `Refusing to run ${action}: database name must be exactly "${REQUIRED_DB_NAME}", got "${target.database}".`,
    );
    process.exit(1);
  }
  return target;
}

export function clientFor(connectionString) {
  return new pg.Client({
    connectionString,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
}

export function readSql(...parts) {
  return fs.readFileSync(path.join(serverRoot, ...parts), 'utf8');
}
