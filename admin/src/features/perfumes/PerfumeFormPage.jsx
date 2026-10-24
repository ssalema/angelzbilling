import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams, useBlocker } from 'react-router-dom';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Box,
  Card,
  Grid,
  Stepper,
  Step,
  StepLabel,
  StepButton,
  Button,
  Stack,
  CircularProgress,
  Divider,
  Skeleton,
  Typography,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import PublishedWithChangesOutlined from '@mui/icons-material/PublishedWithChangesOutlined';

import PageHeader from '../../components/common/PageHeader.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import StickyActionBar from '../../components/common/StickyActionBar.jsx';
import { ErrorState } from '../../components/common/StateViews.jsx';

import StepBasicInfo from './steps/StepBasicInfo.jsx';
import StepFeatures from './steps/StepFeatures.jsx';
import StepMedia from './steps/StepMedia.jsx';
import StepVariants from './steps/StepVariants.jsx';
import StepPreview from './steps/StepPreview.jsx';

import { perfumeSchema, emptyPerfume, stepFields, basePricingFor } from './perfumeSchema.js';
import { CARD_PAD, FONT, GUTTER, INSET_RADIUS } from '../../theme/index.js';
import { perfumeApi } from '../../api/endpoints.js';
import useApiResource from '../../hooks/useApiResource.js';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import { applyServerErrors } from '../../api/client.js';

const STEPS = ['Basic information', 'Features & FAQs', 'Perfume media', 'Variants', 'Preview & publish'];

/** Submits this soon after a step change are treated as stray clicks. */
const STEP_SETTLE_MS = 700;

const PerfumeFormPage = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const snackbar = useSnackbar();

  const [activeStep, setActiveStep] = useState(0);
  const [visited, setVisited] = useState({ 0: true });
  const [confirmLeave, setConfirmLeave] = useState(null);
  // Which button shows a spinner: 'draft' | 'publish'.
  const [pendingAction, setPendingAction] = useState(null);
  // When the current step opened; guards the final Save against stray clicks.
  const stepEnteredAt = useRef(Date.now());

  const methods = useForm({
    resolver: zodResolver(perfumeSchema),
    defaultValues: emptyPerfume,
    mode: 'onTouched',
  });

  const {
    handleSubmit,
    reset,
    trigger,
    setValue,
    getValues,
    setError,
    formState: { isSubmitting, isDirty },
  } = methods;

  // Watch brands/categories only; the perfume itself isn't watched so a
  // half-filled form never gets overwritten.
  const facets = useApiResource(() => perfumeApi.facets(), [], { watch: 'perfumes' });

  const existing = useApiResource(() => (isEdit ? perfumeApi.get(id) : Promise.resolve(null)), [id], {
    immediate: isEdit,
  });

  useEffect(() => {
    if (!existing.data) return;
    const perfume = existing.data;

    reset({
      ...emptyPerfume,
      ...perfume,
      mrp: perfume.mrp ?? '',
      hasVariants: Boolean(perfume.hasVariants),
      tags: perfume.tags || [],
      features: perfume.features || [],
      faqs: perfume.faqs || [],
      images: perfume.images || [],
      videos: perfume.videos || [],
      variantAttributes: perfume.variantAttributes || [],
      variants: (perfume.variants || []).map((variant) => ({
        ...variant,
        _id: variant._id,
        // Mongo returns a Map for `options`; normalise it to a plain object.
        options: variant.options ? { ...variant.options } : {},
        image: variant.image || { url: '', publicId: '' },
      })),
    });
  }, [existing.data, reset]);

  useEffect(() => {
    if (isEdit) return undefined;
    let cancelled = false;

    perfumeApi
      .nextSku()
      .then(({ sku }) => {
        // Never overwrite something typed while the request was in flight.
        if (cancelled || !sku || getValues('sku')) return;
        setValue('sku', sku); // not dirty: an untouched form shouldn't warn on leave
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isEdit, setValue, getValues]);

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        isDirty && !isSubmitting && currentLocation.pathname !== nextLocation.pathname,
      [isDirty, isSubmitting]
    )
  );

  useEffect(() => {
    if (blocker.state === 'blocked') setConfirmLeave(blocker);
  }, [blocker]);

  const goToStep = async (target) => {
    // Moving forward validates the steps being left behind; moving back is free.
    if (target > activeStep) {
      const fields = [];
      for (let step = activeStep; step < target; step += 1) fields.push(...stepFields[step]);
      const valid = await trigger(fields);
      if (!valid) {
        snackbar.warning('Please fix the highlighted fields before continuing');
        return;
      }
    }
    setVisited((prev) => ({ ...prev, [target]: true }));
    setActiveStep(target);
    stepEnteredAt.current = Date.now();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async (values, statusOverride) => {
    setPendingAction(statusOverride === 'draft' ? 'draft' : 'publish');
    const pricing = basePricingFor(values);
    const payload = {
      ...values,
      status: statusOverride || values.status,
      mrp: pricing.mrp,
      discountPercent: pricing.discountPercent,
      // Stock and alert weight are in grams. sizeGrams is only used when there are no variants.
      sizeGrams: Number(values.sizeGrams) || 0,
      stock: Number(values.stock) || 0,
      lowStockThreshold: Number(values.lowStockThreshold) || 0,
      sku: values.sku.toUpperCase(),
      // `stock` is dropped: inventory belongs to the perfume and every size draws on it.
      variants: values.hasVariants
        ? values.variants.map(({ stock: _ignored, ...variant }) => ({
            ...variant,
            sku: variant.sku.toUpperCase(),
            mrp: Number(variant.mrp) || 0,
            discountPercent: Number(variant.discountPercent) || 0,
          }))
        : [],
      variantAttributes: values.hasVariants ? values.variantAttributes : [],
    };

    try {
      const result = isEdit ? await perfumeApi.update(id, payload) : await perfumeApi.create(payload);
      snackbar.success(result.message);
      reset(values); // clears the dirty flag so the leave guard stops firing
      navigate('/perfumes');
    } catch (error) {
      applyServerErrors(error, setError);
      snackbar.error(error.message);
    } finally {
      setPendingAction(null);
    }
  };

  const saveAsDraft = handleSubmit(
    (values) => save(values, 'draft'),
    async () => {
      // Drafts skip publish-only rules; check the essentials only.
      const valid = await trigger(['name', 'sku']);
      if (!valid) {
        snackbar.warning('A name and SKU are needed even for a draft');
        setActiveStep(0);
        return;
      }
      setValue('status', 'draft');
      save(getValues(), 'draft');
    }
  );

  const crumbs = [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Perfumes', to: '/perfumes' },
    { label: isEdit ? 'Edit' : 'New' },
  ];

  if (existing.error) {
    return (
      <Box>
        <PageHeader title="Edit perfume" breadcrumbs={crumbs} />
        <Card>
          <ErrorState error={existing.error} onRetry={existing.reload} />
        </Card>
      </Box>
    );
  }

  if (isEdit && existing.loading) {
    return (
      <Box>
        <PageHeader
          title="Edit perfume"
          breadcrumbs={crumbs}
        />
        {/* Skeleton mirrors the wizard: stepper, then step one's fields. */}
        <Card sx={{ p: CARD_PAD, mb: 2.5 }}>
          <Stack direction="row" spacing={2} sx={{ overflow: 'hidden' }}>
            {STEPS.map((step) => (
              <Stack key={step} direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                <Skeleton variant="circular" width={28} height={28} sx={{ flexShrink: 0 }} />
                <Skeleton variant="text" width="70%" height={14} />
              </Stack>
            ))}
          </Stack>
        </Card>
        <Card sx={{ p: CARD_PAD }}>
          <Skeleton variant="text" width={200} height={22} />
          <Divider sx={{ my: 2 }} />
          <Grid container spacing={GUTTER.fields}>
            {Array.from({ length: 6 }).map((_, index) => (
              <Grid item xs={12} sm={6} key={index}>
                <Skeleton variant="text" width="45%" height={13} />
                <Skeleton variant="rounded" height={44} sx={{ borderRadius: `${INSET_RADIUS}px`, mt: 0.5 }} />
              </Grid>
            ))}
          </Grid>
          <Skeleton variant="rounded" height={110} sx={{ borderRadius: `${INSET_RADIUS}px`, mt: 2 }} />
        </Card>
      </Box>
    );
  }

  const isLastStep = activeStep === STEPS.length - 1;

  return (
    <Box>
      <PageHeader
        title={isEdit ? 'Edit perfume' : 'Add perfume'}
        subtitle={
          isEdit
            ? `Updating "${existing.data?.name || ''}"`
            : 'Five short steps — you can save as a draft at any point'
        }
        breadcrumbs={crumbs}
      />

      <Card sx={{ p: CARD_PAD, mb: 2.5 }}>
        {/* Below `sm` the stepper shows only dots, so name the current step here. */}
        <Box sx={{ display: { xs: 'block', sm: 'none' }, mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
            Step {activeStep + 1} of {STEPS.length}
          </Typography>
          <Typography variant="body2" fontWeight={600} noWrap>
            {STEPS[activeStep]}
          </Typography>
        </Box>

        <Stepper
          activeStep={activeStep}
          alternativeLabel
          nonLinear
          sx={{
            '& .MuiStepLabel-labelContainer': { display: { xs: 'none', sm: 'block' } },
            '& .MuiStepLabel-label': { fontSize: FONT.small, mt: 1 },
            '& .MuiStepButton-root': {
              borderRadius: 1.5,
              py: 1,
              transition: (theme) => theme.transitions.create(['background-color']),
              '&:hover': { backgroundColor: 'action.hover' },
            },
            '& .MuiStepLabel-root': { cursor: 'pointer' },
          }}
        >
          {STEPS.map((label, index) => (
            <Step key={label} completed={visited[index] && index < activeStep}>
              <StepButton
                onClick={() => goToStep(index)}
                disabled={isSubmitting}
                aria-current={index === activeStep ? 'step' : undefined}
              >
                <StepLabel>{label}</StepLabel>
              </StepButton>
            </Step>
          ))}
        </Stepper>
      </Card>

      <FormProvider {...methods}>
        <form
          onSubmit={(event) => {
            if (!isLastStep) {
              event.preventDefault();
              goToStep(activeStep + 1);
              return;
            }
            if (Date.now() - stepEnteredAt.current < STEP_SETTLE_MS) {
              event.preventDefault();
              return;
            }
            handleSubmit((values) => save(values))(event);
          }}
          noValidate
        >
          {activeStep === 0 && <StepBasicInfo facets={facets.data} isEdit={isEdit} />}
          {activeStep === 1 && <StepFeatures />}
          {activeStep === 2 && <StepMedia />}
          {activeStep === 3 && <StepVariants />}
          {activeStep === 4 && <StepPreview />}

          <StickyActionBar
            progress={
              <LinearProgress
                variant="determinate"
                value={((activeStep + 1) / STEPS.length) * 100}
                sx={{ height: 3 }}
              />
            }
            status={
              <Stack direction="row" alignItems="center" spacing={2} sx={{ minWidth: 0 }}>
                <Button
                  type="button"
                  startIcon={<ChevronLeft />}
                  onClick={() => goToStep(activeStep - 1)}
                  disabled={activeStep === 0 || isSubmitting}
                  color="inherit"
                  sx={{ whiteSpace: 'nowrap', flexShrink: 0, visibility: activeStep === 0 ? 'hidden' : 'visible' }}
                >
                  Back
                </Button>

                <Box sx={{ minWidth: 0, display: { xs: 'none', md: 'block' } }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
                    Step {activeStep + 1} of {STEPS.length}
                  </Typography>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {STEPS[activeStep]}
                  </Typography>
                </Box>
              </Stack>
            }
          >
                <Tooltip title="Save what you have and finish later">
                  <span style={{ display: 'flex', flex: 1 }}>
                    <Button
                      type="button"
                      variant="outlined"
                      startIcon={
                        pendingAction === 'draft' ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : (
                          <SaveOutlined />
                        )
                      }
                      onClick={saveAsDraft}
                      disabled={isSubmitting}
                      fullWidth
                      sx={{ whiteSpace: 'nowrap', minWidth: { sm: 140 } }}
                    >
                      {pendingAction === 'draft' ? 'Saving…' : 'Save draft'}
                    </Button>
                  </span>
                </Tooltip>

                {isLastStep ? (
                  <Button
                    type="submit"
                    variant="contained"
                    startIcon={
                      pendingAction === 'publish' ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <PublishedWithChangesOutlined />
                      )
                    }
                    disabled={isSubmitting}
                    fullWidth
                    sx={{ whiteSpace: 'nowrap', minWidth: { sm: 170 } }}
                  >
                    {pendingAction === 'publish' ? 'Saving…' : isEdit ? 'Save changes' : 'Save perfume'}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="contained"
                    endIcon={<ChevronRight />}
                    onClick={() => goToStep(activeStep + 1)}
                    disabled={isSubmitting}
                    fullWidth
                    sx={{ whiteSpace: 'nowrap', minWidth: { sm: 170 } }}
                  >
                    Continue
                  </Button>
                )}
          </StickyActionBar>
        </form>
      </FormProvider>

      <ConfirmDialog
        open={Boolean(confirmLeave)}
        title="Leave without saving?"
        message="You have unsaved changes to this perfume. They will be lost if you leave now."
        confirmLabel="Discard changes"
        severity="warning"
        onConfirm={() => confirmLeave?.proceed?.()}
        onClose={() => {
          confirmLeave?.reset?.();
          setConfirmLeave(null);
        }}
      />
    </Box>
  );
};

export default PerfumeFormPage;
