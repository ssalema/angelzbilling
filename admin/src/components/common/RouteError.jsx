import { useRouteError, isRouteErrorResponse, useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { Box, Card, Typography, Button, Stack, Alert, AlertTitle } from '@mui/material';
import { RefreshRounded, HomeOutlined, ErrorOutline } from '@mui/icons-material';
import { FONT, ICON, brand, surface } from '../../theme/index.js';

/**
 * A stale deploy leaves the browser asking for chunk names that no longer
 * exist; the only real fix is a reload, so we say that instead of showing a
 * generic stack trace.
 */
const isChunkLoadError = (error) =>
  /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(
    error?.message || ''
  );

const describe = (error) => {
  if (isRouteErrorResponse(error)) {
    return {
      title: error.status === 404 ? 'We could not find that page' : `Request failed (${error.status})`,
      message: error.statusText || 'The server rejected this request.',
    };
  }
  if (isChunkLoadError(error)) {
    return {
      title: 'This screen could not be loaded',
      message:
        'A newer version of the admin panel is probably live. Reload once and this page will open normally.',
    };
  }
  return {
    title: 'Something broke on this screen',
    message: 'Your data is safe. The rest of the admin panel still works — try again or move on.',
  };
};

/**
 * Route-level error screen. React Router renders the nearest `errorElement`,
 * so mounting this on the individual routes keeps the sidebar, topbar and
 * every other page alive when one feature fails.
 */
const RouteError = ({ fullHeight = false }) => {
  const error = useRouteError();
  const navigate = useNavigate();
  const location = useLocation();
  const { title, message } = describe(error);

  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error?.message || String(error);

  return (
    <Box
      sx={
        fullHeight
          ? { minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3, bgcolor: brand.ivory }
          : { py: { xs: 3, md: 5 }, display: 'grid', placeItems: 'center' }
      }
    >
      <Card sx={{ maxWidth: 560, width: '100%', textAlign: 'center', p: { xs: 3, md: 4 } }}>
        <Box
          sx={{
            width: 56,
            height: 56,
            mx: 'auto',
            mb: 2,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: surface.plumSoft,
          }}
        >
          <ErrorOutline sx={{ fontSize: ICON.illustration, color: brand.plumLight }} />
        </Box>

        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          {message}
        </Typography>

        {import.meta.env.DEV && detail && (
          <Alert severity="error" sx={{ mb: 2.5, textAlign: 'left' }}>
            <AlertTitle sx={{ fontWeight: 700 }}>{location.pathname}</AlertTitle>
            <Box component="pre" sx={{ m: 0, fontSize: FONT.tiny, whiteSpace: 'pre-wrap' }}>
              {detail}
            </Box>
          </Alert>
        )}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
          <Button variant="contained" startIcon={<RefreshRounded />} onClick={() => navigate(0)}>
            Try again
          </Button>
          <Button component={RouterLink} to="/dashboard" startIcon={<HomeOutlined />} color="inherit">
            Back to dashboard
          </Button>
        </Stack>
      </Card>
    </Box>
  );
};

export default RouteError;
