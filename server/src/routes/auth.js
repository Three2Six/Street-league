import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { broadcast } from '../ws.js';
import { VALID_AVATARS } from '../avatars.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const NICKNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;

router.post('/signup', authLimiter, async (req, res) => {
  const { nickname, email, password, city, state, country } = req.body || {};
  if (!nickname || !NICKNAME_RE.test(nickname)) {
    return res.status(400).json({ error: 'Nickname must be 3-20 characters: letters, numbers, _ or -' });
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email is required' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (nickname, email, password_hash, city, state, country)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, nickname, email, city, state, country, points, visible, avatar, trial_ends_at, paid_at, created_at`,
      [nickname, email.toLowerCase(), passwordHash, city || null, state || null, country || null]
    );
    const user = rows[0];
    res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Nickname or email already taken' });
    }
    throw err;
  }
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const { rows } = await pool.query(
    `SELECT id, nickname, email, password_hash, city, state, country, points, visible, avatar, trial_ends_at, paid_at, created_at
     FROM users WHERE email = $1`,
    [String(email).toLowerCase()]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  delete user.password_hash;
  res.json({ token: signToken(user), user });
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, nickname, email, city, state, country, points, visible, avatar, trial_ends_at, paid_at, created_at FROM users WHERE id = $1`,
    [req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json({ user: rows[0] });
});

// "In the game" / "off the grid" — going invisible pulls you off everyone's map immediately
// and stops you from joining or racing; going visible again just resumes on the next GPS tick.
router.patch('/visibility', requireAuth, async (req, res) => {
  const visible = Boolean(req.body?.visible);
  const { rows } = await pool.query(
    `UPDATE users SET visible = $1 WHERE id = $2
     RETURNING id, nickname, email, city, state, country, points, visible, avatar, trial_ends_at, paid_at, created_at`,
    [visible, req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });

  if (!visible) {
    await pool.query('DELETE FROM live_locations WHERE user_id = $1', [req.userId]);
    broadcast('presence:leave', { id: req.userId });
  }

  res.json({ user: rows[0] });
});

router.patch('/avatar', requireAuth, async (req, res) => {
  const avatar = req.body?.avatar;
  if (!VALID_AVATARS.includes(avatar)) {
    return res.status(400).json({ error: 'Invalid avatar choice' });
  }
  const { rows } = await pool.query(
    `UPDATE users SET avatar = $1 WHERE id = $2
     RETURNING id, nickname, email, city, state, country, points, visible, avatar, trial_ends_at, paid_at, created_at`,
    [avatar, req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });

  // Refresh the marker immediately for anyone already seeing this driver on the map, instead of
  // waiting for their next GPS tick to carry the new avatar along.
  const { rows: locRows } = await pool.query(
    'SELECT lat, lng, heading, speed_mps, updated_at FROM live_locations WHERE user_id = $1',
    [req.userId]
  );
  if (locRows[0]) {
    broadcast('presence:update', { id: req.userId, nickname: rows[0].nickname, avatar, ...locRows[0] });
  }

  res.json({ user: rows[0] });
});

export default router;
