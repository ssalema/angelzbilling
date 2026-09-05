import { Card, Typography, Box, Button, Stack, IconButton, Grid, Chip, Tooltip } from '@mui/material';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { AddRounded, DeleteOutline, HelpOutline, CheckCircleOutline } from '@mui/icons-material';
import { RHFTextField, RHFChipInput } from '../../../components/form/RHFControls.jsx';
import { EmptyState } from '../../../components/common/StateViews.jsx';
import { SectionCard } from './StepBasicInfo.jsx';
import { ICON, surface } from '../../../theme/index.js';

const SUGGESTED_FEATURES = [
  'Alcohol free',
  'Long lasting — 10 to 12 hours',
  'Hand blended in small batches',
  'Skin friendly',
  'Unisex',
  'Gift ready packaging',
];

const StepFeatures = () => {
  const { control, setValue, getValues } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: 'faqs' });

  const addSuggestion = (feature) => {
    const current = getValues('features') || [];
    if (current.includes(feature)) return;
    setValue('features', [...current, feature], { shouldDirty: true, shouldValidate: true });
  };

  return (
    <Box>
      <SectionCard
        title="Key features"
        description="Short selling points. These appear as a bulleted list on the perfume page."
      >
        <RHFChipInput
          name="features"
          label="Features"
          placeholder="Type a feature and press Enter"
          helperText="Up to 20 features"
        />

        <Stack direction="row" spacing={0.75} sx={{ mt: 2, flexWrap: 'wrap' }} useFlexGap>
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', mr: 0.5 }}>
            Quick add:
          </Typography>
          {SUGGESTED_FEATURES.map((feature) => (
            <Chip
              key={feature}
              size="small"
              label={feature}
              variant="outlined"
              icon={<AddRounded sx={{ fontSize: ICON.micro }} />}
              onClick={() => addSuggestion(feature)}
              sx={{ cursor: 'pointer', '&:hover': { borderColor: 'secondary.main', bgcolor: surface.goldFaint } }}
            />
          ))}
        </Stack>
      </SectionCard>

      <SectionCard
        title="Frequently asked questions"
        description="Answer what customers ask at the counter — staff can read these off during a sale."
        action={
          <Button
            startIcon={<AddRounded />}
            variant="outlined"
            size="small"
            onClick={() => append({ question: '', answer: '' })}
            disabled={fields.length >= 20}
          >
            Add FAQ
          </Button>
        }
      >
        {fields.length === 0 ? (
          <EmptyState
            compact
            icon={HelpOutline}
            title="No FAQs yet"
            description="Optional, but they help new staff answer questions confidently."
            action={
              <Button startIcon={<AddRounded />} variant="contained" size="small" onClick={() => append({ question: '', answer: '' })}>
                Add the first FAQ
              </Button>
            }
          />
        ) : (
          <Stack spacing={2}>
            {fields.map((field, index) => (
              <Box
                key={field.id}
                sx={{ border: 1, borderColor: 'divider', borderRadius: 2.5, p: 2, bgcolor: surface.ivoryWash }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CheckCircleOutline sx={{ fontSize: ICON.action, color: 'text.secondary' }} />
                    <Typography variant="subtitle2">Question {index + 1}</Typography>
                  </Stack>
                  <Tooltip title="Remove this FAQ">
                    <IconButton size="small" color="error" onClick={() => remove(index)}>
                      <DeleteOutline sx={{ fontSize: ICON.action }} />
                    </IconButton>
                  </Tooltip>
                </Stack>

                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <RHFTextField
                      name={`faqs.${index}.question`}
                      label="Question"
                      placeholder="How long does the fragrance last?"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <RHFTextField
                      name={`faqs.${index}.answer`}
                      label="Answer"
                      multiline
                      minRows={2}
                      placeholder="Between 8 and 12 hours on skin, and longer on fabric."
                    />
                  </Grid>
                </Grid>
              </Box>
            ))}
          </Stack>
        )}
      </SectionCard>
    </Box>
  );
};

export default StepFeatures;
