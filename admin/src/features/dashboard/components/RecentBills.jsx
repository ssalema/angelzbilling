import { Card, Box, Typography, Stack, Divider, Button, Avatar, Badge } from '@mui/material';
import { ReceiptLongOutlined, Inventory2Outlined, WarningAmberRounded } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import StatusChip from '../../../components/common/StatusChip.jsx';
import SectionTitle from '../../../components/common/SectionTitle.jsx';
import { TableSkeleton, ErrorState, EmptyState } from '../../../components/common/StateViews.jsx';
import { formatCurrency, formatDate, formatGrams, initials, stockStatus, truncate } from '../../../utils/format.js';
import { CARD_HEAD_PAD, CARD_PAD, ICON, brand, surface } from '../../../theme/index.js';

const PanelHeader = ({ title, subtitle, actionLabel, actionTo }) => (
  <>
    <Box sx={CARD_HEAD_PAD}>
      <SectionTitle
        title={title}
        description={subtitle}
        sx={{ mb: 0 }}
        action={
          actionTo && (
            <Button component={RouterLink} to={actionTo} size="small">
              {actionLabel}
            </Button>
          )
        }
      />
    </Box>
    <Divider />
  </>
);

export const RecentBills = ({ data, loading, error, onRetry }) => (
  <Card sx={{ height: '100%' }}>
    <PanelHeader title="Recent bills" actionLabel="View all" actionTo="/billing" />

    {loading ? (
      <TableSkeleton rows={5} columns={3} />
    ) : error ? (
      <ErrorState error={error} onRetry={onRetry} compact />
    ) : !data?.length ? (
      <EmptyState
        compact
        icon={ReceiptLongOutlined}
        title="No bills yet"
        description="Your most recent bills will appear here."
        action={
          <Button component={RouterLink} to="/billing/new" variant="contained" size="small">
            Create the first bill
          </Button>
        }
      />
    ) : (
      <Box>
        {data.map((bill, index) => (
          <Stack
            key={bill.id}
            component={RouterLink}
            to={`/billing/${bill.id}`}
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{
              px: CARD_PAD,
              py: 1.6,
              borderTop: index === 0 ? 0 : 1,
              borderColor: 'divider',
              textDecoration: 'none',
              color: 'inherit',
              '&:hover': { bgcolor: surface.goldFaint },
            }}
          >
            <Avatar sx={{ width: 36, height: 36, bgcolor: surface.plumMuted, color: brand.plum, fontSize: 12, fontWeight: 700 }}>
              {initials(bill.customer?.name)}
            </Avatar>

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
                {bill.billNumber}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {bill.customer?.name} · {formatDate(bill.createdAt)}
              </Typography>
            </Box>

            <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {formatCurrency(bill.grandTotal)}
              </Typography>
              <StatusChip status={bill.status} />
            </Stack>
          </Stack>
        ))}
      </Box>
    )}
  </Card>
);

export const LowStockAlerts = ({ data, loading, error, onRetry }) => (
  <Card sx={{ height: '100%' }}>
    <PanelHeader
      title="Low stock alerts"
      subtitle="Restock these before they sell out — figures are grams on hand"
      actionLabel="Manage"
      actionTo="/perfumes?stock=low"
    />

    {loading ? (
      <TableSkeleton rows={4} columns={3} />
    ) : error ? (
      <ErrorState error={error} onRetry={onRetry} compact />
    ) : !data?.length ? (
      <EmptyState
        compact
        icon={Inventory2Outlined}
        title="All perfumes are well stocked"
        description="Nothing has dropped below its low stock threshold."
      />
    ) : (
      <Box>
        {data.map((perfume, index) => (
          <Stack
            key={perfume.id}
            component={RouterLink}
            to={`/perfumes/${perfume.id}/edit`}
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{
              px: CARD_PAD,
              py: 1.5,
              borderTop: index === 0 ? 0 : 1,
              borderColor: 'divider',
              textDecoration: 'none',
              color: 'inherit',
              '&:hover': { bgcolor: surface.goldFaint },
            }}
          >
            <Badge
              overlap="circular"
              badgeContent={perfume.isOutOfStock ? <WarningAmberRounded sx={{ fontSize: ICON.micro }} /> : 0}
              color="error"
            >
              <Avatar
                variant="rounded"
                src={perfume.image || undefined}
                sx={{ width: 40, height: 40, bgcolor: surface.plumSoft }}
              >
                <Inventory2Outlined sx={{ fontSize: ICON.action, color: brand.plumLight }} />
              </Avatar>
            </Badge>

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>
                {truncate(perfume.name, 34)}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {perfume.sku}
              </Typography>
            </Box>

            {/* The same pill the catalogue and the perfume page use. */}
            <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
              <StatusChip status={stockStatus(perfume)} label={formatGrams(perfume.totalStock)} />
              <Typography variant="caption" color="text.secondary">
                {perfume.isOutOfStock ? 'Out of stock' : `of ${formatGrams(perfume.lowStockThreshold)} min`}
              </Typography>
            </Stack>
          </Stack>
        ))}
      </Box>
    )}
  </Card>
);
