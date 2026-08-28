import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render's managed Postgres requires SSL; rejectUnauthorized:false matches its self-signed chain.
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      nickname TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      city TEXT,
      state TEXT,
      country TEXT,
      points INTEGER NOT NULL DEFAULT 0,
      visible BOOLEAN NOT NULL DEFAULT true,
      avatar TEXT NOT NULL DEFAULT '🚗',
      trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '3 days'),
      paid_at TIMESTAMPTZ,
      stripe_customer_id TEXT,
      agreed_to_terms_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS live_locations (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      heading DOUBLE PRECISION,
      speed_mps DOUBLE PRECISION,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK (type IN ('cop', 'construction', 'debris', 'crash', 'hazard')),
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      description TEXT,
      confirms INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS report_confirmations (
      report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (report_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'route' CHECK (mode IN ('route', 'roll')),
      start_lat DOUBLE PRECISION,
      start_lng DOUBLE PRECISION,
      end_lat DOUBLE PRECISION,
      end_lng DOUBLE PRECISION,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'active', 'finished', 'cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS challenge_participants (
      challenge_id INTEGER REFERENCES challenges(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      race_started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      top_speed_mps DOUBLE PRECISION,
      time_source TEXT NOT NULL DEFAULT 'gps' CHECK (time_source IN ('gps', 'manual')),
      points_awarded INTEGER NOT NULL DEFAULT 0,
      rank INTEGER,
      PRIMARY KEY (challenge_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      channel TEXT NOT NULL DEFAULT 'global',
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sos_alerts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cruises (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT,
      meet_lat DOUBLE PRECISION NOT NULL,
      meet_lng DOUBLE PRECISION NOT NULL,
      route JSONB,
      starts_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS cruise_rsvps (
      cruise_id INTEGER REFERENCES cruises(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (cruise_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS page_views (
      id SERIAL PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      path TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_reports_expires_at ON reports (expires_at);
    CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages (channel, created_at);
    CREATE INDEX IF NOT EXISTS idx_users_points ON users (points DESC);
    CREATE INDEX IF NOT EXISTS idx_sos_status ON sos_alerts (status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_cruises_starts_at ON cruises (starts_at);
    CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views (created_at);
    CREATE INDEX IF NOT EXISTS idx_page_views_visitor ON page_views (visitor_id);
  `);

  // Additive migrations for tables that may already exist from before roll races were added.
  await pool.query(`
    ALTER TABLE live_locations ADD COLUMN IF NOT EXISTS speed_mps DOUBLE PRECISION;
    ALTER TABLE challenges ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'route';
    ALTER TABLE challenges ALTER COLUMN start_lat DROP NOT NULL;
    ALTER TABLE challenges ALTER COLUMN start_lng DROP NOT NULL;
    ALTER TABLE challenges ALTER COLUMN end_lat DROP NOT NULL;
    ALTER TABLE challenges ALTER COLUMN end_lng DROP NOT NULL;
    ALTER TABLE challenge_participants ADD COLUMN IF NOT EXISTS race_started_at TIMESTAMPTZ;
    ALTER TABLE challenge_participants ADD COLUMN IF NOT EXISTS top_speed_mps DOUBLE PRECISION;
    ALTER TABLE challenge_participants ADD COLUMN IF NOT EXISTS time_source TEXT NOT NULL DEFAULT 'gps';
    ALTER TABLE challenge_participants ADD COLUMN IF NOT EXISTS rank INTEGER;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT NOT NULL DEFAULT '🚗';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '3 days');
    ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS agreed_to_terms_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_challenge_participants_rank ON challenge_participants (user_id, rank);
  `);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'challenges_mode_check') THEN
        ALTER TABLE challenges ADD CONSTRAINT challenges_mode_check CHECK (mode IN ('route', 'roll'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'challenge_participants_time_source_check') THEN
        ALTER TABLE challenge_participants ADD CONSTRAINT challenge_participants_time_source_check CHECK (time_source IN ('gps', 'manual'));
      END IF;
    END $$;
  `);
}
