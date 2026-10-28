import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { settingsApi } from '../api/endpoints.js';
import { useAuth } from './AuthContext.jsx';
import { useRealtime } from './RealtimeContext.jsx';
import { configureCurrency, currencySymbol as configuredSymbol } from '../utils/format.js';
import { cacheSiteName, cachedSiteName, documentTitle } from '../utils/branding.js';
import { DEFAULT_MAX_DISCOUNT_PERCENT } from '../utils/constants.js';

const SettingsContext = createContext(null);

export const SettingsProvider = ({ children }) => {
  const { isAuthenticated, booting, bootSettings } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = isAuthenticated ? await settingsApi.get() : await settingsApi.getPublic();
      setSettings(data);
    } catch {
      setSettings(null); // the app still works with defaults
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    // Wait for auth to resolve, or the public request fires and is immediately replaced.
    if (booting) return;

    if (bootSettings) {
      setSettings(bootSettings);
      setLoading(false);
      return;
    }

    load();
  }, [booting, bootSettings, load]);

  // Settings change from other tabs, other admins, and branch writes (the server
  // turns branch mode off when the last active branch goes), so re-read quietly
  // on those events instead of keeping the sign-in copy until the next reload.
  const { revisions } = useRealtime();
  const revision = (revisions?.settings || 0) + (revisions?.branches || 0);
  const seenRevision = useRef(revision);

  useEffect(() => {
    if (revision === seenRevision.current) return;
    seenRevision.current = revision;
    if (!isAuthenticated) return;
    settingsApi
      .get()
      .then(setSettings)
      .catch(() => {
        /* keep the current copy */
      });
  }, [revision, isAuthenticated]);

  useEffect(() => {
    if (settings?.siteName) {
      document.title = documentTitle(settings.siteName);
      // Cached so the next load shows the right title and splash before settings arrive.
      cacheSiteName(settings.siteName);
    }
    const favicon = settings?.branding?.favicon?.url || settings?.favicon;
    if (favicon) {
      const link = document.querySelector("link[rel='icon']");
      if (link) link.href = favicon;
    }
  }, [settings]);

  configureCurrency({
    // Nested from /settings, flat from the signed-out /settings/public payload.
    currency: settings?.billing?.currency || settings?.currency,
    currencySymbol: settings?.billing?.currencySymbol || settings?.currencySymbol,
  });

  const value = useMemo(
    () => ({
      settings,
      loading,
      reload: load,
      setSettings,
      siteName: settings?.siteName || cachedSiteName(),
      logo: settings?.branding?.logo?.url || settings?.logo || '',
      currencySymbol: configuredSymbol(),
      defaultTaxPercent: settings?.billing?.defaultTaxPercent ?? 0,
      // Max discount staff may give without a Branch Admin (the server enforces it too).
      // Falls back to the strict default when settings are missing, matching the server.
      maxDiscountPercent: settings?.billing?.maxDiscountPercent ?? DEFAULT_MAX_DISCOUNT_PERCENT,
      // Off for single-location stores: all branch columns, filters and chips are hidden.
      // The server always sends this flag, so missing settings mean "not known yet": stay off.
      branchesEnabled: settings?.features?.branches === true,
    }),
    [settings, loading, load]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside a SettingsProvider');
  return context;
};
