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
import { RHFTextField, RHFSelect, RHFSwitch } from '../../components/form/RHFControls.jsx';
import DialogCloseButton from '../../components/common/DialogCloseButton.jsx';
import RHFContactNumber from '../../components/form/RHFContactNumber.jsx';
import { userApi } from '../../api/endpoints.js';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { applyServerErrors } from '../../api/client.js';
import { ROLES } from '../../utils/constants.js';
import { DEFAULT_DIAL_CODE, addContactNumberIssue } from '../../utils/countries.js';

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
      branch: z.string().default(''),
      isActive: z.boolean().default(true),
      password: isEdit ? z.string().optional() : passwordRule,
    })
    .superRefine((data, ctx) => {
      // A scoped role without a branch would have access to nothing at all —
      // unless branches are switched off, when there is nothing to scope to.
      if (branchesEnabled && data.role !== 'superadmin' && !data.branch) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['branch'],
          message: 'Branch Admin and Billing Staff accounts must be assigned to a branch',
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
  const isEdit = Boolean(user);

  const methods = useForm({
    resolver: zodResolver(buildSchema(isEdit, branchesEnabled)),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      phoneCountryCode: DEFAULT_DIAL_CODE,
      role: 'staff',
      branch: '',
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
      branch: user?.branch?.id || '',
      isActive: user?.isActive ?? true,
      password: '',
    });
  }, [open, user, reset]);

  const onSubmit = async (values) => {
    const payload = {
      name: values.name,
      email: values.email,
      phone: values.phone,
      phoneCountryCode: values.phoneCountryCode,
      role: values.role,
      branch: values.role === 'superadmin' ? null : values.branch,
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

  const activeBranches = branches.filter((b) => b.isActive || b.id === user?.branch?.id);

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
            <Grid container spacing={2.25}>
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
                  options={ROLES.map((r) => ({ value: r.value, label: r.label }))}
                  helperText={ROLES.find((r) => r.value === role)?.description}
                />
              </Grid>

              {/* Branches off: the field disappears entirely — an account simply
                  has no branch, and nothing on screen mentions one. */}
              {branchesEnabled && (
              <Grid item xs={12}>
                <RHFSelect
                  name="branch"
                  label={role === 'superadmin' ? 'Branch (not applicable)' : 'Assigned branch *'}
                  disabled={role === 'superadmin'}
                  placeholder={role === 'superadmin' ? 'All branches' : 'Select a branch'}
                  options={activeBranches.map((branch) => ({
                    value: branch.id,
                    label: `${branch.name} (${branch.code})`,
                  }))}
                  helperText={
                    role === 'superadmin'
                      ? 'Super Admins always have access to every branch'
                      : 'They will only see data belonging to this branch'
                  }
                />
              </Grid>
              )}

              {!isEdit && (
                <Grid item xs={12}>
                  <RHFTextField
                    name="password"
                    label="Temporary password *"
                    type="text"
                    helperText="At least 8 characters with an uppercase letter, a lowercase letter and a number. Share it securely — they can change it from their profile."
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
                    A Super Admin can manage every branch, every user and every setting. Grant this sparingly.
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
