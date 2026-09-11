import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

/** Tabs that share /settings and are told apart by ?tab=. */
const FORM_TABS = ['general', 'billing', 'social'];
/** The one tab with a path of its own, so it can be linked to and guarded. */
const BRANCHES_PATH = '/settings/branches';
const SETTINGS_PATH = '/settings';

// Which Settings tab is open, and how to change it.
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
