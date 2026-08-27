import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { broadcast } from '../ws.js';

const router = Router();
const POINTS_BY_RANK = [100, 60, 30];
const POINTS_FOR_FINISHING = 10;
const PARTICIPANT_FIELDS = `p.user_id, u.nickname, p.joined_at, p.race_started_at, p.finished_at, p.top_speed_mps, p.time_source, p.points_awarded, p.rank`;
const MPH_TO_MPS = 0.44704;

async function isVisible(userId) {
  const { rows } = await pool.query('SELECT visible FROM users WHERE id = $1', [userId]);
  return Boolean(rows[0]?.visible);
}

const PARTICIPANTS_SUBQUERY = `
  COALESCE(
    (SELECT json_agg(json_build_object(
       'user_id', p.user_id, 'nickname', pu.nickname, 'joined_at', p.joined_at,
       'race_started_at', p.race_started_at, 'finished_at', p.finished_at,
       'top_speed_mps', p.top_speed_mps, 'time_source', p.time_source, 'points_awarded', p.points_awarded,
       'rank', p.rank
     ) ORDER BY p.finished_at ASC NULLS LAST, p.joined_at ASC)
     FROM challenge_participants p JOIN users pu ON pu.id = p.user_id
     WHERE p.challenge_id = c.id),
    '[]'
  ) AS participants`;

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, u.nickname AS creator_nickname,
            (SELECT count(*) FROM challenge_participants p WHERE p.challenge_id = c.id) AS participant_count,
            ${PARTICIPANTS_SUBQUERY}
     FROM challenges c LEFT JOIN users u ON u.id = c.creator_id
     WHERE c.status IN ('open', 'active')
     ORDER BY c.created_at DESC`
  );
  res.json({ challenges: rows });
});

// Finished races vanish from the open/active list the instant they score — this is the only
// place a final podium (medals, times, top speeds) is actually visible, so bragging rights have
// somewhere to live beyond the winner-only trophy case.
router.get('/finished', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, u.nickname AS creator_nickname,
            (SELECT count(*) FROM challenge_participants p WHERE p.challenge_id = c.id) AS participant_count,
            ${PARTICIPANTS_SUBQUERY}
     FROM challenges c LEFT JOIN users u ON u.id = c.creator_id
     WHERE c.status = 'finished' AND c.finished_at > now() - interval '24 hours'
     ORDER BY c.finished_at DESC
     LIMIT 20`
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
  if (!(await isVisible(req.userId))) {
    return res.status(403).json({ error: "You're off the grid — turn visibility on to join a race" });
  }
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

// Manual finish — used by route races' "I finished!" button, and as a roll-race fallback if a
// participant's phone doesn't catch its own lift-off. A roll racer can optionally attach a
// self-reported elapsed time + top speed here too (e.g. read off a Draggy/RaceBox display) —
// self-reported, not device-verified, but still more accurate than phone GPS when it's right.
router.post('/:id/finish', requireAuth, async (req, res) => {
  const challengeId = Number(req.params.id);
  const elapsedSeconds = req.body?.elapsedSeconds != null ? Number(req.body.elapsedSeconds) : null;
  const topSpeedMph = req.body?.topSpeedMph != null ? Number(req.body.topSpeedMph) : null;
  if (elapsedSeconds != null && (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0 || elapsedSeconds > 300)) {
    return res.status(400).json({ error: 'elapsedSeconds must be a positive number of seconds (300 max)' });
  }
  if (topSpeedMph != null && (!Number.isFinite(topSpeedMph) || topSpeedMph < 0 || topSpeedMph > 300)) {
    return res.status(400).json({ error: 'topSpeedMph must be a realistic non-negative number' });
  }

  const { rows } = await pool.query(`SELECT status FROM challenges WHERE id = $1`, [challengeId]);
  if (!rows[0]) return res.status(404).json({ error: 'Challenge not found' });
  if (rows[0].status !== 'active') return res.status(409).json({ error: 'Challenge is not active' });

  const now = new Date();
  const topSpeedMps = topSpeedMph != null ? topSpeedMph * MPH_TO_MPS : null;
  const updated =
    elapsedSeconds != null
      ? await pool.query(
          `UPDATE challenge_participants
           SET finished_at = $4, race_started_at = $3, time_source = 'manual',
               top_speed_mps = GREATEST(top_speed_mps, $5::double precision)
           WHERE challenge_id = $1 AND user_id = $2 AND finished_at IS NULL
           RETURNING user_id`,
          [challengeId, req.userId, new Date(now.getTime() - elapsedSeconds * 1000), now, topSpeedMps]
        )
      : await pool.query(
          `UPDATE challenge_participants SET finished_at = $3
           WHERE challenge_id = $1 AND user_id = $2 AND finished_at IS NULL
           RETURNING user_id`,
          [challengeId, req.userId, now]
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
  if (!(await isVisible(req.userId))) {
    return res.status(403).json({ error: "You're off the grid — turn visibility on to race" });
  }
  const { rows } = await pool.query(`SELECT status, mode FROM challenges WHERE id = $1`, [challengeId]);
  if (!rows[0]) return res.status(404).json({ error: 'Challenge not found' });
  if (rows[0].mode !== 'roll') return res.status(409).json({ error: 'Not a roll race' });
  if (rows[0].status !== 'active') return res.status(409).json({ error: 'Challenge is not active' });

  const updated = await pool.query(
    `UPDATE challenge_participants
     SET race_started_at = now(), top_speed_mps = GREATEST(top_speed_mps, $3::double precision)
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
     SET finished_at = now(), top_speed_mps = GREATEST(top_speed_mps, $3::double precision)
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

// Once every joined participant has a result (finished_at set — whether from an auto-detected
// lift, a manual "log your time", or a plain manual finish), a roll race scores itself, so
// nobody has to touch their phone mid-race to close it out. Deliberately waits for everyone who
// joined, not just everyone currently mid-run: someone who plans to self-report a time (e.g. off
// a Draggy) may not have a race_started_at at all yet, and closing the race the moment the first
// GPS-based finish lands would cut them off before they get the chance. The trade-off is that a
// genuine no-show blocks auto-finish until the creator taps "End & score" — an acceptable manual
// override for a rare case, versus routinely finishing races too early for a common one.
// Returns the finished challenge, or null if it didn't fire.
async function maybeAutoFinishRollChallenge(challengeId) {
  const { rows } = await pool.query(`SELECT status, mode FROM challenges WHERE id = $1`, [challengeId]);
  const c = rows[0];
  if (!c || c.mode !== 'roll' || c.status !== 'active') return null;

  const { rows: counts } = await pool.query(
    `SELECT count(*) AS total, count(*) FILTER (WHERE finished_at IS NOT NULL) AS finished
     FROM challenge_participants WHERE challenge_id = $1`,
    [challengeId]
  );
  const total = Number(counts[0].total);
  const finished = Number(counts[0].finished);
  if (total === 0 || finished < total) return null;

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
    const rank = i + 1;
    await pool.query(
      `UPDATE challenge_participants SET points_awarded = $1, rank = $2 WHERE challenge_id = $3 AND user_id = $4`,
      [points, rank, challengeId, finishers[i].user_id]
    );
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
