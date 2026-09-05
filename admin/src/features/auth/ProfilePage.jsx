import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Box,
  Card,
  Grid,
  Tabs,
  Tab,
  Typography,
  Stack,
  Button,
  Divider,
  Avatar,
  Chip,
  CircularProgress,
  Alert,
  InputAdornment,
  IconButton,
} from '@mui/material';
import {
  SaveOutlined,
  PersonOutline,
  LockResetOutlined,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';

import PageHeader from '../../components/common/PageHeader.jsx';
import { RHFTextField } from '../../components/form/RHFControls.jsx';
import RHFContactNumber from '../../components/form/RHFContactNumber.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import { authApi } from '../../api/endpoints.js';
import { applyServerErrors } from '../../api/client.js';
import { formatDate, initials } from '../../utils/format.js';
import { ROLE_LABELS } from '../../utils/constants.js';
import { DEFAULT_DIAL_CODE, addContactNumberIssue } from '../../utils/countries.js';
import { CARD_PAD, ICON, brand } from '../../theme/index.js';

const profileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
    phone: z.string().trim().default(''),
    phoneCountryCode: z.string().trim().default(DEFAULT_DIAL_CODE),
  })
  .superRefine((data, ctx) =>
    addContactNumberIssue(ctx, {
      dial: data.phoneCountryCode,
      number: data.phone,
      path: ['phone'],
      required: false,
    })
  );

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Your current password is required'),
    newPassword: z
      .string()
      .min(8, 'At least 8 characters')
      .max(72)
      .regex(/[a-z]/, 'Include a lowercase letter')
      .regex(/[A-Z]/, 'Include an uppercase letter')
      .regex(/[0-9]/, 'Include a number'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from your current one',
  });

const ProfilePage = () => {
  const { user, setUser, logout } = useAuth();
  const { branchesEnabled } = useSettings();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showPasswords, setShowPasswords] = useState(false);

  const tab = searchParams.get('tab') === 'password' ? 'password' : 'profile';

  const profileForm = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || '',
      phone: user?.phone || '',
      phoneCountryCode: user?.phoneCountryCode || DEFAULT_DIAL_CODE,
    },
    mode: 'onTouched',
  });

  const passwordForm = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mode: 'onTouched',
  });

  useEffect(() => {
    profileForm.reset({
      name: user?.name || '',
      phone: user?.phone || '',
      phoneCountryCode: user?.phoneCountryCode || DEFAULT_DIAL_CODE,
    });
  }, [user, profileForm]);

  const saveProfile = async (values) => {
    try {
      const updated = await authApi.updateProfile(values);
      setUser(updated);
      profileForm.reset(values);
      snackbar.success('Your profile has been updated');
    } catch (error) {
      applyServerErrors(error, profileForm.setError);
      snackbar.error(error.message);
    }
  };

  const changePassword = async (values) => {
    try {
      const message = await authApi.changePassword(values);
      snackbar.success(message);
      // The server invalidated every session — send them back to sign in.
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      applyServerErrors(error, passwordForm.setError);
      snackbar.error(error.message);
    }
  };

  return (
    <Box>
      <PageHeader
        title="My profile"
        subtitle="Your account details and password"
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Profile' }]}
      />

      <Grid container spacing={2.5}>
        {/* Identity card */}
        <Grid item xs={12} md={4}>
          <Card sx={{ p: 3, textAlign: 'center' }}>
            <Avatar
              src={user?.avatar?.url || undefined}
              sx={{ width: 84, height: 84, mx: 'auto', bgcolor: brand.plum, fontSize: 30, fontWeight: 700 }}
            >
              {initials(user?.name)}
            </Avatar>

            <Typography variant="h5" sx={{ mt: 2 }}>
              {user?.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {user?.email}
            </Typography>

            <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 1.5, flexWrap: 'wrap' }} useFlexGap>
              <Chip size="small" color="secondary" label={ROLE_LABELS[user?.role]} sx={{ color: brand.ink }} />
              {branchesEnabled && (
                <Chip size="small" variant="outlined" label={user?.branch?.name || 'All branches'} />
              )}
            </Stack>

            <Divider sx={{ my: 2.5 }} />

            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  Last signed in
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {user?.lastLoginAt ? formatDate(user.lastLoginAt, 'time') : '—'}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  Status
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
                  Active
                </Typography>
              </Stack>
            </Stack>
          </Card>
        </Grid>

        {/* Forms */}
        <Grid item xs={12} md={8}>
          <Card>
            <Tabs
              value={tab}
              onChange={(_e, next) => setSearchParams(next === 'password' ? { tab: 'password' } : {})}
              // Both labels carry a start icon, so the pair runs wider than a
              // small phone — scrollable keeps the second tab reachable.
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
              sx={{ px: 1, borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab
                value="profile"
                label="Profile details"
                icon={<PersonOutline sx={{ fontSize: ICON.action }} />}
                iconPosition="start"
              />
              <Tab
                value="password"
                label="Change password"
                icon={<LockResetOutlined sx={{ fontSize: ICON.action }} />}
                iconPosition="start"
              />
            </Tabs>

            <Box sx={{ p: CARD_PAD }}>
              {tab === 'profile' ? (
                <FormProvider {...profileForm}>
                  <form onSubmit={profileForm.handleSubmit(saveProfile)} noValidate>
                    <Grid container spacing={2.25}>
                      <Grid item xs={12} sm={6}>
                        <RHFTextField name="name" label="Full name" />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <RHFContactNumber name="phone" codeName="phoneCountryCode" />
                      </Grid>
                      <Grid item xs={12}>
                        <RHFTextField
                          name="email"
                          label="Email address"
                          value={user?.email || ''}
                          disabled
                          helperText="Contact a Super Admin to change the email on your account"
                        />
                      </Grid>
                    </Grid>

                    <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2.5 }}>
                      <Button
                        type="submit"
                        variant="contained"
                        startIcon={
                          profileForm.formState.isSubmitting ? (
                            <CircularProgress size={15} color="inherit" />
                          ) : (
                            <SaveOutlined />
                          )
                        }
                        disabled={profileForm.formState.isSubmitting || !profileForm.formState.isDirty}
                      >
                        Save changes
                      </Button>
                    </Stack>
                  </form>
                </FormProvider>
              ) : (
                <FormProvider {...passwordForm}>
                  <form onSubmit={passwordForm.handleSubmit(changePassword)} noValidate>
                    <Alert severity="info" sx={{ mb: 2.5 }}>
                      Changing your password signs you out of every device, including this one. You will be
                      asked to sign in again straight away.
                    </Alert>

                    <Stack spacing={2.25} sx={{ maxWidth: 420 }}>
                      <RHFTextField
                        name="currentPassword"
                        label="Current password"
                        type={showPasswords ? 'text' : 'password'}
                        autoComplete="current-password"
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                size="small"
                                onClick={() => setShowPasswords((s) => !s)}
                                aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}
                                edge="end"
                              >
                                {showPasswords ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />
                      <RHFTextField
                        name="newPassword"
                        label="New password"
                        type={showPasswords ? 'text' : 'password'}
                        autoComplete="new-password"
                        helperText="At least 8 characters with upper case, lower case and a number"
                      />
                      <RHFTextField
                        name="confirmPassword"
                        label="Confirm new password"
                        type={showPasswords ? 'text' : 'password'}
                        autoComplete="new-password"
                      />
                    </Stack>

                    <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2.5 }}>
                      <Button
                        type="submit"
                        variant="contained"
                        startIcon={
                          passwordForm.formState.isSubmitting ? (
                            <CircularProgress size={15} color="inherit" />
                          ) : (
                            <LockResetOutlined />
                          )
                        }
                        disabled={passwordForm.formState.isSubmitting}
                      >
                        Update password
                      </Button>
                    </Stack>
                  </form>
                </FormProvider>
              )}
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ProfilePage;
