import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { settingsApi } from '../api/endpoints.js';
import { useAuth } from './AuthContext.jsx';
import { configureCurrency, currencySymbol as configuredSymbol } from '../utils/format.js';
import { cacheSiteName, cachedSiteName } from '../utils/branding.js';

const SettingsContext = createContext(null);

/**
 * Store identity (name, logo, favicon, bill prefix) is loaded once and shared,
 * so the sidebar, the bill print header and the browser tab all agree.
 */
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

  /**
   * Boot used to cost two serial round trips: this provider reads
   * `isAuthenticated`, so it could not ask for settings until the auth refresh
   * had come back, and only then made a request of its own — with the app
   * showing its splash for both.
   *
   * The session response now carries the store profile with it, so for a
   * signed-in user there is nothing left to fetch here. Only the signed-out
   * case still needs a request, for the login screen's logo and name.
   */
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
      document.title = `${settings.siteName} — Admin`;
      cacheSiteName(settings.siteName); // brands the next boot splash
    }
    const favicon = settings?.branding?.favicon?.url || settings?.favicon;
    if (favicon) {
      const link = document.querySelector("link[rel='icon']");
      if (link) link.href = favicon;
    }
  }, [settings]);

  /**
   * The shared money formatters are plain functions, not hooks, so the store's
   * currency has to be pushed into them.
   *
   * Deliberately during render rather than in an effect: an effect runs AFTER
   * the children have painted, so the first screen of the session would render
   * its amounts under the default symbol and never re-render to correct itself.
   * The call is idempotent and returns early when nothing changed.
   */
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
