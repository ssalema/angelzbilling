import { Card, Divider, Stack, Box } from '@mui/material';
import { SHADOW, STICKY_BAR } from '../../theme/index.js';

// The bar that follows a long form down the page carrying its save actions.
const StickyActionBar = ({ status, progress, children }) => (
  <Card
    sx={{
      mt: 2.5,
      position: 'sticky',
      bottom: STICKY_BAR.bottom,
      zIndex: STICKY_BAR.zIndex,
      overflow: 'hidden',
      backdropFilter: 'blur(6px)',
      boxShadow: SHADOW.sticky,
    }}
  >
    {progress}
    <Divider />
    <Stack
      direction={{ xs: 'column-reverse', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'stretch', sm: 'center' }}
      spacing={1.5}
      sx={{ p: STICKY_BAR.padding }}
    >
      <Box sx={{ minWidth: 0 }}>{status}</Box>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ width: { xs: '100%', sm: 'auto' }, flexShrink: 0 }}
      >
        {children}
      </Stack>
    </Stack>
  </Card>
);

export default StickyActionBar;
