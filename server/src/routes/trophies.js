import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const SCOPES = new Set(['city', 'state', 'country', 'world']);

// Every 1st-place finish this driver has ever taken, across both race modes.
router.get('/mine', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id AS challenge_id, c.name AS challenge_name, c.mode, p.finished_at, p.points_awarded,
            p.top_speed_mps,
            (SELECT count(*) FROM challenge_participants p2 WHERE p2.challenge_id = c.id) AS participant_count
     FROM challenge_participants p JOIN challenges c ON c.id = p.challenge_id
     WHERE p.user_id = $1 AND p.rank = 1
     ORDER BY p.finished_at DESC`,
    [req.userId]
  );
  res.json({ wins: rows });
});

// The current record holders for the two things this app can actually measure: the quickest
// launch-to-lift roll-race run, and the highest top speed ever logged in one. Route races aren't
// eligible here — every route is a different, one-off distance, so comparing finish times across
// different challenges wouldn't mean anything.
router.get('/records', requireAuth, async (req, res) => {
  const scope = SCOPES.has(req.query.scope) ? req.query.scope : 'world';
  const value = req.query.value ? String(req.query.value) : null;
  if (scope !== 'world' && !value) {
    return res.status(400).json({ error: `value is required when scope=${scope}` });
  }
  const scopeFilter = scope === 'world' ? '' : `AND u.${scope} = $1`;
  const params = scope === 'world' ? [] : [value];

  const { rows: fastestRoll } = await pool.query(
    `SELECT u.nickname, c.name AS challenge_name, p.finished_at,
            EXTRACT(EPOCH FROM (p.finished_at - p.race_started_at)) AS elapsed_seconds
     FROM challenge_participants p
     JOIN challenges c ON c.id = p.challenge_id
     JOIN users u ON u.id = p.user_id
     WHERE c.mode = 'roll' AND p.finished_at IS NOT NULL AND p.race_started_at IS NOT NULL ${scopeFilter}
     ORDER BY (p.finished_at - p.race_started_at) ASC
     LIMIT 1`,
    params
  );

  const { rows: topSpeed } = await pool.query(
    `SELECT u.nickname, c.name AS challenge_name, p.finished_at, p.top_speed_mps
     FROM challenge_participants p
     JOIN challenges c ON c.id = p.challenge_id
     JOIN users u ON u.id = p.user_id
     WHERE c.mode = 'roll' AND p.top_speed_mps IS NOT NULL ${scopeFilter}
     ORDER BY p.top_speed_mps DESC
     LIMIT 1`,
    params
  );

  res.json({ scope, value, fastest_roll: fastestRoll[0] || null, top_speed: topSpeed[0] || null });
});

export default router;
