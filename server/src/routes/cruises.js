import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { broadcast } from '../ws.js';

const router = Router();
const REVEAL_WINDOW_MS = 60 * 60 * 1000; // location + route reveal 1 hour before start
const MAX_ROUTE_POINTS = 50;

function isRevealed(startsAt) {
  return Date.parse(startsAt) - Date.now() <= REVEAL_WINDOW_MS;
}

// Strips the meetup location and route out of a cruise row unless it's revealed (starts within
// the hour) or the requester is the one who set the location in the first place. This happens
// server-side, not just in the UI, so the coordinates are never actually sent to a client that
// shouldn't have them yet — hiding it in the browser wouldn't be hiding it at all.
function shapeCruise(row, userId) {
  const revealed = isRevealed(row.starts_at) || row.creator_id === userId;
  const { meet_lat, meet_lng, route, ...rest } = row;
  return {
    ...rest,
    revealed,
    reveal_at: new Date(Date.parse(row.starts_at) - REVEAL_WINDOW_MS).toISOString(),
    meet_lat: revealed ? meet_lat : null,
    meet_lng: revealed ? meet_lng : null,
    route: revealed ? route : null,
  };
}

function validateRoute(route) {
  if (route == null) return null;
  if (!Array.isArray(route) || route.length > MAX_ROUTE_POINTS) return undefined; // undefined = invalid
  const cleaned = [];
  for (const p of route) {
    const lat = Number(p?.lat);
    const lng = Number(p?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    cleaned.push({ lat, lng });
  }
  return cleaned;
}

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.creator_id, u.nickname AS creator_nickname, c.name, c.description,
            c.meet_lat, c.meet_lng, c.route, c.starts_at, c.status, c.created_at,
            (SELECT count(*) FROM cruise_rsvps r WHERE r.cruise_id = c.id) AS rsvp_count,
            EXISTS(SELECT 1 FROM cruise_rsvps r WHERE r.cruise_id = c.id AND r.user_id = $1) AS my_rsvp
     FROM cruises c LEFT JOIN users u ON u.id = c.creator_id
     WHERE c.status = 'scheduled' AND c.starts_at > now() - interval '3 hours'
     ORDER BY c.starts_at ASC`,
    [req.userId]
  );
  res.json({ cruises: rows.map((r) => shapeCruise(r, req.userId)) });
});

router.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.creator_id, u.nickname AS creator_nickname, c.name, c.description,
            c.meet_lat, c.meet_lng, c.route, c.starts_at, c.status, c.created_at,
            (SELECT count(*) FROM cruise_rsvps r WHERE r.cruise_id = c.id) AS rsvp_count,
            EXISTS(SELECT 1 FROM cruise_rsvps r WHERE r.cruise_id = c.id AND r.user_id = $2) AS my_rsvp
     FROM cruises c LEFT JOIN users u ON u.id = c.creator_id WHERE c.id = $1`,
    [Number(req.params.id), req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Cruise not found' });
  res.json({ cruise: shapeCruise(rows[0], req.userId) });
});

router.post('/', requireAuth, async (req, res) => {
  const { name, description, meet_lat, meet_lng, starts_at, route } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
  const lat = Number(meet_lat);
  const lng = Number(meet_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'meet_lat and meet_lng are required numbers' });
  }
  const startsAtDate = new Date(starts_at);
  if (Number.isNaN(startsAtDate.getTime()) || startsAtDate.getTime() <= Date.now()) {
    return res.status(400).json({ error: 'starts_at must be a valid future date/time' });
  }
  const cleanedRoute = validateRoute(route);
  if (cleanedRoute === undefined) {
    return res.status(400).json({ error: `route must be an array of at most ${MAX_ROUTE_POINTS} {lat, lng} points` });
  }

  const { rows } = await pool.query(
    `INSERT INTO cruises (creator_id, name, description, meet_lat, meet_lng, route, starts_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, creator_id, name, description, meet_lat, meet_lng, route, starts_at, status, created_at`,
    [
      req.userId,
      String(name).slice(0, 80),
      description ? String(description).slice(0, 500) : null,
      lat,
      lng,
      cleanedRoute ? JSON.stringify(cleanedRoute) : null,
      startsAtDate,
    ]
  );
  const cruise = { ...rows[0], creator_nickname: req.nickname, rsvp_count: 0, my_rsvp: false };
  broadcast('cruise:new', { id: cruise.id });
  res.status(201).json({ cruise: shapeCruise(cruise, req.userId) });
});

router.post('/:id/rsvp', requireAuth, async (req, res) => {
  const cruiseId = Number(req.params.id);
  const going = Boolean(req.body?.going);
  const { rows } = await pool.query(`SELECT status FROM cruises WHERE id = $1`, [cruiseId]);
  if (!rows[0]) return res.status(404).json({ error: 'Cruise not found' });
  if (rows[0].status !== 'scheduled') return res.status(409).json({ error: 'This cruise is no longer scheduled' });

  if (going) {
    await pool.query(
      `INSERT INTO cruise_rsvps (cruise_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [cruiseId, req.userId]
    );
  } else {
    await pool.query(`DELETE FROM cruise_rsvps WHERE cruise_id = $1 AND user_id = $2`, [cruiseId, req.userId]);
  }

  broadcast('cruise:update', { id: cruiseId });
  res.json({ ok: true, going });
});

export default router;
