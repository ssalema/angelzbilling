import { useState, useCallback } from 'react';
import { Grid, Button, Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { AddRounded } from '@mui/icons-material';
import {
  CurrencyRupeeRounded,
  ReceiptLongOutlined,
  Inventory2Outlined,
  PeopleAltOutlined,
} from '@mui/icons-material';

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
import { DEFAULT_DATE_RANGE, isDefaultRange } from '../../utils/constants.js';

/**
 * Every widget is fed by its own aggregation endpoint and owns its own range,
 * so refreshing the donut does not re-query the whole page.
 */
const DashboardPage = () => {
  const { isAdmin, user } = useAuth();
  const { branchesEnabled } = useSettings();

  // The main range drives the summary cards and the revenue chart together.
  const [mainRange, setMainRange] = useState(DEFAULT_DATE_RANGE);
  const [paymentRange, setPaymentRange] = useState(DEFAULT_DATE_RANGE);
  const [topRange, setTopRange] = useState(DEFAULT_DATE_RANGE);
  const [topBy, setTopBy] = useState('units');

  // Each card resets only its own filters — that is the point of owning them.
  const resetTop = () => {
    setTopRange(DEFAULT_DATE_RANGE);
    setTopBy('units');
  };

  const params = useCallback((range) => ({ range: range.range, from: range.from, to: range.to }), []);

  const summary = useApiResource(() => dashboardApi.summary(params(mainRange)), [
    mainRange.range,
    mainRange.from,
    mainRange.to,
  ]);

  const series = useApiResource(() => dashboardApi.series(params(mainRange)), [
    mainRange.range,
    mainRange.from,
    mainRange.to,
  ]);

  const payments = useApiResource(() => dashboardApi.paymentMethods(params(paymentRange)), [
    paymentRange.range,
    paymentRange.from,
    paymentRange.to,
  ]);

  const topPerfumes = useApiResource(
    () => dashboardApi.topPerfumes({ ...params(topRange), by: topBy, limit: 5 }),
    [topRange.range, topRange.from, topRange.to, topBy]
  );

  const recentBills = useApiResource(() => dashboardApi.recentBills({ limit: 5 }), []);
  const lowStock = useApiResource(() => dashboardApi.lowStock({ limit: 6 }), []);

  const stats = summary.data;

  return (
    <Box>
      <PageHeader
        title="Dashboard"
        subtitle={
          branchesEnabled
            ? `Store performance at a glance · ${user?.branch?.name || 'all branches'}`
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
            label="Total revenue"
            value={formatCurrency(stats?.revenue?.value)}
            growth={stats?.revenue?.growth}
            caption="vs previous period"
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
              stats?.bills?.refunded
                ? `${formatNumber(stats.bills.refunded)} refunded`
                : 'none refunded'
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

      {/* ── Payment breakdown ── */}
      <Box sx={{ mb: 2.5 }}>
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
      </Box>

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
