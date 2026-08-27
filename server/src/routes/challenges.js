import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { broadcast } from '../ws.js';

const router = Router();
const POINTS_BY_RANK = [100, 60, 30];
const POINTS_FOR_FINISHING = 10;

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, u.nickname AS creator_nickname,
            (SELECT count(*) FROM challenge_participants p WHERE p.challenge_id = c.id) AS participant_count,
            COALESCE(
              (SELECT json_agg(json_build_object(
                 'user_id', p.user_id, 'nickname', pu.nickname,
                 'joined_at', p.joined_at, 'finished_at', p.finished_at, 'points_awarded', p.points_awarded
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
  const { name, start_lat, start_lng, end_lat, end_lng } = req.body || {};
  const coords = [start_lat, start_lng, end_lat, end_lng].map(Number);
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
  if (coords.some((n) => !Number.isFinite(n))) {
    return res.status(400).json({ error: 'start_lat, start_lng, end_lat, end_lng are required numbers' });
  }

  const { rows } = await pool.query(
    `INSERT INTO challenges (creator_id, name, start_lat, start_lng, end_lat, end_lng)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.userId, String(name).slice(0, 80), ...coords]
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
  res.json({ challenge });
});

router.post('/:id/end', requireAuth, async (req, res) => {
  const challengeId = Number(req.params.id);
  const { rows } = await pool.query(`SELECT creator_id, status FROM challenges WHERE id = $1`, [challengeId]);
  if (!rows[0]) return res.status(404).json({ error: 'Challenge not found' });
  if (rows[0].creator_id !== req.userId) return res.status(403).json({ error: 'Only the creator can end this challenge' });
  if (rows[0].status !== 'active') return res.status(409).json({ error: 'Challenge is not active' });

  const { rows: finishers } = await pool.query(
    `SELECT p.user_id, u.nickname, p.finished_at
     FROM challenge_participants p JOIN users u ON u.id = p.user_id
     WHERE p.challenge_id = $1 AND p.finished_at IS NOT NULL
     ORDER BY p.finished_at ASC`,
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
  const challenge = await fetchChallengeWithParticipants(challengeId);
  broadcast('challenge:finished', challenge);
  res.json({ challenge });
});

async function fetchChallengeWithParticipants(challengeId) {
  const { rows } = await pool.query(
    `SELECT c.*, u.nickname AS creator_nickname FROM challenges c
     LEFT JOIN users u ON u.id = c.creator_id WHERE c.id = $1`,
    [challengeId]
  );
  const challenge = rows[0];
  if (!challenge) return null;

  const { rows: participants } = await pool.query(
    `SELECT p.user_id, u.nickname, p.joined_at, p.finished_at, p.points_awarded
     FROM challenge_participants p JOIN users u ON u.id = p.user_id
     WHERE p.challenge_id = $1
     ORDER BY p.finished_at ASC NULLS LAST, p.joined_at ASC`,
    [challengeId]
  );
  challenge.participants = participants;
  return challenge;
}

export default router;
