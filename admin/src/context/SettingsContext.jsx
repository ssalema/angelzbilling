import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { settingsApi } from '../api/endpoints.js';
import { useAuth } from './AuthContext.jsx';

const SettingsContext = createContext(null);

/**
 * Store identity (name, logo, favicon, bill prefix) is loaded once and shared,
 * so the sidebar, the bill print header and the browser tab all agree.
 */
export const SettingsProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
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
    load();
  }, [load]);

  // Reflect the configured branding in the browser tab.
  useEffect(() => {
    if (settings?.siteName) document.title = `${settings.siteName} — Admin`;
    const favicon = settings?.branding?.favicon?.url || settings?.favicon;
    if (favicon) {
      const link = document.querySelector("link[rel='icon']");
      if (link) link.href = favicon;
    }
  }, [settings]);

  const value = useMemo(
    () => ({
      settings,
      loading,
      reload: load,
      setSettings,
      siteName: settings?.siteName || 'Angelz Perfume',
      logo: settings?.branding?.logo?.url || settings?.logo || '',
      currencySymbol: settings?.billing?.currencySymbol || settings?.currencySymbol || '₹',
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
