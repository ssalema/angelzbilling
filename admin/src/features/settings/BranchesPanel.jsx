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
import AddRounded from '@mui/icons-material/AddRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import StoreOutlined from '@mui/icons-material/StoreOutlined';

import DataTable, { actionsColumn } from '../../components/common/DataTable.jsx';
import StatusChip from '../../components/common/StatusChip.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import DialogCloseButton from '../../components/common/DialogCloseButton.jsx';
import { EmptyState } from '../../components/common/StateViews.jsx';
import SectionTitle from '../../components/common/SectionTitle.jsx';
import { RHFTextField, RHFSwitch } from '../../components/form/RHFControls.jsx';
import RHFContactNumber from '../../components/form/RHFContactNumber.jsx';
import AddressFields from '../../components/form/AddressFields.jsx';
import BranchBrandingField from './BranchBrandingField.jsx';

import { branchApi, settingsApi } from '../../api/endpoints.js';
import { useAuth } from '../../context/AuthContext.jsx';
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
import { CARD_HEAD_PAD, ICON, LOGO_FRAME } from '../../theme/index.js';
import { IMG } from '../../utils/image.js';

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

/**
 * A branch carries the same two marks the store does, sized the same way: a wide
 * logo for bill headers and sidebars, a square favicon for the printed slip and
 * the branch table.
 */
const BRANDING_SLOTS = [
  { kind: 'logo', label: 'Branch logo', hint: 'Transparent PNG, around 400×120px' },
  {
    kind: 'favicon',
    label: 'Branch favicon',
    hint: 'Square PNG, 64×64px or larger',
    frameHeight: LOGO_FRAME.squareHeight,
  },
];

const emptyBranch = {
  name: '',
  code: '',
  address: { line1: '', city: '', state: '', pincode: '', country: DEFAULT_COUNTRY },
  phone: '',
  phoneCountryCode: DEFAULT_DIAL_CODE,
  email: '',
  gstin: '',
  isActive: true,
  hasOwnLogo: false,
};

/**
 * `canEdit` says the viewer is a Super Admin, so they see every branch here.
 * Authority is narrower: adding a location, taking one out of service and the
 * branch switch itself are store-wide and belong to the main Super Admin, while
 * a Super Admin assigned to a branch edits that one branch's own details.
 */
const BranchesPanel = ({ canEdit, settings, onSettingsChange }) => {
  const snackbar = useSnackbar();
  const { isMainSuperAdmin, canEditBranch, branchName } = useAuth();
  const [formBranch, setFormBranch] = useState(undefined);
  const [confirm, setConfirm] = useState(null);
  // A branch being created has no id yet, so its artwork waits here until it does.
  const [pendingAssets, setPendingAssets] = useState({ logo: null, favicon: null });
  const [dialogAssets, setDialogAssets] = useState({ logo: '', favicon: '' });
  // Percentage per slot while the save uploads the artwork it held back, so the
  // frames report the same "Uploading… 42%" the field shows on its own uploads.
  const [assetProgress, setAssetProgress] = useState({ logo: null, favicon: null });
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
    setPendingAssets({ logo: null, favicon: null });
    setAssetProgress({ logo: null, favicon: null });
    setDialogAssets({ logo: formBranch?.logo?.url || '', favicon: formBranch?.favicon?.url || '' });
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

      // Artwork picked while creating could only be uploaded once an id existed.
      if (values.hasOwnLogo) {
        const branchId = formBranch?.id || result.data?.id || result.data?._id;
        for (const kind of BRANDING_SLOTS.map((slot) => slot.kind)) {
          if (branchId && pendingAssets[kind]) {
            setAssetProgress((current) => ({ ...current, [kind]: 0 }));
            try {
              await branchApi.uploadBranding(branchId, kind, pendingAssets[kind], (value) =>
                setAssetProgress((current) => ({ ...current, [kind]: value }))
              );
            } finally {
              setAssetProgress((current) => ({ ...current, [kind]: null }));
            }
          }
        }
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
          {/* The favicon is the branch's mark — the same square that heads its
              printed slip — so the row shows that rather than the wide logo. */}
          {row.effectiveFavicon && (
            <Box
              component="img"
              src={IMG.avatar(row.effectiveFavicon)}
              loading="lazy"
              alt={row.name}
              sx={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0, borderRadius: 0.75 }}
            />
          )}
          <Box>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {row.name}
              </Typography>
              {canEdit && !isMainSuperAdmin && canEditBranch(row.id) && (
                <Chip size="small" label="Yours" color="secondary" sx={{ height: 19 }} />
              )}
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
            .join(', ') || 'NA'}
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
            {row.email || 'NA'}
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
            onClick={isMainSuperAdmin ? () => setConfirm(statusConfirm(row)) : undefined}
          />
        );
        return isMainSuperAdmin ? (
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
            <Tooltip title={canEditBranch(row.id) ? 'Edit branch' : 'You can only edit your own branch'}>
              <Box component="span">
                <IconButton
                  size="small"
                  color="primary"
                  disabled={!canEditBranch(row.id)}
                  onClick={() => setFormBranch(row)}
                >
                  <EditOutlined sx={{ fontSize: ICON.action }} />
                </IconButton>
              </Box>
            </Tooltip>
            {isMainSuperAdmin && (
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
            )}
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
          description="Every bill records the location it was raised at. The Head Office — the main business on the General tab — is one of those locations; the branches below are the others."
          sx={{ mb: 0 }}
        />
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexShrink: 0 }}>
          <Tooltip
            title={
              !isMainSuperAdmin
                ? 'Only the main Super Admin can change this'
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
                    disabled={!isMainSuperAdmin || togglingFeature}
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
          {isMainSuperAdmin && branchesEnabled && (
            <Button variant="contained" startIcon={<AddRounded />} onClick={() => setFormBranch(null)}>
              Add branch
            </Button>
          )}
        </Stack>
      </Stack>

      {canEdit && !isMainSuperAdmin && (
        <Box sx={{ px: 2.5, pb: !branchesEnabled ? 0 : 2.5 }}>
          <Alert severity="info">
            You can see every location here, but your account is assigned to {branchName} — so you can edit that
            branch's details only. Adding, activating or removing a location is the main Super Admin's call.
          </Alert>
        </Box>
      )}

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
        onRowClick={canEdit ? (row) => (canEditBranch(row.id) ? setFormBranch(row) : undefined) : undefined}
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
            description="The Head Office is already a location, so billing works without any branches. Add one for each additional shop you run."
            action={
              isMainSuperAdmin && (
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
            An additional business location. It inherits the main business details from the General tab unless it
            sets its own here.
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
                  <RHFSwitch name="isActive" label="Branch is active" disabled={!isMainSuperAdmin} />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <RHFSwitch
                    name="hasOwnLogo"
                    label="This branch has its own branding"
                    helperText="Off: the branch prints under the store logo and favicon from Settings → Branding"
                  />
                </Grid>
                {hasOwnLogo &&
                  BRANDING_SLOTS.map((slot) => (
                    // Stacked rather than side by side, in the same order and at
                    // the same full width the store's own Branding panel gives them.
                    <Grid item xs={12} key={slot.kind}>
                      <BranchBrandingField
                        kind={slot.kind}
                        label={slot.label}
                        hint={slot.hint}
                        frameHeight={slot.frameHeight}
                        branchId={formBranch?.id}
                        current={dialogAssets[slot.kind]}
                        pendingFile={pendingAssets[slot.kind]}
                        uploading={assetProgress[slot.kind] !== null}
                        uploadProgress={assetProgress[slot.kind]}
                        onPendingFile={(file) =>
                          setPendingAssets((current) => ({ ...current, [slot.kind]: file }))
                        }
                        onUploaded={(branch) => {
                          setDialogAssets({
                            logo: branch?.logo?.url || '',
                            favicon: branch?.favicon?.url || '',
                          });
                          // Removing the last mark puts the branch back on the store's.
                          if (branch && !branch.hasOwnLogo) setValue('hasOwnLogo', false);
                          branches.reload();
                        }}
                      />
                    </Grid>
                  ))}
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
