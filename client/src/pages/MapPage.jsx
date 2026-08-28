import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../api.js';
import { useWs } from '../context/WsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLocation } from '../context/LocationContext.jsx';
import { DEVICES, isBluetoothSupported } from '../telemetry/devices.js';
import { distanceMiles, mpsToMph } from '../geo.js';
import PageBackground from '../components/PageBackground.jsx';

const DEFAULT_CENTER = [30.2672, -97.7431]; // Austin, TX — used until we know where the user is
const REPORT_TYPES = [
  { type: 'cop', emoji: '🚓', label: 'Cop' },
  { type: 'construction', emoji: '🚧', label: 'Construction' },
  { type: 'debris', emoji: '⚠️', label: 'Debris' },
  { type: 'crash', emoji: '💥', label: 'Crash' },
];
const REPORT_EMOJI = Object.fromEntries(REPORT_TYPES.map((r) => [r.type, r.emoji]));

function divIcon(html, className) {
  return L.divIcon({ html, className, iconSize: [32, 32], iconAnchor: [16, 16] });
}

function RecenterOnce({ position }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (position && !done.current) {
      map.setView(position, 14);
      done.current = true;
    }
  }, [position, map]);
  return null;
}

function ClickToSetLocation({ enabled, onPick }) {
  useMapEvents({
    click(e) {
      if (enabled) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 15);
  }, [target, map]);
  return null;
}

export default function MapPage() {
  const { user } = useAuth();
  const { connected, subscribe } = useWs();
  const { position: myPosition, speedMps, manualMode, setManualMode, manualSetPosition, geoError } = useLocation();
  const [others, setOthers] = useState({}); // id -> {id, nickname, lat, lng, heading, updated_at}
  const [reports, setReports] = useState({}); // id -> report
  const [pendingReportType, setPendingReportType] = useState(null);
  const [actionError, setActionError] = useState('');
  const [sosAlerts, setSosAlerts] = useState({}); // id -> alert
  const [sosModalOpen, setSosModalOpen] = useState(false);
  const [sosMessage, setSosMessage] = useState('');
  const [sosSending, setSosSending] = useState(false);
  const [flyTarget, setFlyTarget] = useState(null);

  useEffect(() => {
    api('/reports')
      .then(({ reports }) => setReports(Object.fromEntries(reports.map((r) => [r.id, r]))))
      .catch(() => {});
    api('/sos')
      .then(({ alerts }) => setSosAlerts(Object.fromEntries(alerts.map((a) => [a.id, a]))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unsubs = [
      subscribe('presence:snapshot', (list) => {
        setOthers(Object.fromEntries(list.filter((u) => u.id !== user.id).map((u) => [u.id, u])));
      }),
      subscribe('presence:update', (u) => {
        if (u.id === user.id) return;
        setOthers((prev) => ({ ...prev, [u.id]: u }));
      }),
      subscribe('presence:leave', ({ id }) => {
        setOthers((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }),
      subscribe('report:new', (r) => setReports((prev) => ({ ...prev, [r.id]: r }))),
      subscribe('report:confirmed', (r) => setReports((prev) => (prev[r.id] ? { ...prev, [r.id]: { ...prev[r.id], ...r } } : prev))),
      subscribe('report:removed', ({ id }) =>
        setReports((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        })
      ),
      subscribe('sos:new', (a) => setSosAlerts((prev) => ({ ...prev, [a.id]: a }))),
      subscribe('sos:resolved', ({ id }) =>
        setSosAlerts((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        })
      ),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [subscribe, user.id]);

  const othersList = useMemo(() => Object.values(others), [others]);
  const reportsList = useMemo(() => Object.values(reports), [reports]);
  const speedMphRaw = mpsToMph(speedMps);
  const speedMph = speedMphRaw == null ? null : Math.round(speedMphRaw);
  const sosList = useMemo(() => Object.values(sosAlerts), [sosAlerts]);
  const mySos = useMemo(() => sosList.find((a) => a.user_id === user.id), [sosList, user.id]);
  const othersSos = useMemo(() => sosList.filter((a) => a.user_id !== user.id), [sosList, user.id]);

  const startReport = (type) => {
    if (!myPosition) {
      setActionError('We need your position first — click the map or enable location to drop a report.');
      return;
    }
    setPendingReportType(type);
  };

  const confirmReportHere = async () => {
    if (!pendingReportType || !myPosition) return;
    const description = window.prompt(`Add a note about this ${pendingReportType} (optional):`, '') || undefined;
    try {
      await api('/reports', { method: 'POST', body: { type: pendingReportType, lat: myPosition[0], lng: myPosition[1], description } });
    } catch (err) {
      setActionError(err.message);
    } finally {
      setPendingReportType(null);
    }
  };

  const confirmReport = async (id) => {
    try {
      await api(`/reports/${id}/confirm`, { method: 'POST' });
    } catch (err) {
      setActionError(err.message);
    }
  };

  const openSosModal = () => {
    if (!myPosition) {
      setActionError('We need your position first — click the map or enable location before sending an SOS.');
      return;
    }
    setSosMessage('');
    setSosModalOpen(true);
  };

  const sendSos = async () => {
    if (!myPosition) return;
    setSosSending(true);
    try {
      const { alert } = await api('/sos', {
        method: 'POST',
        body: { lat: myPosition[0], lng: myPosition[1], message: sosMessage.trim() || undefined },
      });
      setSosAlerts((prev) => ({ ...prev, [alert.id]: alert }));
      setSosModalOpen(false);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSosSending(false);
    }
  };

  const resolveSos = async () => {
    if (!mySos) return;
    try {
      await api(`/sos/${mySos.id}/resolve`, { method: 'POST' });
      setSosAlerts((prev) => {
        const next = { ...prev };
        delete next[mySos.id];
        return next;
      });
    } catch (err) {
      setActionError(err.message);
    }
  };

  return (
    <div className="map-page">
      <PageBackground image="/backgrounds/map-nav.png" dim="light" />
      <div className="banner-stack">
        {(geoError || actionError) && <div className="banner">{actionError || geoError}</div>}
        {!connected && <div className="banner warning">Reconnecting to live updates…</div>}
        {!user.visible && <div className="banner warning">You're off the grid — nobody else can see you on the map.</div>}

        {othersSos.map((a) => {
          const miles = myPosition ? distanceMiles(myPosition[0], myPosition[1], a.lat, a.lng).toFixed(1) : null;
          return (
            <div key={a.id} className="banner sos-banner" onClick={() => setFlyTarget([a.lat, a.lng])}>
              🆘 {a.nickname} needs help{miles ? ` — ${miles} mi away` : ''}{a.message ? `: "${a.message}"` : ''} (tap to view)
            </div>
          );
        })}
        {mySos && (
          <div className="banner sos-banner sos-banner-mine">
            🆘 Your SOS is active — drivers nearby were notified.
            <button className="sos-resolve-button" onClick={resolveSos}>I'm OK — resolve</button>
          </div>
        )}
      </div>

      <MapContainer center={myPosition || DEFAULT_CENTER} zoom={myPosition ? 14 : 11} className="map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterOnce position={myPosition} />
        <ClickToSetLocation enabled={manualMode} onPick={manualSetPosition} />
        <FlyTo target={flyTarget} />

        {myPosition && (
          <Marker position={myPosition} icon={divIcon(user.avatar || '🚗', 'marker-emoji marker-self')}>
            <Popup>You ({user.nickname})</Popup>
          </Marker>
        )}

        {othersList.map((u) => (
          <Marker key={u.id} position={[u.lat, u.lng]} icon={divIcon(u.avatar || '🚙', 'marker-emoji')}>
            <Popup>{u.nickname}</Popup>
          </Marker>
        ))}

        {reportsList.map((r) => (
          <Marker key={r.id} position={[r.lat, r.lng]} icon={divIcon(REPORT_EMOJI[r.type] || '❗', 'marker-emoji marker-report')}>
            <Popup>
              <div className="report-popup">
                <strong>{r.type}</strong>
                {r.reported_by && <div className="muted">reported by {r.reported_by}</div>}
                {r.description && <p>{r.description}</p>}
                <div className="muted">{r.confirms} confirmation{r.confirms === 1 ? '' : 's'}</div>
                <button onClick={() => confirmReport(r.id)}>Still there 👍</button>
              </div>
            </Popup>
          </Marker>
        ))}

        {sosList.map((a) => (
          <Marker key={a.id} position={[a.lat, a.lng]} icon={divIcon('🆘', 'marker-emoji marker-sos')}>
            <Popup>
              <div className="report-popup">
                <strong>{a.user_id === user.id ? 'Your SOS' : `${a.nickname} needs help`}</strong>
                {a.message && <p>{a.message}</p>}
                <div className="muted">sent {new Date(a.created_at).toLocaleTimeString()}</div>
                {a.user_id === user.id && <button onClick={resolveSos}>I'm OK — resolve</button>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <button className="sos-fab" onClick={openSosModal} title="Alert drivers within 10 miles that you need help">
        🆘 SOS
      </button>

      <div className="map-toolbar">
        <div className="toolbar-left">
          <button className={`toggle-button ${manualMode ? 'active' : ''}`} onClick={() => setManualMode((m) => !m)}>
            {manualMode ? 'Manual position: on (click map)' : 'Use GPS'}
          </button>
          {speedMph != null && <span className="speed-badge">{speedMph} mph</span>}
          <div className="device-buttons">
            {isBluetoothSupported() ? (
              DEVICES.map((d) => (
                <button key={d.id} disabled title="Coming soon — needs the device's official Bluetooth protocol spec">
                  🔌 Connect {d.label}
                </button>
              ))
            ) : (
              <span className="muted device-unsupported" title="Web Bluetooth isn't available in this browser (this is normal on iPhone/Safari)">
                Draggy/RaceBox: not supported in this browser
              </span>
            )}
          </div>
        </div>
        <div className="report-buttons">
          {REPORT_TYPES.map((r) => (
            <button key={r.type} onClick={() => startReport(r.type)} title={`Report ${r.label}`}>
              {r.emoji} {r.label}
            </button>
          ))}
        </div>
      </div>

      {pendingReportType && (
        <div className="modal-backdrop" onClick={() => setPendingReportType(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Drop a {pendingReportType} report at your current position?</h3>
            <div className="modal-actions">
              <button onClick={confirmReportHere}>Drop it</button>
              <button className="secondary" onClick={() => setPendingReportType(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {sosModalOpen && (
        <div className="modal-backdrop" onClick={() => setSosModalOpen(false)}>
          <div className="modal modal-sos" onClick={(e) => e.stopPropagation()}>
            <h3>🆘 Send an SOS?</h3>
            <p className="muted">
              This notifies every Street League driver within 10 miles of your current position, right now, that you need help.
            </p>
            <input
              placeholder="What's going on? (optional)"
              value={sosMessage}
              onChange={(e) => setSosMessage(e.target.value)}
              maxLength={200}
            />
            <div className="modal-actions">
              <button className="sos-confirm-button" disabled={sosSending} onClick={sendSos}>
                {sosSending ? 'Sending…' : 'Send SOS'}
              </button>
              <button className="secondary" onClick={() => setSosModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
