import { Box, Typography, Stack } from '@mui/material';

/**
 * The heading that opens a card or panel — one rank, one face, everywhere.
 *
 * Before this existed the same level of heading was set three different ways
 * (h5 on the dashboard, h6 in Settings and the wizard, an uppercase overline on
 * the bill detail page), so the hierarchy shrank as you moved between screens.
 *
 * `description` is the supporting line underneath; `action` is the control slot
 * on the right, which drops below the title on narrow screens.
 */
const SectionTitle = ({ title, description, action, children, sx, ...rest }) => {
  const heading = (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="h6" {...rest}>
        {title || children}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {description}
        </Typography>
      )}
    </Box>
  );

  if (!action) return <Box sx={{ mb: description ? 2.25 : 2, ...sx }}>{heading}</Box>;

  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'stretch', sm: 'center' }}
      spacing={1.5}
      sx={{ mb: description ? 2.25 : 2, ...sx }}
    >
      {heading}
      <Box sx={{ flexShrink: 0 }}>{action}</Box>
    </Stack>
  );
};

export default SectionTitle;
