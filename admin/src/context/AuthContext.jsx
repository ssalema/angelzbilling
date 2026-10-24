import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import api, {
  setAccessToken,
  setSessionExpiredHandler,
  setSessionRevokedHandler,
} from '../api/client.js';
import { HEAD_OFFICE, SESSION_NOTICE, locationOf } from '../utils/constants.js';
import { authApi } from '../api/endpoints.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [bootSettings, setBootSettings] = useState(null);
  const [booting, setBooting] = useState(true);
  // Why the last session ended, shown on the sign-in page: `{ message, severity }`.
  // Null after a normal sign-out.
  const [sessionNotice, setSessionNotice] = useState(null);
  // Why the session check failed on load (offline, slow, server down). This is not
  // "signed out", so the boot screen shows the reason and a retry instead.
  const [bootError, setBootError] = useState(null);
  const [bootAttempt, setBootAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setBootError(null);

    const restore = async () => {
      try {
        const response = await api.post('/auth/refresh', {}, { timeout: 15_000 });
        const { accessToken, user: restored, settings } = response.data.data;
        setAccessToken(accessToken);
        if (!cancelled) {
          setUser(restored);
          // Settings come with the session, so no extra request is needed on boot.
          if (settings) setBootSettings(settings);
          setBooting(false);
        }
      } catch (error) {
        if (cancelled) return;
        if (error?.isNetwork || error?.status >= 500) {
          setBootError(error);
          return;
        }
        setAccessToken(null);
        setUser(null);
        setBooting(false);
      }
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, [bootAttempt]);

  const retryBoot = useCallback(() => setBootAttempt((attempt) => attempt + 1), []);

  // Retry automatically when back online.
  useEffect(() => {
    if (!bootError) return undefined;
    window.addEventListener('online', retryBoot);
    return () => window.removeEventListener('online', retryBoot);
  }, [bootError, retryBoot]);

  // The axios interceptor calls this when a refresh finally fails.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      // Keep the server's revoke reason if one was already set.
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

  // `notice` is shown on the sign-in page when the session ended on its own.
  const logout = useCallback(async (notice = null) => {
    setSessionNotice(notice?.message ? { severity: 'info', ...notice } : null);
    try {
      await authApi.logout();
    } catch {
      // Sign out locally even if the server call fails.
    }
    setAccessToken(null);
    setUser(null);
    // Clear so the login screen shows the public store profile.
    setBootSettings(null);
  }, []);

  // The server says the session is over (not just a forbidden action), so sign out
  // with its reason.
  useEffect(() => {
    setSessionRevokedHandler((message) =>
      logout(message ? { message, severity: 'error' } : SESSION_NOTICE.ended)
    );
  }, [logout]);

  const refreshUser = useCallback(async () => {
    const fresh = await authApi.me();
    setUser(fresh);
    return fresh;
  }, []);

  const isSuperAdmin = user?.role === 'superadmin';
  // No branch means Head Office. The Head Office Super Admin controls the whole business.
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
      bootError,
      retryBoot,
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
      bootError,
      retryBoot,
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
