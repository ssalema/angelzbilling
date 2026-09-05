import { Box, Typography, Button, Stack, Skeleton, Card, Grid, Divider, Alert, AlertTitle } from '@mui/material';
import { Refresh, LockOutlined, SearchOff, ErrorOutline } from '@mui/icons-material';
import { CARD_PAD, ICON, brand, surface } from '../../theme/index.js';

/* Every screen shares these four states so the app never shows a blank panel. */

export const EmptyState = ({
  icon: Icon = SearchOff,
  title = 'Nothing here yet',
  description,
  action,
  compact = false,
}) => (
  <Box
    sx={{
      textAlign: 'center',
      py: compact ? 4 : 8,
      px: 3,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 1,
    }}
  >
    <Box
      sx={{
        width: compact ? 48 : 64,
        height: compact ? 48 : 64,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        bgcolor: surface.plumSoft,
        mb: 1,
      }}
    >
      <Icon sx={{ fontSize: compact ? 24 : ICON.illustration, color: brand.plumLight }} />
    </Box>
    <Typography variant="h6" sx={{ fontWeight: 700 }}>
      {title}
    </Typography>
    {description && (
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
        {description}
      </Typography>
    )}
    {action && <Box sx={{ mt: 2 }}>{action}</Box>}
  </Box>
);

export const ErrorState = ({ error, onRetry, compact = false }) => {
  const message = typeof error === 'string' ? error : error?.message;

  // A 403 is a permission problem, not a failure — say so plainly.
  if (error?.isPermission) return <PermissionDenied message={message} />;

  return (
    <Box sx={{ py: compact ? 3 : 6, px: 3, textAlign: 'center' }}>
      <ErrorOutline sx={{ fontSize: ICON.illustration, color: 'error.main', mb: 1 }} />
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        We could not load this
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 460, mx: 'auto' }}>
        {message || 'Something went wrong while talking to the server.'}
      </Typography>
      {onRetry && (
        <Button startIcon={<Refresh />} onClick={onRetry} variant="outlined" sx={{ mt: 2.5 }}>
          Try again
        </Button>
      )}
    </Box>
  );
};

export const PermissionDenied = ({ message, title = 'You do not have access to this' }) => (
  <Box sx={{ py: 7, px: 3, textAlign: 'center' }}>
    <Box
      sx={{
        width: 64,
        height: 64,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        bgcolor: surface.goldSoft,
        mx: 'auto',
        mb: 2,
      }}
    >
      <LockOutlined sx={{ fontSize: ICON.illustration, color: brand.goldDark }} />
    </Box>
    <Typography variant="h5" sx={{ fontWeight: 700 }}>
      {title}
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 440, mx: 'auto' }}>
      {message || 'This section is restricted. Ask a Super Admin if you need access.'}
    </Typography>
  </Box>
);

export const InlineError = ({ error, onRetry }) =>
  error ? (
    <Alert
      severity={error.isPermission ? 'warning' : 'error'}
      sx={{ mb: 2 }}
      action={
        onRetry && (
          <Button color="inherit" size="small" onClick={onRetry}>
            Retry
          </Button>
        )
      }
    >
      <AlertTitle sx={{ fontWeight: 700, mb: 0 }}>
        {error.isPermission ? 'Not permitted' : 'Could not load'}
      </AlertTitle>
      {error.message}
    </Alert>
  ) : null;

/* ───────────────────────────── Skeletons ───────────────────────────── */

export const TableSkeleton = ({ rows = 6, columns = 5 }) => (
  <Box sx={{ p: 2 }}>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <Stack key={rowIndex} direction="row" spacing={2} sx={{ py: 1.25, alignItems: 'center' }}>
        {Array.from({ length: columns }).map((__, colIndex) => (
          <Skeleton
            key={colIndex}
            variant={colIndex === 0 ? 'rounded' : 'text'}
            width={colIndex === 0 ? 44 : `${100 / columns}%`}
            height={colIndex === 0 ? 44 : 18}
          />
        ))}
      </Stack>
    ))}
  </Box>
);

export const ChartSkeleton = ({ height = 280 }) => (
  <Box sx={{ p: 3 }}>
    <Skeleton variant="text" width={180} height={22} />
    <Skeleton variant="rounded" height={height} sx={{ mt: 2, borderRadius: 2 }} />
  </Box>
);

/**
 * The placeholder for a whole panel. Detail pages used to drop a bare grey
 * rectangle here, which is a different shape from the card that replaces it —
 * this keeps the border, the padding and a plausible run of lines, so the
 * layout does not shift when the data lands.
 */
export const CardSkeleton = ({ height = 200, lines = 4 }) => (
  <Card sx={{ p: CARD_PAD, height, display: 'flex', flexDirection: 'column', gap: 1 }}>
    <Skeleton variant="text" width="40%" height={16} />
    <Skeleton variant="text" width="70%" height={34} />
    {Array.from({ length: lines }).map((_, index) => (
      <Skeleton key={index} variant="text" width={`${90 - index * 12}%`} height={14} />
    ))}
  </Card>
);
/* ─────────────────────── Whole-page skeletons ───────────────────────
 * These stand in for a screen that has not arrived yet — a lazily loaded
 * route chunk, most often. They mirror the real layout (header block, filter
 * bar, table, cards), so nothing jumps when the real screen replaces them.
 */

export const PageHeaderSkeleton = ({ breadcrumbs = true, action = false }) => (
  <Box sx={{ mb: 3 }}>
    {breadcrumbs && <Skeleton variant="text" width={180} height={14} sx={{ mb: 0.75 }} />}
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'stretch', sm: 'flex-end' }}
      spacing={2}
    >
      <Box sx={{ minWidth: 0, width: '100%' }}>
        <Skeleton variant="text" width={280} height={44} />
        <Skeleton variant="text" width={200} height={16} sx={{ mt: 0.5 }} />
      </Box>
      {action && <Skeleton variant="rounded" width={150} height={40} sx={{ flexShrink: 0, borderRadius: 2 }} />}
    </Stack>
  </Box>
);

export const FilterBarSkeleton = ({ fields = 3 }) => (
  <Box sx={{ p: CARD_PAD }}>
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5 }}>
      <Skeleton variant="rounded" height={40} sx={{ borderRadius: 2, flex: '1 1 260px', minWidth: 180 }} />
      {Array.from({ length: fields }).map((_, index) => (
        <Skeleton key={index} variant="rounded" width={140} height={40} sx={{ borderRadius: 2 }} />
      ))}
    </Stack>
  </Box>
);

export const StatCardsSkeleton = ({ count = 4 }) => (
  <Grid container spacing={2.25} sx={{ mb: 2.5 }}>
    {Array.from({ length: count }).map((_, index) => (
      <Grid item xs={12} sm={6} lg={12 / count} key={index}>
        <Card sx={{ p: CARD_PAD, height: '100%' }}>
          <Skeleton variant="text" width="55%" height={13} />
          <Skeleton variant="text" width="70%" height={40} sx={{ mt: 0.5 }} />
          <Skeleton variant="text" width="85%" height={14} />
        </Card>
      </Grid>
    ))}
  </Grid>
);

/** Search and filters over a table: the perfumes, bills and users screens. */
export const ListPageSkeleton = ({ stats = 0, columns = 6, rows = 8, filters = 3 }) => (
  <Box>
    <PageHeaderSkeleton action />
    {stats > 0 && <StatCardsSkeleton count={stats} />}
    <Card>
      <FilterBarSkeleton fields={filters} />
      <Divider />
      <TableSkeleton rows={rows} columns={columns} />
    </Card>
  </Box>
);

/** A single record across two columns: bill detail, perfume detail. */
export const DetailPageSkeleton = ({ height = 360 }) => (
  <Box>
    <PageHeaderSkeleton action />
    <Grid container spacing={2.5}>
      <Grid item xs={12} md={7}>
        <CardSkeleton height={height} lines={6} />
      </Grid>
      <Grid item xs={12} md={5}>
        <CardSkeleton height={height} lines={5} />
      </Grid>
    </Grid>
  </Box>
);

/** A long form or wizard: create bill, perfume form, settings, profile. */
export const FormPageSkeleton = ({ aside = true, height = 420, fields = 6 }) => (
  <Box>
    <PageHeaderSkeleton action />
    <Grid container spacing={2.5}>
      <Grid item xs={12} md={aside ? 8 : 12}>
        <Card sx={{ p: CARD_PAD }}>
          <Skeleton variant="text" width={200} height={22} />
          <Divider sx={{ my: 2 }} />
          <Grid container spacing={2}>
            {Array.from({ length: fields }).map((_, index) => (
              <Grid item xs={12} sm={6} key={index}>
                <Skeleton variant="text" width="45%" height={13} />
                <Skeleton variant="rounded" height={44} sx={{ borderRadius: 2, mt: 0.5 }} />
              </Grid>
            ))}
          </Grid>
          <Skeleton variant="rounded" height={90} sx={{ borderRadius: 2, mt: 2 }} />
        </Card>
      </Grid>
      {aside && (
        <Grid item xs={12} md={4}>
          <CardSkeleton height={height} lines={5} />
        </Grid>
      )}
    </Grid>
  </Box>
);

/** The dashboard: four tiles, two charts, two panels. */
export const DashboardSkeleton = () => (
  <Box>
    <PageHeaderSkeleton action />
    <StatCardsSkeleton count={4} />
    <Grid container spacing={2.5}>
      <Grid item xs={12} lg={8}>
        <Card>
          <ChartSkeleton height={260} />
        </Card>
      </Grid>
      <Grid item xs={12} lg={4}>
        <Card>
          <ChartSkeleton height={200} />
        </Card>
      </Grid>
      <Grid item xs={12} lg={7}>
        <Card>
          <ChartSkeleton height={230} />
        </Card>
      </Grid>
      <Grid item xs={12} lg={5}>
        <Card>
          <Box sx={{ p: 2 }}>
            <Skeleton variant="text" width={160} height={22} />
          </Box>
          <Divider />
          <TableSkeleton rows={5} columns={3} />
        </Card>
      </Grid>
    </Grid>
  </Box>
);

/**
 * Picks the skeleton that matches the route being loaded, so the placeholder
 * already has the shape of the screen that is about to replace it. Used as
 * the Suspense fallback for the lazily loaded feature chunks.
 */
export const RouteSkeleton = ({ pathname = '' }) => {
  const path = pathname.replace(/\/+$/, '');

  if (path === '' || path.startsWith('/dashboard')) return <DashboardSkeleton />;
  if (path.startsWith('/settings')) return <FormPageSkeleton />;
  if (path.startsWith('/profile')) return <FormPageSkeleton height={300} fields={4} />;

  if (path.startsWith('/perfumes')) {
    if (path === '/perfumes') return <ListPageSkeleton columns={6} filters={3} />;
    if (path.endsWith('/new') || path.endsWith('/edit')) return <FormPageSkeleton aside={false} />;
    return <DetailPageSkeleton height={380} />;
  }

  if (path.startsWith('/billing')) {
    if (path === '/billing') return <ListPageSkeleton stats={4} columns={6} filters={3} />;
    if (path.endsWith('/new')) return <FormPageSkeleton />;
    return <DetailPageSkeleton height={340} />;
  }

  if (path.startsWith('/users')) return <ListPageSkeleton columns={5} filters={2} />;

  return <ListPageSkeleton columns={5} rows={6} filters={2} />;
};

export default EmptyState;
