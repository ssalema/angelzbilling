const SITE_NAME_KEY = 'ab:siteName';

// The fallback name is read from index.html's #boot, so it doesn't change when React mounts.
const DEFAULT_SITE_NAME = 'Angelz Desire';

const FALLBACK_SITE_NAME = (() => {
  try {
    return document.getElementById('boot')?.dataset.siteName || DEFAULT_SITE_NAME;
  } catch {
    return DEFAULT_SITE_NAME;
  }
})();

/** Browser tab title. Mirrored inline in index.html. */
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
