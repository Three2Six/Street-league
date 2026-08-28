import { Router } from 'express';
import { pool } from '../db.js';
import { requireActive as requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const channel = req.query.channel ? String(req.query.channel).slice(0, 64) : 'global';
  const { rows } = await pool.query(
    `SELECT m.id, m.channel, m.text, m.created_at, m.sender_id, u.nickname
     FROM messages m LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.channel = $1
     ORDER BY m.created_at DESC LIMIT 50`,
    [channel]
  );
  res.json({ channel, messages: rows.reverse() });
});

export default router;
