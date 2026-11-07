import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, LinearProgress, Typography, Button, Stack } from '@mui/material';
import Refresh from '@mui/icons-material/Refresh';
import { useAuth } from '../context/AuthContext.jsx';
import { PermissionDenied, ConnectionIcon, ErrorDetails } from '../components/common/StateViews.jsx';
import { brand, surface } from '../theme/index.js';
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
  pending: 'Connecting to the server…',
  ready: 'The server is up — finishing signing you in…',
  starting: 'The server is starting up — almost ready…',
  database: 'The server is up but waiting on its database…',
  silent: 'Waking up the server — after a quiet spell this can take up to a minute.',
  misconfigured: "This panel is set up to reach a server address this device can't reach.",
};

// The states where the server is on its way up, shown with a progress bar.
const WAKING_STATES = ['pending', 'silent', 'starting'];
// What a full wake-up usually takes, which the bar is measured against.
const EXPECTED_WAKE_MS = 60_000;

/** Shown while the refresh cookie is being exchanged on a hard reload. */
const BootScreen = () => {
  const { bootError, retryBoot } = useAuth();
  const [wait, setWait] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(null);

  // A long wait is explained by asking the server what it is doing, not guessed.
  useEffect(() => {
    if (bootError) return undefined;
    setWait(null);
    setElapsed(0);
    const startedAt = Date.now();
    let cancelled = false;
    let poll;
    const tick = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
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
      clearInterval(tick);
    };
  }, [bootError]);

  const waking = WAKING_STATES.includes(wait);
  // Never reaches the end on its own: it fills toward a typical wake-up, not a promise.
  const progress = Math.min(95, (elapsed / EXPECTED_WAKE_MS) * 100);

  useEffect(() => {
    // A setup mistake fails identically every time, so retrying would only hide it.
    if (!bootError || bootError.kind === 'offline' || bootError.kind === 'misconfigured') {
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

  // A normal load shows nothing; a notice appears only when the wait runs long or fails.
  if (!bootError && !wait) return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }} />;

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', px: 3 }}>
      <Stack alignItems="center" spacing={2} sx={{ textAlign: 'center', maxWidth: 460 }}>
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
            <ErrorDetails details={bootError.details} />
          </>
        ) : (
          <>
            {waking && (
              <LinearProgress
                variant="determinate"
                value={progress}
                aria-label="Waking up the server"
                sx={{
                  width: 220,
                  height: 4,
                  borderRadius: 2,
                  bgcolor: surface.goldSoft,
                  '& .MuiLinearProgress-bar': { bgcolor: brand.gold, borderRadius: 2 },
                }}
              />
            )}
            <Typography variant="body2" color="text.secondary">
              {WAIT_MESSAGES[wait]}
            </Typography>
            {waking && (
              <Typography variant="caption" color="text.secondary">
                {Math.round(elapsed / 1000)}s — you can leave this open; it signs you in once the server is up.
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
