import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { hasActiveAccess } from '../access.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, nickname: user.nickname }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = verifyToken(token);
    req.userId = payload.sub;
    req.nickname = payload.nickname;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Same as requireAuth, plus a paywall check — for routes that should stop working once a
// driver's free trial has expired and they haven't paid.
export function requireActive(req, res, next) {
  requireAuth(req, res, async () => {
    const { rows } = await pool.query('SELECT paid_at, trial_ends_at FROM users WHERE id = $1', [req.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    if (!hasActiveAccess(rows[0])) {
      return res.status(402).json({ error: 'Your free trial has ended — upgrade to keep using Street League.' });
    }
    next();
  });
}
