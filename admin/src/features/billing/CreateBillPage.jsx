import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, FormProvider, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Box,
  Card,
  Grid,
  Typography,
  Stack,
  Button,
  Divider,
  Autocomplete,
  TextField,
  IconButton,
  Avatar,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Dialog,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  InputAdornment,
  Tooltip,
} from '@mui/material';
import {
  DeleteOutline,
  ReceiptLongOutlined,
  PrintOutlined,
  VisibilityOutlined,
  SearchRounded,
  PersonOutline,
  AddShoppingCartOutlined,
  CheckCircleOutline,
} from '@mui/icons-material';

import PageHeader from '../../components/common/PageHeader.jsx';
import { RHFTextField, RHFNumberField } from '../../components/form/RHFControls.jsx';
import RHFContactNumber from '../../components/form/RHFContactNumber.jsx';
import SectionTitle from '../../components/common/SectionTitle.jsx';
import SummaryRow from '../../components/common/SummaryRow.jsx';
import { EmptyState } from '../../components/common/StateViews.jsx';
import BillPrintView from './BillPrintView.jsx';
import CustomerRecallBanner from './CustomerRecallBanner.jsx';
import DialogCloseButton from '../../components/common/DialogCloseButton.jsx';

import { billSchema, emptyBill, calculateTotals } from './billSchema.js';
import { perfumeApi, billApi } from '../../api/endpoints.js';
import useApiResource from '../../hooks/useApiResource.js';
import useDebounce from '../../hooks/useDebounce.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import { applyServerErrors } from '../../api/client.js';
import { formatCurrency, formatGrams, formatNumber, unitsFromGrams } from '../../utils/format.js';
import { PAYMENT_METHODS } from '../../utils/constants.js';
import { FONT, CARD_HEAD_PAD, CARD_PAD, ICON, brand, numericText, surface } from '../../theme/index.js';

const CreateBillPage = () => {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const { user } = useAuth();
  const { settings, loading: settingsLoading, defaultTaxPercent, branchesEnabled } = useSettings();

  const [perfumeQuery, setPerfumeQuery] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [savedBill, setSavedBill] = useState(null);

  const debouncedQuery = useDebounce(perfumeQuery, 300);

  const methods = useForm({
    resolver: zodResolver(billSchema),
    defaultValues: { ...emptyBill, taxPercent: defaultTaxPercent || 0 },
    mode: 'onTouched',
  });

  const {
    control,
    handleSubmit,
    setError,
    reset,
    setValue,
    getValues,
    formState: { isSubmitting },
  } = methods;

  /**
   * The store's default tax reaches this form asynchronously: on a hard reload
   * of /billing/new the settings request cannot even start until the refresh
   * cookie has been exchanged, so `defaultValues` above is read while the value
   * is still 0. Apply it once it lands, unless the biller has already typed a
   * rate of their own — a bill must never quietly go out untaxed because the
   * page won a race against its own settings.
   */
  const taxDefaultApplied = useRef(false);
  useEffect(() => {
    if (taxDefaultApplied.current || settingsLoading) return;
    taxDefaultApplied.current = true;
    if (defaultTaxPercent && !Number(getValues('taxPercent'))) {
      setValue('taxPercent', defaultTaxPercent);
    }
  }, [settingsLoading, defaultTaxPercent, getValues, setValue]);

  const { fields, append, remove, update } = useFieldArray({ control, name: 'items' });

  const watched = useWatch({ control });

  /**
   * Grams of a perfume already spoken for by the lines on this bill.
   * `exceptIndex` leaves one line out, which is how we work out the headroom
   * that line still has: its own quantity is what we are about to re-decide.
   */
  const gramsClaimed = useCallback(
    (perfumeId, exceptIndex = -1) =>
      (watched.items || []).reduce((sum, item, index) => {
        if (index === exceptIndex || String(item?.perfume) !== String(perfumeId)) return sum;
        return sum + (Number(item?.quantity) || 0) * (Number(item?.sizeGrams) || 1);
      }, 0),
    [watched.items]
  );

  /** Units this line can still reach, after the other lines take their share. */
  const unitsCeilingFor = useCallback(
    (item, index) => {
      const free = (Number(item?.availableGrams) || 0) - gramsClaimed(item?.perfume, index);
      return unitsFromGrams(free, Number(item?.sizeGrams) || 1);
    },
    [gramsClaimed]
  );
  const totals = useMemo(
    () =>
      calculateTotals(watched.items || [], {
        taxPercent: watched.taxPercent,
        extraDiscount: watched.extraDiscount,
      }),
    [watched.items, watched.taxPercent, watched.extraDiscount]
  );

  const options = useApiResource(
    () => perfumeApi.lookup({ q: debouncedQuery, limit: 25 }),
    [debouncedQuery]
  );

  const addItem = useCallback(
    (option) => {
      if (!option) return;

      // Same SKU twice should bump the quantity, not create a second line.
      const existingIndex = (watched.items || []).findIndex(
        (item) =>
          item.perfume === String(option.perfumeId) && (item.variantSku || '') === (option.variantSku || '')
      );

      // Stock arrives as the perfume's bulk grams, shared by every size, so how
      // many bottles we can add depends on this fill AND on what the other lines
      // of the same perfume have already claimed: 250 g of a 50gm attar is five
      // units, and fewer still if a 100gm line is already on the bill.
      const freeGrams = (Number(option.stock) || 0) - gramsClaimed(option.perfumeId, existingIndex);
      const sellable = unitsFromGrams(freeGrams, option.sizeGrams);

      if (existingIndex >= 0) {
        const current = watched.items[existingIndex];
        if (Number(current.quantity) + 1 > sellable) {
          snackbar.warning(
            `Only ${sellable} more unit(s) of "${option.label}" fit in the ${formatGrams(
              option.stock
            )} of "${option.name}" left in stock`
          );
          return;
        }
        update(existingIndex, { ...current, quantity: Number(current.quantity) + 1 });
        return;
      }

      if (sellable <= 0) {
        snackbar.warning(
          gramsClaimed(option.perfumeId) > 0
            ? `The rest of this bill already uses all ${formatGrams(option.stock)} of "${option.name}"`
            : `"${option.label}" is out of stock`
        );
        return;
      }

      append({
        perfume: String(option.perfumeId),
        variantId: option.variantId ? String(option.variantId) : null,
        variantSku: option.variantSku || '',
        name: option.name,
        label: option.label,
        sku: option.variantSku || option.sku,
        image: option.image || '',
        availableGrams: Number(option.stock) || 0,
        sizeGrams: Number(option.sizeGrams) || 1,
        mrp: option.mrp,
        quantity: 1,
        discountPercent: option.discountPercent || 0,
      });
    },
    [append, update, watched.items, snackbar, gramsClaimed]
  );

  /** Strips display-only fields — the server prices from its own database. */
  const toPayload = (values) => ({
    customer: values.customer,
    items: values.items.map((item) => ({
      perfume: item.perfume,
      variantId: item.variantId || undefined,
      variantSku: item.variantSku || undefined,
      quantity: Number(item.quantity),
      discountPercent: Number(item.discountPercent) || 0,
    })),
    paymentMethod: values.paymentMethod,
    taxPercent: Number(values.taxPercent) || 0,
    extraDiscount: Number(values.extraDiscount) || 0,
    notes: values.notes,
  });

  const onSubmit = async (values) => {
    try {
      const result = await billApi.create(toPayload(values));
      snackbar.success(result.message);
      setSavedBill(result.data);
      setPreviewOpen(false);
    } catch (error) {
      applyServerErrors(error, setError);
      snackbar.error(error.message);
    }
  };

  const openPreview = handleSubmit(
    () => setPreviewOpen(true),
    () => snackbar.warning('Please complete the highlighted fields before previewing')
  );

  const startNewBill = () => {
    reset({ ...emptyBill, taxPercent: defaultTaxPercent || 0 });
    setSavedBill(null);
    setPerfumeQuery('');
  };

  /* ── Success state: the bill is saved, offer print / next actions ── */
  if (savedBill) {
    return (
      <Box>
        <PageHeader
          title="Bill created"
          subtitle={`${savedBill.billNumber} · ${formatCurrency(savedBill.grandTotal)}`}
          breadcrumbs={[{ label: 'Billing', to: '/billing' }, { label: savedBill.billNumber }]}
        />

        <Alert severity="success" icon={<CheckCircleOutline />} className="no-print" sx={{ mb: 2.5 }}>
          Bill <strong>{savedBill.billNumber}</strong> has been saved and stock has been updated.
        </Alert>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} className="no-print" sx={{ mb: 2.5 }}>
          <Button variant="contained" startIcon={<PrintOutlined />} onClick={() => window.print()}>
            Print bill
          </Button>
          <Button variant="outlined" startIcon={<AddShoppingCartOutlined />} onClick={startNewBill}>
            Create another bill
          </Button>
          <Button startIcon={<ReceiptLongOutlined />} onClick={() => navigate('/billing')}>
            Go to bill records
          </Button>
        </Stack>

        <Card sx={{ overflow: 'hidden', bgcolor: 'transparent', border: 'none', py: 3 }}>
          <BillPrintView bill={savedBill} store={{ ...settings, currencySymbol: '₹' }} />
        </Card>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Create bill"
        subtitle="Add the customer, pick the perfumes, then preview and print"
        breadcrumbs={[
          { label: 'Dashboard', to: '/dashboard' },
          { label: 'Billing', to: '/billing' },
          { label: 'Create bill' },
        ]}
      />

      <FormProvider {...methods}>
        <form onSubmit={openPreview} noValidate>
          <Grid container spacing={2.5}>
            {/* ── Left: customer + items ── */}
            <Grid item xs={12} lg={8}>
              <Card sx={{ p: CARD_PAD, mb: 2.5 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <PersonOutline sx={{ fontSize: ICON.action, color: 'text.secondary' }} />
                  <SectionTitle title="Customer details" sx={{ mb: 0 }} />
                </Stack>

                <CustomerRecallBanner />

                <Grid container spacing={2.25}>
                  {/* The number comes first: it is what recalls a returning buyer. */}
                  <Grid item xs={12} sm={6}>
                    <RHFContactNumber
                      name="customer.mobile"
                      codeName="customer.mobileCountryCode"
                      label="Contact number *"
                      helperText="Saved details load automatically for returning customers"
                      autoFocus
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <RHFTextField name="customer.name" label="Customer name *" placeholder="Full name" />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <RHFTextField name="customer.email" label="Email (optional)" type="email" />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <RHFTextField name="customer.gstin" label="GSTIN (optional)" />
                  </Grid>
                  <Grid item xs={12}>
                    <RHFTextField name="customer.address" label="Address (optional)" multiline minRows={2} />
                  </Grid>
                </Grid>

                <Divider sx={{ my: 2.5 }} />

                {/* Bill By is read-only and comes from the session, never the form */}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    label="Bill by"
                    value={user?.name || ''}
                    InputProps={{ readOnly: true }}
                    helperText="Taken from your signed-in account"
                    sx={{ bgcolor: surface.plumFaint }}
                  />
                  {branchesEnabled && (
                    <TextField
                      label="Branch"
                      value={user?.branch?.name || 'Default branch'}
                      InputProps={{ readOnly: true }}
                      helperText="This bill is recorded against this branch"
                      sx={{ bgcolor: surface.plumFaint }}
                    />
                  )}
                </Stack>
              </Card>

              {/* Items */}
              <Card sx={{ mb: 2.5 }}>
                <Box sx={{ ...CARD_HEAD_PAD }}>
                  <SectionTitle title="Perfumes" sx={{ mb: 1.75 }} />

                  <Autocomplete
                    options={options.data || []}
                    loading={options.loading}
                    getOptionLabel={(option) => option.label || ''}
                    isOptionEqualToValue={(a, b) => a.variantSku === b.variantSku && a.perfumeId === b.perfumeId}
                    filterOptions={(x) => x} // server already filtered
                    value={null}
                    blurOnSelect
                    clearOnBlur
                    onInputChange={(_event, value) => setPerfumeQuery(value)}
                    onChange={(_event, option) => {
                      addItem(option);
                      setPerfumeQuery('');
                    }}
                    noOptionsText={
                      debouncedQuery ? 'No published perfume matches that' : 'Start typing a perfume name or SKU'
                    }
                    renderOption={(props, option) => (
                      <Box component="li" {...props} key={`${option.perfumeId}-${option.variantSku}`}>
                        <Avatar
                          variant="rounded"
                          src={option.image || undefined}
                          sx={{ width: 36, height: 36, mr: 1.5, bgcolor: surface.plumSoft }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                            {option.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {option.variantSku || option.sku} ·{' '}
                            {unitsFromGrams(option.stock, option.sizeGrams) > 0
                              ? `${formatGrams(option.stock)} in stock · up to ${formatNumber(
                                  unitsFromGrams(option.stock, option.sizeGrams)
                                )} × ${formatGrams(option.sizeGrams)}`
                              : 'Out of stock'}
                          </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main', ml: 1 }}>
                          {formatCurrency(option.unitPrice)}
                        </Typography>
                      </Box>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="Search a perfume or scan a SKU to add it…"
                        InputProps={{
                          ...params.InputProps,
                          startAdornment: (
                            <>
                              <InputAdornment position="start">
                                <SearchRounded sx={{ fontSize: ICON.action, color: 'text.secondary' }} />
                              </InputAdornment>
                              {params.InputProps.startAdornment}
                            </>
                          ),
                          endAdornment: (
                            <>
                              {options.loading && <CircularProgress size={16} />}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        }}
                      />
                    )}
                  />
                </Box>

                <Divider />

                {fields.length === 0 ? (
                  <EmptyState
                    compact
                    icon={AddShoppingCartOutlined}
                    title="No items on this bill yet"
                    description="Search above to add the first perfume. Every size is listed as its own SKU."
                  />
                ) : (
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small" sx={{ minWidth: 640 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>Item</TableCell>
                          <TableCell align="right" sx={{ width: 96 }}>
                            MRP
                          </TableCell>
                          <TableCell align="center" sx={{ width: 92 }}>
                            Qty
                          </TableCell>
                          <TableCell align="right" sx={{ width: 104 }}>
                            Discount %
                          </TableCell>
                          <TableCell align="right" sx={{ width: 108 }}>
                            Amount
                          </TableCell>
                          <TableCell align="center" sx={{ width: 52 }} />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {fields.map((field, index) => {
                          const line = totals.lines[index] || {};
                          return (
                            <TableRow key={field.id}>
                              <TableCell>
                                <Stack direction="row" spacing={1.25} alignItems="center">
                                  <Avatar
                                    variant="rounded"
                                    src={field.image || undefined}
                                    sx={{ width: 36, height: 36, bgcolor: surface.plumSoft }}
                                  />
                                  <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                      {field.name}
                                    </Typography>
                                    <Stack direction="row" spacing={0.75} alignItems="center">
                                      {field.variantSku && (
                                        <Chip
                                          size="small"
                                          label={field.label?.split('—').pop()?.trim()}
                                          sx={{ height: 18, fontSize: FONT.micro }}
                                        />
                                      )}
                                      <Typography variant="caption" color="text.secondary">
                                        {field.sku} · {formatGrams(field.availableGrams)} in stock · up to{' '}
                                        {formatNumber(
                                          unitsCeilingFor(watched.items?.[index] || field, index)
                                        )}{' '}
                                        × {formatGrams(field.sizeGrams)} here
                                      </Typography>
                                    </Stack>
                                  </Box>
                                </Stack>
                              </TableCell>

                              <TableCell align="right">
                                <Typography variant="body2">{formatCurrency(field.mrp)}</Typography>
                              </TableCell>

                              <TableCell align="center">
                                <Controller
                                  control={control}
                                  name={`items.${index}.quantity`}
                                  render={({ field: qty, fieldState }) => (
                                    <TextField
                                      {...qty}
                                      value={qty.value ?? ''}
                                      onChange={(e) =>
                                        qty.onChange(e.target.value === '' ? '' : Number(e.target.value))
                                      }
                                      type="number"
                                      variant="standard"
                                      error={Boolean(fieldState.error)}
                                      helperText={fieldState.error?.message}
                                      inputProps={{
                                        min: 1,
                                        max: unitsCeilingFor(watched.items?.[index] || field, index),
                                        style: { textAlign: 'center', fontSize: 13 },
                                      }}
                                      sx={{ width: 76 }}
                                    />
                                  )}
                                />
                              </TableCell>

                              <TableCell align="right">
                                {/* Set on the perfume — bill-level changes go through Extra discount. */}
                                <Typography variant="body2">
                                  {formatNumber(Number(line.discountPercent) || 0)}%
                                </Typography>
                              </TableCell>

                              <TableCell align="right">
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                  {formatCurrency(line.lineTotal, { precise: true })}
                                </Typography>
                              </TableCell>

                              <TableCell align="center">
                                <Tooltip title="Remove item">
                                  <IconButton size="small" color="error" onClick={() => remove(index)}>
                                    <DeleteOutline sx={{ fontSize: ICON.action }} />
                                  </IconButton>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Box>
                )}
              </Card>
            </Grid>

            {/* ── Right: totals + payment ── */}
            <Grid item xs={12} lg={4}>
              <Card sx={{ p: CARD_PAD, position: { lg: 'sticky' }, top: 84 }}>
                <SectionTitle title="Bill summary" />

                <SummaryRow label={`Subtotal (${totals.totalQuantity} item${totals.totalQuantity === 1 ? '' : 's'})`} value={formatCurrency(totals.subtotal, { precise: true })} />
                {totals.lineDiscount > 0 && (
                  <SummaryRow
                    label="Item discounts"
                    value={`− ${formatCurrency(totals.lineDiscount, { precise: true })}`}
                    tone="success.main"
                  />
                )}

                <Stack direction="row" spacing={1.5} sx={{ my: 2 }}>
                  <RHFNumberField name="extraDiscount" label="Extra discount" prefix="₹" inputProps={{ min: 0 }} />
                  <RHFNumberField name="taxPercent" label="Tax" suffix="%" inputProps={{ min: 0, max: 100 }} />
                </Stack>

                {totals.extraDiscount > 0 && (
                  <SummaryRow
                    label="Bill discount"
                    value={`− ${formatCurrency(totals.extraDiscount, { precise: true })}`}
                    tone="success.main"
                  />
                )}
                {totals.taxAmount > 0 && (
                  <SummaryRow label={`Tax (${totals.taxPercent}%)`} value={formatCurrency(totals.taxAmount, { precise: true })} />
                )}

                <Divider sx={{ my: 1.75, borderColor: brand.gold }} />

                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Total payable
                  </Typography>
                  <Typography variant="h4" sx={{ ...numericText, color: 'primary.main', fontSize: FONT.figureLg }}>
                    {formatCurrency(totals.grandTotal, { precise: true })}
                  </Typography>
                </Stack>

                <Divider sx={{ my: 2.25 }} />

                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Payment method
                </Typography>
                <Controller
                  control={control}
                  name="paymentMethod"
                  render={({ field, fieldState }) => (
                    <>
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
                        {PAYMENT_METHODS.map((method) => (
                          <Chip
                            key={method.value}
                            label={method.label}
                            onClick={() => field.onChange(method.value)}
                            variant={field.value === method.value ? 'filled' : 'outlined'}
                            color={field.value === method.value ? 'primary' : 'default'}
                            sx={{ height: 34, borderRadius: 2, fontWeight: 600, cursor: 'pointer' }}
                          />
                        ))}
                      </Box>
                      {fieldState.error && (
                        <Typography variant="caption" color="error" sx={{ mt: 0.75, display: 'block' }}>
                          {fieldState.error.message}
                        </Typography>
                      )}
                    </>
                  )}
                />

                <Box sx={{ mt: 2.25 }}>
                  <RHFTextField name="notes" label="Notes (optional)" multiline minRows={2} />
                </Box>

                <Stack spacing={1.25} sx={{ mt: 2.5 }}>
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    startIcon={<VisibilityOutlined />}
                    disabled={fields.length === 0 || isSubmitting}
                  >
                    Preview bill
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={handleSubmit(onSubmit)}
                    disabled={fields.length === 0 || isSubmitting}
                    startIcon={isSubmitting ? <CircularProgress size={15} /> : <ReceiptLongOutlined />}
                  >
                    {isSubmitting ? 'Saving…' : 'Save without preview'}
                  </Button>
                </Stack>
              </Card>
            </Grid>
          </Grid>
        </form>
      </FormProvider>

      {/* Preview before committing */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth scroll="paper">
        <DialogCloseButton
          className="no-print"
          onClose={() => setPreviewOpen(false)}
          label="Keep editing"
          sx={{ bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'background.paper' } }}
        />

        <DialogContent sx={{ p: 0, bgcolor: '#fff' }}>
          <BillPrintView
            bill={{
              billNumber: 'Draft — not yet saved',
              createdAt: new Date(),
              customer: watched.customer,
              items: totals.lines.map((line) => ({
                perfumeName: line.name,
                sku: line.sku,
                variantSku: line.variantSku,
                variantLabel: line.label?.includes('—') ? line.label.split('—').pop().trim() : '',
                quantity: line.quantity,
                mrp: line.mrp,
                discountPercent: line.discountPercent,
                unitPrice: line.unitPrice,
                lineTotal: line.lineTotal,
              })),
              subtotal: totals.subtotal,
              totalDiscount: totals.totalDiscount,
              taxPercent: totals.taxPercent,
              taxAmount: totals.taxAmount,
              grandTotal: totals.grandTotal,
              paymentMethod: watched.paymentMethod,
              notes: watched.notes,
              branch: {
                name: user?.branch?.name || 'Default branch',
                code: user?.branch?.code || '',
                address: '',
                phone: user?.branch?.phone || '',
                phoneCountryCode: user?.branch?.phoneCountryCode || '+91',
              },
              billedBy: { name: user?.name },
            }}
            store={settings}
          />
        </DialogContent>

        <DialogActions className="no-print" sx={{ px: 3, py: 2, gap: 1, borderTop: 1, borderColor: 'divider' }}>
          <Button
            variant="contained"
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={15} color="inherit" /> : <ReceiptLongOutlined />}
          >
            {isSubmitting ? 'Saving…' : 'Confirm & save bill'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CreateBillPage;
