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

  return (
    <AuthContext.Provider value={{ user, token, loading, signup, login, logout, addPoints, setVisible }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
