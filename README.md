# Street League

A Waze-style social app for car enthusiasts. Sign up with a nickname, see
other drivers nearby on a live map, report cops/construction/debris along
the way, race friends in timed challenges, climb a city → state → country →
world scoreboard, and talk trash (or just talk) in chat.

## MVP scope

- **Accounts** — sign up with a nickname, email, password (JWT auth).
- **Live map** — see other online users near you in real time (WebSocket).
  Uses the browser's GPS via the Geolocation API; if that's unavailable
  (or denied), you can click the map to drop your position manually — handy
  for testing without real GPS.
- **Reports** — drop a pin for a cop, construction, debris, or crash; other
  users nearby see it appear live and can confirm it's still there. Reports
  expire automatically.
- **Challenges** — create a point-to-point race, other users join, everyone
  hits "Finish" when they cross the line, and the server ranks finish times
  and awards points (1st/2nd/3rd).
- **Scoreboard** — leaderboard by points, filterable by city, state,
  country, or worldwide.
- **Chat** — a global channel plus one auto-joined channel per city, so
  local drivers can coordinate.

**Not built yet:** native mobile apps (this MVP is a responsive web app),
push notifications, voice callouts, friends/follow graph, moderation tooling
for reports/chat.

## Stack

- **server/** — Express + Postgres (`pg`), JWT auth, a `ws` WebSocket hub
  for live locations/reports/chat/challenges.
- **client/** — React (Vite) SPA, Leaflet map, proxies `/api` and `/ws` to
  the server in dev.

## Setup

### 1. Database (Postgres)

Set `DATABASE_URL` (see `server/.env.example`) to any Postgres connection
string. The server creates all tables automatically on startup
(`initSchema()` in `server/src/db.js`) — no separate migration step.

### 2. Server

```bash
cd server
cp .env.example .env   # fill in DATABASE_URL and JWT_SECRET
npm install
npm run dev             # http://localhost:4000
```

### 3. Client

```bash
cd client
npm install
npm run dev              # http://localhost:5173
```

Open two browser windows (or one normal + one incognito) and sign up as two
different nicknames to see live positions, reports, and chat sync between
them.

## How live location works

Each client sends `{type: "location", lat, lng}` over the WebSocket every
few seconds (from `navigator.geolocation.watchPosition`, or a manual map
click if geolocation isn't available). The server keeps the latest position
per user in Postgres and re-broadcasts everyone's positions to every
connected client a few times a second. There's no geofencing/radius limit
in the MVP — "nearby" is approximated by city for chat and leaderboard
scoping, and the map itself naturally only shows what's in view.

## Points

- Finishing a challenge: 1st = 100 pts, 2nd = 60 pts, 3rd = 30 pts, others
  who finish = 10 pts.
- Reports and confirmations don't award points in the MVP (kept simple to
  avoid a griefing incentive); that's a natural Phase 2 addition once basic
  report-quality signals exist.
