import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { initSchema } from './db.js';
import { initWs } from './ws.js';
import authRoutes from './routes/auth.js';
import reportsRoutes from './routes/reports.js';
import challengesRoutes from './routes/challenges.js';
import leaderboardRoutes from './routes/leaderboard.js';
import messagesRoutes from './routes/messages.js';
import sosRoutes from './routes/sos.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/challenges', challengesRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/sos', sosRoutes);

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
