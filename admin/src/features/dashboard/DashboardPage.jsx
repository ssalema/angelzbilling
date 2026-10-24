import { useState, useCallback } from 'react';
import { Grid, Button, Box, Stack } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import CurrencyRupeeRounded from '@mui/icons-material/CurrencyRupeeRounded';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import PeopleAltOutlined from '@mui/icons-material/PeopleAltOutlined';

import PageHeader from '../../components/common/PageHeader.jsx';
import StatCard from './components/StatCard.jsx';
import RevenueChart from './components/RevenueChart.jsx';
import BreakdownChart from './components/BreakdownChart.jsx';
import TopPerfumes from './components/TopPerfumes.jsx';
import { RecentBills, LowStockAlerts } from './components/RecentBills.jsx';
import { InlineError } from '../../components/common/StateViews.jsx';
import BulkUploadDialog from '../perfumes/bulk/BulkUploadDialog.jsx';

import { dashboardApi } from '../../api/endpoints.js';
import useApiResource from '../../hooks/useApiResource.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { formatCurrency, formatNumber } from '../../utils/format.js';
import { GUTTER, brand } from '../../theme/index.js';
import { locationLabel } from '../../utils/constants.js';
import { currentPeriod, isCurrentPeriod } from '../../utils/period.js';

const useSharedWidget = (overview, key, shared, fetcher, deps) => {
  // A widget with its own range fetches separately, so it must also refresh on writes.
  const own = useApiResource(fetcher, [...deps, shared], {
    immediate: !shared,
    watch: ['bills', 'perfumes'],
  });

  if (!shared) return own;
  return {
    data: overview.data?.[key] ?? null,
    loading: overview.loading,
    error: overview.error,
    reload: overview.reload,
    setData: own.setData,
  };
};

const DashboardPage = () => {
  const { isAdmin, isSuperAdmin, user } = useAuth();
  const { branchesEnabled } = useSettings();

  const [bulkOpen, setBulkOpen] = useState(false);

  // Main range drives the summary cards and the revenue chart.
  const [mainRange, setMainRange] = useState(currentPeriod);
  const [statusRange, setStatusRange] = useState(currentPeriod);
  const [paymentRange, setPaymentRange] = useState(currentPeriod);
  const [topRange, setTopRange] = useState(currentPeriod);
  const [topBy, setTopBy] = useState('units');

  const resetTop = () => {
    setTopRange(currentPeriod());
    setTopBy('units');
  };

  const params = useCallback((range) => ({ range: range.range, from: range.from, to: range.to }), []);

  // One request loads the whole page at the main range.
  const overview = useApiResource(
    (signal) => dashboardApi.overview(params(mainRange), signal),
    [mainRange.range, mainRange.from, mainRange.to],
    // Shows cached figures at once and refreshes in the background.
    // Refreshes on both bill and catalogue writes.
    { cacheKey: 'dashboard:overview', watch: ['bills', 'perfumes'] }
  );

  const useWidget = (key, shared, fetcher, deps) => useSharedWidget(overview, key, shared, fetcher, deps);

  const sameAsMain = (range) =>
    range.range === mainRange.range && range.from === mainRange.from && range.to === mainRange.to;

  const summary = useWidget('summary', true, () => dashboardApi.summary(params(mainRange)), []);
  const series = useWidget('series', true, () => dashboardApi.series(params(mainRange)), []);

  const billStatus = useWidget(
    'billStatus',
    sameAsMain(statusRange),
    () => dashboardApi.billStatus(params(statusRange)),
    [statusRange.range, statusRange.from, statusRange.to]
  );

  const payments = useWidget(
    'payments',
    sameAsMain(paymentRange),
    () => dashboardApi.paymentMethods(params(paymentRange)),
    [paymentRange.range, paymentRange.from, paymentRange.to]
  );

  // Changing `by` (like changing the range) makes this widget fetch on its own.
  const topPerfumes = useWidget(
    'topPerfumes',
    sameAsMain(topRange) && topBy === 'units',
    () => dashboardApi.topPerfumes({ ...params(topRange), by: topBy, limit: 5 }),
    [topRange.range, topRange.from, topRange.to, topBy]
  );

  // No range control on these, so they always use the shared payload.
  const recentBills = useWidget('recentBills', true, () => dashboardApi.recentBills({ limit: 5 }), []);
  const lowStock = useWidget('lowStock', true, () => dashboardApi.lowStock({ limit: 6 }), []);

  const stats = summary.data;

  return (
    <Box>
      <PageHeader
        title="Dashboard"
        subtitle={
          branchesEnabled
            ? `Store performance at a glance · ${isSuperAdmin ? 'all branches' : locationLabel(user?.branch)}`
            : 'Store performance at a glance'
        }
        action={
          isAdmin && (
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.25, justifyContent: { sm: 'flex-end' } }}>
              <Button variant="outlined" startIcon={<UploadFileOutlined />} onClick={() => setBulkOpen(true)}>
                Bulk upload
              </Button>
              <Button component={RouterLink} to="/perfumes/new" variant="contained" startIcon={<AddRounded />}>
                Add perfume
              </Button>
            </Stack>
          )
        }
      />

      <InlineError error={summary.error} onRetry={summary.reload} />

      <Grid container spacing={GUTTER.cards} sx={{ mb: 2.5 }}>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard
            // Money actually received. Part-paid balances show in the caption.
            label="Revenue collected"
            value={formatCurrency(stats?.revenue?.value)}
            growth={stats?.revenue?.growth}
            caption={
              stats?.revenue?.outstanding
                ? `${formatCurrency(stats.revenue.outstanding)} still pending`
                : 'vs previous period'
            }
            icon={CurrencyRupeeRounded}
            color={brand.plum}
            loading={summary.loading}
          />
        </Grid>

        <Grid item xs={12} sm={6} lg={3}>
          <StatCard
            label="Total bills"
            value={formatNumber(stats?.bills?.value)}
            growth={stats?.bills?.growth}
            caption={
              [
                stats?.bills?.pending ? `${formatNumber(stats.bills.pending)} pending` : '',
                stats?.bills?.refunded ? `${formatNumber(stats.bills.refunded)} refunded` : '',
              ]
                .filter(Boolean)
                .join(' · ') || 'all settled'
            }
            icon={ReceiptLongOutlined}
            color={brand.gold}
            loading={summary.loading}
          />
        </Grid>

        <Grid item xs={12} sm={6} lg={3}>
          <StatCard
            label="Perfumes"
            value={formatNumber(stats?.perfumes?.value)}
            caption={
              [
                `${formatNumber(stats?.perfumes?.published || 0)} published`,
                // Out of stock is shown separately from low stock.
                stats?.perfumes?.lowStock ? `${formatNumber(stats.perfumes.lowStock)} low stock` : '',
                stats?.perfumes?.outOfStock ? `${formatNumber(stats.perfumes.outOfStock)} out of stock` : '',
              ]
                .filter(Boolean)
                .join(' · ')
            }
            icon={Inventory2Outlined}
            color={brand.rose}
            loading={summary.loading}
          />
        </Grid>

        <Grid item xs={12} sm={6} lg={3}>
          <StatCard
            label="Customers"
            value={formatNumber(stats?.customers?.value)}
            growth={stats?.customers?.growth}
            // Value = all customers ever; caption = new this period (what the growth chip measures).
            caption={`${formatNumber(stats?.customers?.newInPeriod || 0)} new in this period`}
            icon={PeopleAltOutlined}
            color={brand.plumLight}
            loading={summary.loading}
          />
        </Grid>
      </Grid>

      <Box sx={{ mb: 2.5 }}>
        <RevenueChart
          data={series.data}
          loading={series.loading}
          error={series.error}
          onRetry={() => {
            series.reload();
            summary.reload();
          }}
          range={mainRange}
          onRangeChange={setMainRange}
          growth={stats?.revenue?.growth}
        />
      </Box>

      {/* Donut: bills settled in full vs pending. Pie: payment methods. */}
      <Grid container spacing={GUTTER.cards} sx={{ mb: 2.5 }}>
        <Grid item xs={12} md={5}>
          <BreakdownChart
            title="Bill status"
            data={billStatus.data}
            loading={billStatus.loading}
            error={billStatus.error}
            onRetry={billStatus.reload}
            range={statusRange}
            onRangeChange={setStatusRange}
            onReset={() => setStatusRange(currentPeriod())}
            canReset={!isCurrentPeriod(statusRange)}
            emptyMessage="No bills raised in this period."
            insight={() => {
              const settled = billStatus.data?.settledPercentage;
              if (settled === undefined) return null;
              const owed = billStatus.data?.outstanding || 0;
              // Highlight how much is still unpaid for the period.
              return owed > 0
                ? `${formatNumber(settled)}% settled in full · ${formatCurrency(owed)} still pending.`
                : `${formatNumber(settled)}% of bills in this period were settled in full.`;
            }}
          />
        </Grid>

        <Grid item xs={12} md={7}>
          <BreakdownChart
            title="Payment preference"
            data={payments.data}
            loading={payments.loading}
            error={payments.error}
            onRetry={payments.reload}
            range={paymentRange}
            onRangeChange={setPaymentRange}
            onReset={() => setPaymentRange(currentPeriod())}
            canReset={!isCurrentPeriod(paymentRange)}
            donut={false}
            emptyMessage="No payments recorded in this period."
            insight={(segments) => {
              const top = segments[0];
              return top ? `Customers prefer ${top.label} for payments.` : null;
            }}
          />
        </Grid>
      </Grid>

      <Box sx={{ mb: 2.5 }}>
        <TopPerfumes
          data={topPerfumes.data}
          loading={topPerfumes.loading}
          error={topPerfumes.error}
          onRetry={topPerfumes.reload}
          range={topRange}
          onRangeChange={setTopRange}
          onReset={resetTop}
          canReset={!isCurrentPeriod(topRange) || topBy !== 'units'}
          by={topBy}
          onByChange={setTopBy}
        />
      </Box>

      <Grid container spacing={GUTTER.cards}>
        <Grid item xs={12} md={7}>
          <RecentBills
            data={recentBills.data}
            loading={recentBills.loading}
            error={recentBills.error}
            onRetry={recentBills.reload}
          />
        </Grid>
        <Grid item xs={12} md={5}>
          <LowStockAlerts
            data={lowStock.data}
            loading={lowStock.loading}
            error={lowStock.error}
            onRetry={lowStock.reload}
          />
        </Grid>
      </Grid>

      <BulkUploadDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        // New perfumes change catalogue counts and low-stock warnings, so refresh both widgets.
        onCreated={() => {
          summary.reload();
          lowStock.reload();
        }}
      />
    </Box>
  );
};

export default DashboardPage;
