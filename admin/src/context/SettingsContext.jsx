import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { settingsApi } from '../api/endpoints.js';
import { useAuth } from './AuthContext.jsx';
import { configureCurrency, currencySymbol as configuredSymbol } from '../utils/format.js';
import { cacheSiteName, cachedSiteName, documentTitle } from '../utils/branding.js';

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
    // Wait for the auth attempt to resolve; acting on the interim state would
    // fire the public request and then immediately supersede it.
    if (booting) return;

    if (bootSettings) {
      setSettings(bootSettings);
      setLoading(false);
      return;
    }

    load();
  }, [booting, bootSettings, load]);

  // Reflect the configured branding in the browser tab.
  useEffect(() => {
    if (settings?.siteName) {
      document.title = documentTitle(settings.siteName);
      // Brands the next load's tab title and splash, both of which paint long
      // before this response could arrive.
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
      // Off for single-location stores: every branch column, filter and chip hides.
      branchesEnabled: settings?.features?.branches !== false,
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
