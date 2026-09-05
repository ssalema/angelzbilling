import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Box,
  Card,
  Grid,
  Stack,
  Button,
  Skeleton,
  Menu,
  MenuItem,
  ListItemIcon,
  Typography,
  Divider,
  Avatar,
} from '@mui/material';
import {
  PrintOutlined,
  MoreVertRounded,
  ReplayOutlined,
  Inventory2Outlined,
} from '@mui/icons-material';

import PageHeader from '../../components/common/PageHeader.jsx';
import StatusChip from '../../components/common/StatusChip.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import SectionTitle from '../../components/common/SectionTitle.jsx';
import SummaryRow from '../../components/common/SummaryRow.jsx';
import { ErrorState, CardSkeleton } from '../../components/common/StateViews.jsx';
import BillPrintView from './BillPrintView.jsx';

import { billApi } from '../../api/endpoints.js';
import useApiResource from '../../hooks/useApiResource.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import { formatCurrency, formatDate } from '../../utils/format.js';
import { PAYMENT_METHOD_LABELS } from '../../utils/constants.js';
import { formatContactNumber } from '../../utils/countries.js';
import { FONT, CARD_HEAD_PAD, CARD_PAD, brand, numericText } from '../../theme/index.js';

const BillDetailPage = () => {
  const { id } = useParams();
  const snackbar = useSnackbar();
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();

  const [menuAnchor, setMenuAnchor] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const { data: bill, loading, error, reload } = useApiResource(() => billApi.get(id), [id]);

  // ?print=1 opens the browser print dialog as soon as the bill has rendered.
  useEffect(() => {
    if (bill && searchParams.get('print') === '1') {
      const timer = setTimeout(() => window.print(), 350);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [bill, searchParams]);

  const changeStatus = async (status, reason) => {
    try {
      const result = await billApi.setStatus(id, { status, reason });
      snackbar.success(result.message);
      reload();
    } catch (err) {
      snackbar.error(err.message);
    }
  };

  // Every state renders the same header, so the page does not jump when the
  // bill lands. A bill number is a code, not a display heading — it reads as
  // data, in the same sans face as the rest of the page.
  const crumbs = [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Bill records', to: '/billing' },
    { label: bill?.billNumber || 'View' },
  ];
  const headerSx = {
    '& .MuiTypography-h1': {
      fontFamily: 'inherit',
      fontSize: { xs: '1.4rem', md: '1.6rem' },
      fontWeight: 700,
      letterSpacing: '0.01em',
    },
  };

  if (loading) {
    return (
      <Box>
        <PageHeader title={<Skeleton variant="text" width={220} />} breadcrumbs={crumbs} sx={headerSx} />
        <Grid container spacing={2.5}>
          <Grid item xs={12} md={8}>
            <CardSkeleton height={340} />
          </Grid>
          <Grid item xs={12} md={4}>
            <CardSkeleton height={340} />
          </Grid>
        </Grid>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <PageHeader title="Bill" breadcrumbs={crumbs} sx={headerSx} />
        <Card>
          <ErrorState error={error} onRetry={reload} />
        </Card>
      </Box>
    );
  }

  const canModify = isAdmin && !['cancelled', 'refunded'].includes(bill.status);
  const items = bill.items || [];
  const paymentLabel = PAYMENT_METHOD_LABELS[bill.paymentMethod] || bill.paymentMethod;
  const savings = Number(bill.totalDiscount || 0);

  return (
    <Box>
      <Box className="no-print">
        <PageHeader
          title={bill.billNumber}
          subtitle={`Billed ${formatDate(bill.createdAt, 'medium')}, ${formatDate(bill.createdAt, 'clock')}`}
          sx={headerSx}
          breadcrumbs={crumbs}
          action={
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Button variant="contained" startIcon={<PrintOutlined />} onClick={() => window.print()}>
                Print
              </Button>
              {canModify && (
                <Button
                  variant="outlined"
                  onClick={(e) => setMenuAnchor(e.currentTarget)}
                  sx={{ minWidth: 44, px: 1 }}
                >
                  <MoreVertRounded />
                </Button>
              )}
            </Stack>
          }
        />

        <Grid container spacing={2.5} alignItems="flex-start">
          {/* ── Items ── */}
          <Grid item xs={12} md={8}>
            <Card>
              <Box sx={CARD_HEAD_PAD}>
                <SectionTitle title={`Items (${items.length})`} sx={{ mb: 0 }} />
              </Box>
              <Divider />

              {items.map((item, index) => (
                <Box key={`${item.sku}-${item.variantSku}-${index}`}>
                  {index > 0 && <Divider />}
                  <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ p: CARD_PAD }}>
                    <Avatar
                      variant="rounded"
                      src={item.image || undefined}
                      alt={item.perfumeName}
                      sx={{ width: 56, height: 56, bgcolor: brand.ivoryDeep, color: brand.inkSoft }}
                    >
                      <Inventory2Outlined fontSize="small" />
                    </Avatar>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: FONT.lead, fontWeight: 700, lineHeight: 1.35 }}>
                        {item.perfumeName}
                      </Typography>
                      {(item.variantLabel || item.variantSku || item.sku) && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                          {[item.variantLabel, item.variantSku || item.sku].filter(Boolean).join(' · ')}
                        </Typography>
                      )}
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {formatCurrency(item.unitPrice, { precise: true })} × {item.quantity}
                        {item.discountPercent > 0 ? ` · ${item.discountPercent}% off` : ''}
                      </Typography>
                    </Box>

                    <Typography sx={{ fontSize: FONT.lead, fontWeight: 700, flexShrink: 0 }}>
                      {formatCurrency(item.lineTotal, { precise: true })}
                    </Typography>
                  </Stack>
                </Box>
              ))}
            </Card>

            {bill.notes && (
              <Card sx={{ mt: 2.5, p: CARD_PAD }}>
                <SectionTitle title="Notes" sx={{ mb: 0 }} />
                <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>
                  {bill.notes}
                </Typography>
              </Card>
            )}
          </Grid>

          {/* ── Customer, bill details, payment ── */}
          <Grid item xs={12} md={4}>
            <Stack spacing={2.5}>
              <Card sx={{ p: CARD_PAD }}>
                <SectionTitle title="Customer" sx={{ mb: 0 }} />
                <Typography sx={{ mt: 0.5, fontSize: FONT.lead, fontWeight: 700 }}>
                  {bill.customer?.name || '—'}
                </Typography>
                {bill.customer?.email && (
                  <Typography variant="body2" color="text.secondary">
                    {bill.customer.email}
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary">
                  {formatContactNumber(bill.customer?.mobileCountryCode, bill.customer?.mobile)}
                </Typography>
                {bill.customer?.address && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {bill.customer.address}
                  </Typography>
                )}
                {bill.customer?.gstin && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    GSTIN: {bill.customer.gstin}
                  </Typography>
                )}
              </Card>

              <Card sx={{ p: CARD_PAD }}>
                <SectionTitle title="Bill details" sx={{ mb: 0 }} />
                <Box sx={{ mt: 0.5 }}>
                  <SummaryRow label="Bill number" value={bill.billNumber} />
                  <SummaryRow
                    label="Branch"
                    value={
                      bill.branch?.name
                        ? `${bill.branch.name}${bill.branch.code ? ` (${bill.branch.code})` : ''}`
                        : '—'
                    }
                  />
                  <SummaryRow label="Billed by" value={bill.billedBy?.name || '—'} />
                  <SummaryRow label="Date" value={formatDate(bill.createdAt, 'time')} />
                  {bill.transactionId && <SummaryRow label="Transaction ID" value={bill.transactionId} />}
                </Box>
              </Card>

              <Card sx={{ p: CARD_PAD }}>
                <SectionTitle title="Payment summary" sx={{ mb: 0 }} />
                <Box sx={{ mt: 0.5 }}>
                  <StatusChip status={bill.status} sx={{ mb: 1 }} />
                  <SummaryRow label="Subtotal" value={formatCurrency(bill.subtotal, { precise: true })} />
                  {savings > 0 && (
                    <SummaryRow
                      label="Discount"
                      value={`− ${formatCurrency(savings, { precise: true })}`}
                      tone="success.main"
                    />
                  )}
                  {bill.taxAmount > 0 && (
                    <SummaryRow
                      label={`Tax (${bill.taxPercent}%)`}
                      value={formatCurrency(bill.taxAmount, { precise: true })}
                    />
                  )}
                  <SummaryRow label="Payment mode" value={paymentLabel} />

                  <Divider sx={{ my: 1 }} />

                  <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                    <Typography sx={{ fontSize: FONT.lead, fontWeight: 700 }}>Total</Typography>
                    <Typography sx={{ ...numericText, fontSize: FONT.figureSm }}>
                      {formatCurrency(bill.grandTotal, { precise: true })}
                    </Typography>
                  </Stack>

                  {savings > 0 && (
                    <Typography variant="body2" sx={{ mt: 0.75, color: 'success.main', fontWeight: 600 }}>
                      Saved {formatCurrency(savings, { precise: true })}
                    </Typography>
                  )}
                </Box>
              </Card>
            </Stack>
          </Grid>
        </Grid>
      </Box>

      {/* The thermal slip stays mounted but off-screen — Print still produces the receipt. */}
      <Box sx={{ display: 'none', '@media print': { display: 'block' } }}>
        <BillPrintView bill={bill} store={bill.store} />
      </Box>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setConfirmAction({
              status: 'refunded',
              title: 'Refund this bill?',
              message:
                'The bill will be marked refunded and its items returned to stock. Revenue reports will exclude it.',
              confirmLabel: 'Mark refunded',
              severity: 'error',
            });
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <ReplayOutlined fontSize="small" color="error" />
          </ListItemIcon>
          Refund bill
        </MenuItem>
      </Menu>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        message={confirmAction?.message}
        confirmLabel={confirmAction?.confirmLabel}
        severity={confirmAction?.severity}
        onConfirm={() => changeStatus(confirmAction.status)}
        onClose={() => setConfirmAction(null)}
      />
    </Box>
  );
};

export default BillDetailPage;
