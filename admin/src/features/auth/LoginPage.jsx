import { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Card,
  Typography,
  Button,
  Alert,
  Stack,
  InputAdornment,
  IconButton,
  CircularProgress,
  Divider,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import MailOutline from '@mui/icons-material/MailOutline';
import LockOutlined from '@mui/icons-material/LockOutlined';
import { RHFTextField } from '../../components/form/RHFControls.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { applyServerErrors } from '../../api/client.js';
import { FONT, ICON, brand, onPlum } from '../../theme/index.js';
import { IMG } from '../../utils/image.js';

const schema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const LoginPage = () => {
  const { login, sessionExpired } = useAuth();
  const { siteName, logo } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState(null);

  const methods = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });

  const {
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = methods;

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      await login(values);
      navigate(location.state?.from?.pathname || '/dashboard', { replace: true });
    } catch (error) {
      // Field-level errors go on the fields; everything else on the banner.
      if (!applyServerErrors(error, setError)) setFormError(error.message);
      else setFormError(error.message);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1.05fr 1fr' },
        bgcolor: 'background.default',
      }}
    >
      {/* Brand panel — hidden on small screens where the form is what matters */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: 6,
          bgcolor: brand.plum,
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
          '&::after': {
            content: '""',
            position: 'absolute',
            width: 460,
            height: 460,
            right: -140,
            bottom: -160,
            borderRadius: '50%',
            border: `1px solid ${brand.gold}`,
            opacity: 0.28,
          },
          '&::before': {
            content: '""',
            position: 'absolute',
            width: 300,
            height: 300,
            right: -40,
            bottom: -80,
            borderRadius: '50%',
            border: `1px solid ${brand.gold}`,
            opacity: 0.2,
          },
        }}
      >
        <Box>
          <Typography
            sx={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: '2.1rem',
              fontWeight: 700,
              letterSpacing: '0.03em',
            }}
          >
            {siteName}
          </Typography>
          <Typography sx={{ color: brand.goldLight, letterSpacing: '0.22em', fontSize: FONT.micro, textTransform: 'uppercase', mt: 0.5 }}>
            Billing & Inventory Admin
          </Typography>
        </Box>

        <Box sx={{ position: 'relative', zIndex: 1, maxWidth: 420 }}>
          <Typography variant="h2" sx={{ fontSize: '2.4rem', lineHeight: 1.2, mb: 2 }}>
            Every Perfume, every bottle, every bill, in one place.
          </Typography>
          <Typography sx={{ color: onPlum.textMuted, fontSize: FONT.lead, lineHeight: 1.7 }}>
            Track revenue across branches, manage your fragrance catalogue with per-size variants, and raise a
            printed bill in seconds.
          </Typography>
        </Box>

        <Typography sx={{ fontSize: FONT.small, color: onPlum.textGhost }}>
          © {new Date().getFullYear()} {siteName}. Staff access only.
        </Typography>
      </Box>

      {/* Form panel */}
      <Box sx={{ display: 'grid', placeItems: 'center', p: { xs: 2.5, sm: 4 } }}>
        <Card sx={{ p: { xs: 3, sm: 4.5 }, width: '100%', maxWidth: 420, border: 0, boxShadow: 'none', bgcolor: 'transparent' }}>
          {logo ? (
            <Box component="img" src={IMG.logo(logo)} alt={siteName} sx={{ display: 'block', width: '100%', maxWidth: '100%', height: 'auto', mb: 1, objectFit: 'contain', objectPosition: 'left' }} />
          ) : (
            <Box sx={{ display: { md: 'none' }, mb: 3 }}>
              <Typography sx={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.7rem', fontWeight: 700, color: brand.plum }}>
                {siteName}
              </Typography>
            </Box>
          )}

          <Typography variant="h3" sx={{ mb: 0.75 }}>
            Sign in
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Enter your credentials to access the admin panel.
          </Typography>

          {sessionExpired && !formError && (
            <Alert severity="warning" sx={{ mb: 2.5 }}>
              Your session expired. Please sign in again.
            </Alert>
          )}

          {formError && (
            <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setFormError(null)}>
              {formError}
            </Alert>
          )}

          <FormProvider {...methods}>
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <Stack spacing={2.25}>
                <RHFTextField
                  name="email"
                  label="Email address"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <MailOutline sx={{ fontSize: ICON.action, color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                  }}
                />

                <RHFTextField
                  name="password"
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockOutlined sx={{ fontSize: ICON.action, color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={() => setShowPassword((s) => !s)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          edge="end"
                        >
                          {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={isSubmitting}
                  startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : null}
                  sx={{ minHeight: 46, mt: 0.5 }}
                >
                  {isSubmitting ? 'Signing in…' : 'Sign in'}
                </Button>
              </Stack>
            </form>
          </FormProvider>

          <Divider sx={{ my: 3 }}>
            <Typography variant="caption" color="text.secondary">
              Need access?
            </Typography>
          </Divider>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
            Accounts are created by a Super Admin from the Users module. Contact your administrator if you
            cannot sign in.
          </Typography>
        </Card>
      </Box>
    </Box>
  );
};

export default LoginPage;
