import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { broadcast } from '../ws.js';

const router = Router();
const TYPES = new Set(['cop', 'construction', 'debris', 'crash', 'hazard']);
const LIFETIME_MINUTES = 120;
const CONFIRM_EXTENSION_MINUTES = 30;

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.type, r.lat, r.lng, r.description, r.confirms, r.created_at, r.expires_at,
            u.nickname AS reported_by
     FROM reports r LEFT JOIN users u ON u.id = r.user_id
     WHERE r.expires_at > now()
     ORDER BY r.created_at DESC`
  );
  res.json({ reports: rows });
});

router.post('/', requireAuth, async (req, res) => {
  const { type, lat, lng, description } = req.body || {};
  if (!TYPES.has(type)) return res.status(400).json({ error: `type must be one of ${[...TYPES].join(', ')}` });
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return res.status(400).json({ error: 'lat and lng are required numbers' });
  }

  const { rows } = await pool.query(
    `INSERT INTO reports (user_id, type, lat, lng, description, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + interval '${LIFETIME_MINUTES} minutes')
     RETURNING id, type, lat, lng, description, confirms, created_at, expires_at`,
    [req.userId, type, latNum, lngNum, description ? String(description).slice(0, 280) : null]
  );
  const report = { ...rows[0], reported_by: req.nickname };
  broadcast('report:new', report);
  res.status(201).json({ report });
});

router.post('/:id/confirm', requireAuth, async (req, res) => {
  const reportId = Number(req.params.id);
  try {
    await pool.query(
      `INSERT INTO report_confirmations (report_id, user_id) VALUES ($1, $2)`,
      [reportId, req.userId]
    );
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Already confirmed' });
    if (err.code === '23503') return res.status(404).json({ error: 'Report not found' });
    throw err;
  }

  const { rows } = await pool.query(
    `UPDATE reports SET confirms = confirms + 1,
       expires_at = expires_at + interval '${CONFIRM_EXTENSION_MINUTES} minutes'
     WHERE id = $1
     RETURNING id, confirms, expires_at`,
    [reportId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Report not found' });
  broadcast('report:confirmed', rows[0]);
  res.json({ report: rows[0] });
});

// Periodic sweep of expired reports so every client's map stays in sync.
setInterval(async () => {
  const { rows } = await pool.query(`DELETE FROM reports WHERE expires_at <= now() RETURNING id`);
  for (const row of rows) broadcast('report:removed', { id: row.id });
}, 60_000);

export default router;
