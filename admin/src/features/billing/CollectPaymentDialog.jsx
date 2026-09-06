import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Box,
  Chip,
  Typography,
  Divider,
  CircularProgress,
  InputAdornment,
} from '@mui/material';
import { PaymentsOutlined } from '@mui/icons-material';

import SummaryRow from '../../components/common/SummaryRow.jsx';
import SectionTitle from '../../components/common/SectionTitle.jsx';
import DialogCloseButton from '../../components/common/DialogCloseButton.jsx';
import { billApi } from '../../api/endpoints.js';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import { formatCurrency } from '../../utils/format.js';
import { PAYMENT_METHODS } from '../../utils/constants.js';
import { FONT, numericText, statusColors, surface } from '../../theme/index.js';

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

/**
 * Collects the balance on a pending bill.
 *
 * This updates the bill that is already there — same number, same items, same
 * prices, same stock — so there is nothing here to re-price and nothing to
 * deduct. All it asks for is how much came in and how, and the server flips the
 * bill to paid on its own once the balance reaches zero.
 *
 * Shared by the bill list and the bill detail page so the biller sees the same
 * dialog wherever they spot the pending bill.
 */
const CollectPaymentDialog = ({ open, bill, onClose, onCollected }) => {
  const snackbar = useSnackbar();

  const due = round2(bill?.amountDue);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Opening on a different bill starts a fresh entry, pre-filled with the whole
  // balance: settling in one go is by far the common case, and the biller can
  // still type a smaller figure over it.
  useEffect(() => {
    if (!open || !bill) return;
    setAmount(due > 0 ? String(due) : '');
    setMethod(bill.paymentMethod || 'cash');
    setNote('');
  }, [open, bill, due]);

  if (!bill) return null;

  const received = round2(amount === '' ? 0 : Number(amount));
  const remaining = round2(Math.max(0, due - received));
  const settles = received > 0 && remaining === 0;

  const error =
    amount === ''
      ? ''
      : received <= 0
        ? 'Enter an amount greater than zero'
        : received > due
          ? `Only ${formatCurrency(due, { precise: true })} is pending on this bill`
          : '';

  const submit = async () => {
    setSaving(true);
    try {
      const result = await billApi.collectPayment(bill.id, { amount: received, method, note });
      snackbar.success(result.message);
      onCollected?.(result.data);
      onClose();
    } catch (err) {
      snackbar.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogCloseButton onClose={onClose} disabled={saving} />

      <DialogTitle sx={{ pb: 0.5 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <PaymentsOutlined sx={{ color: statusColors.pending.color }} />
          <Box>
            <Typography sx={{ fontSize: FONT.lead, fontWeight: 700, lineHeight: 1.3 }}>Update payment</Typography>
            <Typography variant="caption" color="text.secondary">
              {bill.billNumber} · {bill.customer?.name}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ p: 1.5, mb: 2.5, borderRadius: 2, bgcolor: surface.plumFaint }}>
          <SummaryRow label="Bill total" value={formatCurrency(bill.grandTotal, { precise: true })} />
          <SummaryRow label="Already paid" value={formatCurrency(bill.amountPaid, { precise: true })} />
          <Divider sx={{ my: 0.75 }} />
          <SummaryRow
            label="Pending"
            value={formatCurrency(due, { precise: true })}
            strong
            tone={statusColors.pending.color}
          />
        </Box>

        <TextField
          label="Amount received *"
          type="number"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          autoFocus
          fullWidth
          error={Boolean(error)}
          helperText={error || 'Leave it at the full balance, or type what the customer paid today'}
          inputProps={{ min: 0, max: due, step: '0.01' }}
          InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
        />

        <Typography variant="subtitle2" sx={{ mt: 2.25, mb: 1 }}>
          Payment method
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
          {PAYMENT_METHODS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              onClick={() => setMethod(option.value)}
              variant={method === option.value ? 'filled' : 'outlined'}
              color={method === option.value ? 'primary' : 'default'}
              sx={{ height: 34, borderRadius: 2, fontWeight: 600, cursor: 'pointer' }}
            />
          ))}
        </Box>

        <TextField
          label="Note (optional)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          fullWidth
          multiline
          minRows={2}
          inputProps={{ maxLength: 300 }}
          sx={{ mt: 2.25 }}
        />

        {/* What this payment leaves behind, before it is committed. */}
        {received > 0 && !error && (
          <Box sx={{ mt: 2.25 }}>
            <SectionTitle title="After this payment" sx={{ mb: 0.5 }} />
            <Stack direction="row" justifyContent="space-between" alignItems="baseline">
              <Typography variant="body2" color="text.secondary">
                {settles ? 'Bill settled in full' : 'Balance still due'}
              </Typography>
              <Typography
                sx={{
                  ...numericText,
                  fontSize: FONT.figureSm,
                  color: settles ? 'success.main' : statusColors.pending.color,
                }}
              >
                {formatCurrency(remaining, { precise: true })}
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {settles
                ? 'This bill moves from Pending to Paid. Stock is not touched — it was deducted when the bill was raised.'
                : 'The bill stays Pending and the rest can be collected later on this same bill.'}
            </Typography>
          </Box>
        )}
      </DialogContent>

      {/* The cross in the corner is the only way out, as in every dialog here. */}
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button
          variant="contained"
          onClick={submit}
          disabled={saving || received <= 0 || Boolean(error)}
          startIcon={saving ? <CircularProgress size={15} color="inherit" /> : <PaymentsOutlined />}
        >
          {saving ? 'Saving…' : 'Record payment'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CollectPaymentDialog;
