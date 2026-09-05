import { Card, Box, Typography, Stack, Divider, ToggleButtonGroup, ToggleButton } from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Cell,
  LabelList,
} from 'recharts';
import DateRangeControl from '../../../components/common/DateRangeControl.jsx';
import SectionTitle from '../../../components/common/SectionTitle.jsx';
import { ChartSkeleton, ErrorState, EmptyState } from '../../../components/common/StateViews.jsx';
import { formatCurrency, formatNumber, truncate } from '../../../utils/format.js';
import { FONT, CARD_HEAD_PAD, brand, chartPalette, onPlum, surface } from '../../../theme/index.js';

const BarTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <Box sx={{ bgcolor: brand.plumDark, color: '#fff', px: 1.6, py: 1.1, borderRadius: 2, maxWidth: 260 }}>
      <Typography sx={{ fontSize: FONT.small, fontWeight: 700 }}>{item.name}</Typography>
      <Typography sx={{ fontSize: FONT.tiny, color: brand.goldLight }}>
        {formatNumber(item.units)} unit{item.units === 1 ? '' : 's'} sold
      </Typography>
      <Typography sx={{ fontSize: FONT.tiny, color: onPlum.textFaint }}>
        {formatCurrency(item.revenue)} revenue
      </Typography>
    </Box>
  );
};

/** Horizontal bar chart of best sellers, switchable between units and revenue. */
const TopPerfumes = ({ data, loading, error, onRetry, range, onRangeChange, by, onByChange }) => {
  const rows = (data || []).map((row) => ({ ...row, shortName: truncate(row.name, 30) }));
  const hasData = rows.length > 0;

  return (
    <Card sx={{ height: '100%' }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        spacing={1.5}
        sx={CARD_HEAD_PAD}
      >
        <SectionTitle
          title="Top selling perfumes"
          description={`By ${by === 'revenue' ? 'revenue earned' : 'units sold'}`}
          sx={{ mb: 0 }}
        />

        <Stack direction="row" spacing={1} alignItems="center">
          <ToggleButtonGroup
            value={by}
            exclusive
            size="small"
            onChange={(_e, next) => next && onByChange(next)}
            sx={{
              '& .MuiToggleButton-root': { px: 1.3, py: 0.4, fontSize: FONT.tiny, textTransform: 'none', borderColor: 'divider' },
              '& .Mui-selected': { bgcolor: surface.plumMuted, color: 'primary.main !important' },
            }}
          >
            <ToggleButton value="units">Units</ToggleButton>
            <ToggleButton value="revenue">Revenue</ToggleButton>
          </ToggleButtonGroup>
          <DateRangeControl value={range} onChange={onRangeChange} onRefresh={onRetry} width={130} />
        </Stack>
      </Stack>

      <Divider />

      {loading ? (
        <ChartSkeleton height={230} />
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} compact />
      ) : !hasData ? (
        <EmptyState
          compact
          title="No sales yet"
          description="Once bills are raised, your best selling fragrances appear here."
        />
      ) : (
        <Box sx={{ p: 2, pt: 2.5 }}>
          <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 46)}>
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 46, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 5" stroke={brand.line} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: brand.inkSoft }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => (by === 'revenue' ? formatCurrency(v) : formatNumber(v))}
              />
              <YAxis
                type="category"
                dataKey="shortName"
                tick={{ fontSize: 11, fill: brand.inkSoft }}
                axisLine={false}
                tickLine={false}
                width={150}
              />
              <RechartsTooltip content={<BarTooltip />} cursor={{ fill: surface.goldFaint }} />
              <Bar dataKey={by} radius={[0, 7, 7, 0]} barSize={22}>
                {rows.map((row, index) => (
                  <Cell key={row.perfumeId || index} fill={chartPalette[index % chartPalette.length]} />
                ))}
                <LabelList
                  dataKey={by}
                  position="right"
                  formatter={(value) => (by === 'revenue' ? formatCurrency(value) : formatNumber(value))}
                  style={{ fontSize: 11, fill: brand.inkSoft, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Card>
  );
};

export default TopPerfumes;
