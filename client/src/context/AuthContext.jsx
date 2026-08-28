import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(getToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    api('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => {
        setToken(null);
        setTokenState(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const applyAuth = useCallback((data) => {
    setToken(data.token);
    setTokenState(data.token);
    setUser(data.user);
  }, []);

  const signup = useCallback(async (payload) => applyAuth(await api('/auth/signup', { method: 'POST', body: payload })), [applyAuth]);
  const login = useCallback(async (payload) => applyAuth(await api('/auth/login', { method: 'POST', body: payload })), [applyAuth]);
  const logout = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUser(null);
  }, []);
  const addPoints = useCallback((delta) => {
    setUser((u) => (u ? { ...u, points: u.points + delta } : u));
  }, []);
  const setVisible = useCallback(async (visible) => {
    const { user } = await api('/auth/visibility', { method: 'PATCH', body: { visible } });
    setUser(user);
  }, []);
  const setAvatar = useCallback(async (avatar) => {
    const { user } = await api('/auth/avatar', { method: 'PATCH', body: { avatar } });
    setUser(user);
  }, []);
  // Points change server-side whenever any challenge finishes (not just ones this tab caused,
  // e.g. a challenge someone else just scored you into) — refetch instead of guessing the delta.
  const refreshMe = useCallback(async () => {
    try {
      const { user } = await api('/auth/me');
      setUser(user);
    } catch {
      // transient network hiccup — the next successful refresh will catch up
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, signup, login, logout, addPoints, setVisible, setAvatar, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
