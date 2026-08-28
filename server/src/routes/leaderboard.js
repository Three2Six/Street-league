import { Router } from 'express';
import { pool } from '../db.js';
import { requireActive as requireAuth } from '../middleware/auth.js';

const router = Router();
const SCOPES = new Set(['city', 'state', 'country', 'world']);

router.get('/', requireAuth, async (req, res) => {
  const scope = SCOPES.has(req.query.scope) ? req.query.scope : 'world';
  const value = req.query.value ? String(req.query.value) : null;

  let query = `
    SELECT u.id, u.nickname, u.points, u.city, u.state, u.country,
           (SELECT count(*) FROM challenge_participants p WHERE p.user_id = u.id AND p.rank = 1) AS wins
    FROM users u`;
  const params = [];
  if (scope !== 'world') {
    if (!value) return res.status(400).json({ error: `value is required when scope=${scope}` });
    params.push(value);
    query += ` WHERE u.${scope} = $1`;
  }
  query += ` ORDER BY u.points DESC, u.nickname ASC LIMIT 100`;

  const { rows } = await pool.query(query, params);
  res.json({ scope, value, leaderboard: rows });
});

export default router;
