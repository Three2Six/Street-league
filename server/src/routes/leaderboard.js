import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const SCOPES = new Set(['city', 'state', 'country', 'world']);

router.get('/', requireAuth, async (req, res) => {
  const scope = SCOPES.has(req.query.scope) ? req.query.scope : 'world';
  const value = req.query.value ? String(req.query.value) : null;

  let query = `SELECT id, nickname, points, city, state, country FROM users`;
  const params = [];
  if (scope !== 'world') {
    if (!value) return res.status(400).json({ error: `value is required when scope=${scope}` });
    params.push(value);
    query += ` WHERE ${scope} = $1`;
  }
  query += ` ORDER BY points DESC, nickname ASC LIMIT 100`;

  const { rows } = await pool.query(query, params);
  res.json({ scope, value, leaderboard: rows });
});

export default router;
