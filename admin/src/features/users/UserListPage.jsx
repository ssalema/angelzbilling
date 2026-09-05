import { useState, useCallback } from 'react';
import {
  Box,
  Card,
  Button,
  Stack,
  MenuItem,
  IconButton,
  Tooltip,
  Typography,
  Avatar,
  Chip,
  Select,
} from '@mui/material';
import {
  PersonAddAlt1Outlined,
  EditOutlined,
  GroupOutlined,
  LockResetOutlined,
} from '@mui/icons-material';

import PageHeader from '../../components/common/PageHeader.jsx';
import DataTable, { actionsColumn } from '../../components/common/DataTable.jsx';
import StatusChip from '../../components/common/StatusChip.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import { EmptyState } from '../../components/common/StateViews.jsx';
import {
  FilterBar,
  FilterSearch,
  FilterSelect,
  FilterRefresh,
} from '../../components/common/FilterBar.jsx';
import UserFormDialog from './UserFormDialog.jsx';
import ResetPasswordDialog from './ResetPasswordDialog.jsx';

import { userApi, branchApi } from '../../api/endpoints.js';
import useApiResource from '../../hooks/useApiResource.js';
import useDebounce from '../../hooks/useDebounce.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import { formatCurrency, formatDate, formatNumber, formatRelative, initials } from '../../utils/format.js';
import { ROLES } from '../../utils/constants.js';
import { formatContactNumber } from '../../utils/countries.js';
import { FONT, ICON, brand } from '../../theme/index.js';

const UserListPage = () => {
  const snackbar = useSnackbar();
  const { user: me } = useAuth();
  const { branchesEnabled } = useSettings();

  const [filters, setFilters] = useState({
    search: '',
    role: 'all',
    status: 'all',
    branch: '',
    sort: '-createdAt',
    page: 1,
    limit: 10,
  });

  const [formUser, setFormUser] = useState(undefined); // undefined = closed, null = new
  const [resetUser, setResetUser] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const debouncedSearch = useDebounce(filters.search, 400);

  const users = useApiResource(
    () =>
      userApi.list({
        search: debouncedSearch,
        role: filters.role,
        status: filters.status,
        branch: filters.branch,
        sort: filters.sort,
        page: filters.page,
        limit: filters.limit,
      }),
    [debouncedSearch, filters.role, filters.status, filters.branch, filters.sort, filters.page, filters.limit]
  );

  const branches = useApiResource(
    () => (branchesEnabled ? branchApi.list({ limit: 100 }) : Promise.resolve({ items: [] })),
    [branchesEnabled]
  );

  const patch = useCallback((changes) => {
    setFilters((prev) => ({ ...prev, ...changes, page: changes.page ?? 1 }));
  }, []);

  const run = async (action, successReload = true) => {
    try {
      const result = await action();
      snackbar.success(result.message);
      if (successReload) users.reload();
    } catch (error) {
      snackbar.error(error.message);
    }
  };

  /** Inline role change straight from the table, as in the reference UI. */
  const changeRole = async (row, role) => {
    if (role === row.role) return;
    await run(() =>
      userApi.update(row.id, {
        role,
        branch: role === 'superadmin' ? null : row.branch?.id || null,
      })
    );
  };

  /** The status pill is the toggle: tapping it activates or deactivates the account. */
  const confirmToggleStatus = (row) => {
    setConfirm({
      title: row.isActive ? `Deactivate ${row.name}?` : `Activate ${row.name}?`,
      message: row.isActive
        ? 'They will be signed out of every device immediately and will not be able to sign back in.'
        : 'They will be able to sign in again with their existing password.',
      confirmLabel: row.isActive ? 'Deactivate' : 'Activate',
      severity: row.isActive ? 'error' : 'warning',
      action: () => userApi.toggleStatus(row.id),
    });
  };

  const items = users.data?.items || [];
  const meta = users.data?.meta || {};
  const isFiltered = Boolean(debouncedSearch) || filters.role !== 'all' || filters.status !== 'all' || filters.branch;

  const columns = [
    {
      key: 'name',
      label: 'User name',
      sortable: true,
      render: (row) => (
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar
            src={row.avatar?.url || undefined}
            sx={{ width: 38, height: 38, bgcolor: brand.plum, fontSize: 13, fontWeight: 700 }}
          >
            {initials(row.name)}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                {row.name}
              </Typography>
              {row.id === me?.id && <Chip size="small" label="You" color="secondary" sx={{ height: 18 }} />}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {formatNumber(row.billCount)} bill(s) · {formatCurrency(row.billTotal)}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      sortable: true,
      render: (row) => (
        <Typography
          component="a"
          href={`mailto:${row.email}`}
          variant="body2"
          sx={{ color: 'text.secondary', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
        >
          {row.email}
        </Typography>
      ),
    },
    {
      key: 'phone',
      label: 'Contact number',
      hideBelow: 'md',
      render: (row) =>
        row.phone ? (
          <Typography variant="body2">{formatContactNumber(row.phoneCountryCode, row.phone)}</Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Not provided
          </Typography>
        ),
    },
    {
      key: 'branch',
      label: 'Branch',
      hideBelow: 'lg',
      render: (row) =>
        row.branch ? (
          <Chip size="small" variant="outlined" label={row.branch.code} title={row.branch.name} />
        ) : (
          <Chip size="small" label="All branches" color="secondary" sx={{ color: brand.ink }} />
        ),
    },
    {
      key: 'createdAt',
      label: 'Registered',
      sortable: true,
      hideBelow: 'lg',
      render: (row) => (
        <Box>
          <Typography variant="body2">{formatDate(row.createdAt)}</Typography>
          <Typography variant="caption" color="text.secondary">
            Last seen {formatRelative(row.lastLoginAt)}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      align: 'center',
      width: 160,
      render: (row) => (
        <Select
          size="small"
          value={row.role}
          onChange={(e) => changeRole(row, e.target.value)}
          disabled={row.id === me?.id}
          sx={{ minWidth: 140, fontSize: FONT.small }}
        >
          {ROLES.map((role) => (
            <MenuItem key={role.value} value={role.value} sx={{ fontSize: FONT.body }}>
              {role.label}
            </MenuItem>
          ))}
        </Select>
      ),
    },
    {
      key: 'isActive',
      label: 'Status',
      align: 'center',
      render: (row) => {
        const isSelf = row.id === me?.id;
        return (
          <Tooltip title={isSelf ? 'You cannot change your own status' : row.isActive ? 'Deactivate account' : 'Activate account'}>
            <span>
              <StatusChip
                status={row.isActive ? 'active' : 'inactive'}
                onClick={isSelf ? undefined : () => confirmToggleStatus(row)}
              />
            </span>
          </Tooltip>
        );
      },
    },
    actionsColumn((row) => (
        <Stack direction="row" spacing={0.25} justifyContent="center">
          <Tooltip title="Edit account">
            <IconButton size="small" color="primary" onClick={() => setFormUser(row)}>
              <EditOutlined sx={{ fontSize: ICON.action }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reset password">
            <IconButton size="small" onClick={() => setResetUser(row)}>
              <LockResetOutlined sx={{ fontSize: ICON.action }} />
            </IconButton>
          </Tooltip>
        </Stack>
      )),
  ];

  return (
    <Box>
      <PageHeader
        title="Users"
        subtitle={`${formatNumber(meta.total || 0)} registered account${meta.total === 1 ? '' : 's'} · only a Super Admin can manage these`}
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Users' }]}
        action={
          <Button variant="contained" startIcon={<PersonAddAlt1Outlined />} onClick={() => setFormUser(null)}>
            Add user
          </Button>
        }
      />

      <Card>
        <FilterBar>
          <FilterSearch
            placeholder="Search by name, email or contact number…"
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
          />

          <FilterSelect
            label="Role"
            width={155}
            value={filters.role}
            onChange={(e) => patch({ role: e.target.value })}
          >
            <MenuItem value="all">All roles</MenuItem>
            {ROLES.map((role) => (
              <MenuItem key={role.value} value={role.value}>
                {role.label}
              </MenuItem>
            ))}
          </FilterSelect>

          {branchesEnabled && (
          <FilterSelect
            label="Branch"
            width={170}
            value={filters.branch}
            onChange={(e) => patch({ branch: e.target.value })}
          >
            <MenuItem value="">All branches</MenuItem>
            {(branches.data?.items || []).map((branch) => (
              <MenuItem key={branch.id} value={branch.id}>
                {branch.name}
              </MenuItem>
            ))}
          </FilterSelect>
          )}

          <FilterSelect
            label="Status"
            width={150}
            value={filters.status}
            onChange={(e) => patch({ status: e.target.value })}
          >
            <MenuItem value="all">All statuses</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
          </FilterSelect>

          <FilterRefresh onClick={users.reload} />
        </FilterBar>

        <DataTable
          columns={columns.filter((column) => branchesEnabled || column.key !== 'branch')}
          rows={items}
          loading={users.loading}
          error={users.error}
          onRetry={users.reload}
          onRowClick={(row) => setFormUser(row)}
          page={filters.page}
          limit={filters.limit}
          total={meta.total}
          onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
          onLimitChange={(limit) => patch({ limit })}
          sort={filters.sort}
          onSortChange={(sort) => patch({ sort })}
          emptyState={
            <EmptyState
              icon={GroupOutlined}
              title={isFiltered ? 'No accounts match these filters' : 'No accounts yet'}
              description={
                isFiltered
                  ? 'Try a different search or clear the filters.'
                  : 'Add branch admins and billing staff so your team can sign in.'
              }
              action={
                isFiltered ? (
                  <Button variant="outlined" onClick={() => patch({ search: '', role: 'all', status: 'all', branch: '' })}>
                    Clear filters
                  </Button>
                ) : (
                  <Button variant="contained" startIcon={<PersonAddAlt1Outlined />} onClick={() => setFormUser(null)}>
                    Add the first user
                  </Button>
                )
              }
            />
          }
        />
      </Card>

      <UserFormDialog
        open={formUser !== undefined}
        user={formUser}
        branches={branches.data?.items || []}
        onClose={() => setFormUser(undefined)}
        onSaved={users.reload}
      />

      <ResetPasswordDialog
        open={Boolean(resetUser)}
        user={resetUser}
        onClose={() => setResetUser(null)}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        severity={confirm?.severity}
        onConfirm={() => run(confirm.action)}
        onClose={() => setConfirm(null)}
      />
    </Box>
  );
};

export default UserListPage;
