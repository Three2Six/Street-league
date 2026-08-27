import { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useWs } from '../context/WsContext.jsx';

const DEFAULT_CENTER = [30.2672, -97.7431];
const pointIcon = (emoji) => L.divIcon({ html: emoji, className: 'marker-emoji', iconSize: [28, 28], iconAnchor: [14, 14] });
const mpsToMph = (mps) => (mps == null ? null : Math.round(mps * 2.23694));

function useNow(intervalMs) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function PointPicker({ start, end, onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return (
    <>
      {start && <Marker position={start} icon={pointIcon('🏁')} />}
      {end && <Marker position={end} icon={pointIcon('🏆')} />}
    </>
  );
}

function CreateChallengeForm({ onCreated }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState('route');
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onPick = (lat, lng) => {
    if (!start) setStart([lat, lng]);
    else if (!end) setEnd([lat, lng]);
    else {
      setStart([lat, lng]);
      setEnd(null);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give it a name.');
      return;
    }
    if (mode === 'route' && (!start || !end)) {
      setError('Click the map to set a start and finish line.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const body =
        mode === 'route'
          ? { name: name.trim(), mode, start_lat: start[0], start_lng: start[1], end_lat: end[0], end_lng: end[1] }
          : { name: name.trim(), mode };
      await api('/challenges', { method: 'POST', body });
      setName('');
      setStart(null);
      setEnd(null);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="create-challenge" onSubmit={submit}>
      <h3>Start a challenge</h3>
      {error && <div className="error-banner">{error}</div>}
      <input placeholder="Challenge name (e.g. Riverside Sprint)" value={name} onChange={(e) => setName(e.target.value)} />

      <div className="mode-toggle">
        <button type="button" className={mode === 'route' ? 'active' : ''} onClick={() => setMode('route')}>
          🗺️ Point-to-point
        </button>
        <button type="button" className={mode === 'roll' ? 'active' : ''} onClick={() => setMode('roll')}>
          🏎️ Roll race
        </button>
      </div>

      {mode === 'route' ? (
        <>
          <p className="muted">Click the map: first click sets the start line 🏁, second sets the finish 🏆.</p>
          <MapContainer center={DEFAULT_CENTER} zoom={11} className="mini-map">
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <PointPicker start={start} end={end} onPick={onPick} />
          </MapContainer>
        </>
      ) : (
        <p className="muted">
          No line to draw — once you hit "Start race", every joined driver's own phone times their run: it starts the instant their
          GPS speed spikes up (foot to the floor) and ends the instant it drops sharply (they lift or brake). Fastest launch-to-lift
          time wins. No buttons to tap mid-race.
        </p>
      )}

      <button type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create challenge'}</button>
    </form>
  );
}

function elapsedLabel(startIso, endMsOrNow) {
  const startMs = Date.parse(startIso);
  const seconds = Math.max(0, (endMsOrNow - startMs) / 1000);
  return `${seconds.toFixed(2)}s`;
}

function ParticipantLine({ p, challenge, now }) {
  if (challenge.mode !== 'roll') {
    return (
      <>
        {p.nickname}
        {p.finished_at ? ` — finished (+${p.points_awarded || 0} pts)` : challenge.status === 'active' ? ' — racing…' : ''}
      </>
    );
  }

  const topMph = mpsToMph(p.top_speed_mps);
  if (p.finished_at && p.race_started_at) {
    return (
      <>
        {p.nickname} — {elapsedLabel(p.race_started_at, Date.parse(p.finished_at))}
        {topMph != null ? ` (top ${topMph} mph)` : ''}
        {p.points_awarded ? ` — +${p.points_awarded} pts` : ' — DNF'}
      </>
    );
  }
  if (p.race_started_at) {
    return (
      <>
        {p.nickname} — 🚀 racing, {elapsedLabel(p.race_started_at, now)}
        {topMph != null ? ` (top ${topMph} mph)` : ''}
      </>
    );
  }
  return <>{p.nickname} — waiting to launch…</>;
}

function ChallengeCard({ challenge, currentUserId, onChanged, now }) {
  const isCreator = challenge.creator_id === currentUserId;
  const me = challenge.participants.find((p) => p.user_id === currentUserId);
  const [busy, setBusy] = useState(false);

  const act = async (path) => {
    setBusy(true);
    try {
      await api(`/challenges/${challenge.id}/${path}`, { method: 'POST' });
      onChanged();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="challenge-card">
      <div className="challenge-header">
        <strong>{challenge.mode === 'roll' ? '🏎️ ' : '🗺️ '}{challenge.name}</strong>
        <span className={`status-pill ${challenge.status}`}>{challenge.status}</span>
      </div>
      <div className="muted">by {challenge.creator_nickname} • {challenge.participant_count} joined</div>

      <ol className="participant-list">
        {challenge.participants.map((p) => (
          <li key={p.user_id}>
            <ParticipantLine p={p} challenge={challenge} now={now} />
          </li>
        ))}
      </ol>

      <div className="challenge-actions">
        {challenge.status === 'open' && !me && (
          <button disabled={busy} onClick={() => act('join')}>Join</button>
        )}
        {challenge.status === 'open' && isCreator && (
          <button disabled={busy} onClick={() => act('start')}>Start race</button>
        )}
        {challenge.status === 'active' && challenge.mode === 'roll' && me && me.race_started_at && !me.finished_at && (
          <span className="muted racing-hint">Your phone is timing this — no need to tap anything.</span>
        )}
        {challenge.status === 'active' && challenge.mode === 'roll' && me && !me.race_started_at && (
          <span className="muted racing-hint">Floor it when you're ready — we'll catch the launch.</span>
        )}
        {challenge.status === 'active' && me && !me.finished_at && (
          <button
            disabled={busy}
            className={challenge.mode === 'roll' ? 'secondary' : ''}
            onClick={() => act('finish')}
          >
            {challenge.mode === 'roll' ? 'Missed it? Finish manually' : 'I finished! 🏁'}
          </button>
        )}
        {challenge.status === 'active' && isCreator && (
          <button disabled={busy} className="secondary" onClick={() => act('end')}>End & score</button>
        )}
      </div>
    </div>
  );
}

export default function ChallengesPage() {
  const { user } = useAuth();
  const { subscribe } = useWs();
  const [challenges, setChallenges] = useState([]);
  const now = useNow(500);

  const load = () => api('/challenges').then(({ challenges }) => setChallenges(challenges));

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const unsubs = [
      subscribe('challenge:new', load),
      subscribe('challenge:update', load),
      subscribe('challenge:finished', load),
    ];
    return () => unsubs.forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe]);

  return (
    <div className="page challenges-page">
      <div className="challenges-list">
        <h2>Open & active challenges</h2>
        {challenges.length === 0 && <p className="muted">No challenges yet — start one!</p>}
        {challenges.map((c) => (
          <ChallengeCard key={c.id} challenge={c} currentUserId={user.id} onChanged={load} now={now} />
        ))}
      </div>
      <CreateChallengeForm onCreated={load} />
    </div>
  );
}
