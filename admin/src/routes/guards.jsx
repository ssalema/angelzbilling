import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography, Button, Stack } from '@mui/material';
import Refresh from '@mui/icons-material/Refresh';
import { useAuth } from '../context/AuthContext.jsx';
import { PermissionDenied, ConnectionIcon } from '../components/common/StateViews.jsx';
import { ICON, brand } from '../theme/index.js';
import { cachedSiteName } from '../utils/branding.js';

// After this long, the boot screen explains the wait.
const SLOW_BOOT_MS = 6000;

/** Shown while the refresh cookie is being exchanged on a hard reload. */
const BootScreen = () => {
  const { bootError, retryBoot } = useAuth();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (bootError) return undefined;
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), SLOW_BOOT_MS);
    return () => clearTimeout(timer);
  }, [bootError]);

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
          </>
        ) : (
          <>
            <CircularProgress size={24} sx={{ color: brand.gold }} />
            {slow && (
              <Typography variant="body2" color="text.secondary">
                Still connecting — this is taking longer than usual. Your connection may be slow.
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
