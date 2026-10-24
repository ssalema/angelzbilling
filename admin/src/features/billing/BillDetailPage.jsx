import { useEffect, useRef, useState } from 'react';
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
  CircularProgress,
} from '@mui/material';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import ReplayOutlined from '@mui/icons-material/ReplayOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';

import PageHeader from '../../components/common/PageHeader.jsx';
import StatusChip from '../../components/common/StatusChip.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import SectionTitle from '../../components/common/SectionTitle.jsx';
import SummaryRow from '../../components/common/SummaryRow.jsx';
import { ErrorState, CardSkeleton } from '../../components/common/StateViews.jsx';
import BillPrintView from './BillPrintView.jsx';
import CollectPaymentDialog from './CollectPaymentDialog.jsx';

import { billApi } from '../../api/endpoints.js';
import { downloadBillPdf } from '../../utils/downloadBill.js';
import useApiResource from '../../hooks/useApiResource.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import useRequestKey from '../../hooks/useRequestKey.js';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format.js';
import { splitGst } from './billSchema.js';
import { PAYMENT_METHOD_LABELS, locationFullLabel } from '../../utils/constants.js';
import { formatContactNumber } from '../../utils/countries.js';
import { FONT, CARD_HEAD_PAD, CARD_PAD, GUTTER, brand, numericText, statusColors } from '../../theme/index.js';

// Long bills scroll inside the items card. Row height is in px.
const ITEMS_BEFORE_SCROLL = 8;
const ITEM_ROW_HEIGHT = 97;

const BillDetailPage = () => {
  const statusKey = useRequestKey();
  const { id } = useParams();
  const snackbar = useSnackbar();
  const { isAdmin } = useAuth();
  const { branchesEnabled } = useSettings();
  const [searchParams] = useSearchParams();

  const [menuAnchor, setMenuAnchor] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);

  // The PDF is rendered from the off-screen slip.
  const slipRef = useRef(null);
  const [downloading, setDownloading] = useState(false);

  const { data: bill, loading, error, reload } = useApiResource(() => billApi.get(id), [id], { watch: 'bills' });

  // ?print=1 opens the print dialog once the bill has rendered.
  useEffect(() => {
    if (bill && searchParams.get('print') === '1') {
      const timer = setTimeout(() => window.print(), 350);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [bill, searchParams]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadBillPdf(slipRef.current, bill);
    } catch (err) {
      snackbar.error(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const changeStatus = async (status, reason) => {
    try {
      const result = await billApi.setStatus(id, { status, reason }, statusKey.get());
      statusKey.renew();
      snackbar.success(result.message);
      reload();
    } catch (err) {
      snackbar.error(err.message);
    }
  };

  // Same header in every state so the page doesn't jump.
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
        <Grid container spacing={GUTTER.page}>
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
  // Tax is split half CGST, half SGST.
  const gst = splitGst(bill.taxPercent, bill.taxAmount);

  const amountDue = Number(bill.amountDue || 0);
  const canCollectPayment = bill.status === 'pending' && amountDue > 0;
  // Newest first.
  const history = [...(bill.payments || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
  const refund = (bill.statusHistory || []).find((event) => event.to === 'refunded');

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
              {canCollectPayment && (
                <Button
                  variant="contained"
                  startIcon={<PaymentsOutlined />}
                  onClick={() => setPaymentOpen(true)}
                  sx={{
                    bgcolor: statusColors.pending.color,
                    '&:hover': { bgcolor: statusColors.pending.color, filter: 'brightness(0.92)' },
                  }}
                >
                  Update payment
                </Button>
              )}
              <Button
                variant={canCollectPayment ? 'outlined' : 'contained'}
                startIcon={<PrintOutlined />}
                onClick={() => window.print()}
              >
                Print
              </Button>
              <Button
                variant="outlined"
                startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <DownloadOutlined />}
                disabled={downloading}
                onClick={handleDownload}
              >
                Download
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

        <Grid container spacing={GUTTER.page} alignItems="flex-start">
          {/* ── Items ── */}
          <Grid item xs={12} md={8}>
            <Card>
              <Box sx={CARD_HEAD_PAD}>
                <SectionTitle title={`Items (${items.length})`} sx={{ mb: 0 }} />
              </Box>
              <Divider />

              <Box
                sx={{
                  ...(items.length > ITEMS_BEFORE_SCROLL && {
                    maxHeight: ITEMS_BEFORE_SCROLL * ITEM_ROW_HEIGHT,
                    overflowY: 'auto',
                  }),
                }}
              >
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
              </Box>
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
                  {bill.customer?.name || 'NA'}
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
                  {branchesEnabled && (
                    <SummaryRow
                      label="Branch"
                      // No branch means the bill was raised at Head Office.
                      value={locationFullLabel(bill.branch)}
                    />
                  )}
                  <SummaryRow label="Billed by" value={bill.billedBy?.name || 'NA'} />
                  <SummaryRow label="Date" value={formatDate(bill.createdAt, 'time')} />
                  {refund && (
                    <>
                      <SummaryRow label="Refunded by" value={refund.by?.name || 'NA'} />
                      <SummaryRow label="Refunded on" value={formatDate(refund.at, 'time')} />
                      {refund.note && <SummaryRow label="Reason" value={refund.note} />}
                    </>
                  )}
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
                    <>
                      <SummaryRow
                        label={`CGST (${formatNumber(gst.half)}%)`}
                        value={formatCurrency(gst.cgst, { precise: true })}
                      />
                      <SummaryRow
                        label={`SGST (${formatNumber(gst.half)}%)`}
                        value={formatCurrency(gst.sgst, { precise: true })}
                      />
                    </>
                  )}
                  <SummaryRow label="Payment mode" value={paymentLabel} />

                  <Divider sx={{ my: 1 }} />

                  <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                    <Typography sx={{ fontSize: FONT.lead, fontWeight: 700 }}>Total</Typography>
                    <Typography sx={{ ...numericText, fontSize: FONT.figureSm }}>
                      {formatCurrency(bill.grandTotal, { precise: true })}
                    </Typography>
                  </Stack>

                  {/* Show paid and due amounts only when a balance remains. */}
                  {amountDue > 0 && (
                    <>
                      <Divider sx={{ my: 1 }} />
                      <SummaryRow label="Paid" value={formatCurrency(bill.amountPaid, { precise: true })} />
                      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ py: 0.6 }}>
                        <Typography sx={{ fontSize: FONT.lead, fontWeight: 700 }}>Due</Typography>
                        <Typography
                          sx={{ ...numericText, fontSize: FONT.figureSm, color: statusColors.pending.color }}
                        >
                          {formatCurrency(amountDue, { precise: true })}
                        </Typography>
                      </Stack>
                    </>
                  )}

                  {savings > 0 && (
                    <Typography variant="body2" sx={{ mt: 0.75, color: 'success.main', fontWeight: 600 }}>
                      Saved {formatCurrency(savings, { precise: true })}
                    </Typography>
                  )}
                </Box>
              </Card>

              {/* ── Payment history ── */}
              {history.length > 0 && (
                <Card>
                  <Box sx={CARD_HEAD_PAD}>
                    <SectionTitle title={`Payment history (${history.length})`} sx={{ mb: 0 }} />
                  </Box>
                  <Divider />
                  {history.map((entry, index) => (
                    <Box key={entry._id || `${entry.at}-${index}`}>
                      {index > 0 && <Divider />}
                      <Box sx={{ p: CARD_PAD }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
                          <Typography sx={{ fontSize: FONT.lead, fontWeight: 700 }}>
                            {formatCurrency(entry.amount, { precise: true })}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {PAYMENT_METHOD_LABELS[entry.method] || entry.method}
                          </Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                          {entry.by?.name || 'NA'} · {formatDate(entry.at, 'medium')},{' '}
                          {formatDate(entry.at, 'clock')}
                        </Typography>
                        {entry.note && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            {entry.note}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Card>
              )}
            </Stack>
          </Grid>
        </Grid>
      </Box>

      {/* Slip is kept off-screen (not hidden) so Print and PDF download both work. */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          top: 0,
          left: -10000,
          width: 360,
          pointerEvents: 'none',
          '@media print': { position: 'static', left: 0, width: 'auto', pointerEvents: 'auto' },
        }}
      >
        <BillPrintView ref={slipRef} bill={bill} store={bill.store} />
      </Box>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setConfirmAction({
              status: 'refunded',
              title: 'Refund this bill?',
              message:
                'The bill will be marked refunded and its items returned to stock. Revenue reports will exclude it' +
                // Warn that any amount still due is written off too.
                (amountDue > 0
                  ? `, and the ${formatCurrency(amountDue)} still owed on it will no longer be collectable.`
                  : '.'),
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

      {/* Reload instead of patching, since the server decides the new status. */}
      <CollectPaymentDialog
        open={paymentOpen}
        bill={bill}
        onClose={() => setPaymentOpen(false)}
        onCollected={reload}
      />

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
