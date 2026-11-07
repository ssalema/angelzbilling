const SITE_NAME_KEY = 'ab:siteName';

const FALLBACK_SITE_NAME = 'Angelz Desire';

/** Browser tab title. Mirrored inline in index.html. */
export const documentTitle = (name) => `${name || FALLBACK_SITE_NAME} — Billing and Inventory`;

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
