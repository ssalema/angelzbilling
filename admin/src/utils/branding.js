/**
 * The store name for the screens that paint BEFORE settings exist: the boot
 * splash, the auth-refresh screen and the crash screen. None of them can wait
 * on a request, and none of them may hardcode a store name — this app is
 * installed per store.
 *
 * So the last known name is kept in localStorage and reused on the next load.
 * A first-ever visit has nothing cached and falls back to a neutral word; every
 * visit after that is branded from the first frame. The same key is read by the
 * inline splash script in index.html, so keep them in step.
 */
export const SITE_NAME_KEY = 'ab:siteName';

/** Deliberately generic — a store that has never loaded settings has no name yet. */
export const FALLBACK_SITE_NAME = 'Admin';

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
