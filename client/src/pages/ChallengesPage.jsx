import { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useWs } from '../context/WsContext.jsx';

const DEFAULT_CENTER = [30.2672, -97.7431];
const pointIcon = (emoji) => L.divIcon({ html: emoji, className: 'marker-emoji', iconSize: [28, 28], iconAnchor: [14, 14] });

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
    if (!name.trim() || !start || !end) {
      setError('Give it a name, then click the map to set a start and finish line.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api('/challenges', {
        method: 'POST',
        body: { name: name.trim(), start_lat: start[0], start_lng: start[1], end_lat: end[0], end_lng: end[1] },
      });
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
      <p className="muted">Click the map: first click sets the start line 🏁, second sets the finish 🏆.</p>
      <MapContainer center={DEFAULT_CENTER} zoom={11} className="mini-map">
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <PointPicker start={start} end={end} onPick={onPick} />
      </MapContainer>
      <button type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create challenge'}</button>
    </form>
  );
}

function ChallengeCard({ challenge, currentUserId, onChanged }) {
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
        <strong>{challenge.name}</strong>
        <span className={`status-pill ${challenge.status}`}>{challenge.status}</span>
      </div>
      <div className="muted">by {challenge.creator_nickname} • {challenge.participant_count} joined</div>

      <ol className="participant-list">
        {challenge.participants.map((p) => (
          <li key={p.user_id}>
            {p.nickname}
            {p.finished_at ? ` — finished (+${p.points_awarded || 0} pts)` : challenge.status === 'active' ? ' — racing…' : ''}
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
        {challenge.status === 'active' && me && !me.finished_at && (
          <button disabled={busy} onClick={() => act('finish')}>I finished! 🏁</button>
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
          <ChallengeCard key={c.id} challenge={c} currentUserId={user.id} onChanged={load} />
        ))}
      </div>
      <CreateChallengeForm onCreated={load} />
    </div>
  );
}
