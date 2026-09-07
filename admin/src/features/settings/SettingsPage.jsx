import { useEffect, useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Box,
  Card,
  Paper,
  Grid,
  Tabs,
  Tab,
  Typography,
  Stack,
  Button,
  Divider,
  InputAdornment,
  CircularProgress,
  Skeleton,
  Alert,
} from '@mui/material';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import StorefrontOutlined from '@mui/icons-material/StorefrontOutlined';
import StoreOutlined from '@mui/icons-material/StoreOutlined';
import ShareOutlined from '@mui/icons-material/ShareOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import Instagram from '@mui/icons-material/Instagram';
import Facebook from '@mui/icons-material/Facebook';
import LinkedIn from '@mui/icons-material/LinkedIn';

import PageHeader from '../../components/common/PageHeader.jsx';
import { RHFTextField, RHFNumberField } from '../../components/form/RHFControls.jsx';
import RHFContactNumber from '../../components/form/RHFContactNumber.jsx';
import SectionTitle from '../../components/common/SectionTitle.jsx';
import { ResetIconButton } from '../../components/common/FilterBar.jsx';
import { ErrorState, CardSkeleton } from '../../components/common/StateViews.jsx';
import BrandingPanel from './BrandingPanel.jsx';
import BranchesPanel from './BranchesPanel.jsx';
import useSettingsTab from './useSettingsTab.js';

import { settingsApi } from '../../api/endpoints.js';
import useApiResource from '../../hooks/useApiResource.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import { applyServerErrors } from '../../api/client.js';
import { formatRelative } from '../../utils/format.js';
import { DEFAULT_DIAL_CODE, addContactNumberIssue } from '../../utils/countries.js';
import { CARD_PAD, ICON } from '../../theme/index.js';

const urlOrEmpty = (name) => z.string().trim().url(`Enter a full ${name} URL`).or(z.literal('')).default('');

const schema = z
  .object({
  siteName: z.string().trim().min(2, 'Store name is required').max(120),
  tagline: z.string().trim().max(200).default(''),
  contactEmail: z.string().trim().email('Enter a valid email').or(z.literal('')).default(''),
  contactNumber: z.string().trim().default(''),
  contactNumberCountryCode: z.string().trim().default(DEFAULT_DIAL_CODE),
  companyAddress: z.string().trim().max(500).default(''),
  gstin: z.string().trim().max(20).default(''),
  social: z.object({
    instagram: urlOrEmpty('Instagram'),
    facebook: urlOrEmpty('Facebook'),
    twitter: urlOrEmpty('X (Twitter)'),
    linkedin: urlOrEmpty('LinkedIn'),
  }),
  billing: z.object({
    currencySymbol: z.string().trim().max(4).default('₹'),
    billPrefix: z
      .string()
      .trim()
      .toUpperCase()
      .min(1, 'Required')
      .max(6)
      .regex(/^[A-Z0-9]+$/, 'Letters and numbers only')
      .default('AP'),
    defaultTaxPercent: z.coerce.number().min(0).max(100).default(0),
    maxDiscountPercent: z.coerce.number().min(0).max(100).default(20),
    invoiceFooter: z.string().trim().max(300).default(''),
    termsAndConditions: z.string().trim().max(2000).default(''),
  }),
  })
  .superRefine((data, ctx) =>
    addContactNumberIssue(ctx, {
      dial: data.contactNumberCountryCode,
      number: data.contactNumber,
      path: ['contactNumber'],
      required: false,
    })
  );

/**
 * "Never updated" hint next to each field, matching the reference UI.
 * The server escapes dots to colons because Mongoose Map keys cannot hold "."
 */
const UpdatedHint = ({ settings, path }) => {
  const at = settings?.updatedFields?.[path.replace(/\./g, ':')];
  return (
    <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: at ? 'normal' : 'italic', whiteSpace: 'nowrap' }}>
      {at ? `Updated ${formatRelative(at)}` : 'Never updated'}
    </Typography>
  );
};

const FieldRow = ({ label, settings, path, gutter = true, children }) => (
  <Box sx={{ mb: gutter ? 2.25 : 0 }}>
    <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.6 }}>
      <Typography variant="subtitle2">{label}</Typography>
      <UpdatedHint settings={settings} path={path} />
    </Stack>
    {children}
  </Box>
);

const TABS = [
  { value: 'general', label: 'General', icon: <StorefrontOutlined sx={{ fontSize: ICON.action }} /> },
  { value: 'billing', label: 'Billing', icon: <ReceiptLongOutlined sx={{ fontSize: ICON.action }} /> },
  { value: 'branches', label: 'Branches', icon: <StoreOutlined sx={{ fontSize: ICON.action }} /> },
  { value: 'social', label: 'Social profiles', icon: <ShareOutlined sx={{ fontSize: ICON.action }} /> },
];

const SettingsPage = () => {
  const snackbar = useSnackbar();
  // The General, Billing, Social and Branding panels all write the ONE main
  // business record, so they follow store-wide authority, not branch authority.
  const { isSuperAdmin, isMainSuperAdmin, branchName } = useAuth();
  const { reload: reloadGlobalSettings } = useSettings();
  const { tab, setTab } = useSettingsTab();

  const settings = useApiResource(() => settingsApi.get(), []);

  const methods = useForm({ resolver: zodResolver(schema), mode: 'onTouched' });
  const {
    handleSubmit,
    reset,
    setError,
    formState: { isSubmitting, isDirty },
  } = methods;

  useEffect(() => {
    if (!settings.data) return;
    const data = settings.data;
    reset({
      siteName: data.siteName || '',
      tagline: data.tagline || '',
      contactEmail: data.contactEmail || '',
      contactNumber: data.contactNumber || '',
      contactNumberCountryCode: data.contactNumberCountryCode || DEFAULT_DIAL_CODE,
      companyAddress: data.companyAddress || '',
      gstin: data.gstin || '',
      social: {
        instagram: data.social?.instagram || '',
        facebook: data.social?.facebook || '',
        twitter: data.social?.twitter || '',
        linkedin: data.social?.linkedin || '',
      },
      billing: {
        currencySymbol: data.billing?.currencySymbol || '₹',
        billPrefix: data.billing?.billPrefix || 'AP',
        defaultTaxPercent: data.billing?.defaultTaxPercent ?? 0,
        maxDiscountPercent: data.billing?.maxDiscountPercent ?? 20,
        invoiceFooter: data.billing?.invoiceFooter || '',
        termsAndConditions: data.billing?.termsAndConditions || '',
      },
    });
  }, [settings.data, reset]);

  /**
   * Branding waits here until the form is saved, so the logo behaves like every
   * other field on the tab: a File to upload, `null` to remove, or no key at
   * all for untouched. Discarding drops the lot.
   */
  const [branding, setBranding] = useState({});
  const brandingDirty = Object.keys(branding).length > 0;

  // Percentage per slot while the save is uploading it — the slot shows the
  // same spinner-and-bar readout the perfume media grid does.
  const [brandingProgress, setBrandingProgress] = useState({});

  const stageBranding = (kind, value) => setBranding((current) => ({ ...current, [kind]: value }));

  const discard = () => {
    reset();
    setBranding({});
  };

  const onSubmit = async (values) => {
    try {
      const result = await settingsApi.update(values);

      // Sequentially, and after the text fields: every branding call writes the
      // same settings document, so the last response is the one that carries
      // the whole save.
      let data = result.data;
      for (const kind of ['logo', 'favicon']) {
        if (!(kind in branding)) continue;
        const file = branding[kind];
        let uploaded;
        if (file) {
          setBrandingProgress((current) => ({ ...current, [kind]: 0 }));
          try {
            uploaded = await settingsApi.uploadBranding(kind, file, (value) =>
              setBrandingProgress((current) => ({ ...current, [kind]: value }))
            );
          } finally {
            setBrandingProgress((current) => ({ ...current, [kind]: null }));
          }
        } else {
          uploaded = await settingsApi.removeBranding(kind);
        }
        data = uploaded.data;
      }

      setBranding({});
      snackbar.success(result.message);
      settings.setData(data);
      reset(values);
      reloadGlobalSettings(); // sidebar + print header pick up the new name/logo
    } catch (error) {
      applyServerErrors(error, setError);
      snackbar.error(error.message);
    }
  };

  if (settings.error) {
    return (
      <Box>
        <PageHeader title="Settings" />
        <Card>
          <ErrorState error={settings.error} onRetry={settings.reload} />
        </Card>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Settings"
        subtitle="Store identity, contact details, billing rules, branding, branches and social profiles"
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Settings' }]}
      />

      {!isMainSuperAdmin && (
        <Alert severity="info" sx={{ mb: 2.5 }}>
          {isSuperAdmin
            ? `These are the main business details and apply to every location. Your account is assigned to ${branchName}, so you can view them but only the main Super Admin can change them — edit your own branch under the Branches tab.`
            : 'You can view these settings, but only a Super Admin can change them.'}
        </Alert>
      )}

      <Card sx={{ mb: 2.5 }}>
        <Tabs
          value={tab}
          onChange={(_event, next) => setTab(next)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 1, borderBottom: 1, borderColor: 'divider' }}
        >
          {TABS.map((item) => (
            <Tab key={item.value} value={item.value} label={item.label} icon={item.icon} iconPosition="start" />
          ))}
        </Tabs>
      </Card>

      {settings.loading ? (
        // The tabs above are already real, so this only stands in for the
        // panel: a form card beside its summary card, same as what lands.
        <Grid container spacing={2.5}>
          <Grid item xs={12} md={8}>
            <Card sx={{ p: CARD_PAD }}>
              <Skeleton variant="text" width={200} height={22} />
              <Divider sx={{ my: 2 }} />
              <Grid container spacing={2}>
                {Array.from({ length: 6 }).map((_, index) => (
                  <Grid item xs={12} sm={6} key={index}>
                    <Skeleton variant="text" width="45%" height={13} />
                    <Skeleton variant="rounded" height={44} sx={{ borderRadius: 2, mt: 0.5 }} />
                  </Grid>
                ))}
              </Grid>
              <Skeleton variant="rounded" height={90} sx={{ borderRadius: 2, mt: 2 }} />
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <CardSkeleton height={420} lines={6} />
          </Grid>
        </Grid>
      ) : tab === 'branches' ? (
        <BranchesPanel
          canEdit={isSuperAdmin}
          settings={settings.data}
          onSettingsChange={(data) => {
            settings.setData(data);
            reloadGlobalSettings(); // branch chips and columns across the app follow this switch
          }}
        />
      ) : (
        <FormProvider {...methods}>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Grid container spacing={2.5}>
              <Grid item xs={12} md={tab === 'general' ? 8 : 12}>
                {tab === 'general' && (
                  // Every field row carries a bottom margin for the row under
                  // it; the last one has nothing under it but the card edge.
                  <Card sx={{ p: CARD_PAD, '& > :last-child': { mb: 0 } }}>
                    <SectionTitle
                      title="General information"
                      description="The main business identity — used everywhere a branch does not override it."
                      action={
                        <ResetIconButton
                          onClick={() => reset()}
                          disabled={!isDirty}
                          title="Reset changes"
                          disabledTitle="No unsaved changes"
                        />
                      }
                    />
                    <Divider sx={{ mb: 2.5 }} />

                    <FieldRow label="Site name" settings={settings.data} path="siteName">
                      <RHFTextField name="siteName" placeholder="Your store name" disabled={!isMainSuperAdmin} />
                    </FieldRow>

                    <FieldRow label="Tagline" settings={settings.data} path="tagline">
                      <RHFTextField
                        name="tagline"
                        placeholder="Hand blended attars and fine fragrance"
                        disabled={!isMainSuperAdmin}
                      />
                    </FieldRow>

                    <FieldRow label="Contact email" settings={settings.data} path="contactEmail">
                      <RHFTextField
                        name="contactEmail"
                        type="email"
                        placeholder="support@yourstore.in"
                        disabled={!isMainSuperAdmin}
                      />
                    </FieldRow>

                    <FieldRow label="Contact number" settings={settings.data} path="contactNumber">
                      <RHFContactNumber
                        name="contactNumber"
                        codeName="contactNumberCountryCode"
                        label={null}
                        disabled={!isMainSuperAdmin}
                      />
                    </FieldRow>

                    <FieldRow label="Company address" settings={settings.data} path="companyAddress">
                      <RHFTextField
                        name="companyAddress"
                        placeholder="City, State (Country)"
                        multiline
                        minRows={2}
                        maxRows={2}
                        disabled={!isMainSuperAdmin}
                      />
                    </FieldRow>

                    <FieldRow label="GSTIN" settings={settings.data} path="gstin">
                      <RHFTextField
                        name="gstin"
                        placeholder="22AAAAA0000A1Z5"
                        disabled={!isMainSuperAdmin}
                        inputProps={{ style: { textTransform: 'uppercase' } }}
                      />
                    </FieldRow>
                  </Card>
                )}

                {tab === 'billing' && (
                  <Card sx={{ p: CARD_PAD }}>
                    <SectionTitle
                      title="Billing preferences"
                      description="These defaults apply to every new bill and to the printed invoice."
                    />
                    <Divider sx={{ mb: 2.5 }} />

                    <Grid container spacing={2.25}>
                      <Grid item xs={12} sm={4}>
                        <RHFTextField
                          name="billing.billPrefix"
                          label="Bill number prefix"
                          disabled={!isMainSuperAdmin}
                          helperText="e.g. AP260900001"
                          inputProps={{ style: { textTransform: 'uppercase' }, maxLength: 6 }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <RHFTextField
                          name="billing.currencySymbol"
                          label="Currency symbol"
                          disabled={!isMainSuperAdmin}
                          inputProps={{ maxLength: 4 }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <RHFNumberField
                          name="billing.defaultTaxPercent"
                          label="Default tax"
                          suffix="%"
                          disabled={!isMainSuperAdmin}
                          inputProps={{ min: 0, max: 100, step: '0.01' }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <RHFNumberField
                          name="billing.maxDiscountPercent"
                          label="Staff discount limit"
                          suffix="%"
                          disabled={!isMainSuperAdmin}
                          helperText="The most Billing Staff may take off a line or a bill. Admins can go higher."
                          inputProps={{ min: 0, max: 100, step: '1' }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={8}>
                        <RHFTextField
                          name="billing.invoiceFooter"
                          label="Invoice footer"
                          placeholder="Thank you for shopping with us."
                          disabled={!isMainSuperAdmin}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <RHFTextField
                          name="billing.termsAndConditions"
                          label="Terms and conditions"
                          multiline
                          minRows={4}
                          placeholder="Printed in small type at the bottom of every bill."
                          disabled={!isMainSuperAdmin}
                        />
                      </Grid>
                    </Grid>
                  </Card>
                )}

                {tab === 'social' && (
                  <Card sx={{ p: CARD_PAD }}>
                    <SectionTitle
                      title="Social profiles"
                      description="Full profile URLs — used on printed material and future customer-facing pages."
                    />
                    <Divider sx={{ mb: 2.5 }} />

                    <Grid container spacing={2.5}>
                      <Grid item xs={12} md={6}>
                        <FieldRow label="Instagram" settings={settings.data} path="social.instagram" gutter={false}>
                          <RHFTextField
                            name="social.instagram"
                            placeholder="https://instagram.com/yourstore"
                            disabled={!isMainSuperAdmin}
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <Instagram sx={{ fontSize: ICON.action }} />
                                </InputAdornment>
                              ),
                            }}
                          />
                        </FieldRow>
                      </Grid>

                      <Grid item xs={12} md={6}>
                        <FieldRow label="X (Twitter)" settings={settings.data} path="social.twitter" gutter={false}>
                          <RHFTextField
                            name="social.twitter"
                            placeholder="https://x.com/yourstore"
                            disabled={!isMainSuperAdmin}
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <Box component="span" sx={{ fontWeight: 700, fontSize: ICON.inline }}>
                                    𝕏
                                  </Box>
                                </InputAdornment>
                              ),
                            }}
                          />
                        </FieldRow>
                      </Grid>

                      <Grid item xs={12} md={6}>
                        <FieldRow label="Facebook" settings={settings.data} path="social.facebook" gutter={false}>
                          <RHFTextField
                            name="social.facebook"
                            placeholder="https://facebook.com/yourstore"
                            disabled={!isMainSuperAdmin}
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <Facebook sx={{ fontSize: ICON.action }} />
                                </InputAdornment>
                              ),
                            }}
                          />
                        </FieldRow>
                      </Grid>

                      <Grid item xs={12} md={6}>
                        <FieldRow label="LinkedIn" settings={settings.data} path="social.linkedin" gutter={false}>
                          <RHFTextField
                            name="social.linkedin"
                            placeholder="https://linkedin.com/company/yourstore"
                            disabled={!isMainSuperAdmin}
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <LinkedIn sx={{ fontSize: ICON.action }} />
                                </InputAdornment>
                              ),
                            }}
                          />
                        </FieldRow>
                      </Grid>
                    </Grid>
                  </Card>
                )}
              </Grid>

              {tab === 'general' && (
                <Grid item xs={12} md={4}>
                  <BrandingPanel
                    settings={settings.data}
                    canEdit={isMainSuperAdmin}
                    pending={branding}
                    onPending={stageBranding}
                    onResetPending={() => setBranding({})}
                    progress={brandingProgress}
                    disabled={isSubmitting}
                  />
                </Grid>
              )}
            </Grid>

            {isMainSuperAdmin && (isDirty || brandingDirty) && (
              <Paper
                elevation={0}
                sx={{
                  position: 'sticky',
                  bottom: 0,
                  zIndex: (theme) => theme.zIndex.appBar,
                  mt: 2.5,
                  px: 2.5,
                  py: 1.75,
                  borderTop: 1,
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                }}
              >
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.5}
                  alignItems={{ xs: 'stretch', sm: 'center' }}
                  justifyContent="space-between"
                >
                  <Typography variant="body2" color="text.secondary">
                    You have unsaved changes.
                  </Typography>
                  <Stack direction="row" spacing={1.5} justifyContent="flex-end">
                    <Button variant="outlined" color="inherit" onClick={discard} disabled={isSubmitting}>
                      Discard changes
                    </Button>
                    <Button
                      type="submit"
                      variant="contained"
                      startIcon={isSubmitting ? <CircularProgress size={15} color="inherit" /> : <SaveOutlined />}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Saving…' : 'Save changes'}
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            )}
          </form>
        </FormProvider>
      )}
    </Box>
  );
};

export default SettingsPage;
