import { z } from 'zod';

const pad = (n) => String(n).padStart(2, '0');

// "Today" is the server's local calendar date, as YYYY-MM-DD.
export function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isRealDate(value) {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Accepts a calendar date "YYYY-MM-DD" that actually exists (rejects 2026-02-30).
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date in YYYY-MM-DD format')
  .refine(isRealDate, 'is not a real calendar date');
