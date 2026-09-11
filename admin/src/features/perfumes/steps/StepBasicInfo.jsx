import { Grid, Card, Box } from '@mui/material';
import { useFormContext, useWatch } from 'react-hook-form';
import {
  RHFTextField,
  RHFNumberField,
  RHFAutocomplete,
  RHFChipInput,
} from '../../../components/form/RHFControls.jsx';
import SectionTitle from '../../../components/common/SectionTitle.jsx';
import { FRAGRANCE_FAMILIES, CONCENTRATIONS } from '../../../utils/constants.js';
import { formatGrams } from '../../../utils/format.js';
import { CARD_PAD, GUTTER } from '../../../theme/index.js';

// Re-exported so every wizard step opens its panels the same way.
export const SectionCard = ({ title, description, action, children }) => (
  <Card sx={{ p: CARD_PAD, mb: 2.5 }}>
    <SectionTitle title={title} description={description} action={action} />
    {children}
  </Card>
);

const StepBasicInfo = ({ facets, isEdit }) => {
  const { control } = useFormContext();
  const [stock, lowStockThreshold] = useWatch({
    control,
    name: ['stock', 'lowStockThreshold'],
  });

  const stockGrams = Number(stock) || 0;
  const isLow = stockGrams <= (Number(lowStockThreshold) || 0);

  return (
    <Box>
      <SectionCard title="Basic information" description="The essentials that identify this fragrance.">
        <Grid container spacing={GUTTER.cards}>
          <Grid item xs={12} md={8}>
            <RHFTextField
              name="name"
              label="Perfume name *"
              placeholder="e.g. Royal Oud — Premium Attar"
              helperText="Shown on the catalogue, the bill and the print receipt"
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <RHFTextField
              name="sku"
              label="SKU *"
              placeholder="AP-001"
              helperText={
                isEdit ? 'Unique across the whole catalogue' : 'Numbered automatically — edit it if you prefer your own'
              }
              inputProps={{ style: { textTransform: 'uppercase' } }}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <RHFAutocomplete name="brand" label="Brand" options={facets?.brands || []} />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <RHFAutocomplete name="category" label="Category" options={facets?.categories || []} />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <RHFAutocomplete name="subCategory" label="Sub-category" options={facets?.subCategories || []} />
          </Grid>

          <Grid item xs={12} sm={6}>
            <RHFAutocomplete name="fragranceFamily" label="Fragrance family" options={FRAGRANCE_FAMILIES} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <RHFAutocomplete name="concentration" label="Concentration" options={CONCENTRATIONS} />
          </Grid>

          <Grid item xs={12}>
            <RHFTextField
              name="shortDescription"
              label="Short description"
              placeholder="One line that sums up the scent"
            />
          </Grid>
          <Grid item xs={12}>
            <RHFTextField
              name="description"
              label="Full description"
              multiline
              minRows={4}
              placeholder="Describe the notes, the occasion and how it wears through the day."
            />
          </Grid>
        </Grid>
      </SectionCard>

      <SectionCard
        title="Inventory"
        description="One bulk weight for the whole perfume — every size is poured from it. Prices are set on the Variants step."
      >
        <Grid container spacing={GUTTER.cards}>
          <Grid item xs={12} sm={6}>
            <RHFNumberField
              name="stock"
              label="Total stock on hand (gm) *"
              inputProps={{ min: 0, step: 'any' }}
              helperText={
                stockGrams > 0
                  ? formatGrams(stockGrams)
                  : 'Required — the whole perfume, variants included, sells from this weight'
              }
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <RHFNumberField
              name="lowStockThreshold"
              label="Low stock alert at (gm) *"
              inputProps={{ min: 0, step: 'any' }}
              helperText={
                isLow && stockGrams >= 0
                  ? 'The stock above is already at or below this — the alert will fire'
                  : 'Alerts when the total above falls to this weight'
              }
            />
          </Grid>
          <Grid item xs={12}>
            <RHFChipInput
              name="tags"
              label="Tags"
              placeholder="Type a tag and press Enter"
              helperText="Used by search — e.g. woody, gifting, bestseller"
            />
          </Grid>
        </Grid>
      </SectionCard>
    </Box>
  );
};

export default StepBasicInfo;
