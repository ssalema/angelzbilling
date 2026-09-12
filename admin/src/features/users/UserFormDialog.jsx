import { useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  Typography,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/material';
import { RHFTextField, RHFPasswordField, RHFSelect, RHFSwitch } from '../../components/form/RHFControls.jsx';
import DialogCloseButton from '../../components/common/DialogCloseButton.jsx';
import RHFContactNumber from '../../components/form/RHFContactNumber.jsx';
import { userApi } from '../../api/endpoints.js';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { applyServerErrors } from '../../api/client.js';
import {
  ROLES,
  HEAD_OFFICE,
  locationOf,
  locationOptions,
  locationFullLabel,
  PASSWORD_HINT,
} from '../../utils/constants.js';
import { DEFAULT_DIAL_CODE, addContactNumberIssue } from '../../utils/countries.js';
import { GUTTER } from '../../theme/index.js';

const passwordRule = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72)
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[0-9]/, 'Include a number');

const buildSchema = (isEdit, branchesEnabled = true) =>
  z
    .object({
      name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
      email: z.string().trim().toLowerCase().email('Enter a valid email address'),
      phone: z.string().trim().default(''),
      phoneCountryCode: z.string().trim().default(DEFAULT_DIAL_CODE),
      role: z.enum(['superadmin', 'admin', 'staff']),
      // A location id: a branch, or the Head Office. Never empty in the form —
      // "all branches" is a filter word and is not assignable.
      branch: z.string().default(HEAD_OFFICE.id),
      isActive: z.boolean().default(true),
      password: isEdit ? z.string().optional() : passwordRule,
    })
    .superRefine((data, ctx) => {
      // Every account sits somewhere — the Head Office counts — so this only catches a picker that was never answered.
      if (branchesEnabled && data.role !== 'superadmin' && !data.branch) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['branch'],
          message: 'Choose the location this account belongs to',
        });
      }
      addContactNumberIssue(ctx, {
        dial: data.phoneCountryCode,
        number: data.phone,
        path: ['phone'],
        required: false,
      });
    });

const UserFormDialog = ({ open, user, branches = [], onClose, onSaved }) => {
  const snackbar = useSnackbar();
  const { branchesEnabled } = useSettings();
  // A Super Admin assigned to a branch builds that branch's team: they cannot
  // grant the Super Admin role, and cannot post anyone to another location.
  const { isMainSuperAdmin, myLocationId, branchName } = useAuth();
  const isEdit = Boolean(user);

  const methods = useForm({
    resolver: zodResolver(buildSchema(isEdit, branchesEnabled)),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      phoneCountryCode: DEFAULT_DIAL_CODE,
      role: 'staff',
      branch: HEAD_OFFICE.id,
      isActive: true,
      password: '',
    },
    mode: 'onTouched',
  });

  const {
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { isSubmitting },
  } = methods;

  const role = watch('role');

  useEffect(() => {
    if (!open) return;
    reset({
      name: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      phoneCountryCode: user?.phoneCountryCode || DEFAULT_DIAL_CODE,
      role: user?.role || 'staff',
      branch: locationOf(user?.branch).id === HEAD_OFFICE.id && !isMainSuperAdmin
        ? myLocationId
        : locationOf(user?.branch).id,
      isActive: user?.isActive ?? true,
      password: '',
    });
  }, [open, user, reset, isMainSuperAdmin, myLocationId]);

  const onSubmit = async (values) => {
    const payload = {
      name: values.name,
      email: values.email,
      phone: values.phone,
      phoneCountryCode: values.phoneCountryCode,
      role: values.role,
      // The Head Office has no Branch record, so it goes over the wire as null.
      branch: !values.branch || values.branch === HEAD_OFFICE.id ? null : values.branch,
      isActive: values.isActive,
    };
    if (!isEdit) payload.password = values.password;

    try {
      const result = isEdit ? await userApi.update(user.id, payload) : await userApi.create(payload);
      snackbar.success(result.message);
      onSaved?.();
      onClose();
    } catch (error) {
      applyServerErrors(error, setError);
      snackbar.error(error.message);
    }
  };

  // Head Office first, then the branches. A Super Admin assigned to a branch
  // only gets that one: they staff their own location, nobody else's.
  const locations = locationOptions(
    branches.filter((b) => b.isActive || b.id === locationOf(user?.branch).id)
  ).filter((option) => isMainSuperAdmin || String(option.id) === String(myLocationId));

  const roleOptions = ROLES.filter((r) => isMainSuperAdmin || r.value !== 'superadmin');

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogCloseButton onClose={onClose} disabled={isSubmitting} />

      <DialogTitle sx={{ pb: 1, pr: 6 }}>
        {isEdit ? `Edit ${user.name}` : 'Add an admin account'}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {isEdit
            ? 'Change the role, branch assignment or contact details.'
            : 'They will be able to sign in immediately with the password you set here.'}
        </Typography>
      </DialogTitle>

      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogContent dividers>
            <Grid container spacing={GUTTER.cards}>
              <Grid item xs={12} sm={6}>
                <RHFTextField name="name" label="Full name *" autoFocus />
              </Grid>
              <Grid item xs={12} sm={6}>
                <RHFTextField
                  name="email"
                  label="Email address *"
                  type="email"
                  disabled={isEdit && user?.role === 'superadmin'}
                  helperText={isEdit ? 'Used to sign in' : undefined}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <RHFContactNumber name="phone" codeName="phoneCountryCode" />
              </Grid>

              <Grid item xs={12} sm={6}>
                <RHFSelect
                  name="role"
                  label="Role *"
                  options={roleOptions.map((r) => ({ value: r.value, label: r.label }))}
                  helperText={
                    isMainSuperAdmin
                      ? ROLES.find((r) => r.value === role)?.description
                      : 'Only the main Super Admin can grant the Super Admin role.'
                  }
                />
              </Grid>

              {/* Branches off: the field disappears entirely — an account simply
                  has no branch, and nothing on screen mentions one. */}
              {branchesEnabled && (
              <Grid item xs={12}>
                <RHFSelect
                  name="branch"
                  label="Assigned location *"
                  disabled={!isMainSuperAdmin}
                  options={locations.map((option) => ({
                    value: option.id,
                    label: locationFullLabel(option),
                  }))}
                  helperText={
                    !isMainSuperAdmin
                      ? `New accounts join ${branchName}, the location your account manages.`
                      : role === 'superadmin'
                        ? `${HEAD_OFFICE.name} makes them the Head Office Super Admin, with authority over the whole business. Pick a branch and they still see everything, but can only make changes inside that branch.`
                        : 'They will only see data belonging to this location'
                  }
                />
              </Grid>
              )}

              {!isEdit && (
                <Grid item xs={12}>
                  <RHFPasswordField
                    name="password"
                    label="Temporary password *"
                    /* Set for someone else and read back to hand over, so it
                       starts legible — and can now be hidden again. */
                    defaultVisible
                    helperText={`${PASSWORD_HINT}. Share it securely — they can change it from their profile.`}
                  />
                </Grid>
              )}

              <Grid item xs={12}>
                <Divider sx={{ my: 0.5 }} />
                <RHFSwitch
                  name="isActive"
                  label="Account is active"
                  helperText="A deactivated account is signed out everywhere and cannot sign back in."
                />
              </Grid>

              {role === 'superadmin' && (
                <Grid item xs={12}>
                  <Alert severity="warning">
                    {watch('branch') && watch('branch') !== HEAD_OFFICE.id
                      ? 'This Super Admin can view every location, user, bill and setting, but can only make changes within their assigned branch — not to the main business details or to another branch.'
                      : `A ${HEAD_OFFICE.name} Super Admin can manage every location, every user and every setting, including the main business details. Grant this sparingly.`}
                  </Alert>
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
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create account'}
            </Button>
          </DialogActions>
        </form>
      </FormProvider>
    </Dialog>
  );
};

export default UserFormDialog;
