import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import api, { setAccessToken, setSessionExpiredHandler } from '../api/client.js';
import { HEAD_OFFICE, SESSION_NOTICE, locationOf } from '../utils/constants.js';
import { authApi } from '../api/endpoints.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [bootSettings, setBootSettings] = useState(null);
  const [booting, setBooting] = useState(true);
  // Why the last session ended, worded for the person reading the sign-in page.
  // `{ message, severity }`, or null after a sign-out they asked for themselves.
  const [sessionNotice, setSessionNotice] = useState(null);

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
      // A revoked session usually fails a refresh moments later. The reason the
      // server gave is the better one, so it is not replaced by this fallback.
      setSessionNotice((current) => current || SESSION_NOTICE.expired);
    });
  }, []);

  const login = useCallback(async (credentials) => {
    const { user: loggedIn, accessToken, settings } = await authApi.login(credentials);
    setAccessToken(accessToken);
    setUser(loggedIn);
    if (settings) setBootSettings(settings);
    setSessionNotice(null);
    return loggedIn;
  }, []);

  // `notice` is carried to the sign-in page when the session ended on its own
  // rather than because the person asked to sign out.
  const logout = useCallback(async (notice = null) => {
    setSessionNotice(notice?.message ? { severity: 'info', ...notice } : null);
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
      sessionNotice,
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
      sessionNotice,
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
