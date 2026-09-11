const SITE_NAME_KEY = 'ab:siteName';

/** Deliberately generic — a store that has never loaded settings has no name yet. */
const FALLBACK_SITE_NAME = 'Admin';

/** The browser tab, one format everywhere. Mirrored inline in index.html. */
export const documentTitle = (name) => (name ? `${name} — Admin` : FALLBACK_SITE_NAME);

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
