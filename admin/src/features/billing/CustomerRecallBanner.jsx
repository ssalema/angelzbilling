import { Alert, AlertTitle, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { HistoryRounded, PersonAddAltRounded } from '@mui/icons-material';

import useCustomerRecall from './useCustomerRecall.js';
import { formatCurrency, formatDate } from '../../utils/format.js';
import { ICON } from '../../theme/index.js';

/**
 * Sits above the customer fields and does the recall: type a number that has
 * bought here before and the rest of the form fills itself from their last bill.
 * Rendered inside the billing FormProvider — it drives the form directly.
 */
const CustomerRecallBanner = () => {
  const { customer, loading, searched, applySaved, forget } = useCustomerRecall();

  if (loading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, color: 'text.secondary' }}>
        <CircularProgress size={14} thickness={5} />
        <Typography variant="caption">Checking earlier bills for this number…</Typography>
      </Stack>
    );
  }

  if (customer) {
    return (
      <Alert
        severity="success"
        icon={<HistoryRounded fontSize="small" />}
        sx={{ mb: 2, alignItems: 'center' }}
        action={
          <Stack direction="row" spacing={0.5}>
            <Button size="small" color="inherit" onClick={applySaved}>
              Use saved details
            </Button>
            <Button size="small" color="inherit" onClick={forget}>
              Not them
            </Button>
          </Stack>
        }
      >
        <AlertTitle sx={{ mb: 0.25 }}>Returning customer — {customer.name}</AlertTitle>
        <Box component="span" sx={{ typography: 'caption' }}>
          {customer.visits} bill{customer.visits === 1 ? '' : 's'} · {formatCurrency(customer.totalSpent)} spent ·
          last visit {formatDate(customer.lastVisit)} ({customer.lastBillNumber})
        </Box>
      </Alert>
    );
  }

  if (searched) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, color: 'text.secondary' }}>
        <PersonAddAltRounded sx={{ fontSize: ICON.inline }} />
        <Typography variant="caption">
          No earlier bills for this number — filling in a new customer.
        </Typography>
      </Stack>
    );
  }

  return null;
};

export default CustomerRecallBanner;
