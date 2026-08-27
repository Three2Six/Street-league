import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { broadcast, broadcastTo } from '../ws.js';
import { distanceMeters } from '../utils/geo.js';

const router = Router();
const RADIUS_METERS = 10 * 1609.344; // 10 miles
const LIFETIME_MINUTES = 60;

// SOS is a rare, urgent action, not something to accidentally spam — a generous cap is enough
// to stop misuse without getting in the way of someone who genuinely needs help twice in an hour.
const sosLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.id, s.lat, s.lng, s.message, s.created_at, s.expires_at, s.user_id, u.nickname
     FROM sos_alerts s JOIN users u ON u.id = s.user_id
     WHERE s.status = 'active' AND s.expires_at > now()
     ORDER BY s.created_at DESC`
  );
  res.json({ alerts: rows });
});

router.post('/', requireAuth, sosLimiter, async (req, res) => {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const message = req.body?.message ? String(req.body.message).slice(0, 200) : null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng are required numbers' });
  }

  const { rows: existing } = await pool.query(
    `SELECT s.id, s.lat, s.lng, s.message, s.created_at, s.expires_at, s.user_id, u.nickname
     FROM sos_alerts s JOIN users u ON u.id = s.user_id
     WHERE s.user_id = $1 AND s.status = 'active' AND s.expires_at > now()`,
    [req.userId]
  );
  if (existing[0]) return res.json({ alert: existing[0], notified: null, alreadyActive: true });

  const { rows } = await pool.query(
    `INSERT INTO sos_alerts (user_id, lat, lng, message, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '${LIFETIME_MINUTES} minutes')
     RETURNING id, lat, lng, message, created_at, expires_at, user_id`,
    [req.userId, lat, lng, message]
  );
  const alert = { ...rows[0], nickname: req.nickname };

  const { rows: nearby } = await pool.query(
    `SELECT ll.user_id AS id, ll.lat, ll.lng
     FROM live_locations ll JOIN users u ON u.id = ll.user_id
     WHERE u.visible AND ll.user_id != $1`,
    [req.userId]
  );
  const recipientIds = nearby
    .filter((u) => distanceMeters(lat, lng, u.lat, u.lng) <= RADIUS_METERS)
    .map((u) => u.id);

  broadcastTo(recipientIds, 'sos:new', alert);
  res.status(201).json({ alert, notified: recipientIds.length, alreadyActive: false });
});

router.post('/:id/resolve', requireAuth, async (req, res) => {
  const alertId = Number(req.params.id);
  const { rows } = await pool.query(
    `UPDATE sos_alerts SET status = 'resolved', resolved_at = now()
     WHERE id = $1 AND user_id = $2 AND status = 'active'
     RETURNING id`,
    [alertId, req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Active SOS not found' });

  broadcast('sos:resolved', { id: alertId });
  res.json({ ok: true });
});

// Safety net in case someone never comes back to resolve their own alert.
setInterval(async () => {
  const { rows } = await pool.query(
    `UPDATE sos_alerts SET status = 'resolved', resolved_at = now()
     WHERE status = 'active' AND expires_at <= now()
     RETURNING id`
  );
  for (const row of rows) broadcast('sos:resolved', { id: row.id });
}, 60_000);

export default router;
