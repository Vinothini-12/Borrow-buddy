import bcrypt from 'bcrypt';
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { conflict, notFound, unauthorized } from '../utils/httpError.js';

const router = Router();

// Columns safe to send to clients. password_hash is never selected into responses.
const PUBLIC_USER_COLUMNS = 'id, name, email, created_at';

const registerSchema = z.object({
  name: z.string().trim().min(1, 'is required').max(100),
  email: z.string().trim().toLowerCase().pipe(z.email('must be a valid email')),
  password: z.string().min(8, 'must be at least 8 characters').max(72),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'is required'),
  password: z.string().min(1, 'is required'),
});

router.post('/register', validate(registerSchema), async (req, res) => {
  const { name, email, password } = req.body;
  const existing = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (existing.rowCount > 0) throw conflict('An account with that email already exists', 'EMAIL_TAKEN');

  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING ${PUBLIC_USER_COLUMNS}`,
    [name, email, passwordHash],
  );
  res.status(201).json({ token: signToken(rows[0]), user: rows[0] });
});

router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await query(
    `SELECT ${PUBLIC_USER_COLUMNS}, password_hash FROM users WHERE email = $1`,
    [email],
  );
  const found = rows[0];
  const ok = found && (await bcrypt.compare(password, found.password_hash));
  if (!ok) throw unauthorized('Incorrect email or password');

  const { password_hash: _omit, ...user } = found;
  res.json({ token: signToken(user), user });
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await query(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = $1`, [req.user.id]);
  if (!rows[0]) throw notFound('User no longer exists');
  res.json({ user: rows[0] });
});

export default router;
