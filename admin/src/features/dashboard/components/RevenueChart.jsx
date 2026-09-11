import { useState } from 'react';
import {
  Card,
  Box,
  Typography,
  Stack,
  Select,
  MenuItem,
  Chip,
  Divider,
} from '@mui/material';
import TrendingUp from '@mui/icons-material/TrendingUp';
import TrendingDown from '@mui/icons-material/TrendingDown';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import DateRangeControl from '../../../components/common/DateRangeControl.jsx';
import SectionTitle from '../../../components/common/SectionTitle.jsx';
import { ChartSkeleton, ErrorState, EmptyState } from '../../../components/common/StateViews.jsx';
import { formatCurrency, formatCompactCurrency, formatNumber, formatChartKey } from '../../../utils/format.js';
import { CHART_METRICS, DEFAULT_DATE_RANGE, isDefaultRange } from '../../../utils/constants.js';
import { FONT, CARD_PAD, ICON, SHADOW, brand, numericText, onPlum, surface } from '../../../theme/index.js';

const metricLabel = {
  revenue: 'Revenue',
  bills: 'Bills',
  customers: 'Customers',
  aov: 'Average order value',
};

const ChartTooltip = ({ active, payload, metric }) => {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const isMoney = metric === 'revenue' || metric === 'aov';

  return (
    <Box
      sx={{
        bgcolor: brand.plumDark,
        color: '#fff',
        px: 1.75,
        py: 1.25,
        borderRadius: 2,
        boxShadow: SHADOW.toast,
      }}
    >
      <Typography sx={{ fontSize: FONT.tiny, color: brand.goldLight, mb: 0.4 }}>{point.label}</Typography>
      <Typography sx={{ fontSize: FONT.lead, fontWeight: 700 }}>
        {isMoney ? formatCurrency(point[metric], { precise: true }) : formatNumber(point[metric])}
      </Typography>
      {metric !== 'bills' && (
        <Typography sx={{ fontSize: FONT.tiny, color: onPlum.textFaint, mt: 0.3 }}>
          {formatNumber(point.bills)} bill{point.bills === 1 ? '' : 's'}
        </Typography>
      )}
    </Box>
  );
};

const RevenueChart = ({ data, loading, error, onRetry, range, onRangeChange, growth }) => {
  const [metric, setMetric] = useState('revenue');

  // Reset clears both of this card's filters: the metric and the range.
  const canReset = metric !== 'revenue' || !isDefaultRange(range);
  const handleReset = () => {
    setMetric('revenue');
    onRangeChange(DEFAULT_DATE_RANGE);
  };

  const points =
    data?.points?.map((point) => ({
      ...point,
      label: formatChartKey(point.key, data.granularity),
    })) || [];

  const isMoney = metric === 'revenue' || metric === 'aov';

  // The API returns the total for `revenue`; derive the others client-side so
  // switching metric does not need a round trip.
  const total = (() => {
    if (!points.length) return 0;
    if (metric === 'aov') {
      const bills = points.reduce((sum, p) => sum + p.bills, 0);
      const revenue = points.reduce((sum, p) => sum + p.revenue, 0);
      return bills ? revenue / bills : 0;
    }
    return points.reduce((sum, p) => sum + (p[metric] || 0), 0);
  })();

  const hasData = points.some((p) => p[metric] > 0);

  return (
    <Card>
      <Box sx={{ p: CARD_PAD }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'flex-start' }}
          spacing={2}
        >
          <Box>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <SectionTitle title="Revenue growth" sx={{ mb: 0 }} />
              {typeof growth === 'number' && Number.isFinite(growth) && (
                <Chip
                  size="small"
                  icon={
                    growth >= 0 ? (
                      <TrendingUp sx={{ fontSize: ICON.micro }} />
                    ) : (
                      <TrendingDown sx={{ fontSize: ICON.micro }} />
                    )
                  }
                  label={`${growth > 0 ? '+' : ''}${growth}%`}
                  sx={{
                    bgcolor: growth >= 0 ? surface.successSoft : surface.errorSoft,
                    color: growth >= 0 ? 'success.main' : 'error.main',
                    fontWeight: 700,
                  }}
                />
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              Performance insights for the selected period
            </Typography>
          </Box>

          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent={{ xs: 'flex-start', md: 'flex-end' }}
            flexWrap="wrap"
            useFlexGap
          >
            <Select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              size="small"
              sx={{ minWidth: 150, bgcolor: 'background.paper', fontSize: FONT.small, fontWeight: 600 }}
            >
              {CHART_METRICS.map((option) => (
                <MenuItem key={option.value} value={option.value} sx={{ fontSize: FONT.body }}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>

            <DateRangeControl
              value={range}
              onChange={onRangeChange}
              onReset={handleReset}
              canReset={canReset}
              width={150}
            />
          </Stack>
        </Stack>
      </Box>

      <Divider />

      <Box sx={{ px: CARD_PAD, pt: 2 }}>
        <Typography variant="overline" color="text.secondary">
          Total for period
        </Typography>
        <Typography variant="h3" sx={{ ...numericText }}>
          {isMoney ? formatCurrency(total) : formatNumber(Math.round(total))}
          {metric === 'aov' && (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              per bill
            </Typography>
          )}
        </Typography>
      </Box>

      <Box sx={{ px: { xs: 0.5, sm: 1.5 }, pb: 2, pt: 1 }}>
        {loading ? (
          <ChartSkeleton height={260} />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} compact />
        ) : !hasData ? (
          <EmptyState
            compact
            title={`No ${metricLabel[metric].toLowerCase()} in this period`}
            description="Create a bill or widen the date range to see the trend here."
          />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={points} margin={{ top: 10, right: 16, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={brand.plum} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={brand.plum} stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 5" stroke={brand.line} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: brand.inkSoft }}
                axisLine={{ stroke: brand.line }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 11, fill: brand.inkSoft }}
                axisLine={false}
                tickLine={false}
                width={54}
                tickFormatter={(v) => (isMoney ? formatCompactCurrency(v) : formatNumber(v))}
              />
              <RechartsTooltip content={<ChartTooltip metric={metric} />} cursor={{ stroke: brand.gold, strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey={metric}
                stroke={brand.plum}
                strokeWidth={2.4}
                fill="url(#revenueFill)"
                // A line needs two points to be visible at all, so a period that
                // holds a single bucket is drawn as a marked point instead of an
                // empty panel.
                dot={points.length === 1 ? { r: 4, fill: brand.plum, stroke: '#fff', strokeWidth: 2 } : false}
                activeDot={{ r: 5, fill: brand.gold, stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Card>
  );
};

export default RevenueChart;
