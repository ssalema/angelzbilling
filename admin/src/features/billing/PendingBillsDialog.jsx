import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Box,
  Typography,
  Divider,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';

import DialogCloseButton from '../../components/common/DialogCloseButton.jsx';
import SummaryRow from '../../components/common/SummaryRow.jsx';
import { formatCurrency, formatDate } from '../../utils/format.js';
import { FONT, ICON, INSET_RADIUS, numericText, statusColors, surface } from '../../theme/index.js';

// Shown over the billing form when the typed mobile number has unpaid bills.
const PendingBillsDialog = ({ open, customer, onClose, onCollect }) => {
  const bills = customer?.pendingBills || [];
  if (!bills.length) return null;

  const totalDue = bills.reduce((sum, bill) => sum + Number(bill.amountDue || 0), 0);

  // Ignore backdrop clicks and Escape; only explicit actions close it.
  const handleClose = (_event, reason) => {
    if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
    onClose?.();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogCloseButton onClose={onClose} label="Continue billing" />

      <DialogTitle sx={{ pb: 1, pr: 6 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <WarningAmberRounded sx={{ fontSize: ICON.action, color: statusColors.pending.color }} />
          <Box>
            <Typography sx={{ fontSize: FONT.lead, fontWeight: 700, lineHeight: 1.3 }}>
              This customer has a pending balance
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {customer.name} · {bills.length} unpaid bill{bills.length === 1 ? '' : 's'}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ p: 1.5, mb: 2, borderRadius: `${INSET_RADIUS}px`, bgcolor: surface.plumFaint }}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline">
            <Typography variant="body2" color="text.secondary">
              Total pending
            </Typography>
            <Typography sx={{ ...numericText, fontSize: FONT.figureSm, color: statusColors.pending.color }}>
              {formatCurrency(totalDue, { precise: true })}
            </Typography>
          </Stack>
        </Box>

        {bills.map((bill, index) => (
          <Box key={bill.id}>
            {index > 0 && <Divider sx={{ my: 1.25 }} />}
            <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {bill.billNumber}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {formatDate(bill.createdAt)}
              </Typography>
            </Stack>
            <SummaryRow label="Bill total" value={formatCurrency(bill.grandTotal, { precise: true })} />
            <SummaryRow label="Paid" value={formatCurrency(bill.amountPaid, { precise: true })} />
            <SummaryRow
              label="Still due"
              value={formatCurrency(bill.amountDue, { precise: true })}
              strong
              tone={statusColors.pending.color}
            />
            {/* Actions per bill, so it is clear which balance is collected.
                Collecting here avoids leaving the sale in progress. */}
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button
                component={RouterLink}
                to={`/billing/${bill.id}`}
                size="small"
                variant="outlined"
                fullWidth
                startIcon={<ReceiptLongOutlined sx={{ fontSize: ICON.inline }} />}
              >
                Open Bill
              </Button>
              <Button
                size="small"
                variant="contained"
                fullWidth
                onClick={() => onCollect?.(bill)}
                startIcon={<PaymentsOutlined sx={{ fontSize: ICON.inline }} />}
                sx={{
                  bgcolor: statusColors.pending.color,
                  '&:hover': { bgcolor: statusColors.pending.color, filter: 'brightness(0.92)' },
                }}
              >
                Collect Bill
              </Button>
            </Stack>
          </Box>
        ))}

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          A balance is collected against its own bill and never rolled into the new one, so the bill being
          rung up behind this stays exactly as it is.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button variant="contained" onClick={onClose}>
          Continue billing
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PendingBillsDialog;
