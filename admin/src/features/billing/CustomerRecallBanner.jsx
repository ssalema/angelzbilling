import { useEffect, useRef, useState } from 'react';
import { Alert, AlertTitle, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import PersonAddAltRounded from '@mui/icons-material/PersonAddAltRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';

import useCustomerRecall from './useCustomerRecall.js';
import PendingBillsDialog from './PendingBillsDialog.jsx';
import CollectPaymentDialog from './CollectPaymentDialog.jsx';
import { formatCurrency, formatDate } from '../../utils/format.js';
import { ICON } from '../../theme/index.js';

const CustomerRecallBanner = () => {
  const { customer, loading, searched, applySaved, forget, refresh } = useCustomerRecall();

  const [pendingOpen, setPendingOpen] = useState(false);
  /** The pending bill whose balance is being taken, if any. */
  const [collecting, setCollecting] = useState(null);

  // The warning interrupts once per number.
  const warnedFor = useRef('');
  const owed = Number(customer?.totalDue || 0);
  const hasPending = Boolean(customer?.pendingBills?.length);

  useEffect(() => {
    if (!hasPending) return;
    const key = `${customer.mobileCountryCode}-${customer.mobile}`;
    if (warnedFor.current === key) return;
    warnedFor.current = key;
    setPendingOpen(true);
  }, [hasPending, customer]);

  const banner = () => {
    if (loading) {
      return (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, color: 'text.secondary' }}>
          <CircularProgress size={14} thickness={5} />
          <Typography variant="caption">Checking earlier bills for this number…</Typography>
        </Stack>
      );
    }

    // An open balance turns the recall amber: the same banner, saying the one
    // extra thing the biller has to know before ringing up another sale.
    if (customer) {
      return (
        <Alert
          severity={hasPending ? 'warning' : 'success'}
          icon={hasPending ? <WarningAmberRounded fontSize="small" /> : <HistoryRounded fontSize="small" />}
          sx={{ mb: 2, alignItems: 'center' }}
          action={
            <Stack direction="row" spacing={0.5}>
              {hasPending && (
                <Button size="small" color="inherit" onClick={() => setPendingOpen(true)}>
                  View pending
                </Button>
              )}
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
            {hasPending && (
              <>
                {' · '}
                <Box component="strong">
                  {formatCurrency(owed)} pending across {customer.pendingBills.length} bill
                  {customer.pendingBills.length === 1 ? '' : 's'}
                </Box>
              </>
            )}
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

  return (
    <>
      {banner()}

      <PendingBillsDialog
        open={pendingOpen}
        customer={customer}
        onClose={() => setPendingOpen(false)}
        // A recall row carries no customer of its own — the collect dialog names
        // one in its header, and it is this customer by definition.
        onCollect={(bill) => setCollecting({ ...bill, customer: { name: customer.name } })}
      />

      <CollectPaymentDialog
        open={Boolean(collecting)}
        bill={collecting}
        onClose={() => setCollecting(null)}
        // The balance just changed, so the warning behind this dialog is now
        // stale — re-read it rather than leaving a settled bill on the list.
        onCollected={refresh}
      />
    </>
  );
};

export default CustomerRecallBanner;
