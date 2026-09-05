import { Card, Box, Typography, Stack, Divider } from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import DateRangeControl from '../../../components/common/DateRangeControl.jsx';
import SectionTitle from '../../../components/common/SectionTitle.jsx';
import { ChartSkeleton, ErrorState, EmptyState } from '../../../components/common/StateViews.jsx';
import { formatCurrency, formatNumber } from '../../../utils/format.js';
import { FONT, CARD_HEAD_PAD, brand, chartPalette, onPlum } from '../../../theme/index.js';

const SliceTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <Box sx={{ bgcolor: brand.plumDark, color: '#fff', px: 1.6, py: 1.1, borderRadius: 2 }}>
      <Typography sx={{ fontSize: FONT.small, fontWeight: 700 }}>{item.label}</Typography>
      <Typography sx={{ fontSize: FONT.tiny, color: brand.goldLight }}>
        {formatNumber(item.count)} bill{item.count === 1 ? '' : 's'} · {item.percentage}%
      </Typography>
      <Typography sx={{ fontSize: FONT.tiny, color: onPlum.textFaint }}>
        {formatCurrency(item.amount)}
      </Typography>
    </Box>
  );
};

/**
 * Shared donut/pie card used for both "Bill status" and "Payment preference".
 * `donut` toggles the hole, matching the two reference charts.
 */
const BreakdownChart = ({
  title,
  data,
  loading,
  error,
  onRetry,
  range,
  onRangeChange,
  donut = true,
  insight,
  emptyMessage = 'No bills in this period yet.',
}) => {
  const segments = data?.segments || [];
  const hasData = segments.length > 0 && segments.some((s) => s.count > 0);

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        spacing={1}
        sx={CARD_HEAD_PAD}
      >
        <SectionTitle title={title} sx={{ mb: 0 }} />
        <DateRangeControl value={range} onChange={onRangeChange} onRefresh={onRetry} width={130} />
      </Stack>

      <Divider />

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {loading ? (
          <ChartSkeleton height={200} />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} compact />
        ) : !hasData ? (
          <EmptyState compact title="Nothing to chart yet" description={emptyMessage} />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie
                  data={segments}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={donut ? 58 : 0}
                  outerRadius={90}
                  paddingAngle={donut ? 2 : 0}
                  startAngle={90}
                  endAngle={-270}
                  stroke="#fff"
                  strokeWidth={2}
                  label={({ percentage }) => (percentage >= 8 ? `${Math.round(percentage)}%` : '')}
                  labelLine={false}
                >
                  {segments.map((segment, index) => (
                    <Cell key={segment.key} fill={chartPalette[index % chartPalette.length]} />
                  ))}
                </Pie>
                <RechartsTooltip content={<SliceTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Legend with counts — the reference shows "Confirmed · 3" style labels */}
            <Stack
              direction="row"
              spacing={2}
              justifyContent="center"
              flexWrap="wrap"
              useFlexGap
              sx={{ px: 2, pb: 1 }}
            >
              {segments.map((segment, index) => (
                <Stack key={segment.key} direction="row" spacing={0.75} alignItems="center">
                  <Box
                    sx={{
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      bgcolor: chartPalette[index % chartPalette.length],
                      flexShrink: 0,
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {segment.label} · <strong>{formatNumber(segment.count)}</strong>
                  </Typography>
                </Stack>
              ))}
            </Stack>

            {insight && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', textAlign: 'center', px: 2, pb: 2, pt: 0.5 }}
              >
                {insight(segments)}
              </Typography>
            )}
          </>
        )}
      </Box>
    </Card>
  );
};

export default BreakdownChart;
