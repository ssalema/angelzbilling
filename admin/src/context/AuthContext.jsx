import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import api, { setAccessToken, setSessionExpiredHandler } from '../api/client.js';
import { HEAD_OFFICE, locationOf } from '../utils/constants.js';
import { authApi } from '../api/endpoints.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [bootSettings, setBootSettings] = useState(null);
  const [booting, setBooting] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const response = await api.post('/auth/refresh');
        const { accessToken, user: restored, settings } = response.data.data;
        setAccessToken(accessToken);
        if (!cancelled) {
          setUser(restored);
          // Arrives with the session, so the settings request that used to
          // follow this one is no longer needed on boot.
          if (settings) setBootSettings(settings);
        }
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
    const { user: loggedIn, accessToken, settings } = await authApi.login(credentials);
    setAccessToken(accessToken);
    setUser(loggedIn);
    if (settings) setBootSettings(settings);
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
    // Belongs to the session that just ended. Left in place, the login screen
    // would render the signed-in store profile instead of the public one.
    setBootSettings(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const fresh = await authApi.me();
    setUser(fresh);
    return fresh;
  }, []);

  // Seeing and changing are two different questions.
  const isSuperAdmin = user?.role === 'superadmin';
  // Every account sits at a location; no branch means the Head Office, and the
  // Head Office Super Admin is the one with authority over the whole business.
  const myLocationId = user ? locationOf(user.branch).id : null;
  const isMainSuperAdmin = isSuperAdmin && myLocationId === HEAD_OFFICE.id;

  const canEditBranch = useCallback(
    (branchId) => {
      if (!isSuperAdmin) return false;
      if (isMainSuperAdmin) return true;
      return String(branchId || HEAD_OFFICE.id) === String(myLocationId);
    },
    [isSuperAdmin, isMainSuperAdmin, myLocationId]
  );

  const value = useMemo(
    () => ({
      user,
      booting,
      bootSettings,
      sessionExpired,
      isAuthenticated: Boolean(user),
      isSuperAdmin,
      isMainSuperAdmin,
      myLocationId,
      // A branch id to assign, or null when the account sits at the Head Office.
      myBranchId: myLocationId === HEAD_OFFICE.id ? null : myLocationId,
      canEditBranch,
      isAdmin: user?.role === 'superadmin' || user?.role === 'admin',
      branchName: user ? locationOf(user.branch).name : HEAD_OFFICE.name,
      login,
      logout,
      refreshUser,
      setUser,
    }),
    [
      user,
      booting,
      bootSettings,
      sessionExpired,
      isSuperAdmin,
      isMainSuperAdmin,
      myLocationId,
      canEditBranch,
      login,
      logout,
      refreshUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
};
