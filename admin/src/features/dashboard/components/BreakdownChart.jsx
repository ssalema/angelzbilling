import { Card, Box, Typography, Stack, Divider } from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import PeriodControl from '../../../components/common/PeriodControl.jsx';
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

const RADIAN = Math.PI / 180;

// Percentage labels sit just outside the arc.
const renderPercentLabel = ({ cx, cy, midAngle, outerRadius, percentage, index }) => {
  if (percentage < 8) return null;
  const radius = outerRadius + 16;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill={chartPalette[index % chartPalette.length]}
      textAnchor={x > cx + 4 ? 'start' : x < cx - 4 ? 'end' : 'middle'}
      dominantBaseline="central"
      style={{ fontSize: FONT.small, fontWeight: 700 }}
    >
      {Math.round(percentage)}%
    </text>
  );
};

// Shared donut/pie card used for both "Bill status" and "Payment preference".
const BreakdownChart = ({
  title,
  data,
  loading,
  error,
  onRetry,
  range,
  onRangeChange,
  onReset,
  canReset,
  donut = true,
  insight,
  emptyMessage = 'No bills in this period yet.',
}) => {
  const segments = data?.segments || [];
  const hasData = segments.length > 0 && segments.some((s) => s.count > 0);

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* The period control needs the full width of a card this narrow, so it
          sits on its own line under the title rather than beside it. */}
      <Box sx={CARD_HEAD_PAD}>
        <SectionTitle title={title} sx={{ mb: 1.5 }} />
        <PeriodControl value={range} onChange={onRangeChange} onReset={onReset} canReset={canReset} />
      </Box>

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
            <ResponsiveContainer width="100%" height={240}>
              <PieChart margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                <Pie
                  data={segments}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={donut ? 52 : 0}
                  outerRadius={80}
                  paddingAngle={donut ? 2 : 0}
                  startAngle={90}
                  endAngle={-270}
                  stroke="#fff"
                  strokeWidth={2}
                  label={renderPercentLabel}
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
