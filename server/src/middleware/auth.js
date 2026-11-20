import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { unauthorized } from '../utils/httpError.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user.id) }, config.jwtSecret, { expiresIn: '7d' });
}

// Requires "Authorization: Bearer <token>" and sets req.user = { id }.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: Number(payload.sub) };
    next();
  } catch {
    next(unauthorized('Session expired or invalid. Please log in again.'));
  }
}
