import { useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Card,
  Grid,
  Typography,
  Stack,
  Chip,
  Button,
  Divider,
  Avatar,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ButtonBase,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Skeleton,
} from '@mui/material';
import {
  EditOutlined,
  CheckRounded,
  ExpandMore,
  Inventory2Outlined,
  LocalOfferOutlined,
  InfoOutlined,
} from '@mui/icons-material';

import PageHeader from '../../components/common/PageHeader.jsx';
import StatusChip from '../../components/common/StatusChip.jsx';
import SectionTitle from '../../components/common/SectionTitle.jsx';
import DialogCloseButton from '../../components/common/DialogCloseButton.jsx';
import { ErrorState, CardSkeleton } from '../../components/common/StateViews.jsx';
import { perfumeApi } from '../../api/endpoints.js';
import useApiResource from '../../hooks/useApiResource.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  formatCurrency,
  formatDate,
  formatGrams,
  formatNumber,
  stockStatus,
  truncate,
  unitsFromGrams,
  STOCK_LABELS,
} from '../../utils/format.js';
import { FONT, CARD_HEAD_PAD, CARD_PAD, DISCOUNT_COLOR, ICON, brand, numericText, surface } from '../../theme/index.js';

const Row = ({ label, value }) => (
  <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ py: 0.7 }}>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right' }}>
      {value || 'NA'}
    </Typography>
  </Stack>
);

const PerfumeViewPage = () => {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [activeImage, setActiveImage] = useState(0);
  const [soldOpen, setSoldOpen] = useState(false);

  const { data: perfume, loading, error, reload } = useApiResource(() => perfumeApi.get(id), [id]);

  // Loading, error and loaded all render the same header — same breadcrumbs,
  // same height — so the page never jumps when the perfume arrives.
  const crumbs = [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Perfumes', to: '/perfumes' },
    { label: perfume?.name ? truncate(perfume.name, 32) : 'View' },
  ];

  if (loading) {
    return (
      <Box>
        <PageHeader title={<Skeleton variant="text" width={280} />} breadcrumbs={crumbs} />
        <Grid container spacing={2.5}>
          <Grid item xs={12} md={5}>
            <CardSkeleton height={380} />
          </Grid>
          <Grid item xs={12} md={7}>
            <CardSkeleton height={380} />
          </Grid>
        </Grid>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <PageHeader title="Perfume" breadcrumbs={crumbs} />
        <Card>
          <ErrorState error={error} onRetry={reload} />
        </Card>
      </Box>
    );
  }

  const images = perfume.images || [];
  const variants = perfume.variants || [];
  // "1 × 50gm · 2 × 100gm" reads truer than a bare unit count pooled across sizes.
  const soldBySize = (perfume.sales?.bySize || []).filter((row) => row.unitsSold > 0);

  return (
    <Box>
      <PageHeader
        title={perfume.name}
        subtitle={[perfume.brand, perfume.sku].filter(Boolean).join(' · ')}
        breadcrumbs={crumbs}
        // The breadcrumb is how you go back; the action slot is for the one
        // thing you came here to do.
        action={
          isAdmin && (
            <Button
              component={RouterLink}
              to={`/perfumes/${id}/edit`}
              variant="contained"
              startIcon={<EditOutlined />}
            >
              Edit perfume
            </Button>
          )
        }
      />

      <Grid container spacing={2.5}>
        {/* Gallery */}
        <Grid item xs={12} md={5}>
          <Card sx={{ p: CARD_PAD }}>
            <Box
              sx={{
                borderRadius: 3,
                overflow: 'hidden',
                bgcolor: surface.plumFaint,
                aspectRatio: '1',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {images[activeImage]?.url ? (
                <Box
                  component="img"
                  src={images[activeImage].url}
                  alt={perfume.name}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Inventory2Outlined sx={{ fontSize: ICON.illustration, color: brand.plumLight }} />
              )}
            </Box>

            {images.length > 1 && (
              <Stack direction="row" spacing={1} sx={{ mt: 1.5, overflowX: 'auto', pb: 0.5 }}>
                {images.map((image, index) => (
                  <Avatar
                    key={image.publicId || index}
                    variant="rounded"
                    src={image.url}
                    onClick={() => setActiveImage(index)}
                    sx={{
                      width: 56,
                      height: 56,
                      flexShrink: 0,
                      cursor: 'pointer',
                      border: 2,
                      borderColor: index === activeImage ? 'secondary.main' : 'divider',
                    }}
                  />
                ))}
              </Stack>
            )}

            {perfume.videos?.length > 0 && (
              <Stack spacing={1.5} sx={{ mt: 2 }}>
                {perfume.videos.map((video, index) => (
                  <Box
                    key={video.publicId || index}
                    component="video"
                    src={video.url}
                    controls
                    sx={{ width: '100%', borderRadius: 2, bgcolor: '#000' }}
                  />
                ))}
              </Stack>
            )}
          </Card>
        </Grid>

        {/* Details */}
        <Grid item xs={12} md={7}>
          <Card sx={{ p: CARD_PAD, mb: 2.5 }}>
            <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }} useFlexGap>
              <StatusChip status={perfume.status} />
              <StatusChip status={stockStatus(perfume)} label={STOCK_LABELS[stockStatus(perfume)]} />
              {perfume.hasVariants && <Chip size="small" label={`${variants.length} variants`} variant="outlined" />}
            </Stack>

            <Typography variant="h3">{perfume.name}</Typography>
            {perfume.shortDescription && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                {perfume.shortDescription}
              </Typography>
            )}

            <Stack direction="row" spacing={1.5} alignItems="baseline" sx={{ mt: 2 }}>
              <Typography variant="h4" sx={{ ...numericText, color: 'primary.main', fontSize: FONT.figureLg }}>
                {perfume.priceFrom !== perfume.priceTo
                  ? `${formatCurrency(perfume.priceFrom)} – ${formatCurrency(perfume.priceTo)}`
                  : formatCurrency(perfume.finalPrice)}
              </Typography>
              {perfume.discountPercent > 0 && (
                <>
                  <Typography variant="body1" sx={{ textDecoration: 'line-through', color: 'text.secondary' }}>
                    {formatCurrency(perfume.mrp)}
                  </Typography>
                  <Chip
                    size="small"
                    icon={<LocalOfferOutlined sx={{ fontSize: ICON.inline, color: `${DISCOUNT_COLOR} !important` }} />}
                    label={`${perfume.discountPercent}% off`}
                    sx={{ color: DISCOUNT_COLOR, bgcolor: surface.successSoft, fontWeight: 700 }}
                  />
                </>
              )}
            </Stack>

            <Divider sx={{ my: 2 }} />

            {/* Sales performance from real bill data */}
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <Typography variant="overline" color="text.secondary" component="div">
                  Units sold
                </Typography>
                {soldBySize.length > 0 ? (
                  <Tooltip title="See the size-wise split">
                    <ButtonBase
                      onClick={() => setSoldOpen(true)}
                      aria-label="See the size-wise split of units sold"
                      sx={{
                        // Block-level and left-aligned so the figure keeps the
                        // exact position the other stat tiles put theirs in.
                        display: 'flex',
                        width: 'fit-content',
                        borderRadius: 1,
                        px: 0.5,
                        ml: -0.5,
                        gap: 0.25,
                        color: 'primary.main',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Typography variant="h5" sx={{ ...numericText, color: 'inherit' }}>
                        {formatNumber(perfume.sales?.unitsSold)}
                      </Typography>
                      <InfoOutlined sx={{ fontSize: ICON.inline, opacity: 0.7 }} />
                    </ButtonBase>
                  </Tooltip>
                ) : (
                  <Typography variant="h5" sx={{ ...numericText }}>
                    {formatNumber(perfume.sales?.unitsSold)}
                  </Typography>
                )}
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="overline" color="text.secondary">
                  Revenue
                </Typography>
                <Typography variant="h5" sx={{ ...numericText }}>
                  {formatCurrency(perfume.sales?.revenue)}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="overline" color="text.secondary">
                  In stock
                </Typography>
                <Typography variant="h5" sx={{ ...numericText }}>
                  {formatGrams(perfume.totalStock)}
                </Typography>
                {!perfume.hasVariants && (
                  <Typography variant="caption" color="text.secondary">
                    {`${formatNumber(perfume.unitsInStock ?? 0)} unit(s) sellable`}
                  </Typography>
                )}
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="overline" color="text.secondary">
                  Alert at
                </Typography>
                <Typography variant="h5" sx={{ ...numericText }}>
                  {formatGrams(perfume.lowStockThreshold)}
                </Typography>
              </Grid>
            </Grid>

            {/* The size-wise story behind the pooled units-sold figure. */}
            <Dialog open={soldOpen} onClose={() => setSoldOpen(false)} maxWidth="xs" fullWidth>
              <DialogCloseButton onClose={() => setSoldOpen(false)} />

              <DialogTitle sx={{ pb: 1, pr: 6 }}>
                Units sold by size
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  All-time, across paid bills only.
                </Typography>
              </DialogTitle>

              <DialogContent dividers sx={{ p: 0 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Size</TableCell>
                      <TableCell align="right">Units</TableCell>
                      <TableCell align="right">Revenue</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {soldBySize.map((row) => (
                      <TableRow key={row.variantId || row.label}>
                        <TableCell>
                          <Chip size="small" label={row.label} variant="outlined" />
                        </TableCell>
                        <TableCell align="right" sx={{ ...numericText }}>
                          {formatNumber(row.unitsSold)}
                        </TableCell>
                        <TableCell align="right" sx={{ ...numericText }}>
                          {formatCurrency(row.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                      <TableCell align="right" sx={{ ...numericText }}>
                        {formatNumber(perfume.sales?.unitsSold)}
                      </TableCell>
                      <TableCell align="right" sx={{ ...numericText }}>
                        {formatCurrency(perfume.sales?.revenue)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </DialogContent>
            </Dialog>
          </Card>

          {/* Variants */}
          {perfume.hasVariants && variants.length > 0 && (
            <Card sx={{ mb: 2.5 }}>
              <Box sx={CARD_HEAD_PAD}>
                <SectionTitle
                  title="Available sizes"
                  sx={{ mb: 0 }}
                  description={`Each size sets its own price and SKU. All of them are poured from the perfume's ${formatGrams(
                    perfume.totalStock
                  )} of stock, so the counts below are alternatives, not a total.`}
                />
              </Box>
              <Divider />
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 520 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Size</TableCell>
                      <TableCell>SKU</TableCell>
                      <TableCell align="right">MRP</TableCell>
                      <TableCell align="right">Selling</TableCell>
                      <TableCell align="right">Fill size</TableCell>
                      <TableCell align="center">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {variants.map((variant) => (
                      <TableRow key={variant.sku} sx={{ opacity: variant.isActive ? 1 : 0.55 }}>
                        <TableCell>
                          <Chip size="small" label={variant.label} sx={{ fontWeight: 700 }} />
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: FONT.small }}>{variant.sku}</TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{
                              textDecoration: variant.discountPercent > 0 ? 'line-through' : 'none',
                              color: 'text.secondary',
                            }}
                          >
                            {formatCurrency(variant.mrp)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                            {formatCurrency(variant.sellingPrice)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          {formatGrams(variant.sizeGrams)}
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {formatNumber(unitsFromGrams(perfume.totalStock, variant.sizeGrams))} sellable
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          {!variant.isActive ? (
                            <StatusChip status="inactive" label="Inactive" />
                          ) : unitsFromGrams(perfume.totalStock, variant.sizeGrams) === 0 ? (
                            <StatusChip status="out_of_stock" label="Sold out" />
                          ) : (
                            <StatusChip status="in_stock" label="Available" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Card>
          )}

          {/* Description, features, FAQs */}
          <Card sx={{ p: CARD_PAD, mb: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1.25 }}>
              About this fragrance
            </Typography>

            {perfume.description ? (
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line', lineHeight: 1.75 }}>
                {perfume.description}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No description has been added yet.
              </Typography>
            )}

            {perfume.features?.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  Key features
                </Typography>
                <List dense disablePadding>
                  {perfume.features.map((feature) => (
                    <ListItem key={feature} disableGutters sx={{ py: 0.15 }}>
                      <ListItemIcon sx={{ minWidth: 26 }}>
                        <CheckRounded sx={{ fontSize: ICON.inline, color: 'success.main' }} />
                      </ListItemIcon>
                      <ListItemText primaryTypographyProps={{ variant: 'body2' }} primary={feature} />
                    </ListItem>
                  ))}
                </List>
              </>
            )}

            {perfume.faqs?.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Frequently asked questions
                </Typography>
                {perfume.faqs.map((faq, index) => (
                  <Accordion
                    key={index}
                    elevation={0}
                    sx={{ border: 1, borderColor: 'divider', borderRadius: 2, mb: 1, '&:before': { display: 'none' } }}
                  >
                    <AccordionSummary expandIcon={<ExpandMore />}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {faq.question}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Typography variant="body2" color="text.secondary">
                        {faq.answer}
                      </Typography>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </>
            )}
          </Card>

          {/* Metadata */}
          <Card sx={{ p: CARD_PAD }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Catalogue details
            </Typography>
            <Row label="SKU" value={perfume.sku} />
            <Row label="Brand" value={perfume.brand} />
            <Row label="Category" value={[perfume.category, perfume.subCategory].filter(Boolean).join(' → ')} />
            <Row label="Fragrance family" value={perfume.fragranceFamily} />
            <Row label="Concentration" value={perfume.concentration} />
            <Row label="Tags" value={perfume.tags?.join(', ')} />
            <Divider sx={{ my: 1 }} />
            <Row label="Created" value={formatDate(perfume.createdAt, 'time')} />
            <Row label="Created by" value={perfume.createdBy?.name} />
            <Row label="Last updated" value={formatDate(perfume.updatedAt, 'time')} />
            <Row label="Updated by" value={perfume.updatedBy?.name} />
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PerfumeViewPage;
