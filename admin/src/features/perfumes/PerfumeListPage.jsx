import { useState, useCallback, useEffect } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card,
  Box,
  Button,
  Stack,
  MenuItem,
  IconButton,
  Tooltip,
  Typography,
  Avatar,
  Chip,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import AddchartOutlined from '@mui/icons-material/AddchartOutlined';
import SellOutlined from '@mui/icons-material/SellOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';

import PageHeader from '../../components/common/PageHeader.jsx';
import UpdateStockDialog from './stock/UpdateStockDialog.jsx';
import UpdatePriceDialog from './pricing/UpdatePriceDialog.jsx';
import BulkUploadDialog from './bulk/BulkUploadDialog.jsx';
import DataTable, { actionsColumn } from '../../components/common/DataTable.jsx';
import StatusChip from '../../components/common/StatusChip.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import { EmptyState } from '../../components/common/StateViews.jsx';
import {
  FilterBar,
  FilterSearch,
  FilterSelect,
  FilterReset,
} from '../../components/common/FilterBar.jsx';

import { perfumeApi } from '../../api/endpoints.js';
import useApiResource from '../../hooks/useApiResource.js';
import useDebounce from '../../hooks/useDebounce.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import {
  formatCurrency,
  formatDate,
  formatGrams,
  formatNumber,
  stockStatus,
  truncate,
  STOCK_LABELS,
} from '../../utils/format.js';
import { PERFUME_STATUSES } from '../../utils/constants.js';
import { DISCOUNT_COLOR, ICON, brand, surface } from '../../theme/index.js';
import { IMG } from '../../utils/image.js';

const STOCK_FILTERS = [
  { value: 'all', label: 'Any stock level' },
  { value: 'in', label: 'In stock' },
  { value: 'restock', label: 'Low or out of stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
];

const STOCK_VALUES = STOCK_FILTERS.map((f) => f.value);

const PerfumeListPage = () => {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();

  const [filters, setFilters] = useState({
    search: '',
    category: '',
    status: 'all',
    // Deep link from the dashboard's restock panel lands here pre-filtered. An
    // unknown value in the URL falls back to showing everything.
    stock: STOCK_VALUES.includes(searchParams.get('stock')) ? searchParams.get('stock') : 'all',
    sort: '-createdAt',
    page: 1,
    limit: 10,
  });

  const [confirmDelete, setConfirmDelete] = useState(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const debouncedSearch = useDebounce(filters.search, 400);

  const perfumes = useApiResource(
    (signal) =>
      perfumeApi.list(
        {
          search: debouncedSearch,
          category: filters.category,
          status: filters.status,
          stock: filters.stock,
          sort: filters.sort,
          page: filters.page,
          limit: filters.limit,
        },
        signal
      ),
    [debouncedSearch, filters.category, filters.status, filters.stock, filters.sort, filters.page, filters.limit],
    { cacheKey: 'perfumes:list', watch: 'perfumes' }
  );

  // The dropdown contents, which change only when the catalogue does.
  const facets = useApiResource((signal) => perfumeApi.facets(signal), [], { cacheKey: 'perfumes:facets', watch: 'perfumes' });

  // Deleting the last perfume of a category drops it from the facets.
  useEffect(() => {
    if (!filters.category || !facets.data) return;
    if (!(facets.data.categories || []).includes(filters.category)) {
      setFilters((prev) => ({ ...prev, category: '', page: 1 }));
    }
  }, [facets.data, filters.category]);

  const patch = useCallback((changes) => {
    // Any filter change resets to page 1 — staying on page 7 of a new result set
    // is the classic way to show a user an empty table for no reason.
    setFilters((prev) => ({ ...prev, ...changes, page: changes.page ?? 1 }));
  }, []);

  const resetFilters = () =>
    setFilters((prev) => ({ ...prev, search: '', category: '', status: 'all', stock: 'all', page: 1 }));

  const handleDelete = async () => {
    try {
      const result = await perfumeApi.remove(confirmDelete.id);
      snackbar.success(result.message);
      perfumes.reload();
      facets.reload();
    } catch (error) {
      snackbar.error(error.message);
    }
  };

  const items = perfumes.data?.items || [];
  const meta = perfumes.data?.meta || {};
  const isFiltered =
    Boolean(debouncedSearch) || filters.category || filters.status !== 'all' || filters.stock !== 'all';

  const columns = [
    {
      key: 'image',
      label: 'Image',
      width: 74,
      render: (row) => (
        <Avatar
          variant="rounded"
          src={IMG.avatar(row.primaryImage) || undefined}
          alt={row.name}
          sx={{ width: 48, height: 48, bgcolor: surface.plumSoft, border: 1, borderColor: 'divider' }}
        >
          <Inventory2Outlined sx={{ fontSize: ICON.nav, color: brand.plumLight }} />
        </Avatar>
      ),
    },
    {
      key: 'name',
      label: 'Perfume name',
      sortable: true,
      render: (row) => (
        <Box sx={{ minWidth: 180 }}>
          <Typography
            component={RouterLink}
            to={`/perfumes/${row.id}`}
            variant="subtitle2"
            sx={{ fontWeight: 700, textDecoration: 'none', color: 'text.primary', '&:hover': { color: 'primary.main' } }}
          >
            {truncate(row.name, 42)}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {[row.brand, row.sku].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      hideBelow: 'md',
      render: (row) => (
        <Box>
          <Typography variant="body2">{row.category || 'NA'}</Typography>
          {row.subCategory && (
            <Typography variant="caption" color="text.secondary">
              {row.subCategory}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      key: 'mrp',
      label: 'Price',
      align: 'right',
      sortable: true,
      hideBelow: 'sm',
      render: (row) => (
        <Typography
          variant="body2"
          sx={{ textDecoration: row.discountPercent > 0 ? 'line-through' : 'none', color: 'text.secondary' }}
        >
          {formatCurrency(row.mrp)}
        </Typography>
      ),
    },
    {
      key: 'discountPercent',
      label: 'Discount',
      align: 'center',
      hideBelow: 'md',
      // A discount is money off, not a fault — it never wears the error red
      // that out-of-stock, deactivate and delete use.
      render: (row) =>
        row.discountPercent > 0 ? (
          <Chip
            size="small"
            label={`${row.discountPercent}%`}
            sx={{ fontWeight: 700, color: DISCOUNT_COLOR, bgcolor: surface.successSoft }}
          />
        ) : (
          <Typography variant="caption" color="text.secondary">
            NA
          </Typography>
        ),
    },
    {
      key: 'finalPrice',
      label: 'Final price',
      align: 'right',
      sortable: true,
      render: (row) => (
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {row.variantCount > 1 && row.priceFrom !== row.priceTo
            ? `${formatCurrency(row.priceFrom)} – ${formatCurrency(row.priceTo)}`
            : formatCurrency(row.finalPrice)}
        </Typography>
      ),
    },
    {
      key: 'variants',
      label: 'Variants',
      align: 'center',
      hideBelow: 'lg',
      render: (row) =>
        row.variantCount ? (
          <Chip size="small" label={`${row.variantCount} sizes`} variant="outlined" />
        ) : (
          <Typography variant="caption" color="text.secondary">
            NA
          </Typography>
        ),
    },
    {
      key: 'stock',
      label: 'Stock',
      align: 'center',
      // Stock is bulk weight; the tooltip spells out what that covers in bottles.
      render: (row) => (
        <Tooltip title={`${STOCK_LABELS[stockStatus(row)]} · ${formatNumber(row.unitsInStock ?? 0)} unit(s) sellable`}>
          <span>
            <StatusChip
              status={stockStatus(row)}
              label={formatGrams(row.totalStock)}
              sx={{ minWidth: 46 }}
            />
          </span>
        </Tooltip>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      align: 'center',
      render: (row) => <StatusChip status={row.status} />,
    },
    {
      key: 'createdAt',
      label: 'Added',
      sortable: true,
      hideBelow: 'lg',
      render: (row) => (
        <Typography variant="caption" color="text.secondary">
          {formatDate(row.createdAt)}
        </Typography>
      ),
    },
    // Billing staff can neither edit nor delete, so the column is left out for
    // them rather than standing there labelled "Actions" and holding nothing.
    ...(isAdmin
      ? [
          actionsColumn((row) => (
            <Stack direction="row" spacing={0.25} justifyContent="center">
              <Tooltip title="Edit perfume">
                <IconButton size="small" color="primary" onClick={() => navigate(`/perfumes/${row.id}/edit`)}>
                  <EditOutlined sx={{ fontSize: ICON.action }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete perfume">
                <IconButton size="small" color="error" onClick={() => setConfirmDelete(row)}>
                  <DeleteOutline sx={{ fontSize: ICON.action }} />
                </IconButton>
              </Tooltip>
            </Stack>
          )),
        ]
      : []),
  ];

  return (
    <Box>
      <PageHeader
        title="Perfumes"
        subtitle={`${formatNumber(meta.total || 0)} perfume${meta.total === 1 ? '' : 's'} in your catalogue`}
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Perfumes' }]}
        action={
          isAdmin && (
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.25, justifyContent: { sm: 'flex-end' } }}>
              {/* Restocking is a routine job of its own, so it sits beside
                  "Add perfume" rather than being buried a perfume at a time. */}
              <Button variant="outlined" startIcon={<AddchartOutlined />} onClick={() => setStockOpen(true)}>
                Update stock
              </Button>
              {/* Repricing is the same kind of routine, catalogue-wide job as
                  restocking, and just as painful one perfume at a time. */}
              <Button variant="outlined" startIcon={<SellOutlined />} onClick={() => setPriceOpen(true)}>
                Update price
              </Button>
              {/* Filling a catalogue is a job of its own — a thousand fragrances
                  is a spreadsheet, not a thousand trips through the wizard. The
                  wizard itself is untouched and still the way to add one. */}
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

      <Card>
        <FilterBar>
          <FilterSearch
            placeholder="Search by name, brand or SKU…"
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
          />

          <FilterSelect
            label="Category"
            width={170}
            value={filters.category}
            onChange={(e) => patch({ category: e.target.value })}
          >
            <MenuItem value="">All categories</MenuItem>
            {(facets.data?.categories || []).map((category) => (
              <MenuItem key={category} value={category}>
                {category}
              </MenuItem>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Status"
            width={150}
            value={filters.status}
            onChange={(e) => patch({ status: e.target.value })}
          >
            <MenuItem value="all">All statuses</MenuItem>
            {PERFUME_STATUSES.map((status) => (
              <MenuItem key={status.value} value={status.value}>
                {status.label}
              </MenuItem>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Stock"
            width={165}
            value={filters.stock}
            onChange={(e) => patch({ stock: e.target.value })}
          >
            {STOCK_FILTERS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </FilterSelect>

          <FilterReset onClick={resetFilters} disabled={!isFiltered} />
        </FilterBar>

        <DataTable
          columns={columns}
          rows={items}
          loading={perfumes.loading}
          error={perfumes.error}
          onRetry={perfumes.reload}
          onRowClick={(row) => navigate(`/perfumes/${row.id}`)}
          page={filters.page}
          limit={filters.limit}
          total={meta.total}
          onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
          onLimitChange={(limit) => patch({ limit })}
          sort={filters.sort}
          onSortChange={(sort) => patch({ sort })}
          emptyState={
            <EmptyState
              icon={Inventory2Outlined}
              title={isFiltered ? 'No perfumes match these filters' : 'Your catalogue is empty'}
              description={
                isFiltered
                  ? 'Try a different search term, or clear the filters to see everything.'
                  : 'Add your first fragrance to start billing.'
              }
              action={
                isFiltered ? (
                  <Button
                    variant="outlined"
                    onClick={() => patch({ search: '', category: '', status: 'all', stock: 'all' })}
                  >
                    Clear filters
                  </Button>
                ) : (
                  isAdmin && (
                    <Button component={RouterLink} to="/perfumes/new" variant="contained" startIcon={<AddRounded />}>
                      Add perfume
                    </Button>
                  )
                )
              }
            />
          }
        />
      </Card>

      <UpdatePriceDialog
        open={priceOpen}
        onClose={() => setPriceOpen(false)}
        // Every row shows a price and a final-price range, so a repricing has
        // to be reflected behind the dialog rather than on the next visit.
        onUpdated={perfumes.reload}
      />

      <BulkUploadDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        // A run of new perfumes changes both the table and the category filter
        // behind the dialog, so both are reloaded rather than left stale.
        onCreated={() => {
          perfumes.reload();
          facets.reload();
        }}
      />

      <UpdateStockDialog
        open={stockOpen}
        onClose={() => setStockOpen(false)}
        // The table shows grams and a stock pill on every row, so a top-up has
        // to be reflected behind the dialog rather than on the next visit.
        onUpdated={perfumes.reload}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={`Delete "${truncate(confirmDelete?.name || '', 32)}"?`}
        message="This cannot be undone. If the perfume appears on any bill it will be archived instead, so your records stay intact."
        confirmLabel="Delete perfume"
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(null)}
      />
    </Box>
  );
};

export default PerfumeListPage;
