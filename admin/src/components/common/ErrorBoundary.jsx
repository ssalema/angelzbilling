import { Component } from 'react';
import { Box, Typography, Button, Stack, Alert, AlertTitle } from '@mui/material';
import { RefreshRounded, HomeOutlined } from '@mui/icons-material';
import { FONT, brand } from '../../theme/index.js';

/**
 * Last line of defence. A render crash anywhere shows this rather than a blank
 * white page, and gives the user a way out.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // In production this is where a Sentry / LogRocket call would go.
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3, bgcolor: brand.ivory }}>
        <Box sx={{ maxWidth: 520, textAlign: 'center' }}>
          <Typography
            sx={{
              fontFamily: "'Cormorant Garamond', serif",
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: brand.plum,
              mb: 2,
            }}
          >
            Angelz Perfume
          </Typography>

          <Typography variant="h3" sx={{ mb: 1 }}>
            Something broke on this screen
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Your data is safe. Reloading usually clears this.
          </Typography>

          {import.meta.env.DEV && (
            <Alert severity="error" sx={{ mb: 2.5, textAlign: 'left' }}>
              <AlertTitle sx={{ fontWeight: 700 }}>{error.name}</AlertTitle>
              <Box component="pre" sx={{ m: 0, fontSize: FONT.tiny, whiteSpace: 'pre-wrap' }}>
                {error.message}
              </Box>
            </Alert>
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
            <Button
              variant="contained"
              startIcon={<RefreshRounded />}
              onClick={() => window.location.reload()}
            >
              Reload the page
            </Button>
            <Button
              startIcon={<HomeOutlined />}
              onClick={() => {
                window.location.href = '/dashboard';
              }}
              color="inherit"
            >
              Back to dashboard
            </Button>
          </Stack>
        </Box>
      </Box>
    );
  }
}

export default ErrorBoundary;
