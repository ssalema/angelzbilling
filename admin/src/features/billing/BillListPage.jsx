import { useState, useCallback, useEffect, useRef } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  Grid,
  Button,
  Stack,
  MenuItem,
  IconButton,
  Tooltip,
  Typography,
  Chip,
  CircularProgress,
} from '@mui/material';
import AddCardOutlined from '@mui/icons-material/AddCardOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';

import PageHeader from '../../components/common/PageHeader.jsx';
import DataTable, { actionsColumn } from '../../components/common/DataTable.jsx';
import StatusChip from '../../components/common/StatusChip.jsx';
import StatCard from '../dashboard/components/StatCard.jsx';
import { EmptyState } from '../../components/common/StateViews.jsx';
import BillPrintView from './BillPrintView.jsx';
import CollectPaymentDialog from './CollectPaymentDialog.jsx';
import {
  FilterBar,
  FilterSearch,
  FilterSelect,
  FilterReset,
} from '../../components/common/FilterBar.jsx';
import DateRangeControl from '../../components/common/DateRangeControl.jsx';

import { billApi, branchApi } from '../../api/endpoints.js';
import useApiResource from '../../hooks/useApiResource.js';
import useDebounce from '../../hooks/useDebounce.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format.js';
import { downloadBillPdf } from '../../utils/downloadBill.js';
import { formatContactNumber } from '../../utils/countries.js';
import {
  BILL_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  HEAD_OFFICE,
  locationOf,
  DEFAULT_DATE_RANGE,
  isDefaultRange,
} from '../../utils/constants.js';
import { ICON, brand, statusColors } from '../../theme/index.js';

const BillListPage = () => {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const { branchesEnabled } = useSettings();
  const snackbar = useSnackbar();

  // Printing from the row stays on the list: the slip is fetched, rendered
  // off-screen and sent straight to the printer.
  const [printBill, setPrintBill] = useState(null);
  const [printingId, setPrintingId] = useState(null);

  // Downloading works the same way, only the mounted slip is serialised to a
  // file instead of being handed to the printer.
  const [downloadBill, setDownloadBill] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const downloadRef = useRef(null);

  // The pending row whose balance is being collected, if any.
  const [paymentBill, setPaymentBill] = useState(null);

  const [range, setRange] = useState(DEFAULT_DATE_RANGE);
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    paymentMethod: 'all',
    branch: '',
    sort: '-createdAt',
    page: 1,
    limit: 10,
  });

  const debouncedSearch = useDebounce(filters.search, 400);

  const query = {
    search: debouncedSearch,
    status: filters.status,
    paymentMethod: filters.paymentMethod,
    branch: filters.branch,
    range: range.range,
    from: range.from,
    to: range.to,
    sort: filters.sort,
    page: filters.page,
    limit: filters.limit,
  };

  const bills = useApiResource(() => billApi.list(query), [
    debouncedSearch,
    filters.status,
    filters.paymentMethod,
    filters.branch,
    filters.sort,
    filters.page,
    filters.limit,
    range.range,
    range.from,
    range.to,
  ]);

  const stats = useApiResource(
    () => billApi.stats({ range: range.range, from: range.from, to: range.to, branch: filters.branch }),
    [range.range, range.from, range.to, filters.branch]
  );

  const branches = useApiResource(
    () => (isSuperAdmin && branchesEnabled ? branchApi.list({ limit: 100 }) : Promise.resolve({ items: [] })),
    [isSuperAdmin, branchesEnabled],
    { immediate: isSuperAdmin && branchesEnabled }
  );

  const patch = useCallback((changes) => {
    setFilters((prev) => ({ ...prev, ...changes, page: changes.page ?? 1 }));
  }, []);

  // The slip needs one paint before the print dialog can capture it.
  useEffect(() => {
    if (!printBill) return undefined;
    const timer = setTimeout(() => {
      window.print();
      setPrintBill(null);
    }, 300);
    return () => clearTimeout(timer);
  }, [printBill]);

  // The slip must be painted before it can be rasterised into the PDF.
  useEffect(() => {
    if (!downloadBill) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        await downloadBillPdf(downloadRef.current, downloadBill);
      } catch (err) {
        if (!cancelled) snackbar.error(err.message);
      } finally {
        if (!cancelled) {
          setDownloadBill(null);
          setDownloadingId(null);
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [downloadBill, snackbar]);

  const handleDownload = async (id) => {
    setDownloadingId(id);
    try {
      setDownloadBill(await billApi.get(id));
    } catch (err) {
      snackbar.error(err.message);
      setDownloadingId(null);
    }
  };

  const handlePrint = async (id) => {
    setPrintingId(id);
    try {
      setPrintBill(await billApi.get(id));
    } catch (err) {
      snackbar.error(err.message);
    } finally {
      setPrintingId(null);
    }
  };

  const resetFilters = () => {
    setFilters((prev) => ({ ...prev, search: '', status: 'all', paymentMethod: 'all', branch: '', page: 1 }));
    setRange(DEFAULT_DATE_RANGE);
  };

  const refreshAll = () => {
    bills.reload();
    stats.reload();
  };

  const items = bills.data?.items || [];
  const meta = bills.data?.meta || {};
  const isFiltered =
    Boolean(debouncedSearch) ||
    filters.status !== 'all' ||
    filters.paymentMethod !== 'all' ||
    Boolean(filters.branch) ||
    !isDefaultRange(range);

  const columns = [
    {
      key: 'billNumber',
      label: 'Bill number',
      sortable: true,
      render: (row) => (
        <Box>
          <Typography
            component={RouterLink}
            to={`/billing/${row.id}`}
            variant="subtitle2"
            sx={{ fontWeight: 700, textDecoration: 'none', color: 'text.primary', '&:hover': { color: 'primary.main' } }}
          >
            {row.billNumber}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {row.items?.length || 0} item{row.items?.length === 1 ? '' : 's'}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (row) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {row.customer?.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatContactNumber(row.customer?.mobileCountryCode, row.customer?.mobile, '')}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'grandTotal',
      label: 'Amount',
      align: 'right',
      sortable: true,
      // The amount owed is what makes a pending row actionable, so it sits under
      // the total rather than hiding behind the status pill.
      render: (row) => (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {formatCurrency(row.grandTotal)}
          </Typography>
          {row.amountDue > 0 && (
            <Typography variant="caption" sx={{ color: statusColors.pending.color, fontWeight: 600 }}>
              {formatCurrency(row.amountDue)} due
            </Typography>
          )}
        </Box>
      ),
    },
    {
      key: 'paymentMethod',
      label: 'Payment',
      align: 'center',
      hideBelow: 'md',
      render: (row) => (
        <Chip size="small" variant="outlined" label={PAYMENT_METHOD_LABELS[row.paymentMethod] || row.paymentMethod} />
      ),
    },
    {
      key: 'branch',
      label: 'Branch',
      hideBelow: 'lg',
      // A bill with no branch was raised at the Head Office — the main business
      // is a location too, so this is never blank.
      render: (row) => {
        const location = locationOf(row.branch);
        return (
          <Box>
            <Typography variant="body2">{location.code || HEAD_OFFICE.code}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {location.name}
            </Typography>
          </Box>
        );
      },
    },
    {
      key: 'billedBy',
      label: 'Bill by',
      hideBelow: 'lg',
      render: (row) => (
        <Typography variant="body2" noWrap>
          {row.billedBy?.name || 'NA'}
        </Typography>
      ),
    },
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      hideBelow: 'sm',
      render: (row) => (
        <Box>
          <Typography variant="body2">{formatDate(row.createdAt)}</Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDate(row.createdAt, 'clock')}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      align: 'center',
      render: (row) => <StatusChip status={row.status} />,
    },
    actionsColumn((row) => (
        <Stack direction="row" spacing={0.25} justifyContent="center">
          {/* Pending only. A paid or refunded bill has nothing left to collect,
              so it never carries this button. */}
          {row.status === 'pending' && row.amountDue > 0 && (
            <Tooltip title={`Update payment — ${formatCurrency(row.amountDue)} due`}>
              <IconButton
                size="small"
                onClick={(event) => {
                  // The row itself opens the bill; this opens the dialog over it.
                  event.stopPropagation();
                  setPaymentBill(row);
                }}
                sx={{ color: statusColors.pending.color }}
              >
                <PaymentsOutlined sx={{ fontSize: ICON.action }} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="View bill">
            <IconButton size="small" onClick={() => navigate(`/billing/${row.id}`)}>
              <VisibilityOutlined sx={{ fontSize: ICON.action }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Download bill">
            <span>
              <IconButton
                size="small"
                disabled={downloadingId === row.id}
                onClick={() => handleDownload(row.id)}
              >
                {downloadingId === row.id ? (
                  <CircularProgress size={16} />
                ) : (
                  <DownloadOutlined sx={{ fontSize: ICON.action }} />
                )}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Print bill">
            <span>
              <IconButton
                size="small"
                color="primary"
                disabled={printingId === row.id}
                onClick={() => handlePrint(row.id)}
              >
                {printingId === row.id ? (
                  <CircularProgress size={16} />
                ) : (
                  <PrintOutlined sx={{ fontSize: ICON.action }} />
                )}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      )),
  ];

  return (
    <>
      <Box className="no-print">
        <PageHeader
          title="Bill records"
          subtitle={`${formatNumber(meta.total || 0)} bill${meta.total === 1 ? '' : 's'} in the selected period`}
          breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Bill records' }]}
          // The topbar already carries Create bill on every screen, so the
          // header does not repeat it here.
        />

        {/* Period summary */}
        <Grid container spacing={2.25} sx={{ mb: 2.5 }}>
          <Grid item xs={12} sm={6} lg={3}>
            <StatCard
              label="Bills in period"
              value={formatNumber(stats.data?.totalBills)}
              caption={`${formatNumber(stats.data?.paidCount || 0)} paid · ${formatNumber(
                stats.data?.pendingCount || 0
              )} pending`}
              loading={stats.loading}
              color={brand.plum}
            />
          </Grid>
          <Grid item xs={12} sm={6} lg={3}>
            <StatCard
              label="Revenue collected"
              value={formatCurrency(stats.data?.revenue)}
              caption={`of ${formatCurrency(stats.data?.billedAmount)} billed`}
              loading={stats.loading}
              color={brand.gold}
            />
          </Grid>
          {/* The other half of the revenue card: money billed but not yet in. */}
          <Grid item xs={12} sm={6} lg={3}>
            <StatCard
              label="Total pending"
              value={formatCurrency(stats.data?.outstanding)}
              caption={`across ${formatNumber(stats.data?.pendingCount || 0)} pending bill(s)`}
              loading={stats.loading}
              color={statusColors.pending.color}
            />
          </Grid>
          <Grid item xs={12} sm={6} lg={3}>
            <StatCard
              label="Refunded value"
              value={formatCurrency(stats.data?.refundedAmount)}
              caption={`across ${formatNumber(stats.data?.refundedCount || 0)} bill(s) · stock returned`}
              loading={stats.loading}
              color={brand.rose}
            />
          </Grid>
        </Grid>

        <Card>
          <FilterBar>
            <FilterSearch
              placeholder="Search bill number, customer name or contact number…"
              value={filters.search}
              onChange={(e) => patch({ search: e.target.value })}
            />

            <FilterSelect
              label="Status"
              width={145}
              value={filters.status}
              onChange={(e) => patch({ status: e.target.value })}
            >
              <MenuItem value="all">All statuses</MenuItem>
              {BILL_STATUSES.map((status) => (
                <MenuItem key={status.value} value={status.value}>
                  {status.label}
                </MenuItem>
              ))}
            </FilterSelect>

            <FilterSelect
              label="Payment"
              width={155}
              value={filters.paymentMethod}
              onChange={(e) => patch({ paymentMethod: e.target.value })}
            >
              <MenuItem value="all">All methods</MenuItem>
              {PAYMENT_METHODS.map((method) => (
                <MenuItem key={method.value} value={method.value}>
                  {method.label}
                </MenuItem>
              ))}
            </FilterSelect>

            {isSuperAdmin && branchesEnabled && (
              <FilterSelect
                label="Branch"
                width={165}
                value={filters.branch}
                onChange={(e) => patch({ branch: e.target.value })}
              >
                <MenuItem value="">All branches</MenuItem>
                <MenuItem value={HEAD_OFFICE.id}>{HEAD_OFFICE.name}</MenuItem>
                {(branches.data?.items || [])
                  .filter((branch) => branch.isActive)
                  .map((branch) => (
                    <MenuItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </MenuItem>
                  ))}
              </FilterSelect>
            )}

            <DateRangeControl label="Date" value={range} onChange={setRange} />

            <FilterReset onClick={resetFilters} disabled={!isFiltered} />
          </FilterBar>

          <DataTable
            columns={columns.filter((column) => branchesEnabled || column.key !== 'branch')}
            rows={items}
            loading={bills.loading}
            error={bills.error}
            onRetry={refreshAll}
            onRowClick={(row) => navigate(`/billing/${row.id}`)}
            page={filters.page}
            limit={filters.limit}
            total={meta.total}
            onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
            onLimitChange={(limit) => patch({ limit })}
            sort={filters.sort}
            onSortChange={(sort) => patch({ sort })}
            emptyState={
              <EmptyState
                icon={ReceiptLongOutlined}
                title={isFiltered ? 'No bills match these filters' : 'No bills in this period'}
                description={
                  isFiltered
                    ? 'Try clearing the filters or choosing a wider date range.'
                    : 'Create your first bill and it will appear here immediately.'
                }
                action={
                  isFiltered ? (
                    <Button
                      variant="outlined"
                      onClick={() => {
                        patch({ search: '', status: 'all', paymentMethod: 'all', branch: '' });
                        setRange({ range: 'all' });
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <Button component={RouterLink} to="/billing/new" variant="contained" startIcon={<AddCardOutlined />}>
                      Create bill
                    </Button>
                  )
                }
              />
            }
          />
        </Card>
      </Box>

      {/* Collecting a balance changes both the row and the period totals, so the
          list and its summary strip are refetched together. */}
      <CollectPaymentDialog
        open={Boolean(paymentBill)}
        bill={paymentBill}
        onClose={() => setPaymentBill(null)}
        onCollected={refreshAll}
      />

      {/* Off-screen slip — mounted only while a row is being printed. */}
      {printBill && (
        <Box sx={{ display: 'none', '@media print': { display: 'block' } }}>
          <BillPrintView bill={printBill} store={printBill.store} />
        </Box>
      )}

      {/* Off-screen slip — mounted only long enough to serialise it to a file. */}
      {downloadBill && (
        <Box
          className="no-print"
          aria-hidden
          sx={{ position: 'absolute', top: 0, left: -10000, width: 360, pointerEvents: 'none' }}
        >
          <BillPrintView ref={downloadRef} bill={downloadBill} store={downloadBill.store} />
        </Box>
      )}
    </>
  );
};

export default BillListPage;
