import { Card, Box, Typography, Stack, Skeleton } from '@mui/material';
import { TrendingUp, TrendingDown, TrendingFlat } from '@mui/icons-material';
import { CARD_PAD, ICON, numericText } from '../../../theme/index.js';


/**
 * The summary tile used four times across the top of the dashboard.
 * Label, big value, a growth pill and a supporting caption — matching the
 * reference layout, in the perfume palette.
 */
const StatCard = ({ label, value, caption, growth, icon: Icon, color = '#3E2545', loading }) => {
  if (loading) {
    return (
      <Card sx={{ p: CARD_PAD, height: '100%' }}>
        <Skeleton variant="text" width="55%" height={13} />
        <Skeleton variant="text" width="70%" height={40} sx={{ mt: 0.5 }} />
        <Skeleton variant="text" width="85%" height={14} />
      </Card>
    );
  }

  const hasGrowth = typeof growth === 'number' && Number.isFinite(growth);
  const up = growth > 0;
  const flat = growth === 0;
  const GrowthIcon = flat ? TrendingFlat : up ? TrendingUp : TrendingDown;
  const growthColor = flat ? 'text.secondary' : up ? 'success.main' : 'error.main';

  return (
    <Card sx={{ p: CARD_PAD, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4 }}>
          {label}
        </Typography>

        {Icon && (
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: `${color}14`,
              flexShrink: 0,
            }}
          >
            <Icon sx={{ fontSize: ICON.nav, color }} />
          </Box>
        )}
      </Stack>

      <Typography
        variant="h2"
        sx={{
          ...numericText,
          fontSize: { xs: '1.6rem', sm: '1.85rem' },
          lineHeight: 1.15,
          mt: 0.25,
        }}
      >
        {value}
      </Typography>

      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 'auto', pt: 1, flexWrap: 'wrap' }}>
        {hasGrowth && (
          <Stack direction="row" spacing={0.25} alignItems="center" sx={{ color: growthColor }}>
            <GrowthIcon sx={{ fontSize: ICON.inline }} />
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {up ? '+' : ''}
              {growth}%
            </Typography>
          </Stack>
        )}
        {caption && (
          <Typography variant="caption" color="text.secondary">
            {caption}
          </Typography>
        )}
      </Stack>
    </Card>
  );
};

export default StatCard;
