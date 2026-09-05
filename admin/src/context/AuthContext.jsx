import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import api, { setAccessToken, setSessionExpiredHandler } from '../api/client.js';
import { authApi } from '../api/endpoints.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  /**
   * On a page refresh the in-memory access token is gone, but the httpOnly
   * refresh cookie is not — so we silently trade it for a new session.
   */
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const response = await api.post('/auth/refresh');
        const { accessToken, user: restored } = response.data.data;
        setAccessToken(accessToken);
        if (!cancelled) setUser(restored);
      } catch {
        setAccessToken(null);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // The axios interceptor calls this when a refresh finally fails.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setSessionExpired(true);
    });
  }, []);

  const login = useCallback(async (credentials) => {
    const { user: loggedIn, accessToken } = await authApi.login(credentials);
    setAccessToken(accessToken);
    setUser(loggedIn);
    setSessionExpired(false);
    return loggedIn;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Signing out locally matters more than the server acknowledging it.
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const fresh = await authApi.me();
    setUser(fresh);
    return fresh;
  }, []);

  const value = useMemo(
    () => ({
      user,
      booting,
      sessionExpired,
      isAuthenticated: Boolean(user),
      isSuperAdmin: user?.role === 'superadmin',
      isAdmin: user?.role === 'superadmin' || user?.role === 'admin',
      branchName: user?.branch?.name || 'All branches',
      login,
      logout,
      refreshUser,
      setUser,
    }),
    [user, booting, sessionExpired, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
};
