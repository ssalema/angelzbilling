import { Box, Typography, Stack, Tooltip } from '@mui/material';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { ICON } from '../../theme/index.js';

// The heading that opens a card or panel — one rank, one face, everywhere.
const SectionTitle = ({ title, description, descriptionAs = 'below', action, children, sx, ...rest }) => {
  const asTooltip = Boolean(description) && descriptionAs === 'tooltip';

  const heading = (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" alignItems="center" spacing={0.75}>
        <Typography variant="h6" {...rest}>
          {title || children}
        </Typography>
        {asTooltip && (
          <Tooltip title={description}>
            {/* Focusable, so the blurb is reachable without a pointer. */}
            <InfoOutlined
              tabIndex={0}
              aria-label={description}
              sx={{
                fontSize: ICON.action,
                color: 'text.secondary',
                cursor: 'help',
                outlineOffset: 2,
                flexShrink: 0,
              }}
            />
          </Tooltip>
        )}
      </Stack>
      {description && !asTooltip && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {description}
        </Typography>
      )}
    </Box>
  );

  const mb = description && !asTooltip ? 2.25 : 2;

  if (!action) return <Box sx={{ mb, ...sx }}>{heading}</Box>;

  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'stretch', sm: 'center' }}
      spacing={1.5}
      sx={{ mb, ...sx }}
    >
      {heading}
      <Box sx={{ flexShrink: 0 }}>{action}</Box>
    </Stack>
  );
};

export default SectionTitle;
