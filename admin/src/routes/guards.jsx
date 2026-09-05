import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography, Button, Stack } from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';
import { PermissionDenied } from '../components/common/StateViews.jsx';
import { ICON, brand } from '../theme/index.js';

/** Shown while the refresh cookie is being exchanged on a hard reload. */
const BootScreen = () => (
  <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default' }}>
    <Stack alignItems="center" spacing={2}>
      <Typography
        sx={{
          fontFamily: "'Cormorant Garamond', serif",
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: brand.plum,
          fontSize: ICON.nav,
        }}
      >
        Angelz Perfume
      </Typography>
      <CircularProgress size={24} sx={{ color: brand.gold }} />
    </Stack>
  </Box>
);

/** Requires a session. Remembers where the user was headed. */
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

/**
 * Role gate. Renders a clear explanation rather than a redirect, so a branch
 * admin who bookmarks /users understands why they cannot see it.
 */
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
