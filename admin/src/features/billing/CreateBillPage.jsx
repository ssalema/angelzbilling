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
  MenuItem,
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
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import SearchRounded from '@mui/icons-material/SearchRounded';
import PersonOutline from '@mui/icons-material/PersonOutline';
import AddShoppingCartOutlined from '@mui/icons-material/AddShoppingCartOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';

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
import { perfumeApi, billApi, branchApi } from '../../api/endpoints.js';
import useApiResource from '../../hooks/useApiResource.js';
import useDebounce from '../../hooks/useDebounce.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import { applyServerErrors } from '../../api/client.js';
import { currencySymbol, formatCurrency, formatGrams, formatNumber, unitsFromGrams } from '../../utils/format.js';
import { PAYMENT_METHODS, PAYMENT_TERMS, HEAD_OFFICE, locationOf, locationOptions } from '../../utils/constants.js';
import { downloadBillPdf } from '../../utils/downloadBill.js';
import { FONT, CARD_HEAD_PAD, CARD_PAD, ICON, brand, numericText, statusColors, surface } from '../../theme/index.js';

const CreateBillPage = () => {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  // Only the Head Office Super Admin picks where a bill is raised. Everyone
  // else bills at the location they are assigned to and cannot change it — the
  // server pins them there regardless of what this page sends.
  const { user, isMainSuperAdmin } = useAuth();
  const { settings, loading: settingsLoading, defaultTaxPercent, branchesEnabled } = useSettings();

  const [perfumeQuery, setPerfumeQuery] = useState('');
  // Head Office by default: the main business is a location, not a fallback.
  const [billLocationId, setBillLocationId] = useState(HEAD_OFFICE.id);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [savedBill, setSavedBill] = useState(null);

  // The saved slip is already on screen, so the PDF is rendered straight from it.
  const savedSlipRef = useRef(null);
  const [downloading, setDownloading] = useState(false);

  const debouncedQuery = useDebounce(perfumeQuery, 300);

  const canPickLocation = isMainSuperAdmin && branchesEnabled;

  const branches = useApiResource(
    () => (canPickLocation ? branchApi.list({ limit: 100 }) : Promise.resolve({ items: [] })),
    [canPickLocation],
    { immediate: canPickLocation }
  );

  const locations = useMemo(
    () => locationOptions((branches.data?.items || []).filter((branch) => branch.isActive)),
    [branches.data]
  );

  /** The location this bill will be recorded against, whoever is billing. */
  const billLocation = useMemo(() => {
    if (!canPickLocation) return locationOf(user?.branch);
    return locations.find((option) => option.id === billLocationId) || HEAD_OFFICE;
  }, [canPickLocation, locations, billLocationId, user]);

  const atHeadOffice = billLocation.id === HEAD_OFFICE.id;

  /**
   * The slip is headed by a favicon, and a branch with its own branding prints
   * under its own. The server resolves it that way when the bill is reloaded, so
   * the preview and the just-saved slip have to resolve it the same way here or
   * the paper would change after the save.
   */
  const slipStore = useMemo(
    () => ({
      ...settings,
      currencySymbol: currencySymbol(),
      favicon:
        (!atHeadOffice && billLocation.effectiveFavicon) || settings?.branding?.favicon?.url || '',
    }),
    [settings, atHeadOffice, billLocation]
  );

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

  /**
   * A part payment is still one bill: the total below is what the customer owes
   * in full, and `amountReceived` is only how much of it crossed the counter
   * today. The server recomputes both — this is what the biller watches while
   * typing, so the drawer and the slip agree before anything is saved.
   */
  const isPartial = watched.paymentTerm === 'partial';
  const amountReceived = isPartial ? Math.min(Number(watched.amountPaid) || 0, totals.grandTotal) : totals.grandTotal;
  const balanceDue = Math.max(0, Number((totals.grandTotal - amountReceived).toFixed(2)));

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
    // Full Paid sends nothing at all: the server fills in the grand total it
    // computed itself, so the two can never disagree about what "all of it" was.
    ...(values.paymentTerm === 'partial' ? { amountPaid: Number(values.amountPaid) || 0 } : {}),
    notes: values.notes,
    // Sent only by the one account allowed to choose; null is the Head Office,
    // which is an answer rather than an absence.
    ...(canPickLocation ? { branch: atHeadOffice ? null : billLocation.id } : {}),
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

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadBillPdf(savedSlipRef.current, savedBill);
    } catch (err) {
      snackbar.error(err.message);
    } finally {
      setDownloading(false);
    }
  };

  /* ── Success state: the bill is saved, offer print / next actions ── */
  if (savedBill) {
    return (
      <Box>
        <PageHeader
          title="Bill created"
          subtitle={`${savedBill.billNumber} · ${formatCurrency(savedBill.grandTotal)}${
            savedBill.amountDue > 0 ? ` · ${formatCurrency(savedBill.amountDue)} due` : ''
          }`}
          breadcrumbs={[{ label: 'Billing', to: '/billing' }, { label: savedBill.billNumber }]}
        />

        {/* A bill with a balance is saved and stocked exactly like any other —
            the only difference worth saying out loud is what is still owed and
            that it is collected on this same bill, not a new one. */}
        <Alert
          severity={savedBill.amountDue > 0 ? 'warning' : 'success'}
          icon={<CheckCircleOutline />}
          className="no-print"
          sx={{ mb: 2.5 }}
        >
          Bill <strong>{savedBill.billNumber}</strong> has been saved and stock has been updated.
          {savedBill.amountDue > 0 && (
            <>
              {' '}
              <strong>{formatCurrency(savedBill.amountDue, { precise: true })}</strong> is still due — collect it
              from the bill record when the customer pays.
            </>
          )}
        </Alert>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} className="no-print" sx={{ mb: 2.5 }}>
          <Button variant="contained" startIcon={<PrintOutlined />} onClick={() => window.print()}>
            Print bill
          </Button>
          <Button
            variant="outlined"
            startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <DownloadOutlined />}
            disabled={downloading}
            onClick={handleDownload}
          >
            Download bill
          </Button>
          <Button variant="outlined" startIcon={<AddShoppingCartOutlined />} onClick={startNewBill}>
            Create another bill
          </Button>
          <Button startIcon={<ReceiptLongOutlined />} onClick={() => navigate('/billing')}>
            Go to bill records
          </Button>
        </Stack>

        <Card sx={{ overflow: 'hidden', bgcolor: 'transparent', border: 'none', py: 3 }}>
          <BillPrintView ref={savedSlipRef} bill={savedBill} store={slipStore} />
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
                  {branchesEnabled &&
                    (canPickLocation ? (
                      <TextField
                        select
                        label="Branch *"
                        value={billLocationId}
                        onChange={(event) => setBillLocationId(event.target.value)}
                        helperText="Where this bill is raised — it prints under this location's details"
                        sx={{ minWidth: 220 }}
                      >
                        {locations.map((option) => (
                          <MenuItem key={option.id} value={option.id}>
                            {option.code ? `${option.name} (${option.code})` : option.name}
                          </MenuItem>
                        ))}
                      </TextField>
                    ) : (
                      <TextField
                        label="Branch"
                        value={billLocation.name}
                        InputProps={{ readOnly: true }}
                        helperText="Taken from your signed-in account"
                        sx={{ bgcolor: surface.plumFaint }}
                      />
                    ))}
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
                  <RHFNumberField name="extraDiscount" label="Extra discount" prefix={currencySymbol()} inputProps={{ min: 0 }} />
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

                {/* ── How much of it is being settled now ── */}
                <Typography variant="subtitle2" sx={{ mt: 2.25, mb: 1 }}>
                  Payment received
                </Typography>
                <Controller
                  control={control}
                  name="paymentTerm"
                  render={({ field }) => (
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
                      {PAYMENT_TERMS.map((term) => (
                        <Chip
                          key={term.value}
                          label={term.label}
                          onClick={() => {
                            field.onChange(term.value);
                            // Going back to Full clears the part amount, so a
                            // stale figure cannot be sent with a settled bill.
                            if (term.value === 'full') setValue('amountPaid', 0);
                          }}
                          variant={field.value === term.value ? 'filled' : 'outlined'}
                          color={field.value === term.value ? 'primary' : 'default'}
                          sx={{ height: 34, borderRadius: 2, fontWeight: 600, cursor: 'pointer' }}
                        />
                      ))}
                    </Box>
                  )}
                />

                {isPartial && (
                  <Box sx={{ mt: 1.75 }}>
                    <RHFNumberField
                      name="amountPaid"
                      label="Amount received *"
                      prefix={currencySymbol()}
                      fullWidth
                      inputProps={{ min: 0, max: totals.grandTotal }}
                      helperText="The balance stays on this bill and can be collected later"
                    />
                    <Box sx={{ mt: 1, p: 1.5, borderRadius: 2, bgcolor: surface.plumFaint }}>
                      <SummaryRow label="Paid now" value={formatCurrency(amountReceived, { precise: true })} />
                      <SummaryRow
                        label="Balance due"
                        value={formatCurrency(balanceDue, { precise: true })}
                        strong
                        tone={balanceDue > 0 ? statusColors.pending.color : 'text.primary'}
                      />
                    </Box>
                  </Box>
                )}

                <Box sx={{ mt: 2.25 }}>
                  <RHFTextField name="notes" label="Notes (optional)" multiline minRows={2} />
                </Box>

                {/* Every bill is saved from the preview dialog, so this is the only way out of the form. */}
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  fullWidth
                  startIcon={<VisibilityOutlined />}
                  disabled={fields.length === 0 || isSubmitting}
                  sx={{ mt: 2.5 }}
                >
                  Preview bill
                </Button>
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
              // The preview has to show the slip the customer will actually be
              // handed, balance and all — otherwise the paper changes after save.
              amountPaid: amountReceived,
              amountDue: balanceDue,
              status: balanceDue > 0 ? 'pending' : 'paid',
              // The slip prints one line per payment, and the only payment this
              // bill can have yet is the one being taken right now — so stand it
              // in exactly as the server will write it.
              payments: amountReceived > 0
                ? [{ amount: amountReceived, method: watched.paymentMethod, at: new Date(), atBilling: true }]
                : [],
              paymentMethod: watched.paymentMethod,
              notes: watched.notes,
              // The Head Office carries no branch snapshot, and neither does a
              // store with branches switched off — both print under the main
              // business name, address and logo, exactly as the server writes it.
              branch:
                branchesEnabled && !atHeadOffice
                  ? {
                      name: billLocation.name,
                      code: billLocation.code || '',
                      address: '',
                      phone: billLocation.phone || '',
                      phoneCountryCode: billLocation.phoneCountryCode || '+91',
                    }
                  : {},
              billedBy: { name: user?.name },
            }}
            store={slipStore}
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
