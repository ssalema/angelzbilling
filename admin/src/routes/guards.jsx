import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography, Button, Stack } from '@mui/material';
import Refresh from '@mui/icons-material/Refresh';
import { useAuth } from '../context/AuthContext.jsx';
import { PermissionDenied, ConnectionIcon } from '../components/common/StateViews.jsx';
import { ICON, brand } from '../theme/index.js';
import { cachedSiteName } from '../utils/branding.js';
import { checkServer } from '../api/network.js';

// After this long, the boot screen explains the wait.
const SLOW_BOOT_MS = 6000;

// A restarting server is usually back within a minute, so the boot screen keeps
// trying on its own. Offline is left to the browser's 'online' event instead.
const AUTO_RETRY_SECONDS = 10;
// A server that says it is booting is seconds away, so it is asked again sooner.
const STARTING_RETRY_SECONDS = 3;

// How often a long wait re-checks what the server is doing.
const WAIT_CHECK_MS = 4000;

/** What the wait is, worded from what the server answered. See api/network.js. */
const WAIT_MESSAGES = {
  pending: 'Still connecting — this is taking longer than usual.',
  ready: 'The server is up — finishing signing you in…',
  starting: 'The server is starting up — almost ready…',
  database: 'The server is up but waiting on its database…',
  silent: "The server isn't answering yet. If it has been idle it can take up to a minute to wake up.",
};

/** Shown while the refresh cookie is being exchanged on a hard reload. */
const BootScreen = () => {
  const { bootError, retryBoot } = useAuth();
  const [wait, setWait] = useState(null);
  const [countdown, setCountdown] = useState(null);

  // A long wait is explained by asking the server what it is doing, not guessed.
  useEffect(() => {
    if (bootError) return undefined;
    setWait(null);
    let cancelled = false;
    let poll;
    const check = () =>
      checkServer().then((state) => {
        if (!cancelled) setWait(state);
      });
    const start = setTimeout(() => {
      setWait((current) => current || 'pending');
      check();
      poll = setInterval(check, WAIT_CHECK_MS);
    }, SLOW_BOOT_MS);
    return () => {
      cancelled = true;
      clearTimeout(start);
      clearInterval(poll);
    };
  }, [bootError]);

  useEffect(() => {
    if (!bootError || bootError.kind === 'offline') {
      setCountdown(null);
      return undefined;
    }
    let left = bootError.kind === 'starting' ? STARTING_RETRY_SECONDS : AUTO_RETRY_SECONDS;
    setCountdown(left);
    const timer = setInterval(() => {
      left -= 1;
      if (left > 0) return setCountdown(left);
      clearInterval(timer);
      return retryBoot();
    }, 1000);
    return () => clearInterval(timer);
  }, [bootError, retryBoot]);

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', px: 3 }}>
      <Stack alignItems="center" spacing={2} sx={{ textAlign: 'center', maxWidth: 460 }}>
        <Typography
          sx={{
            fontFamily: "'Cormorant Garamond', serif",
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: brand.plum,
            fontSize: ICON.nav,
          }}
        >
          {cachedSiteName()}
        </Typography>

        {bootError ? (
          <>
            <ConnectionIcon kind={bootError.kind} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {bootError.title || 'We could not open the panel'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {bootError.message}
            </Typography>
            <Button startIcon={<Refresh />} onClick={retryBoot} variant="outlined">
              Try again
            </Button>
            {countdown !== null && (
              <Typography variant="caption" color="text.secondary">
                Trying again automatically in {countdown}s…
              </Typography>
            )}
          </>
        ) : (
          <>
            <CircularProgress size={24} sx={{ color: brand.gold }} />
            {wait && (
              <Typography variant="body2" color="text.secondary">
                {WAIT_MESSAGES[wait]}
              </Typography>
            )}
          </>
        )}
      </Stack>
    </Box>
  );
};

/** Requires a session; remembers where the user was headed. */
export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, booting } = useAuth();
  const location = useLocation();

  if (booting) return <BootScreen />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
};

/** Keeps a signed-in user away from /login. */
export const PublicOnlyRoute = ({ children }) => {
  const { isAuthenticated, booting } = useAuth();
  if (booting) return <BootScreen />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
};

export const RoleGuard = ({ roles = [], children }) => {
  const { user } = useAuth();
  if (!roles.length || roles.includes(user?.role)) return children;

  return (
    <Box sx={{ py: 4 }}>
      <PermissionDenied
        title="This section is restricted"
        message={`Your account is a ${
          { superadmin: 'Super Admin', admin: 'Branch Admin', staff: 'Billing Staff' }[user?.role] || 'user'
        } account. Only ${roles
          .map((r) => ({ superadmin: 'Super Admin', admin: 'Branch Admin', staff: 'Billing Staff' }[r]))
          .join(' and ')} accounts can open this page.`}
      />
      <Box sx={{ textAlign: 'center' }}>
        <Button variant="outlined" href="/dashboard">
          Back to dashboard
        </Button>
      </Box>
    </Box>
  );
};
