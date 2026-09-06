import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import api, { setAccessToken, setSessionExpiredHandler } from '../api/client.js';
import { HEAD_OFFICE, locationOf } from '../utils/constants.js';
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

  /**
   * Seeing and changing are two different questions.
   *
   * `isSuperAdmin` answers what this account may SEE — every branch, user, bill
   * and setting, whether or not a branch is assigned. `isMainSuperAdmin` answers
   * what it may CHANGE store-wide: the main business details, the branch
   * registry, another branch's team. A Super Admin with a branch edits inside
   * that branch only, which is what `canEditBranch` answers per record.
   */
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
