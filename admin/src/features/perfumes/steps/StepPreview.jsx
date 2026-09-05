import { useFormContext, useWatch } from 'react-hook-form';
import {
  Card,
  Box,
  Typography,
  Stack,
  Grid,
  Chip,
  Divider,
  Alert,
  AlertTitle,
  Avatar,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  RadioGroup,
  FormControlLabel,
  Radio,
  Paper,
} from '@mui/material';
import {
  CheckCircleRounded,
  ExpandMore,
  Inventory2Outlined,
  ErrorOutline,
  CheckRounded,
} from '@mui/icons-material';
import { formatCurrency, formatGrams, formatNumber, unitsFromGrams } from '../../../utils/format.js';
import { basePricingFor, computeFinalPrice, sizeGramsFor } from '../perfumeSchema.js';
import { CARD_PAD, DISCOUNT_COLOR, ICON, brand, numericText, surface } from '../../../theme/index.js';

const Row = ({ label, value }) => (
  <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ py: 0.65 }}>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right' }}>
      {value || '—'}
    </Typography>
  </Stack>
);

/**
 * Final step: a read-only rendering of everything entered, plus the publish
 * decision. Anything that would block publishing is surfaced here rather than
 * failing silently on save.
 */
const StepPreview = () => {
  const { control } = useFormContext();
  const data = useWatch({ control });

  const variants = data.variants || [];
  // Prices are entered per variant, so the perfume's headline price is the
  // cheapest active one — or the base price when it sells in a single size.
  const pricing = basePricingFor(data);
  const finalPrice = computeFinalPrice(pricing.mrp, pricing.discountPercent);

  const prices = variants.length
    ? variants.map((v) => computeFinalPrice(v.mrp, v.discountPercent))
    : [finalPrice];
  const priceFrom = Math.min(...prices);
  const priceTo = Math.max(...prices);

  // One bulk weight for the whole perfume — variants are poured from it.
  const totalStock = Number(data.stock) || 0;

  // Publish readiness — same rules the server enforces, explained up front.
  const blockers = [];
  if (!data.images?.length) blockers.push('At least one perfume image is required');
  if (!Number(pricing.mrp)) blockers.push(data.hasVariants ? 'Price at least one active variant' : 'A price must be set');
  if (data.hasVariants && !variants.length) blockers.push('Generate at least one variant combination');

  const warnings = [];
  if (!data.shortDescription) warnings.push('No short description — listings will look sparse');
  if (!data.category) warnings.push('No category set, so category filters will not find this perfume');
  if (totalStock === 0) warnings.push('Stock is zero grams, so this will show as sold out');
  if (!data.features?.length) warnings.push('No features listed');

  return (
    <Box>
      <Grid container spacing={2.5}>
        {/* ── Visual preview ── */}
        <Grid item xs={12} md={5}>
          <Card sx={{ p: CARD_PAD, position: { md: 'sticky' }, top: 84 }}>
            <Typography variant="overline" color="text.secondary">
              Preview
            </Typography>

            <Box
              sx={{
                mt: 1,
                borderRadius: 3,
                overflow: 'hidden',
                bgcolor: surface.plumFaint,
                aspectRatio: '1',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {data.images?.[0]?.url ? (
                <Box
                  component="img"
                  src={data.images[0].url}
                  alt={data.name}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Stack alignItems="center" spacing={1}>
                  <Inventory2Outlined sx={{ fontSize: ICON.illustration, color: brand.plumLight }} />
                  <Typography variant="caption" color="text.secondary">
                    No image added
                  </Typography>
                </Stack>
              )}
            </Box>

            {data.images?.length > 1 && (
              <Stack direction="row" spacing={1} sx={{ mt: 1.25, overflowX: 'auto', pb: 0.5 }}>
                {data.images.slice(1).map((image, index) => (
                  <Avatar
                    key={image.publicId || index}
                    variant="rounded"
                    src={image.url}
                    sx={{ width: 52, height: 52, flexShrink: 0, border: 1, borderColor: 'divider' }}
                  />
                ))}
              </Stack>
            )}

            <Box sx={{ mt: 2 }}>
              {data.brand && (
                <Typography variant="overline" color="text.secondary">
                  {data.brand}
                </Typography>
              )}
              <Typography variant="h4" sx={{ lineHeight: 1.25 }}>
                {data.name || 'Untitled perfume'}
              </Typography>
              {data.shortDescription && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  {data.shortDescription}
                </Typography>
              )}

              <Stack direction="row" spacing={1.25} alignItems="baseline" sx={{ mt: 1.75 }}>
                <Typography variant="h5" sx={{ ...numericText, color: 'primary.main' }}>
                  {priceFrom === priceTo
                    ? formatCurrency(priceFrom)
                    : `${formatCurrency(priceFrom)} – ${formatCurrency(priceTo)}`}
                </Typography>
                {Number(pricing.discountPercent) > 0 && (
                  <>
                    <Typography variant="body2" sx={{ textDecoration: 'line-through', color: 'text.secondary' }}>
                      {formatCurrency(pricing.mrp)}
                    </Typography>
                    <Chip
                      size="small"
                      label={`${pricing.discountPercent}% off`}
                      sx={{ color: DISCOUNT_COLOR, bgcolor: surface.successSoft, fontWeight: 700 }}
                    />
                  </>
                )}
              </Stack>

              {/* Size selector, rendered the way the storefront would */}
              {data.hasVariants && variants.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                    {data.variantAttributes?.[0]?.name || 'Options'}
                  </Typography>
                  <Stack direction="row" spacing={0.75} sx={{ mt: 0.75, flexWrap: 'wrap' }} useFlexGap>
                    {variants.map((variant, index) => (
                      <Chip
                        key={variant.sku || index}
                        label={variant.label}
                        size="small"
                        variant={index === 0 ? 'filled' : 'outlined'}
                        color={index === 0 ? 'primary' : 'default'}
                        disabled={!variant.isActive || unitsFromGrams(totalStock, sizeGramsFor(variant)) === 0}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
            </Box>
          </Card>
        </Grid>

        {/* ── Summary + publish ── */}
        <Grid item xs={12} md={7}>
          {blockers.length > 0 && (
            <Alert severity="error" sx={{ mb: 2 }}>
              <AlertTitle sx={{ fontWeight: 700 }}>Not ready to publish</AlertTitle>
              <List dense disablePadding>
                {blockers.map((blocker) => (
                  <ListItem key={blocker} disableGutters sx={{ py: 0 }}>
                    <ListItemIcon sx={{ minWidth: 24 }}>
                      <ErrorOutline sx={{ fontSize: ICON.inline }} color="error" />
                    </ListItemIcon>
                    <ListItemText primaryTypographyProps={{ variant: 'body2' }} primary={blocker} />
                  </ListItem>
                ))}
              </List>
              You can still save this as a draft.
            </Alert>
          )}

          {blockers.length === 0 && warnings.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <AlertTitle sx={{ fontWeight: 700 }}>Worth a second look</AlertTitle>
              <List dense disablePadding>
                {warnings.map((warning) => (
                  <ListItem key={warning} disableGutters sx={{ py: 0 }}>
                    <ListItemText primaryTypographyProps={{ variant: 'body2' }} primary={`• ${warning}`} />
                  </ListItem>
                ))}
              </List>
            </Alert>
          )}

          {blockers.length === 0 && warnings.length === 0 && (
            <Alert severity="success" icon={<CheckCircleRounded />} sx={{ mb: 2 }}>
              Everything looks complete. This perfume is ready to publish.
            </Alert>
          )}

          <Card sx={{ p: CARD_PAD, mb: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              Publish status
            </Typography>

            {/* Each option is its own card; StatusOption owns the form binding. */}
            <RadioGroup value={data.status}>
              {[
                {
                  value: 'draft',
                  label: 'Save as draft',
                  hint: 'Not billable yet. Come back and finish it later.',
                },
                {
                  value: 'published',
                  label: 'Publish',
                  hint: 'Available immediately in the billing screen.',
                  disabled: blockers.length > 0,
                },
                {
                  value: 'archived',
                  label: 'Archive',
                  hint: 'Hidden from billing, but past bills keep their history.',
                },
              ].map((option) => (
                <StatusOption key={option.value} option={option} />
              ))}
            </RadioGroup>
          </Card>

          <Card sx={{ p: CARD_PAD }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Summary
            </Typography>

            <Row label="SKU" value={data.sku?.toUpperCase()} />
            <Row label="Brand" value={data.brand} />
            <Row label="Category" value={[data.category, data.subCategory].filter(Boolean).join(' → ')} />
            <Row label="Fragrance family" value={data.fragranceFamily} />
            <Row label="Concentration" value={data.concentration} />
            <Divider sx={{ my: 1 }} />
            <Row label={data.hasVariants ? 'MRP (from)' : 'MRP'} value={formatCurrency(pricing.mrp, { precise: true })} />
            <Row label="Discount" value={pricing.discountPercent ? `${pricing.discountPercent}%` : 'None'} />
            <Row
              label={data.hasVariants ? 'Final price (from)' : 'Final price'}
              value={formatCurrency(finalPrice, { precise: true })}
            />
            <Divider sx={{ my: 1 }} />
            <Row label="Total stock" value={formatGrams(totalStock)} />
            <Row label="Low stock alert at" value={formatGrams(data.lowStockThreshold)} />
            <Row label="Features" value={formatNumber(data.features?.length || 0)} />
            <Row label="FAQs" value={formatNumber(data.faqs?.length || 0)} />
            <Row
              label="Variants"
              value={data.hasVariants ? `${formatNumber(variants.length)} SKUs` : 'Single SKU'}
            />

            {data.hasVariants && variants.length > 0 && (
              <Accordion elevation={0} sx={{ mt: 1.5, border: 1, borderColor: 'divider', borderRadius: 2, '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Typography variant="subtitle2">All {variants.length} variants</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <Stack spacing={0.75}>
                    {variants.map((variant, index) => (
                      <Paper
                        key={variant.sku || index}
                        variant="outlined"
                        sx={{ px: 1.5, py: 1, borderRadius: 2, opacity: variant.isActive ? 1 : 0.55 }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {variant.label}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                              {variant.sku}
                            </Typography>
                          </Box>
                          <Stack alignItems="flex-end">
                            <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                              {formatCurrency(computeFinalPrice(variant.mrp, variant.discountPercent))}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                color:
                                  unitsFromGrams(totalStock, sizeGramsFor(variant)) === 0
                                    ? 'error.main'
                                    : 'text.secondary',
                              }}
                            >
                              {unitsFromGrams(totalStock, sizeGramsFor(variant)) === 0
                                ? 'Sold out'
                                : `${formatNumber(
                                    unitsFromGrams(totalStock, sizeGramsFor(variant))
                                  )} × ${formatGrams(sizeGramsFor(variant))} sellable`}
                            </Typography>
                          </Stack>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            )}

            {data.features?.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                  Features
                </Typography>
                <List dense disablePadding>
                  {data.features.map((feature) => (
                    <ListItem key={feature} disableGutters sx={{ py: 0.1 }}>
                      <ListItemIcon sx={{ minWidth: 24 }}>
                        <CheckRounded sx={{ fontSize: ICON.inline, color: 'success.main' }} />
                      </ListItemIcon>
                      <ListItemText primaryTypographyProps={{ variant: 'body2' }} primary={feature} />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

/** Kept separate so it can read form context for the radio binding. */
const StatusOption = ({ option }) => {
  const { control } = useFormContext();
  const status = useWatch({ control, name: 'status' });
  const { setValue } = useFormContext();

  return (
    <Paper
      variant="outlined"
      onClick={() => !option.disabled && setValue('status', option.value, { shouldDirty: true, shouldValidate: true })}
      sx={{
        p: 1.5,
        mb: 1,
        borderRadius: 2.5,
        cursor: option.disabled ? 'not-allowed' : 'pointer',
        opacity: option.disabled ? 0.5 : 1,
        borderColor: status === option.value ? 'primary.main' : 'divider',
        borderWidth: status === option.value ? 1.5 : 1,
        bgcolor: status === option.value ? surface.plumFaint : 'transparent',
      }}
    >
      <FormControlLabel
        value={option.value}
        control={<Radio size="small" checked={status === option.value} disabled={option.disabled} />}
        sx={{ m: 0, alignItems: 'flex-start' }}
        label={
          <Box sx={{ pt: 0.25 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {option.label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {option.disabled ? 'Resolve the issues above to enable this' : option.hint}
            </Typography>
          </Box>
        }
      />
    </Paper>
  );
};

export default StepPreview;
