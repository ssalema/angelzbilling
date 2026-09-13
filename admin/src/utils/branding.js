const SITE_NAME_KEY = 'ab:siteName';

/**
 * The static name index.html paints before React mounts, so a cold load hands
 * off to the React splash without the name changing. Read at module evaluation,
 * which runs before the first render replaces #boot.
 */
const FALLBACK_SITE_NAME = (() => {
  try {
    return document.getElementById('boot')?.dataset.siteName || 'Admin';
  } catch {
    return 'Admin';
  }
})();

/** The browser tab, one format everywhere. Mirrored inline in index.html. */
export const documentTitle = (name) => `${name || FALLBACK_SITE_NAME} — Admin`;

export const cachedSiteName = () => {
  try {
    return localStorage.getItem(SITE_NAME_KEY) || FALLBACK_SITE_NAME;
  } catch {
    return FALLBACK_SITE_NAME; // private mode / storage disabled
  }
};

export const cacheSiteName = (name) => {
  if (!name) return;
  try {
    localStorage.setItem(SITE_NAME_KEY, name);
  } catch {
    /* nothing to do — the fallback still renders */
  }
};
