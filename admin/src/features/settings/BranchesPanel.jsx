import { useState, useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  Box,
  Typography,
  Stack,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  IconButton,
  Tooltip,
  Chip,
  CircularProgress,
  Switch,
  FormControlLabel,
  Alert,
} from '@mui/material';
import { AddRounded, EditOutlined, DeleteOutline, StoreOutlined } from '@mui/icons-material';

import DataTable, { actionsColumn } from '../../components/common/DataTable.jsx';
import StatusChip from '../../components/common/StatusChip.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import DialogCloseButton from '../../components/common/DialogCloseButton.jsx';
import { EmptyState } from '../../components/common/StateViews.jsx';
import SectionTitle from '../../components/common/SectionTitle.jsx';
import { RHFTextField, RHFSwitch } from '../../components/form/RHFControls.jsx';
import RHFContactNumber from '../../components/form/RHFContactNumber.jsx';
import AddressFields from '../../components/form/AddressFields.jsx';
import BranchLogoField from './BranchLogoField.jsx';

import { branchApi, settingsApi } from '../../api/endpoints.js';
import useApiResource from '../../hooks/useApiResource.js';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import { applyServerErrors } from '../../api/client.js';
import { formatNumber } from '../../utils/format.js';
import {
  DEFAULT_DIAL_CODE,
  DEFAULT_COUNTRY,
  addContactNumberIssue,
  addPostalCodeIssue,
  formatContactNumber,
} from '../../utils/countries.js';
import { CARD_HEAD_PAD, ICON } from '../../theme/index.js';

const schema = z
  .object({
  name: z.string().trim().min(2, 'Branch name must be at least 2 characters').max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'At least 2 characters')
    .max(10, 'At most 10 characters')
    .regex(/^[A-Z0-9-]+$/, 'Letters, numbers and hyphens only'),
  address: z
    .object({
      line1: z.string().trim().max(200).default(''),
      city: z.string().trim().max(80).default(''),
      state: z.string().trim().max(80).default(''),
      pincode: z.string().trim().max(12).default(''),
      country: z.string().trim().max(80).default(DEFAULT_COUNTRY),
    })
    // A pincode means six digits in India and something else everywhere else.
    .superRefine((address, ctx) =>
      addPostalCodeIssue(ctx, { country: address.country, value: address.pincode, path: ['pincode'] })
    ),
  phone: z.string().trim().default(''),
  phoneCountryCode: z.string().trim().default(DEFAULT_DIAL_CODE),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')).default(''),
  gstin: z.string().trim().toUpperCase().max(20).default(''),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  hasOwnLogo: z.boolean().default(false),
  })
  .superRefine((data, ctx) =>
    addContactNumberIssue(ctx, {
      dial: data.phoneCountryCode,
      number: data.phone,
      path: ['phone'],
      required: false,
    })
  );

const emptyBranch = {
  name: '',
  code: '',
  address: { line1: '', city: '', state: '', pincode: '', country: DEFAULT_COUNTRY },
  phone: '',
  phoneCountryCode: DEFAULT_DIAL_CODE,
  email: '',
  gstin: '',
  isActive: true,
  isDefault: false,
  hasOwnLogo: false,
};

const BranchesPanel = ({ canEdit, settings, onSettingsChange }) => {
  const snackbar = useSnackbar();
  const [formBranch, setFormBranch] = useState(undefined);
  const [confirm, setConfirm] = useState(null);
  // A branch being created has no id yet, so its logo waits here until it does.
  const [pendingLogo, setPendingLogo] = useState(null);
  const [dialogLogo, setDialogLogo] = useState('');
  const [togglingFeature, setTogglingFeature] = useState(false);
  // Branches come back in one call; the bar keeps a long list navigable.
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const branches = useApiResource(() => branchApi.list({ limit: 100 }), []);

  const methods = useForm({ resolver: zodResolver(schema), defaultValues: emptyBranch, mode: 'onTouched' });
  const {
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { isSubmitting },
  } = methods;

  const hasOwnLogo = watch('hasOwnLogo');

  useEffect(() => {
    if (formBranch === undefined) return;
    setPendingLogo(null);
    setDialogLogo(formBranch?.logo?.url || '');
    reset(
      formBranch
        ? {
            ...emptyBranch,
            ...formBranch,
            address: { ...emptyBranch.address, ...(formBranch.address || {}) },
          }
        : emptyBranch
    );
  }, [formBranch, reset]);

  const onSubmit = async (values) => {
    try {
      const result = formBranch
        ? await branchApi.update(formBranch.id, values)
        : await branchApi.create(values);

      // The logo picked while creating could only be uploaded once an id existed.
      if (pendingLogo && values.hasOwnLogo) {
        const branchId = formBranch?.id || result.data?.id || result.data?._id;
        if (branchId) await branchApi.uploadLogo(branchId, pendingLogo);
      }

      snackbar.success(result.message);
      branches.reload();
      setFormBranch(undefined);
    } catch (error) {
      applyServerErrors(error, setError);
      snackbar.error(error.message);
    }
  };

  const run = async (action) => {
    try {
      const result = await action();
      if (result?.message) snackbar.success(result.message);
      branches.reload();
    } catch (error) {
      snackbar.error(error.message);
    }
  };

  const items = branches.data?.items || [];

  // Single-location stores switch branches off entirely. Nothing is deleted — the
  // server deactivates every branch, and switching back on reactivates them.
  const branchesEnabled = settings?.features?.branches !== false;

  const setBranchesEnabled = async (enabled) => {
    setTogglingFeature(true);
    try {
      const result = await settingsApi.update({ features: { branches: enabled } });
      snackbar.success(
        enabled ? 'Branch management turned on — branches reactivated' : 'Branch management turned off'
      );
      onSettingsChange?.(result.data);
      branches.reload();
    } catch (error) {
      snackbar.error(error.message);
    } finally {
      setTogglingFeature(false);
    }
  };

  // The status pill is the toggle, so activation lives with the state it changes.
  const statusConfirm = (row) => ({
    title: row.isActive ? `Deactivate ${row.name}?` : `Activate ${row.name}?`,
    message: row.isActive
      ? 'No new bills can be raised against this branch, and its staff will not be able to sign in. Existing records are untouched.'
      : 'Staff assigned to this branch will be able to sign in and bill again.',
    confirmLabel: row.isActive ? 'Deactivate' : 'Activate',
    severity: row.isActive ? 'error' : 'warning',
    action: () => branchApi.toggleStatus(row.id),
  });

  const columns = [
    {
      key: 'name',
      label: 'Branch',
      render: (row) => (
        <Stack direction="row" spacing={1.25} alignItems="center">
          {row.effectiveLogo && (
            <Box
              component="img"
              src={row.effectiveLogo}
              alt={row.name}
              sx={{ width: 40, height: 28, objectFit: 'contain', flexShrink: 0 }}
            />
          )}
          <Box>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {row.name}
              </Typography>
              {row.isDefault && <Chip size="small" label="Default" color="secondary" sx={{ height: 19 }} />}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Code: {row.code}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    {
      key: 'address',
      label: 'Address',
      hideBelow: 'md',
      render: (row) => (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 260 }}>
          {[row.address?.line1, row.address?.city, row.address?.state, row.address?.pincode]
            .filter(Boolean)
            .join(', ') || '—'}
        </Typography>
      ),
    },
    {
      key: 'contact',
      label: 'Contact',
      hideBelow: 'lg',
      render: (row) => (
        <Box>
          <Typography variant="body2">{formatContactNumber(row.phoneCountryCode, row.phone)}</Typography>
          <Typography variant="caption" color="text.secondary">
            {row.email || '—'}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'usage',
      label: 'Usage',
      align: 'center',
      hideBelow: 'md',
      render: (row) => (
        <Stack spacing={0.25} alignItems="center">
          <Typography variant="caption">{formatNumber(row.userCount)} user(s)</Typography>
          <Typography variant="caption" color="text.secondary">
            {formatNumber(row.billCount)} bill(s)
          </Typography>
        </Stack>
      ),
    },
    {
      key: 'isActive',
      label: 'Status',
      align: 'center',
      render: (row) => {
        const chip = (
          <StatusChip
            status={row.isActive ? 'active' : 'inactive'}
            onClick={canEdit ? () => setConfirm(statusConfirm(row)) : undefined}
          />
        );
        return canEdit ? (
          <Tooltip title={row.isActive ? 'Deactivate branch' : 'Activate branch'}>
            <Box component="span">{chip}</Box>
          </Tooltip>
        ) : (
          chip
        );
      },
    },
    actionsColumn((row) =>
        canEdit && (
          <Stack direction="row" spacing={0.25} justifyContent="center">
            <Tooltip title="Edit branch">
              <IconButton size="small" color="primary" onClick={() => setFormBranch(row)}>
                <EditOutlined sx={{ fontSize: ICON.action }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete branch">
              <IconButton
                size="small"
                color="error"
                onClick={() =>
                  setConfirm({
                    title: `Delete ${row.name}?`,
                    message:
                      'A branch with users or bills attached cannot be deleted — deactivate it instead so your records stay intact.',
                    confirmLabel: 'Delete branch',
                    severity: 'error',
                    action: () => branchApi.remove(row.id),
                  })
                }
              >
                <DeleteOutline sx={{ fontSize: ICON.action }} />
              </IconButton>
            </Tooltip>
          </Stack>
        )),
  ];

  return (
    <Card>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        spacing={1.5}
        sx={CARD_HEAD_PAD}
      >
        <SectionTitle
          title="Branch management"
          description="Each bill records the branch it was raised at, so reporting stays accurate across locations."
          sx={{ mb: 0 }}
        />
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexShrink: 0 }}>
          <Tooltip
            title={
              !canEdit
                ? 'Only a Super Admin can change this'
                : branchesEnabled
                  ? 'Turn off if this store runs from a single location'
                  : 'Turn on to bill and report per location'
            }
          >
            <Box component="span">
              <FormControlLabel
                sx={{ mr: 0, whiteSpace: 'nowrap' }}
                control={
                  <Switch
                    checked={branchesEnabled}
                    disabled={!canEdit || togglingFeature}
                    onChange={(event) => {
                      const next = event.target.checked;
                      if (next) return setBranchesEnabled(true);
                      setConfirm({
                        title: 'Turn branch management off?',
                        message:
                          'Every branch is deactivated — nothing is deleted, and past bills keep their branch. Branch columns, filters and pickers disappear across the app. Switching this back on reactivates them.',
                        confirmLabel: 'Turn off',
                        severity: 'warning',
                        action: () => setBranchesEnabled(false),
                      });
                    }}
                  />
                }
                label={
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {branchesEnabled ? 'Branches on' : 'Branches off'}
                  </Typography>
                }
              />
            </Box>
          </Tooltip>
          {canEdit && branchesEnabled && (
            <Button variant="contained" startIcon={<AddRounded />} onClick={() => setFormBranch(null)}>
              Add branch
            </Button>
          )}
        </Stack>
      </Stack>

      {!branchesEnabled && (
        <Box sx={{ px: 2.5, pb: 2.5 }}>
          <Alert severity="info" icon={<StoreOutlined />}>
            Branch management is off, so every branch below is deactivated and branch columns, filters and pickers
            stay hidden across the app. Nothing was deleted — switch it back on to reactivate them.
          </Alert>
        </Box>
      )}

      <DataTable
        columns={columns}
        rows={items.slice((page - 1) * limit, page * limit)}
        loading={branches.loading}
        error={branches.error}
        onRetry={branches.reload}
        onRowClick={canEdit ? (row) => setFormBranch(row) : undefined}
        page={page}
        limit={limit}
        total={items.length}
        onPageChange={setPage}
        onLimitChange={(next) => {
          setLimit(next);
          setPage(1);
        }}
        emptyState={
          <EmptyState
            icon={StoreOutlined}
            title="No branches yet"
            description="Add at least one branch — every bill has to belong to one. A single-location store can switch branch management off instead."
            action={
              canEdit && (
                <Button variant="contained" startIcon={<AddRounded />} onClick={() => setFormBranch(null)}>
                  Add the first branch
                </Button>
              )
            }
          />
        }
      />

      {/* Add / edit */}
      <Dialog
        open={formBranch !== undefined}
        onClose={isSubmitting ? undefined : () => setFormBranch(undefined)}
        maxWidth="sm"
        fullWidth
      >
        <DialogCloseButton onClose={() => setFormBranch(undefined)} disabled={isSubmitting} />

        <DialogTitle sx={{ pb: 1, pr: 6 }}>
          {formBranch ? `Edit ${formBranch.name}` : 'Add a branch'}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            The branch code appears in every bill number raised here.
          </Typography>
        </DialogTitle>

        <FormProvider {...methods}>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <DialogContent dividers>
              <Grid container spacing={2.25}>
                <Grid item xs={12} sm={8}>
                  <RHFTextField name="name" label="Branch name *" autoFocus />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <RHFTextField
                    name="code"
                    label="Branch code *"
                    inputProps={{ style: { textTransform: 'uppercase' }, maxLength: 10 }}
                    helperText="e.g. MUM"
                  />
                </Grid>

                <AddressFields />

                <Grid item xs={12} sm={6}>
                  <RHFContactNumber name="phone" codeName="phoneCountryCode" />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <RHFTextField name="email" label="Email" type="email" />
                </Grid>
                <Grid item xs={12}>
                  <RHFTextField name="gstin" label="GSTIN" inputProps={{ style: { textTransform: 'uppercase' } }} />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <RHFSwitch name="isActive" label="Branch is active" />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <RHFSwitch
                    name="isDefault"
                    label="Default branch"
                    helperText="Used when a Super Admin bills without picking one"
                  />
                </Grid>

                <Grid item xs={12}>
                  <RHFSwitch
                    name="hasOwnLogo"
                    label="This branch has its own logo"
                    helperText="Off: the branch prints under the store logo from Settings → Branding"
                  />
                </Grid>
                {hasOwnLogo && (
                  <Grid item xs={12}>
                    <BranchLogoField
                      branchId={formBranch?.id}
                      current={dialogLogo}
                      pendingFile={pendingLogo}
                      onPendingFile={setPendingLogo}
                      onUploaded={(branch) => {
                        setDialogLogo(branch?.logo?.url || '');
                        // Removing the logo puts the branch back on the store logo.
                        if (branch && !branch.hasOwnLogo) setValue('hasOwnLogo', false);
                        branches.reload();
                      }}
                    />
                  </Grid>
                )}
              </Grid>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
              <Button
                type="submit"
                variant="contained"
                disabled={isSubmitting}
                startIcon={isSubmitting ? <CircularProgress size={15} color="inherit" /> : null}
              >
                {isSubmitting ? 'Saving…' : formBranch ? 'Save changes' : 'Create branch'}
              </Button>
            </DialogActions>
          </form>
        </FormProvider>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        severity={confirm?.severity}
        onConfirm={() => run(confirm.action)}
        onClose={() => setConfirm(null)}
      />
    </Card>
  );
};

export default BranchesPanel;
