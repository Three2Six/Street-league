import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// No admin/role system exists yet — gated by a shared secret (ADMIN_KEY) instead. Fine for a
// solo-operator dashboard; would need real roles if more than one person needs access.
function requireAdminKey(req, res, next) {
  const key = req.query.key || req.headers['x-admin-key'];
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Invalid admin key' });
  }
  next();
}

router.get('/stats', requireAdminKey, async (req, res) => {
  const [signups, visitors, views, daily] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM users'),
    pool.query('SELECT COUNT(DISTINCT visitor_id)::int AS count FROM page_views'),
    pool.query('SELECT COUNT(*)::int AS count FROM page_views'),
    pool.query(`
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
             COUNT(DISTINCT visitor_id)::int AS visitors,
             COUNT(*)::int AS views
      FROM page_views
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 14
    `),
  ]);

  res.json({
    totalSignups: signups.rows[0].count,
    totalVisitors: visitors.rows[0].count,
    totalPageViews: views.rows[0].count,
    daily: daily.rows,
  });
});

export default router;
