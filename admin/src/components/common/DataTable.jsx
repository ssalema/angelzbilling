import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Box,
} from '@mui/material';
import { TableSkeleton, EmptyState, ErrorState } from './StateViews.jsx';
import Pagination from './Pagination.jsx';

/**
 * Table shell that owns the loading / empty / error states so no list screen
 * has to re-implement them.
 *
 * columns: [{ key, label, align, width, sortable, render(row), hideBelow }]
 *
 * The actions column is the same everywhere: use `actionsColumn(render)` below
 * so its header, alignment and width never drift between lists.
 */
export const ACTIONS_WIDTH = 120;

export const actionsColumn = (render) => ({
  key: 'actions',
  label: 'Actions',
  align: 'center',
  width: ACTIONS_WIDTH,
  render,
});
const DataTable = ({
  columns,
  rows = [],
  loading,
  error,
  onRetry,
  emptyState,
  // pagination (omit `total` for a non-paginated table)
  page = 1,
  limit = 10,
  total,
  onPageChange,
  onLimitChange,
  // sorting
  sort,
  onSortChange,
  getRowKey = (row, index) => row.id || row._id || index,
  onRowClick,
  dense = false,
}) => {
  const showPagination = typeof total === 'number' && total > 0 && onPageChange;

  const currentSort = (() => {
    if (!sort) return { field: null, direction: 'asc' };
    const desc = sort.startsWith('-');
    return { field: desc ? sort.slice(1) : sort, direction: desc ? 'desc' : 'asc' };
  })();

  const handleSort = (field) => {
    if (!onSortChange) return;
    const nextDesc = currentSort.field === field ? currentSort.direction === 'asc' : true;
    onSortChange(`${nextDesc ? '-' : ''}${field}`);
  };

  const renderBody = () => {
    if (loading) {
      return (
        <TableRow>
          <TableCell colSpan={columns.length} sx={{ border: 0, p: 0 }}>
            <TableSkeleton rows={Math.min(limit, 8)} columns={columns.length} />
          </TableCell>
        </TableRow>
      );
    }

    if (error) {
      return (
        <TableRow>
          <TableCell colSpan={columns.length} sx={{ border: 0 }}>
            <ErrorState error={error} onRetry={onRetry} />
          </TableCell>
        </TableRow>
      );
    }

    if (!rows.length) {
      return (
        <TableRow>
          <TableCell colSpan={columns.length} sx={{ border: 0 }}>
            {emptyState || <EmptyState title="No records found" description="Try adjusting your filters." />}
          </TableCell>
        </TableRow>
      );
    }

    return rows.map((row, index) => (
      <TableRow
        key={getRowKey(row, index)}
        hover
        // A clickable row is also a keyboard target — Enter opens it, exactly
        // as clicking does. The actions cell stops the event so its buttons never
        // open the row behind them, and any column marked `stopRowClick` does the
        // same for a control it carries — an inline dropdown, say.
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        onKeyDown={
          onRowClick
            ? (event) => {
                if (event.key === 'Enter' && event.target === event.currentTarget) onRowClick(row);
              }
            : undefined
        }
        tabIndex={onRowClick ? 0 : undefined}
        sx={{
          cursor: onRowClick ? 'pointer' : 'default',
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
        }}
      >
        {columns.map((column) => (
          <TableCell
            key={column.key}
            align={column.align || 'left'}
            onClick={
              column.key === 'actions' || column.stopRowClick
                ? (event) => event.stopPropagation()
                : undefined
            }
            sx={{
              width: column.width,
              ...(column.hideBelow ? { display: { xs: 'none', [column.hideBelow]: 'table-cell' } } : {}),
            }}
          >
            {column.render ? column.render(row, index) : row[column.key] ?? 'NA'}
          </TableCell>
        ))}
      </TableRow>
    ));
  };

  return (
    <Box>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size={dense ? 'small' : 'medium'} sx={{ minWidth: 680 }}>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  align={column.align || 'left'}
                  sx={{
                    width: column.width,
                    ...(column.hideBelow ? { display: { xs: 'none', [column.hideBelow]: 'table-cell' } } : {}),
                  }}
                >
                  {column.sortable && onSortChange ? (
                    <TableSortLabel
                      active={currentSort.field === column.key}
                      direction={currentSort.field === column.key ? currentSort.direction : 'asc'}
                      onClick={() => handleSort(column.key)}
                    >
                      {column.label}
                    </TableSortLabel>
                  ) : (
                    column.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>{renderBody()}</TableBody>
        </Table>
      </TableContainer>

      {showPagination && !loading && !error && (
        <Pagination
          page={page}
          limit={limit}
          total={total}
          onPageChange={onPageChange}
          onLimitChange={onLimitChange}
        />
      )}
    </Box>
  );
};

export default DataTable;
