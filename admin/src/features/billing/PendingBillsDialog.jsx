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
import { FONT, ICON, numericText, statusColors, surface } from '../../theme/index.js';

/**
 * Raised over the billing form when the number just typed belongs to a customer
 * who still owes money.
 *
 * This is a warning, not a gate: the shop decides whether to sell to someone
 * with an open balance, and blocking the sale would leave a customer standing at
 * the counter while a biller hunts for a workaround. What it must not do is let
 * the bill be rung up while nobody at the counter knows there is a balance — so
 * it interrupts once, names the bills, and gets out of the way.
 */
const PendingBillsDialog = ({ open, customer, onClose, onCollect }) => {
  const bills = customer?.pendingBills || [];
  if (!bills.length) return null;

  const totalDue = bills.reduce((sum, bill) => sum + Number(bill.amountDue || 0), 0);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogCloseButton onClose={onClose} label="Continue billing" />

      <DialogTitle sx={{ pb: 0.5 }}>
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
        <Box sx={{ p: 1.5, mb: 2, borderRadius: 2, bgcolor: surface.plumFaint }}>
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
            {/* Its own pair per bill: with more than one open, a single shared
                action could only ever guess which balance the biller meant.
                Collecting happens right here — walking away to the bill record
                would abandon the sale being rung up behind this dialog. */}
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

      {/* Each bill above carries its own way out; this just gets on with the sale. */}
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button variant="contained" onClick={onClose}>
          Continue billing
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PendingBillsDialog;
