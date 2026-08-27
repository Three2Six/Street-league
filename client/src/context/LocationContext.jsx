import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useWs } from './WsContext.jsx';
import { useAuth } from './AuthContext.jsx';

const LocationContext = createContext(null);
const WS_SEND_THROTTLE_MS = 2000;

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function LocationProvider({ children }) {
  const { user } = useAuth();
  const { send, connected } = useWs();
  const [position, setPosition] = useState(null);
  const [heading, setHeading] = useState(null);
  const [speedMps, setSpeedMps] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [geoError, setGeoError] = useState('');

  const lastSentRef = useRef(0);
  const prevSampleRef = useRef(null); // { lat, lng, t } — for the speed fallback when coords.speed is unavailable
  const lastSampleRef = useRef(null); // { lat, lng, heading, speed } — resent once the socket (re)connects
  const speedListenersRef = useRef(new Set());

  // Raw, un-throttled speed stream for anything that needs to react fast (roll-race detection).
  const emitSpeed = (speed, t) => {
    for (const fn of speedListenersRef.current) fn({ speedMps: speed, t });
  };
  const subscribeSpeed = (fn) => {
    speedListenersRef.current.add(fn);
    return () => speedListenersRef.current.delete(fn);
  };

  const publish = (lat, lng, headingVal, rawSpeed) => {
    const t = Date.now();
    let speed = rawSpeed;
    if (speed == null || !Number.isFinite(speed)) {
      const prev = prevSampleRef.current;
      if (prev && t - prev.t > 300) {
        const dtSeconds = (t - prev.t) / 1000;
        speed = haversineMeters(prev.lat, prev.lng, lat, lng) / dtSeconds;
      } else {
        speed = null;
      }
    }
    prevSampleRef.current = { lat, lng, t };

    setPosition([lat, lng]);
    setHeading(headingVal ?? null);
    if (speed != null) setSpeedMps(speed);
    emitSpeed(speed, t);

    lastSampleRef.current = { lat, lng, heading: headingVal ?? null, speed };
    if (user?.visible && t - lastSentRef.current >= WS_SEND_THROTTLE_MS) {
      lastSentRef.current = t;
      send({ type: 'location', lat, lng, heading: headingVal ?? null, speed });
    }
  };

  // The very first GPS fix (or any fix while the socket happens to be mid-reconnect) can race
  // the WebSocket handshake and get silently dropped, since `send` no-ops until the socket is
  // open — with no guarantee another GPS callback follows soon enough to cover for it. Resend
  // whatever we last knew the instant the connection is actually up, bypassing the throttle.
  useEffect(() => {
    if (connected && user?.visible && lastSampleRef.current) {
      lastSentRef.current = Date.now();
      send({ type: 'location', ...lastSampleRef.current });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => {
    if (!user) return;
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation is not available in this browser — click the map to set your position.');
      setManualMode(true);
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => publish(pos.coords.latitude, pos.coords.longitude, pos.coords.heading, pos.coords.speed),
      () => {
        setGeoError('Location permission denied — click the map to set your position instead.');
        setManualMode(true);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const manualSetPosition = (lat, lng) => publish(lat, lng, null, null);

  return (
    <LocationContext.Provider
      value={{ position, heading, speedMps, manualMode, setManualMode, manualSetPosition, geoError, subscribeSpeed }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within LocationProvider');
  return ctx;
}
