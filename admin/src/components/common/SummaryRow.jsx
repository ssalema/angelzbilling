import { Stack, Typography } from '@mui/material';

// Label on the left, value on the right; used by totals blocks and detail panels.
const SummaryRow = ({ label, value, strong = false, tone }) => (
  <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ py: 0.6 }}>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    <Typography
      variant="body2"
      sx={{
        fontWeight: strong ? 700 : 600,
        textAlign: 'right',
        color: tone || 'text.primary',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {value}
    </Typography>
  </Stack>
);

export default SummaryRow;
