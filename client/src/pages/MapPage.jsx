import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../api.js';
import { useWs } from '../context/WsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLocation } from '../context/LocationContext.jsx';
import { DEVICES, isBluetoothSupported } from '../telemetry/devices.js';

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

export default function MapPage() {
  const { user } = useAuth();
  const { connected, subscribe } = useWs();
  const { position: myPosition, speedMps, manualMode, setManualMode, manualSetPosition, geoError } = useLocation();
  const [others, setOthers] = useState({}); // id -> {id, nickname, lat, lng, heading, updated_at}
  const [reports, setReports] = useState({}); // id -> report
  const [pendingReportType, setPendingReportType] = useState(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    api('/reports')
      .then(({ reports }) => setReports(Object.fromEntries(reports.map((r) => [r.id, r]))))
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
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [subscribe, user.id]);

  const othersList = useMemo(() => Object.values(others), [others]);
  const reportsList = useMemo(() => Object.values(reports), [reports]);
  const speedMph = speedMps != null ? Math.round(speedMps * 2.23694) : null;

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

  return (
    <div className="map-page">
      {(geoError || actionError) && <div className="banner">{actionError || geoError}</div>}
      {!connected && <div className="banner warning">Reconnecting to live updates…</div>}
      {!user.visible && <div className="banner warning">You're off the grid — nobody else can see you on the map.</div>}

      <MapContainer center={myPosition || DEFAULT_CENTER} zoom={myPosition ? 14 : 11} className="map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterOnce position={myPosition} />
        <ClickToSetLocation enabled={manualMode} onPick={manualSetPosition} />

        {myPosition && (
          <Marker position={myPosition} icon={divIcon('🚗', 'marker-emoji marker-self')}>
            <Popup>You ({user.nickname})</Popup>
          </Marker>
        )}

        {othersList.map((u) => (
          <Marker key={u.id} position={[u.lat, u.lng]} icon={divIcon('🚙', 'marker-emoji')}>
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
      </MapContainer>

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
    </div>
  );
}
