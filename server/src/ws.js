import { WebSocketServer } from 'ws';
import { verifyToken } from './middleware/auth.js';
import { pool } from './db.js';

// userId -> Set<WebSocket>
const clients = new Map();

export function initWs(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    const userId = payload.sub;
    const nickname = payload.nickname;
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(ws);

    // Snapshot of everyone currently online so a new client can render the map immediately.
    const { rows } = await pool.query(
      `SELECT ll.user_id AS id, u.nickname, ll.lat, ll.lng, ll.heading, ll.speed_mps, ll.updated_at
       FROM live_locations ll JOIN users u ON u.id = ll.user_id
       WHERE u.visible`
    );
    send(ws, 'presence:snapshot', rows);

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === 'location') {
        const lat = Number(msg.lat);
        const lng = Number(msg.lng);
        const heading = msg.heading == null ? null : Number(msg.heading);
        const speedMps = msg.speed == null ? null : Number(msg.speed);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        // Off the grid: don't track or broadcast position while the user has visibility off.
        const { rows: urows } = await pool.query('SELECT visible FROM users WHERE id = $1', [userId]);
        if (!urows[0]?.visible) return;

        await pool.query(
          `INSERT INTO live_locations (user_id, lat, lng, heading, speed_mps, updated_at)
           VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (user_id) DO UPDATE SET lat = $2, lng = $3, heading = $4, speed_mps = $5, updated_at = now()`,
          [userId, lat, lng, heading, Number.isFinite(speedMps) ? speedMps : null]
        );
        broadcast('presence:update', {
          id: userId,
          nickname,
          lat,
          lng,
          heading,
          speed_mps: Number.isFinite(speedMps) ? speedMps : null,
          updated_at: new Date().toISOString(),
        });
      }

      if (msg.type === 'chat') {
        const channel = typeof msg.channel === 'string' && msg.channel ? msg.channel.slice(0, 64) : 'global';
        const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 500) : '';
        if (!text) return;
        const { rows } = await pool.query(
          `INSERT INTO messages (sender_id, channel, text) VALUES ($1, $2, $3)
           RETURNING id, channel, text, created_at`,
          [userId, channel, text]
        );
        broadcast('chat:message', { ...rows[0], sender_id: userId, nickname });
      }
    });

    ws.on('close', async () => {
      const set = clients.get(userId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          clients.delete(userId);
          await pool.query('DELETE FROM live_locations WHERE user_id = $1', [userId]);
          broadcast('presence:leave', { id: userId });
        }
      }
    });
  });

  return wss;
}

function send(ws, type, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type, payload }));
}

export function broadcast(type, payload) {
  for (const set of clients.values()) {
    for (const ws of set) send(ws, type, payload);
  }
}

// Deliver only to specific users — e.g. an SOS alert should reach drivers within its radius,
// not everyone logged in everywhere.
export function broadcastTo(userIds, type, payload) {
  for (const userId of userIds) {
    const set = clients.get(userId);
    if (!set) continue;
    for (const ws of set) send(ws, type, payload);
  }
}
