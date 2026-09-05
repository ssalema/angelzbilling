import { Grid, Card, Typography, Box, Divider } from '@mui/material';
import { useFormContext, useWatch } from 'react-hook-form';
import {
  RHFTextField,
  RHFNumberField,
  RHFAutocomplete,
  RHFChipInput,
} from '../../../components/form/RHFControls.jsx';
import SectionTitle from '../../../components/common/SectionTitle.jsx';
import { FRAGRANCE_FAMILIES, CONCENTRATIONS } from '../../../utils/constants.js';
import { formatCurrency, formatGrams, formatNumber, unitsFromGrams } from '../../../utils/format.js';
import { computeFinalPrice, smallestFillGramsFor } from '../perfumeSchema.js';
import { FONT, CARD_PAD, brand, numericText, surface } from '../../../theme/index.js';

/**
 * Re-exported so every wizard step opens its panels the same way. It used to be
 * private here, and the other steps hand-rolled the pattern instead.
 */
export const SectionCard = ({ title, description, action, children }) => (
  <Card sx={{ p: CARD_PAD, mb: 2.5 }}>
    <SectionTitle title={title} description={description} action={action} />
    {children}
  </Card>
);

const StepBasicInfo = ({ facets, isEdit }) => {
  const { control } = useFormContext();
  const [mrp, discountPercent, sizeGrams, stock, lowStockThreshold, hasVariants, variants] = useWatch({
    control,
    name: ['mrp', 'discountPercent', 'sizeGrams', 'stock', 'lowStockThreshold', 'hasVariants', 'variants'],
  });

  const finalPrice = computeFinalPrice(mrp, discountPercent);
  const saving = (Number(mrp) || 0) - finalPrice;
  const stockGrams = Number(stock) || 0;
  const isLow = stockGrams <= (Number(lowStockThreshold) || 0);

  // This is the perfume's ONE stock, so what it covers depends on which fill it
  // is poured into: the pack size when there are no variants, otherwise the
  // smallest active variant size (the best case).
  const packSize = smallestFillGramsFor({ hasVariants, variants, sizeGrams });

  return (
    <Box>
      <SectionCard title="Basic information" description="The essentials that identify this fragrance.">
        <Grid container spacing={2.25}>
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
              helperText="Appears under the perfume name in listings"
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

      <SectionCard title="Pricing">
        <Grid container spacing={2.25} alignItems="stretch">
          <Grid item xs={12} sm={6} md={4}>
            <RHFNumberField
              name="mrp"
              label="MRP / Price *"
              prefix="₹"
              inputProps={{ min: 0, step: '0.01' }}
              helperText="Before any discount"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <RHFNumberField
              name="discountPercent"
              label="Discount"
              suffix="%"
              inputProps={{ min: 0, max: 100, step: '0.01' }}
              helperText="Leave at 0 for no discount"
            />
          </Grid>

          <Grid item xs={12} md={4}>
            {/* Live calculation, matching the reference pricing panel */}
            <Box
              sx={{
                height: '100%',
                border: 1.5,
                borderColor: 'primary.main',
                borderRadius: 2.5,
                px: 2,
                py: 1.5,
                bgcolor: surface.plumFaint,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Final price (auto-calculated)
              </Typography>
              <Typography variant="h5" sx={{ ...numericText, color: 'primary.main', fontSize: FONT.figureMd, mt: 0.25 }}>
                {formatCurrency(finalPrice, { precise: true })}
              </Typography>
              {saving > 0 && (
                <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 700 }}>
                  Customer saves {formatCurrency(saving, { precise: true })}
                </Typography>
              )}
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2.5 }} />

        <Typography variant="subtitle2" sx={{ mb: 1.5, color: brand.inkSoft }}>
          Inventory
        </Typography>
        <Grid container spacing={2.25}>
          <Grid item xs={12} sm={6}>
            <RHFNumberField
              name="stock"
              label="Total stock on hand (gm) *"
              inputProps={{ min: 0, step: 'any' }}
              helperText={
                stockGrams > 0
                  ? `${formatGrams(stockGrams)} — up to ${formatNumber(
                      unitsFromGrams(stockGrams, packSize)
                    )} bottle(s) of ${formatGrams(packSize)}`
                  : 'The whole perfume, variants included, sells from this weight'
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
