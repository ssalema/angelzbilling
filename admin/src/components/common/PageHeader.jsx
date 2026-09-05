import { Box, Typography, Breadcrumbs, Link, Stack } from '@mui/material';
import { NavigateNext } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { FONT, ICON } from '../../theme/index.js';

/**
 * The title block every page starts with: breadcrumbs, heading, subtitle and
 * an action slot on the right (which wraps below the title on mobile).
 */
const PageHeader = ({ title, subtitle, breadcrumbs = [], action, sx }) => (
  <Box sx={{ mb: 3, ...sx }}>
    {breadcrumbs.length > 0 && (
      <Breadcrumbs
        separator={<NavigateNext sx={{ fontSize: ICON.inline }} />}
        sx={{ mb: 0.75, '& .MuiBreadcrumbs-li': { fontSize: FONT.small } }}
      >
        {breadcrumbs.map((crumb, index) =>
          crumb.to && index < breadcrumbs.length - 1 ? (
            <Link
              key={crumb.label}
              component={RouterLink}
              to={crumb.to}
              underline="hover"
              color="text.secondary"
              sx={{ fontSize: FONT.small }}
            >
              {crumb.label}
            </Link>
          ) : (
            <Typography key={crumb.label} color="text.primary" sx={{ fontSize: FONT.small, fontWeight: 600 }}>
              {crumb.label}
            </Typography>
          )
        )}
      </Breadcrumbs>
    )}

    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'stretch', sm: 'flex-end' }}
      spacing={2}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' }, lineHeight: 1.15 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>

      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
    </Stack>
  </Box>
);

export default PageHeader;
