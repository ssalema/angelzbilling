import { Box, Typography, Button, Stack } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import { brand } from '../../theme/index.js';

const NotFoundPage = () => (
  <Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center', py: 8, px: 3 }}>
    <Stack alignItems="center" spacing={2} sx={{ textAlign: 'center' }}>
      <Typography
        sx={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: { xs: '4.5rem', sm: '6rem' },
          fontWeight: 700,
          color: brand.gold,
          lineHeight: 1,
        }}
      >
        404
      </Typography>

      <Typography variant="h3">This page does not exist</Typography>

      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
        The link may be out of date, or the record you are looking for has been removed.
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ pt: 1 }}>
        <Button startIcon={<ArrowBackRounded />} onClick={() => window.history.back()} color="inherit">
          Go back
        </Button>
        <Button component={RouterLink} to="/dashboard" variant="contained" startIcon={<HomeOutlined />}>
          Back to dashboard
        </Button>
      </Stack>
    </Stack>
  </Box>
);

export default NotFoundPage;
