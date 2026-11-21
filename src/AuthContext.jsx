import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { request } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, csrfToken: '' });

  const refreshSession = useCallback(async () => {
    try {
      const response = await request('/api/auth/session');
      setState({ status: 'authenticated', ...response.data });
      return response.data;
    } catch (error) {
      if (error.status !== 401) console.error(error);
      setState({ status: 'unauthenticated', user: null, csrfToken: '' });
      return null;
    }
  }, []);

  useEffect(() => { refreshSession(); }, [refreshSession]);

  const login = useCallback(async (email, password) => {
    const response = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setState({ status: 'authenticated', ...response.data });
    return response.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await request('/api/auth/logout', { method: 'POST' }, state.csrfToken);
    } finally {
      setState({ status: 'unauthenticated', user: null, csrfToken: '' });
    }
  }, [state.csrfToken]);

  const api = useCallback(async (path, options = {}) => {
    try {
      return await request(path, options, state.csrfToken);
    } catch (error) {
      if (error.status === 401) setState({ status: 'unauthenticated', user: null, csrfToken: '' });
      throw error;
    }
  }, [state.csrfToken]);

  const value = useMemo(() => ({ ...state, login, logout, api, refreshSession }), [state, login, logout, api, refreshSession]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
