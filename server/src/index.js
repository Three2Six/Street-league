import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSchema } from './db.js';
import { initWs } from './ws.js';
import authRoutes from './routes/auth.js';
import reportsRoutes from './routes/reports.js';
import challengesRoutes from './routes/challenges.js';
import leaderboardRoutes from './routes/leaderboard.js';
import messagesRoutes from './routes/messages.js';
import sosRoutes from './routes/sos.js';
import cruisesRoutes from './routes/cruises.js';
import trophiesRoutes from './routes/trophies.js';
import billingRoutes, { stripeWebhook } from './routes/billing.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));

// Mounted before express.json(): Stripe's signature check needs the exact raw request bytes,
// which body-parsing would otherwise consume.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/challenges', challengesRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/cruises', cruisesRoutes);
app.use('/api/trophies', trophiesRoutes);

// Serve the built client (client/dist) so a single service can host both the API and the app —
// the client already calls /api and /ws with relative, same-origin paths, so no separate static
// host or CORS setup is needed in production. No-ops harmlessly in dev, where dist/ doesn't exist
// and the client is served by Vite on its own port instead.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => err && next(err));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
initWs(server);

const port = process.env.PORT || 4000;
initSchema()
  .then(() => {
    server.listen(port, () => console.log(`Street League server listening on :${port}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database schema', err);
    process.exit(1);
  });
