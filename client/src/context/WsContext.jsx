import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';

const WsContext = createContext(null);

export function WsProvider({ children }) {
  const { token } = useAuth();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const listenersRef = useRef(new Map()); // type -> Set<fn>

  useEffect(() => {
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${proto}://${window.location.host}/ws?token=${encodeURIComponent(token)}`);
    socketRef.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      const handlers = listenersRef.current.get(msg.type);
      if (handlers) for (const fn of handlers) fn(msg.payload);
    };

    return () => socket.close();
  }, [token]);

  const send = (obj) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
  };

  const subscribe = (type, fn) => {
    if (!listenersRef.current.has(type)) listenersRef.current.set(type, new Set());
    listenersRef.current.get(type).add(fn);
    return () => listenersRef.current.get(type)?.delete(fn);
  };

  return <WsContext.Provider value={{ connected, send, subscribe }}>{children}</WsContext.Provider>;
}

export function useWs() {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error('useWs must be used within WsProvider');
  return ctx;
}
