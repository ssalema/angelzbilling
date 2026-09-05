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
  Stack,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import { RHFTextField } from '../../components/form/RHFControls.jsx';
import DialogCloseButton from '../../components/common/DialogCloseButton.jsx';
import { userApi } from '../../api/endpoints.js';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import { applyServerErrors } from '../../api/client.js';

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .max(72)
      .regex(/[a-z]/, 'Include a lowercase letter')
      .regex(/[A-Z]/, 'Include an uppercase letter')
      .regex(/[0-9]/, 'Include a number'),
    confirmPassword: z.string().min(1, 'Confirm the password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

const ResetPasswordDialog = ({ open, user, onClose }) => {
  const snackbar = useSnackbar();

  const methods = useForm({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
    mode: 'onTouched',
  });

  const {
    handleSubmit,
    reset,
    setError,
    formState: { isSubmitting },
  } = methods;

  useEffect(() => {
    if (open) reset({ password: '', confirmPassword: '' });
  }, [open, reset]);

  const onSubmit = async (values) => {
    try {
      const result = await userApi.resetPassword(user.id, values.password);
      snackbar.success(result.message);
      onClose();
    } catch (error) {
      applyServerErrors(error, setError);
      snackbar.error(error.message);
    }
  };

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogCloseButton onClose={onClose} disabled={isSubmitting} />

      <DialogTitle sx={{ pb: 1, pr: 6 }}>
        Reset password
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          Set a new password for {user?.name}
        </Typography>
      </DialogTitle>

      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogContent dividers>
            <Alert severity="warning" sx={{ mb: 2 }}>
              This signs {user?.name?.split(' ')[0]} out of every device. Share the new password with them
              securely — they can change it from their own profile afterwards.
            </Alert>

            <Stack spacing={2.25}>
              <RHFTextField
                name="password"
                label="New password"
                type="text"
                autoFocus
                helperText="At least 8 characters with upper case, lower case and a number"
              />
              <RHFTextField name="confirmPassword" label="Confirm password" type="text" />
            </Stack>
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting}
              startIcon={isSubmitting ? <CircularProgress size={15} color="inherit" /> : null}
            >
              {isSubmitting ? 'Resetting…' : 'Reset password'}
            </Button>
          </DialogActions>
        </form>
      </FormProvider>
    </Dialog>
  );
};

export default ResetPasswordDialog;
