import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

// Generous but bounded — this is hit on every route change, including by anonymous visitors
// who never sign up, so it can't require auth like the rest of the API.
const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/', trackLimiter, async (req, res) => {
  const { visitorId, path } = req.body || {};
  if (typeof visitorId !== 'string' || !visitorId || visitorId.length > 100) {
    return res.status(400).json({ error: 'Invalid visitor id' });
  }
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 200) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  // Attach a user id when we can, but a missing/expired token is fine — anonymous visits still count.
  let userId = null;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      userId = verifyToken(token).sub;
    } catch {
      // not logged in / expired — track anonymously
    }
  }

  await pool.query('INSERT INTO page_views (visitor_id, path, user_id) VALUES ($1, $2, $3)', [
    visitorId.slice(0, 100),
    path.slice(0, 200),
    userId,
  ]);
  res.status(204).end();
});

export default router;
