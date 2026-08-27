import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useWs } from '../context/WsContext.jsx';
import { useNow } from '../hooks/useNow.js';

const DEFAULT_CENTER = [30.2672, -97.7431];
const pointIcon = (emoji, className = 'marker-emoji') => L.divIcon({ html: emoji, className, iconSize: [28, 28], iconAnchor: [14, 14] });

function countdownLabel(targetMs, now) {
  const diff = targetMs - now;
  if (diff <= 0) return null;
  const totalMinutes = Math.ceil(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function RoutePicker({ meetPoint, route, onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return (
    <>
      {meetPoint && <Marker position={meetPoint} icon={pointIcon('📍')} />}
      {route.map((p, i) => (
        <Marker key={i} position={[p.lat, p.lng]} icon={pointIcon('🔹')} />
      ))}
      {route.length > 0 && <Polyline positions={[meetPoint, ...route.map((p) => [p.lat, p.lng])]} color="#ff5a36" />}
    </>
  );
}

function CreateCruiseForm({ onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [meetPoint, setMeetPoint] = useState(null);
  const [route, setRoute] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onPick = (lat, lng) => {
    if (!meetPoint) setMeetPoint([lat, lng]);
    else setRoute((r) => [...r, { lat, lng }]);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give it a name.');
    if (!meetPoint) return setError('Click the map to drop the meetup pin.');
    if (!startsAt) return setError('Pick a date and time.');
    const startsAtDate = new Date(startsAt);
    if (Number.isNaN(startsAtDate.getTime()) || startsAtDate.getTime() <= Date.now()) {
      return setError('That start time has already passed.');
    }

    setSubmitting(true);
    setError('');
    try {
      await api('/cruises', {
        method: 'POST',
        body: {
          name: name.trim(),
          description: description.trim() || undefined,
          meet_lat: meetPoint[0],
          meet_lng: meetPoint[1],
          route: route.length ? route : undefined,
          starts_at: startsAtDate.toISOString(),
        },
      });
      setName('');
      setDescription('');
      setStartsAt('');
      setMeetPoint(null);
      setRoute([]);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="create-challenge" onSubmit={submit}>
      <h3>Plan a cruise</h3>
      {error && <div className="error-banner">{error}</div>}
      <input placeholder="Cruise name (e.g. Friday Night Loop)" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Details (optional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
      <label>
        Meet-up time
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </label>
      <p className="muted">
        Click the map to drop the meet-up pin 📍, then keep clicking to sketch an optional route 🔹. The location and route stay
        hidden from everyone else until 1 hour before start.
      </p>
      <MapContainer center={DEFAULT_CENTER} zoom={11} className="mini-map">
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <RoutePicker meetPoint={meetPoint} route={route} onPick={onPick} />
      </MapContainer>
      {(meetPoint || route.length > 0) && (
        <button type="button" className="secondary" onClick={() => { setMeetPoint(null); setRoute([]); }}>
          Clear pin & route
        </button>
      )}
      <button type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create cruise'}</button>
    </form>
  );
}

function CruiseCard({ cruise, currentUserId, onChanged, now }) {
  const [busy, setBusy] = useState(false);
  const startsAtMs = Date.parse(cruise.starts_at);
  const revealAtMs = Date.parse(cruise.reveal_at);
  const isCreator = cruise.creator_id === currentUserId;
  const started = startsAtMs <= now;

  const toggleRsvp = async () => {
    setBusy(true);
    try {
      await api(`/cruises/${cruise.id}/rsvp`, { method: 'POST', body: { going: !cruise.my_rsvp } });
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
        <strong>🚗 {cruise.name}</strong>
        <span className="status-pill">{started ? 'underway' : new Date(cruise.starts_at).toLocaleString()}</span>
      </div>
      <div className="muted">
        by {cruise.creator_nickname} • {cruise.rsvp_count} going{isCreator ? ' • you created this' : ''}
      </div>
      {cruise.description && <p>{cruise.description}</p>}

      {cruise.revealed ? (
        <MapContainer center={[cruise.meet_lat, cruise.meet_lng]} zoom={12} className="mini-map">
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Marker position={[cruise.meet_lat, cruise.meet_lng]} icon={pointIcon('📍')}>
            <Popup>Meet here</Popup>
          </Marker>
          {cruise.route?.map((p, i) => (
            <Marker key={i} position={[p.lat, p.lng]} icon={pointIcon('🔹')} />
          ))}
          {cruise.route?.length > 0 && (
            <Polyline positions={[[cruise.meet_lat, cruise.meet_lng], ...cruise.route.map((p) => [p.lat, p.lng])]} color="#ff5a36" />
          )}
        </MapContainer>
      ) : (
        <div className="cruise-locked">
          🔒 Meet-up location reveals in {countdownLabel(revealAtMs, now) || 'a moment'}
        </div>
      )}

      <div className="challenge-actions">
        <button disabled={busy} className={cruise.my_rsvp ? 'secondary' : ''} onClick={toggleRsvp}>
          {cruise.my_rsvp ? "I'm in ✅ (tap to cancel)" : "RSVP — I'm in! 🙋"}
        </button>
      </div>
    </div>
  );
}

export default function CruisesPage() {
  const { user } = useAuth();
  const { subscribe } = useWs();
  const [cruises, setCruises] = useState([]);
  const now = useNow(30_000); // also drives the periodic refetch below, so reveals land without a manual refresh

  const load = () => api('/cruises').then(({ cruises }) => setCruises(cruises));

  // Refetch periodically (piggybacking on the countdown tick) so a cruise's reveal — a
  // server-side, time-based change with no natural client event to trigger it — actually shows
  // up without the user having to manually refresh the page.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(now / 30_000)]);

  useEffect(() => {
    const unsubs = [subscribe('cruise:new', load), subscribe('cruise:update', load)];
    return () => unsubs.forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe]);

  const sorted = useMemo(() => [...cruises].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)), [cruises]);

  return (
    <div className="page challenges-page">
      <div className="challenges-list">
        <h2>Upcoming cruises</h2>
        {sorted.length === 0 && <p className="muted">No cruises planned yet — set one up!</p>}
        {sorted.map((c) => (
          <CruiseCard key={c.id} cruise={c} currentUserId={user.id} onChanged={load} now={now} />
        ))}
      </div>
      <CreateCruiseForm onCreated={load} />
    </div>
  );
}
