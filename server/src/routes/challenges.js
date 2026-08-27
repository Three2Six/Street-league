import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { broadcast } from '../ws.js';

const router = Router();
const POINTS_BY_RANK = [100, 60, 30];
const POINTS_FOR_FINISHING = 10;
const PARTICIPANT_FIELDS = `p.user_id, u.nickname, p.joined_at, p.race_started_at, p.finished_at, p.top_speed_mps, p.points_awarded`;

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, u.nickname AS creator_nickname,
            (SELECT count(*) FROM challenge_participants p WHERE p.challenge_id = c.id) AS participant_count,
            COALESCE(
              (SELECT json_agg(json_build_object(
                 'user_id', p.user_id, 'nickname', pu.nickname, 'joined_at', p.joined_at,
                 'race_started_at', p.race_started_at, 'finished_at', p.finished_at,
                 'top_speed_mps', p.top_speed_mps, 'points_awarded', p.points_awarded
               ) ORDER BY p.finished_at ASC NULLS LAST, p.joined_at ASC)
               FROM challenge_participants p JOIN users pu ON pu.id = p.user_id
               WHERE p.challenge_id = c.id),
              '[]'
            ) AS participants
     FROM challenges c LEFT JOIN users u ON u.id = c.creator_id
     WHERE c.status IN ('open', 'active')
     ORDER BY c.created_at DESC`
  );
  res.json({ challenges: rows });
});

router.get('/:id', requireAuth, async (req, res) => {
  const challenge = await fetchChallengeWithParticipants(Number(req.params.id));
  if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
  res.json({ challenge });
});

router.post('/', requireAuth, async (req, res) => {
  const { name, mode, start_lat, start_lng, end_lat, end_lng } = req.body || {};
  const challengeMode = mode === 'roll' ? 'roll' : 'route';
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });

  let coords = [null, null, null, null];
  if (challengeMode === 'route') {
    coords = [start_lat, start_lng, end_lat, end_lng].map(Number);
    if (coords.some((n) => !Number.isFinite(n))) {
      return res.status(400).json({ error: 'start_lat, start_lng, end_lat, end_lng are required numbers for a route race' });
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO challenges (creator_id, name, mode, start_lat, start_lng, end_lat, end_lng)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [req.userId, String(name).slice(0, 80), challengeMode, ...coords]
  );
  const challenge = await fetchChallengeWithParticipants(rows[0].id);
  broadcast('challenge:new', challenge);
  res.status(201).json({ challenge });
});

router.post('/:id/join', requireAuth, async (req, res) => {
  const challengeId = Number(req.params.id);
  const { rows } = await pool.query(`SELECT status FROM challenges WHERE id = $1`, [challengeId]);
  if (!rows[0]) return res.status(404).json({ error: 'Challenge not found' });
  if (rows[0].status !== 'open') return res.status(409).json({ error: 'Challenge already started or finished' });

  await pool.query(
    `INSERT INTO challenge_participants (challenge_id, user_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [challengeId, req.userId]
  );
  const challenge = await fetchChallengeWithParticipants(challengeId);
  broadcast('challenge:update', challenge);
  res.json({ challenge });
});

router.post('/:id/start', requireAuth, async (req, res) => {
  const challengeId = Number(req.params.id);
  const { rows } = await pool.query(`SELECT creator_id, status FROM challenges WHERE id = $1`, [challengeId]);
  if (!rows[0]) return res.status(404).json({ error: 'Challenge not found' });
  if (rows[0].creator_id !== req.userId) return res.status(403).json({ error: 'Only the creator can start this challenge' });
  if (rows[0].status !== 'open') return res.status(409).json({ error: 'Challenge already started or finished' });

  await pool.query(`UPDATE challenges SET status = 'active', started_at = now() WHERE id = $1`, [challengeId]);
  const challenge = await fetchChallengeWithParticipants(challengeId);
  broadcast('challenge:update', challenge);
  res.json({ challenge });
});

// Manual finish — used by route races' "I finished!" button, and as a roll-race fallback
// if a participant's phone doesn't catch its own lift-off.
router.post('/:id/finish', requireAuth, async (req, res) => {
  const challengeId = Number(req.params.id);
  const { rows } = await pool.query(`SELECT status FROM challenges WHERE id = $1`, [challengeId]);
  if (!rows[0]) return res.status(404).json({ error: 'Challenge not found' });
  if (rows[0].status !== 'active') return res.status(409).json({ error: 'Challenge is not active' });

  const updated = await pool.query(
    `UPDATE challenge_participants SET finished_at = now()
     WHERE challenge_id = $1 AND user_id = $2 AND finished_at IS NULL
     RETURNING user_id`,
    [challengeId, req.userId]
  );
  if (!updated.rows[0]) return res.status(409).json({ error: 'Not a participant, or already finished' });

  const challenge = await fetchChallengeWithParticipants(challengeId);
  broadcast('challenge:update', challenge);
  const finished = await maybeAutoFinishRollChallenge(challengeId);
  res.json({ challenge: finished || challenge });
});

// Roll race: a participant's own phone detected a hard launch (GPS speed spiking up).
router.post('/:id/launch', requireAuth, async (req, res) => {
  const challengeId = Number(req.params.id);
  const speed = Number(req.body?.speed);
  const { rows } = await pool.query(`SELECT status, mode FROM challenges WHERE id = $1`, [challengeId]);
  if (!rows[0]) return res.status(404).json({ error: 'Challenge not found' });
  if (rows[0].mode !== 'roll') return res.status(409).json({ error: 'Not a roll race' });
  if (rows[0].status !== 'active') return res.status(409).json({ error: 'Challenge is not active' });

  const updated = await pool.query(
    `UPDATE challenge_participants
     SET race_started_at = now(), top_speed_mps = GREATEST(COALESCE(top_speed_mps, 0), COALESCE($3, 0))
     WHERE challenge_id = $1 AND user_id = $2 AND race_started_at IS NULL
     RETURNING user_id`,
    [challengeId, req.userId, Number.isFinite(speed) ? speed : null]
  );
  if (!updated.rows[0]) return res.status(409).json({ error: 'Not a participant, or already launched' });

  const challenge = await fetchChallengeWithParticipants(challengeId);
  broadcast('challenge:update', challenge);
  res.json({ challenge });
});

// Roll race: a participant's own phone detected a hard lift-off (GPS speed dropping fast) — their run is over.
router.post('/:id/lift', requireAuth, async (req, res) => {
  const challengeId = Number(req.params.id);
  const topSpeed = Number(req.body?.topSpeed);
  const { rows } = await pool.query(`SELECT status, mode FROM challenges WHERE id = $1`, [challengeId]);
  if (!rows[0]) return res.status(404).json({ error: 'Challenge not found' });
  if (rows[0].mode !== 'roll') return res.status(409).json({ error: 'Not a roll race' });
  if (rows[0].status !== 'active') return res.status(409).json({ error: 'Challenge is not active' });

  const updated = await pool.query(
    `UPDATE challenge_participants
     SET finished_at = now(), top_speed_mps = GREATEST(COALESCE(top_speed_mps, 0), COALESCE($3, 0))
     WHERE challenge_id = $1 AND user_id = $2 AND race_started_at IS NOT NULL AND finished_at IS NULL
     RETURNING user_id`,
    [challengeId, req.userId, Number.isFinite(topSpeed) ? topSpeed : null]
  );
  if (!updated.rows[0]) return res.status(409).json({ error: 'Not racing, or already finished' });

  const challenge = await fetchChallengeWithParticipants(challengeId);
  broadcast('challenge:update', challenge);
  const finished = await maybeAutoFinishRollChallenge(challengeId);
  res.json({ challenge: finished || challenge });
});

router.post('/:id/end', requireAuth, async (req, res) => {
  const challengeId = Number(req.params.id);
  const { rows } = await pool.query(`SELECT creator_id, status FROM challenges WHERE id = $1`, [challengeId]);
  if (!rows[0]) return res.status(404).json({ error: 'Challenge not found' });
  if (rows[0].creator_id !== req.userId) return res.status(403).json({ error: 'Only the creator can end this challenge' });
  if (rows[0].status !== 'active') return res.status(409).json({ error: 'Challenge is not active' });

  const challenge = await scoreAndFinishChallenge(challengeId);
  broadcast('challenge:finished', challenge);
  res.json({ challenge });
});

// Once nobody is still mid-run (everyone who launched has also lifted, and at least one
// finisher exists), a roll race scores itself — nobody should have to touch their phone
// while driving to close it out. Returns the finished challenge, or null if it didn't fire.
async function maybeAutoFinishRollChallenge(challengeId) {
  const { rows } = await pool.query(`SELECT status, mode FROM challenges WHERE id = $1`, [challengeId]);
  const c = rows[0];
  if (!c || c.mode !== 'roll' || c.status !== 'active') return null;

  const { rows: counts } = await pool.query(
    `SELECT
       count(*) FILTER (WHERE race_started_at IS NOT NULL AND finished_at IS NULL) AS still_racing,
       count(*) FILTER (WHERE finished_at IS NOT NULL) AS finished
     FROM challenge_participants WHERE challenge_id = $1`,
    [challengeId]
  );
  if (Number(counts[0].still_racing) > 0 || Number(counts[0].finished) === 0) return null;

  const challenge = await scoreAndFinishChallenge(challengeId);
  broadcast('challenge:finished', challenge);
  return challenge;
}

// Ranks finishers, pays out points, and marks the challenge finished. Route races rank by
// absolute finish time (everyone started together); roll races rank by each participant's
// own launch-to-lift elapsed time (their reaction/run time), since launches aren't synced.
async function scoreAndFinishChallenge(challengeId) {
  const { rows: challengeRows } = await pool.query(`SELECT mode FROM challenges WHERE id = $1`, [challengeId]);
  const mode = challengeRows[0]?.mode;

  const orderBy = mode === 'roll' ? '(p.finished_at - p.race_started_at) ASC' : 'p.finished_at ASC';
  const whereExtra = mode === 'roll' ? 'AND p.race_started_at IS NOT NULL' : '';
  const { rows: finishers } = await pool.query(
    `SELECT p.user_id, u.nickname, p.finished_at
     FROM challenge_participants p JOIN users u ON u.id = p.user_id
     WHERE p.challenge_id = $1 AND p.finished_at IS NOT NULL ${whereExtra}
     ORDER BY ${orderBy}`,
    [challengeId]
  );

  for (let i = 0; i < finishers.length; i++) {
    const points = POINTS_BY_RANK[i] ?? POINTS_FOR_FINISHING;
    await pool.query(`UPDATE challenge_participants SET points_awarded = $1 WHERE challenge_id = $2 AND user_id = $3`, [
      points,
      challengeId,
      finishers[i].user_id,
    ]);
    await pool.query(`UPDATE users SET points = points + $1 WHERE id = $2`, [points, finishers[i].user_id]);
  }

  await pool.query(`UPDATE challenges SET status = 'finished', finished_at = now() WHERE id = $1`, [challengeId]);
  return fetchChallengeWithParticipants(challengeId);
}

async function fetchChallengeWithParticipants(challengeId) {
  const { rows } = await pool.query(
    `SELECT c.*, u.nickname AS creator_nickname FROM challenges c
     LEFT JOIN users u ON u.id = c.creator_id WHERE c.id = $1`,
    [challengeId]
  );
  const challenge = rows[0];
  if (!challenge) return null;

  const { rows: participants } = await pool.query(
    `SELECT ${PARTICIPANT_FIELDS}
     FROM challenge_participants p JOIN users u ON u.id = p.user_id
     WHERE p.challenge_id = $1
     ORDER BY p.finished_at ASC NULLS LAST, p.joined_at ASC`,
    [challengeId]
  );
  challenge.participants = participants;
  return challenge;
}

export default router;
