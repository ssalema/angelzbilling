import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

/** Tabs that share /settings and are told apart by ?tab=. */
export const FORM_TABS = ['general', 'billing', 'social'];
/** The one tab with a path of its own, so it can be linked to and guarded. */
export const BRANCHES_PATH = '/settings/branches';
export const SETTINGS_PATH = '/settings';

/**
 * Which Settings tab is open, and how to change it.
 *
 * The answer lives in the URL and never in component state. The dashboard
 * layout keys its Suspense boundary on the pathname, so stepping between
 * /settings and /settings/branches remounts the whole page: anything held in
 * useState or useRef is wiped and the tab would snap back to its initial
 * value — which is exactly how "Branches -> Billing" used to land on General.
 * The URL is the one thing that survives a remount, and it makes every tab
 * deep-linkable and back/forward-able for free.
 *
 * Switching between the three form tabs only rewrites the query string. The
 * pathname is untouched, so the page is not remounted and a half-filled form
 * is not thrown away mid-edit.
 */
const useSettingsTab = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const onBranchesPath = location.pathname.replace(/\/+$/, '').endsWith('/branches');
  const queryTab = searchParams.get('tab');
  const tab =
    onBranchesPath || queryTab === 'branches'
      ? 'branches'
      : FORM_TABS.includes(queryTab)
        ? queryTab
        : 'general';

  // A hand-typed or bookmarked /settings?tab=branches gets the canonical path.
  useEffect(() => {
    if (!onBranchesPath && queryTab === 'branches') navigate(BRANCHES_PATH, { replace: true });
  }, [onBranchesPath, queryTab, navigate]);

  const setTab = (next) => {
    if (next === tab) return;
    if (next === 'branches') {
      navigate(BRANCHES_PATH);
      return;
    }
    // General is the default, so it stays on a bare /settings.
    const search = next === 'general' ? '' : `?tab=${next}`;
    // Leaving /settings/branches is a real navigation: push it, so Back comes
    // back here instead of jumping off the Settings page entirely.
    if (onBranchesPath) navigate(`${SETTINGS_PATH}${search}`);
    // Same pathname: replace, so flipping through the form tabs neither piles
    // up history entries nor makes Back feel broken.
    else setSearchParams(next === 'general' ? {} : { tab: next }, { replace: true });
  };

  return { tab, setTab };
};

export default useSettingsTab;
