import { Stack, Typography } from '@mui/material';

// A label on the left, a figure on the right — the line every totals block and detail panel is built from.
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
