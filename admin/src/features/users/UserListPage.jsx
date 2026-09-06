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
import PersonAddAlt1Outlined from '@mui/icons-material/PersonAddAlt1Outlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import LockResetOutlined from '@mui/icons-material/LockResetOutlined';

import PageHeader from '../../components/common/PageHeader.jsx';
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
import UserFormDialog from './UserFormDialog.jsx';
import ResetPasswordDialog from './ResetPasswordDialog.jsx';

import { userApi, branchApi } from '../../api/endpoints.js';
import useApiResource from '../../hooks/useApiResource.js';
import useDebounce from '../../hooks/useDebounce.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import { formatCurrency, formatDate, formatNumber, formatRelative, initials } from '../../utils/format.js';
import { ROLES, HEAD_OFFICE, locationOf } from '../../utils/constants.js';
import { formatContactNumber } from '../../utils/countries.js';
import { FONT, ICON, brand } from '../../theme/index.js';

const UserListPage = () => {
  const snackbar = useSnackbar();
  const { user: me, isMainSuperAdmin, canEditBranch, branchName } = useAuth();
  const { branchesEnabled } = useSettings();

  /**
   * Every Super Admin sees every account — the list is never filtered by branch.
   * Changing one is narrower: a Super Admin assigned to a branch manages that
   * branch's team, and never another Super Admin. The server enforces the same
   * rule; this only keeps the table honest about it.
   */
  const canManage = (row) =>
    isMainSuperAdmin || (row.role !== 'superadmin' && canEditBranch(locationOf(row.branch).id));

  const roleOptions = ROLES.filter((role) => isMainSuperAdmin || role.value !== 'superadmin');

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

  const resetFilters = () =>
    setFilters((prev) => ({ ...prev, search: '', role: 'all', status: 'all', branch: '', page: 1 }));

  const run = async (action, successReload = true) => {
    try {
      const result = await action();
      snackbar.success(result.message);
      if (successReload) users.reload();
    } catch (error) {
      snackbar.error(error.message);
    }
  };

  /**
   * Inline role change straight from the table, as in the reference UI.
   *
   * The branch assignment rides along unchanged. Promoting a branch account to
   * Super Admin therefore makes a branch-level one — full visibility, authority
   * still capped at their branch. Cutting them loose to the whole business is a
   * deliberate act, done in the edit dialog by clearing the branch.
   */
  const changeRole = async (row, role) => {
    if (role === row.role) return;
    // The location rides along unchanged; `null` keeps a Head Office account
    // at the Head Office rather than reading as "no location".
    const branch = locationOf(row.branch);
    await run(() =>
      userApi.update(row.id, { role, branch: branch.id === HEAD_OFFICE.id ? null : branch.id })
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
      // Nobody is assigned to "all branches" — an account with no branch belongs
      // to the Head Office, which is a location alongside the rest.
      render: (row) => {
        const location = locationOf(row.branch);
        return location.isHeadOffice || location.id === HEAD_OFFICE.id ? (
          <Chip size="small" label={HEAD_OFFICE.name} color="secondary" sx={{ color: brand.ink }} />
        ) : (
          <Chip size="small" variant="outlined" label={location.code} title={location.name} />
        );
      },
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
      // The dropdown changes the role in place; it must not also open the row.
      stopRowClick: true,
      render: (row) => (
        <Select
          size="small"
          value={row.role}
          onChange={(e) => changeRole(row, e.target.value)}
          disabled={row.id === me?.id || !canManage(row)}
          sx={{ minWidth: 140, fontSize: FONT.small }}
        >
          {roleOptions.map((role) => (
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
        const locked = isSelf || !canManage(row);
        return (
          <Tooltip
            title={
              isSelf
                ? 'You cannot change your own status'
                : !canManage(row)
                  ? `Only accounts in ${branchName} can be changed by your account`
                  : row.isActive
                    ? 'Deactivate account'
                    : 'Activate account'
            }
          >
            <span>
              <StatusChip
                status={row.isActive ? 'active' : 'inactive'}
                onClick={locked ? undefined : () => confirmToggleStatus(row)}
              />
            </span>
          </Tooltip>
        );
      },
    },
    actionsColumn((row) => {
      const manageable = canManage(row);
      const blocked = `Your account manages ${branchName} only`;
      return (
        <Stack direction="row" spacing={0.25} justifyContent="center">
          <Tooltip title={manageable ? 'Edit account' : blocked}>
            <Box component="span">
              <IconButton
                size="small"
                color="primary"
                disabled={!manageable}
                onClick={() => setFormUser(row)}
              >
                <EditOutlined sx={{ fontSize: ICON.action }} />
              </IconButton>
            </Box>
          </Tooltip>
          <Tooltip title={manageable ? 'Reset password' : blocked}>
            <Box component="span">
              <IconButton size="small" disabled={!manageable} onClick={() => setResetUser(row)}>
                <LockResetOutlined sx={{ fontSize: ICON.action }} />
              </IconButton>
            </Box>
          </Tooltip>
        </Stack>
      );
    }),
  ];

  return (
    <Box>
      <PageHeader
        title="Users"
        subtitle={`${formatNumber(meta.total || 0)} registered account${meta.total === 1 ? '' : 's'} · ${
          isMainSuperAdmin ? 'only a Super Admin can manage these' : `you manage the ${branchName} team`
        }`}
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

          <FilterReset onClick={resetFilters} disabled={!isFiltered} />
        </FilterBar>

        <DataTable
          columns={columns.filter((column) => branchesEnabled || column.key !== 'branch')}
          rows={items}
          loading={users.loading}
          error={users.error}
          onRetry={users.reload}
          onRowClick={(row) => (canManage(row) ? setFormUser(row) : undefined)}
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
