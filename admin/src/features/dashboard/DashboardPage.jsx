import { useState, useCallback } from 'react';
import { Grid, Button, Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
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

import { dashboardApi } from '../../api/endpoints.js';
import useApiResource from '../../hooks/useApiResource.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { formatCurrency, formatNumber } from '../../utils/format.js';
import { brand } from '../../theme/index.js';
import { DEFAULT_DATE_RANGE, isDefaultRange, locationLabel } from '../../utils/constants.js';

/**
 * Feeds one widget, from the combined payload while it is in step with the
 * page, and from its own endpoint once it is not.
 *
 * `immediate: !shared` is what drives the switch: while the widget is shared
 * its own request never fires, and when `shared` goes false the flag flips to
 * true and `useApiResource` runs it. `shared` is in the dependency list so
 * going back in step re-runs the effect too.
 *
 * The returned shape is exactly `useApiResource`'s, so a widget component
 * cannot tell which source it was given.
 */
const useSharedWidget = (overview, key, shared, fetcher, deps) => {
  const own = useApiResource(fetcher, [...deps, shared], { immediate: !shared });

  if (!shared) return own;
  return {
    data: overview.data?.[key] ?? null,
    loading: overview.loading,
    error: overview.error,
    reload: overview.reload,
    setData: own.setData,
  };
};

/**
 * The page loads in one request and every widget owns its own range, so
 * narrowing the donut refetches only the donut — not the whole page.
 */
const DashboardPage = () => {
  const { isAdmin, isSuperAdmin, user } = useAuth();
  const { branchesEnabled } = useSettings();

  // The main range drives the summary cards and the revenue chart together.
  const [mainRange, setMainRange] = useState(DEFAULT_DATE_RANGE);
  const [statusRange, setStatusRange] = useState(DEFAULT_DATE_RANGE);
  const [paymentRange, setPaymentRange] = useState(DEFAULT_DATE_RANGE);
  const [topRange, setTopRange] = useState(DEFAULT_DATE_RANGE);
  const [topBy, setTopBy] = useState('units');

  // Each card resets only its own filters — that is the point of owning them.
  const resetTop = () => {
    setTopRange(DEFAULT_DATE_RANGE);
    setTopBy('units');
  };

  const params = useCallback((range) => ({ range: range.range, from: range.from, to: range.to }), []);

  /**
   * One request brings the whole page back at the main range. Opening the
   * dashboard used to fire eight at once, and the browser will only run a few
   * per origin in parallel, so the lower widgets sat queued behind the top ones
   * for no reason — every one of them is driven by the same range on load.
   */
  const overview = useApiResource(() => dashboardApi.overview(params(mainRange)), [
    mainRange.range,
    mainRange.from,
    mainRange.to,
  ]);

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

  // `by` is part of what makes this widget's request distinct, so a change of
  // metric takes it off the shared payload just as a range change does.
  const topPerfumes = useWidget(
    'topPerfumes',
    sameAsMain(topRange) && topBy === 'units',
    () => dashboardApi.topPerfumes({ ...params(topRange), by: topBy, limit: 5 }),
    [topRange.range, topRange.from, topRange.to, topBy]
  );

  // Neither of these carries a range control, so they are always shared.
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
            <Button component={RouterLink} to="/perfumes/new" variant="contained" startIcon={<AddRounded />}>
              Add perfume
            </Button>
          )
        }
      />

      <InlineError error={summary.error} onRetry={summary.reload} />

      {/* ── Summary cards ── */}
      <Grid container spacing={2.25} sx={{ mb: 2.5 }}>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard
            // Money actually taken. A part-paid bill counts for what came in,
            // and the rest shows up in the caption as still owed.
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
            caption={`${formatNumber(stats?.perfumes?.published || 0)} published · ${formatNumber(
              stats?.perfumes?.lowStock || 0
            )} low stock`}
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
            caption={`${formatNumber(stats?.customers?.newInPeriod || 0)} billed in this period`}
            icon={PeopleAltOutlined}
            color={brand.plumLight}
            loading={summary.loading}
          />
        </Grid>
      </Grid>

      {/* ── Revenue analytics ── */}
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

      {/* ── How bills settled, and how customers paid ──
          Two questions about the same bills, so they sit side by side: the donut
          is how many were settled in full, the pie is what they paid with. */}
      <Grid container spacing={2.25} sx={{ mb: 2.5 }}>
        <Grid item xs={12} md={5}>
          <BreakdownChart
            title="Bill status"
            data={billStatus.data}
            loading={billStatus.loading}
            error={billStatus.error}
            onRetry={billStatus.reload}
            range={statusRange}
            onRangeChange={setStatusRange}
            onReset={() => setStatusRange(DEFAULT_DATE_RANGE)}
            canReset={!isDefaultRange(statusRange)}
            emptyMessage="No bills raised in this period."
            insight={() => {
              const settled = billStatus.data?.settledPercentage;
              if (settled === undefined) return null;
              const owed = billStatus.data?.outstanding || 0;
              // The number a shop owner actually wants off this chart is how much
              // of the period is still walking around unpaid.
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
            onReset={() => setPaymentRange(DEFAULT_DATE_RANGE)}
            canReset={!isDefaultRange(paymentRange)}
            donut={false}
            emptyMessage="No payments recorded in this period."
            insight={(segments) => {
              const top = segments[0];
              return top ? `Customers prefer ${top.label} for payments.` : null;
            }}
          />
        </Grid>
      </Grid>

      {/* ── Top sellers ── */}
      <Box sx={{ mb: 2.5 }}>
        <TopPerfumes
          data={topPerfumes.data}
          loading={topPerfumes.loading}
          error={topPerfumes.error}
          onRetry={topPerfumes.reload}
          range={topRange}
          onRangeChange={setTopRange}
          onReset={resetTop}
          canReset={!isDefaultRange(topRange) || topBy !== 'units'}
          by={topBy}
          onByChange={setTopBy}
        />
      </Box>

      {/* ── Recent bills + low stock ── */}
      <Grid container spacing={2.25}>
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
    </Box>
  );
};

export default DashboardPage;
