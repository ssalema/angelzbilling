import { useMemo, useState } from 'react';
import { useFormContext, useFieldArray, useWatch, Controller } from 'react-hook-form';
import {
  Card,
  Box,
  Grid,
  Typography,
  Stack,
  Switch,
  FormControlLabel,
  Button,
  IconButton,
  Chip,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TextField,
  Tooltip,
  Alert,
  InputAdornment,
  Collapse,
  Avatar,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import KeyboardArrowUp from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import SearchRounded from '@mui/icons-material/SearchRounded';

import { RHFTextField, RHFSelect, RHFChipInput, RHFNumberField } from '../../../components/form/RHFControls.jsx';
import { EmptyState } from '../../../components/common/StateViews.jsx';
import SectionTitle from '../../../components/common/SectionTitle.jsx';
import { PERFUME_SIZES, SELECTOR_STYLES } from '../../../utils/constants.js';
import { currencySymbol, formatCurrency, formatGrams, formatNumber, unitsFromGrams } from '../../../utils/format.js';
import { computeFinalPrice, sizeGramsFor } from '../perfumeSchema.js';
import { FONT, CARD_HEAD_PAD, CARD_PAD, CARD_RADIUS, GUTTER, INSET_RADIUS, ICON, brand, numericText, surface } from '../../../theme/index.js';

/** Cartesian perfume of every attribute's values — {Size:'50gm'} × {Colour:'Gold'}. */
const buildCombinations = (attributes) => {
  const usable = attributes.filter((attribute) => attribute.name && attribute.values?.length);
  if (!usable.length) return [];

  return usable.reduce(
    (accumulator, attribute) =>
      accumulator.flatMap((combination) =>
        attribute.values.map((value) => ({ ...combination, [attribute.name]: value }))
      ),
    [{}]
  );
};

const labelFor = (options) => Object.values(options).join(' / ');

const skuFor = (baseSku, options) => {
  const suffix = Object.values(options)
    .map((value) => String(value).toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .join('-');
  return `${(baseSku || 'SKU').toUpperCase()}-${suffix}`;
};

/* ─────────────────────────── One variant row ─────────────────────────── */

const VariantRow = ({ index, attributeNames, onRemove, onOpenDetail, expanded, perfumeStock }) => {
  const { control } = useFormContext();
  const variant = useWatch({ control, name: `variants.${index}` });

  const sellingPrice = computeFinalPrice(variant?.mrp, variant?.discountPercent);
  // A variant holds no stock of its own.
  const fillGrams = sizeGramsFor(variant);
  const unitsLeft = unitsFromGrams(perfumeStock, fillGrams);
  const outOfStock = unitsLeft === 0;

  return (
    <>
      <TableRow sx={{ opacity: variant?.isActive === false ? 0.55 : 1 }}>
        <TableCell sx={{ width: 54 }}>
          {/* The thumbnail is the toggle for this row's image field. */}
          <Tooltip title={expanded ? 'Hide image field' : 'Set a variant image'}>
            <IconButton size="small" onClick={onOpenDetail} sx={{ p: 0.25 }}>
              <Avatar
                variant="rounded"
                src={variant?.image?.url || undefined}
                sx={{
                  width: 34,
                  height: 34,
                  bgcolor: surface.plumSoft,
                  fontSize: 13,
                  color: brand.plumLight,
                  outline: expanded ? 2 : 0,
                  outlineColor: 'primary.main',
                  outlineOffset: 1,
                }}
              >
                {index + 1}
              </Avatar>
            </IconButton>
          </Tooltip>
        </TableCell>

        {attributeNames.map((name) => (
          <TableCell key={name}>
            <Chip size="small" label={variant?.options?.[name] || 'NA'} sx={{ fontWeight: 600 }} />
          </TableCell>
        ))}

        <TableCell sx={{ minWidth: 190 }}>
          <Controller
            control={control}
            name={`variants.${index}.sku`}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                variant="standard"
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
                inputProps={{ style: { fontSize: 13, fontFamily: 'monospace', textTransform: 'uppercase' } }}
              />
            )}
          />
        </TableCell>

        <TableCell align="right" sx={{ width: 108 }}>
          <Controller
            control={control}
            name={`variants.${index}.mrp`}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^\d.]/g, '');
                  field.onChange(raw === '' ? '' : Number(raw));
                }}
                type="text"
                inputMode="decimal"
                variant="standard"
                error={Boolean(fieldState.error)}
                inputProps={{ style: { fontSize: 13, textAlign: 'right' } }}
              />
            )}
          />
        </TableCell>

        <TableCell align="right" sx={{ width: 96 }}>
          <Controller
            control={control}
            name={`variants.${index}.discountPercent`}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^\d.]/g, '');
                  field.onChange(raw === '' ? '' : Number(raw));
                }}
                type="text"
                inputMode="decimal"
                variant="standard"
                error={Boolean(fieldState.error)}
                inputProps={{ style: { fontSize: 13, textAlign: 'right' } }}
              />
            )}
          />
        </TableCell>

        {/* Selling price is derived, never typed — one source of truth for money */}
        <TableCell align="right" sx={{ width: 106 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
            {formatCurrency(sellingPrice)}
          </Typography>
        </TableCell>

        {/* Fill size, and what the shared stock covers at it — both derived */}
        <TableCell align="right" sx={{ width: 112 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {formatGrams(fillGrams)}
          </Typography>
          <Typography
            variant="caption"
            sx={{ display: 'block', fontSize: FONT.micro, color: outOfStock ? 'error.main' : 'text.secondary' }}
          >
            {outOfStock ? 'Not enough stock' : `${formatNumber(unitsLeft)} sellable`}
          </Typography>
        </TableCell>

        <TableCell align="center" sx={{ width: 70 }}>
          <Controller
            control={control}
            name={`variants.${index}.isActive`}
            render={({ field }) => <Switch size="small" checked={Boolean(field.value)} onChange={field.onChange} />}
          />
        </TableCell>

        <TableCell align="center" sx={{ width: 56 }}>
          <Tooltip title="Remove this combination">
            <IconButton size="small" color="error" onClick={onRemove}>
              <DeleteOutline sx={{ fontSize: ICON.action }} />
            </IconButton>
          </Tooltip>
        </TableCell>
      </TableRow>

      {/* Image field, collapsed by default to keep the table readable */}
      <TableRow>
        <TableCell colSpan={attributeNames.length + 8} sx={{ py: 0, border: 0 }}>
          <Collapse in={expanded} unmountOnExit>
            <Box sx={{ py: 2, px: 1, bgcolor: surface.ivoryWash, borderRadius: `${INSET_RADIUS}px`, mb: 1 }}>
              <RHFTextField
                name={`variants.${index}.image.url`}
                label="Variant image URL"
                placeholder="Leave empty to use the perfume images"
                helperText="Upload in the Media step, then paste the URL here"
              />
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

/* ───────────────────── Price for a perfume with no variants ───────────────────── */

// Pricing belongs to the variants: each combination carries its own MRP and discount in the table below.
const BasePricing = () => {
  const { control } = useFormContext();
  const [mrp, discountPercent] = useWatch({ control, name: ['mrp', 'discountPercent'] });

  const finalPrice = computeFinalPrice(mrp, discountPercent);
  const saving = (Number(mrp) || 0) - finalPrice;

  return (
    <Card sx={{ p: CARD_PAD, mt: 2.5 }}>
      <SectionTitle
        title="Price"
        description="This perfume sells in one size, so it has a single price. Turn variants on above to price each fill size separately."
      />
      <Grid container spacing={GUTTER.cards} alignItems="stretch">
        <Grid item xs={12} sm={6} md={4}>
          <RHFNumberField
            name="mrp"
            label="MRP / Price *"
            prefix={currencySymbol()}
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
          <Box
            sx={{
              height: '100%',
              border: 1.5,
              borderColor: 'primary.main',
              borderRadius: `${CARD_RADIUS}px`,
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
    </Card>
  );
};

/* ─────────────────────────── The step itself ─────────────────────────── */

const StepVariants = () => {
  const { control, setValue, getValues, formState } = useFormContext();
  const hasVariants = useWatch({ control, name: 'hasVariants' });
  const attributes = useWatch({ control, name: 'variantAttributes' }) || [];
  const variants = useWatch({ control, name: 'variants' }) || [];
  // Inventory lives on the perfume (step 1). Every row reads it; none owns it.
  const perfumeStock = Number(useWatch({ control, name: 'stock' })) || 0;
  const lowStockThreshold = Number(useWatch({ control, name: 'lowStockThreshold' })) || 0;

  const attributeArray = useFieldArray({ control, name: 'variantAttributes' });
  const variantArray = useFieldArray({ control, name: 'variants' });

  const [expandedRow, setExpandedRow] = useState(null);
  const [search, setSearch] = useState('');

  const attributeNames = useMemo(
    () => attributes.filter((a) => a.name).map((a) => a.name),
    [attributes]
  );

  const possibleCount = useMemo(() => buildCombinations(attributes).length, [attributes]);

  const generateCombinations = () => {
    const baseSku = getValues('sku');
    // Seeds each new row so a perfume that already had a single price does not
    // start over at zero when it gains sizes; every row stays editable.
    const baseMrp = Number(getValues('mrp')) || 0;
    const baseDiscount = Number(getValues('discountPercent')) || 0;
    const existing = getValues('variants') || [];

    const next = buildCombinations(attributes).map((options) => {
      const label = labelFor(options);
      const previous = existing.find((v) => v.label === label);
      if (previous) return { ...previous, options };

      return {
        label,
        options,
        sku: skuFor(baseSku, options),
        mrp: baseMrp,
        discountPercent: baseDiscount,
        isActive: true,
        image: { url: '', publicId: '' },
      };
    });

    setValue('variants', next, { shouldDirty: true, shouldValidate: true });
  };

  const addSizeAttribute = () => {
    if (attributes.some((a) => a.name?.toLowerCase() === 'size')) return;
    attributeArray.append({ name: 'Size', selectorStyle: 'automatic', values: [...PERFUME_SIZES] });
  };

  const visible = useMemo(() => {
    if (!search.trim()) return variants;
    const needle = search.toLowerCase();
    return variants.filter(
      (v) => v.label?.toLowerCase().includes(needle) || v.sku?.toLowerCase().includes(needle)
    );
  }, [variants, search]);

  const totals = useMemo(
    () => ({
      count: variants.length,
      active: variants.filter((v) => v.isActive).length,
      minPrice: variants.length ? Math.min(...variants.map((v) => computeFinalPrice(v.mrp, v.discountPercent))) : 0,
      maxPrice: variants.length ? Math.max(...variants.map((v) => computeFinalPrice(v.mrp, v.discountPercent))) : 0,
    }),
    [variants, perfumeStock]
  );

  const variantsError = formState.errors?.variants?.message || formState.errors?.variantAttributes?.message;

  return (
    <Box>
      <Card sx={{ p: CARD_PAD, mb: 2.5 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={1.5}
        >
          <SectionTitle
            title="Perfume variants"
            description="Sell the same fragrance in several fill sizes. Each combination gets its own SKU and price — the stock stays on the perfume, and every size is poured from it."
            sx={{ mb: 0 }}
          />

          <Controller
            control={control}
            name="hasVariants"
            render={({ field }) => (
              <FormControlLabel
                labelPlacement="start"
                sx={{ ml: 0, flexShrink: 0 }}
                control={
                  <Switch
                    checked={Boolean(field.value)}
                    onChange={(event) => {
                      field.onChange(event.target.checked);
                      // Turning it on with nothing configured: offer the perfume sizes straight away.
                      if (event.target.checked && !attributes.length) addSizeAttribute();
                    }}
                  />
                }
                label={
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    This perfume has variants
                  </Typography>
                }
              />
            )}
          />
        </Stack>
      </Card>

      {!hasVariants ? (
        <>
          <Card sx={{ p: CARD_PAD }}>
            <EmptyState
              icon={AutoAwesome}
              title="Selling one size only"
              description="One price for the whole perfume, drawn from the gram stock set in step 1. Turn variants on above if you sell it in 25gm, 50gm, 100gm and other fills — then each size carries its own price."
            />
          </Card>
          <BasePricing />
        </>
      ) : (
        <>
          {variantsError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {variantsError}
            </Alert>
          )}

          {/* ── 1. Define the attributes ── */}
          <Card sx={{ p: CARD_PAD, mb: 2.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              1 · Define the options
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.25 }}>
              Add an attribute for each way the perfume varies, then list its values. Size is the usual one for
              perfume.
            </Typography>

            <Stack spacing={2}>
              {attributeArray.fields.map((field, index) => (
                <Box key={field.id} sx={{ border: 1, borderColor: 'divider', borderRadius: `${CARD_RADIUS}px`, p: 2 }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
                    <Box sx={{ flex: 1, width: '100%' }}>
                      <RHFTextField
                        name={`variantAttributes.${index}.name`}
                        label="Attribute name *"
                        placeholder="Size"
                        helperText="Shown above the selector"
                      />
                    </Box>
                    <Box sx={{ width: { xs: '100%', md: 200 } }}>
                      <RHFSelect
                        name={`variantAttributes.${index}.selectorStyle`}
                        label="Selector style"
                        options={SELECTOR_STYLES}
                      />
                    </Box>
                    <Stack direction="row" sx={{ pt: { md: 0.5 } }}>
                      <Tooltip title="Move up">
                        <span>
                          <IconButton
                            size="small"
                            disabled={index === 0}
                            onClick={() => attributeArray.move(index, index - 1)}
                          >
                            <KeyboardArrowUp sx={{ fontSize: ICON.action }} />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Move down">
                        <span>
                          <IconButton
                            size="small"
                            disabled={index === attributeArray.fields.length - 1}
                            onClick={() => attributeArray.move(index, index + 1)}
                          >
                            <KeyboardArrowDown sx={{ fontSize: ICON.action }} />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Remove attribute">
                        <IconButton size="small" color="error" onClick={() => attributeArray.remove(index)}>
                          <DeleteOutline sx={{ fontSize: ICON.action }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>

                  <Box sx={{ mt: 2 }}>
                    <RHFChipInput
                      name={`variantAttributes.${index}.values`}
                      label={`${attributes[index]?.name || 'Attribute'} values`}
                      placeholder="Type a value and press Enter"
                      options={attributes[index]?.name?.toLowerCase() === 'size' ? PERFUME_SIZES : []}
                      helperText={`${attributes[index]?.values?.length || 0} value(s) — each one multiplies the number of SKUs`}
                    />
                  </Box>
                </Box>
              ))}
            </Stack>

            <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }} useFlexGap>
              <Button
                startIcon={<AddRounded />}
                variant="outlined"
                size="small"
                onClick={() => attributeArray.append({ name: '', selectorStyle: 'automatic', values: [] })}
              >
                Custom attribute
              </Button>
            </Stack>
          </Card>

          {/* ── 2. Generate and price ── */}
          <Card>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'stretch', sm: 'center' }}
              spacing={1.5}
              sx={{ ...CARD_HEAD_PAD }}
            >
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  2 · Generate and price the combinations
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {possibleCount} combination{possibleCount === 1 ? '' : 's'} from your attributes
                </Typography>
              </Box>

              <Button
                variant="contained"
                startIcon={<AutoAwesome />}
                onClick={generateCombinations}
                disabled={!possibleCount}
                sx={{ flexShrink: 0 }}
              >
                {variants.length ? 'Regenerate combinations' : 'Generate combinations'}
              </Button>
            </Stack>

            {variants.length > 0 && (
              <>
                <Divider />

                {/* Summary + bulk edit + find */}
                <Stack
                  direction={{ xs: 'column', lg: 'row' }}
                  spacing={1.5}
                  alignItems={{ lg: 'center' }}
                  sx={{ px: CARD_PAD, py: 2 }}
                >
                  <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }} useFlexGap>
                    <Chip size="small" color="primary" label={`${totals.count} SKUs`} />
                    <Chip size="small" variant="outlined" label={`${totals.active} active`} />
                    <Chip
                      size="small"
                      variant="outlined"
                      color={perfumeStock <= lowStockThreshold ? 'warning' : 'default'}
                      label={`${formatGrams(perfumeStock)} stock`}
                    />
                    <Chip
                      size="small"
                      variant="outlined"
                      label={
                        totals.minPrice === totals.maxPrice
                          ? formatCurrency(totals.minPrice)
                          : `${formatCurrency(totals.minPrice)} – ${formatCurrency(totals.maxPrice)}`
                      }
                    />
                  </Stack>

                  <Box sx={{ flexGrow: 1 }} />

                  <TextField
                    placeholder="Find a combination or SKU…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    sx={{ maxWidth: { lg: 250 } }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchRounded sx={{ fontSize: ICON.action, color: 'text.secondary' }} />
                        </InputAdornment>
                      ),
                    }}
                  />
                </Stack>

                <Alert
                  severity="info"
                  sx={{ mx: CARD_PAD, mb: 2, bgcolor: surface.plumFaint, color: 'text.primary' }}
                >
                  Each row sets a fill size, its price and discount, and its SKU — this is the only place a
                  perfume with variants is priced. Every size is poured from the
                  perfume&apos;s single bulk weight of <strong>{formatGrams(perfumeStock)}</strong>, set under
                  Inventory in step 1. Selling one 50gm bottle removes 50 gm from that total, and the low stock alert
                  watches the same figure.
                </Alert>

                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 880 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Image</TableCell>
                        {attributeNames.map((name) => (
                          <TableCell key={name}>{name}</TableCell>
                        ))}
                        <TableCell>SKU</TableCell>
                        <TableCell align="right">MRP</TableCell>
                        <TableCell align="right">Discount</TableCell>
                        <TableCell align="right">Selling</TableCell>
                        <TableCell align="right">Fill size</TableCell>
                        <TableCell align="center">Active</TableCell>
                        <TableCell align="center">Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {variantArray.fields.map((field, index) => {
                        const isVisible = visible.some((v) => v.label === variants[index]?.label);
                        if (!isVisible) return null;
                        return (
                          <VariantRow
                            key={field.id}
                            index={index}
                            attributeNames={attributeNames}
                            expanded={expandedRow === index}
                            perfumeStock={perfumeStock}
                            onOpenDetail={() => setExpandedRow(expandedRow === index ? null : index)}
                            onRemove={() => variantArray.remove(index)}
                          />
                        );
                      })}
                    </TableBody>
                  </Table>
                </Box>

                {visible.length === 0 && (
                  <EmptyState compact title="No combinations match that search" description="Clear the search to see them all." />
                )}
              </>
            )}

            {variants.length === 0 && possibleCount > 0 && (
              <EmptyState
                compact
                icon={AutoAwesome}
                title={`Ready to create ${possibleCount} SKU${possibleCount === 1 ? '' : 's'}`}
                description="Click Generate combinations above to build a priceable row for each one."
              />
            )}

            {possibleCount === 0 && (
              <EmptyState
                compact
                title="Add an attribute first"
                description="Name an attribute and give it at least one value — then combinations can be generated."
              />
            )}
          </Card>
        </>
      )}
    </Box>
  );
};

export default StepVariants;
