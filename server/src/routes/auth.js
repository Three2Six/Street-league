import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { broadcast } from '../ws.js';
import { FOUNDER_AVATARS, ALL_AVATARS } from '../avatars.js';
import { hasActiveAccess } from '../access.js';

const router = Router();
const REFERRAL_BONUS_POINTS = 25;

// The client trusts this computed flag rather than re-deriving access itself, since it depends
// on BETA_ENDS_AT — a server-only env var the client has no way to see.
const withActive = (user) => ({ ...user, active: hasActiveAccess(user) });

// Whether the beta is open RIGHT NOW — snapshotted onto new signups as users.founder so it
// stays true for them even after BETA_ENDS_AT later moves or passes.
function isBetaOpen() {
  const betaEndsAt = process.env.BETA_ENDS_AT;
  return Boolean(betaEndsAt) && new Date() < new Date(betaEndsAt);
}

function genReferralCode() {
  return crypto.randomBytes(4).toString('hex');
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const NICKNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;

router.post('/signup', authLimiter, async (req, res) => {
  const { nickname, email, password, city, state, country, agreedToTerms, referralCode } = req.body || {};
  if (!nickname || !NICKNAME_RE.test(nickname)) {
    return res.status(400).json({ error: 'Nickname must be 3-20 characters: letters, numbers, _ or -' });
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email is required' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (agreedToTerms !== true) {
    return res.status(400).json({ error: 'You must agree to the Terms & Liability Disclaimer to create an account' });
  }

  let referrerId = null;
  if (typeof referralCode === 'string' && referralCode.trim()) {
    const { rows: refRows } = await pool.query('SELECT id FROM users WHERE referral_code = $1', [referralCode.trim().toLowerCase()]);
    referrerId = refRows[0]?.id || null;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const founder = isBetaOpen();
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (nickname, email, password_hash, city, state, country, agreed_to_terms_at, founder, referral_code, referred_by)
       VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8, $9)
       RETURNING id, nickname, email, city, state, country, points, visible, avatar, trial_ends_at, paid_at, founder, referral_code, created_at`,
      [nickname, email.toLowerCase(), passwordHash, city || null, state || null, country || null, founder, genReferralCode(), referrerId]
    );

    if (referrerId) {
      await pool.query('UPDATE users SET points = points + $1 WHERE id = $2', [REFERRAL_BONUS_POINTS, referrerId]);
    }

    const user = withActive(rows[0]);
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
    `SELECT id, nickname, email, password_hash, city, state, country, points, visible, avatar, trial_ends_at, paid_at, founder, referral_code, created_at
     FROM users WHERE email = $1`,
    [String(email).toLowerCase()]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  delete user.password_hash;
  res.json({ token: signToken(user), user: withActive(user) });
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, nickname, email, city, state, country, points, visible, avatar, trial_ends_at, paid_at, founder, referral_code, created_at FROM users WHERE id = $1`,
    [req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });

  // Backfills a referral code for accounts created before this feature existed.
  if (!rows[0].referral_code) {
    const { rows: updated } = await pool.query(
      'UPDATE users SET referral_code = $1 WHERE id = $2 RETURNING referral_code',
      [genReferralCode(), req.userId]
    );
    rows[0].referral_code = updated[0].referral_code;
  }

  res.json({ user: withActive(rows[0]) });
});

// A driver's own referral code/link, and how many people have joined through it.
router.get('/referral', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT referral_code FROM users WHERE id = $1', [req.userId]);
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });

  let code = rows[0].referral_code;
  if (!code) {
    code = genReferralCode();
    await pool.query('UPDATE users SET referral_code = $1 WHERE id = $2', [code, req.userId]);
  }

  const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE referred_by = $1', [req.userId]);
  res.json({ code, referredCount: countRows[0].count, pointsEarned: countRows[0].count * REFERRAL_BONUS_POINTS });
});

// "In the game" / "off the grid" — going invisible pulls you off everyone's map immediately
// and stops you from joining or racing; going visible again just resumes on the next GPS tick.
router.patch('/visibility', requireAuth, async (req, res) => {
  const visible = Boolean(req.body?.visible);
  const { rows } = await pool.query(
    `UPDATE users SET visible = $1 WHERE id = $2
     RETURNING id, nickname, email, city, state, country, points, visible, avatar, trial_ends_at, paid_at, founder, referral_code, created_at`,
    [visible, req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });

  if (!visible) {
    await pool.query('DELETE FROM live_locations WHERE user_id = $1', [req.userId]);
    broadcast('presence:leave', { id: req.userId });
  }

  res.json({ user: withActive(rows[0]) });
});

router.patch('/avatar', requireAuth, async (req, res) => {
  const avatar = req.body?.avatar;
  if (!ALL_AVATARS.includes(avatar)) {
    return res.status(400).json({ error: 'Invalid avatar choice' });
  }
  if (FOUNDER_AVATARS.includes(avatar)) {
    const { rows: founderRows } = await pool.query('SELECT founder FROM users WHERE id = $1', [req.userId]);
    if (!founderRows[0]?.founder) {
      return res.status(403).json({ error: 'That avatar is exclusive to drivers who joined during the beta' });
    }
  }
  const { rows } = await pool.query(
    `UPDATE users SET avatar = $1 WHERE id = $2
     RETURNING id, nickname, email, city, state, country, points, visible, avatar, trial_ends_at, paid_at, founder, referral_code, created_at`,
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

  res.json({ user: withActive(rows[0]) });
});

export default router;
