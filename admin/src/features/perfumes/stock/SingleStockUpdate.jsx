import { useMemo, useState } from 'react';
import {
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchRounded from '@mui/icons-material/SearchRounded';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import AddchartOutlined from '@mui/icons-material/AddchartOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';

import StatusChip from '../../../components/common/StatusChip.jsx';
import { perfumeApi } from '../../../api/endpoints.js';
import useApiResource from '../../../hooks/useApiResource.js';
import useDebounce from '../../../hooks/useDebounce.js';
import { useSnackbar } from '../../../context/SnackbarContext.jsx';
import { formatGrams, formatNumber, stockStatus } from '../../../utils/format.js';
import { brand, CARD_RADIUS, FONT, ICON, numericText, surface } from '../../../theme/index.js';
import { IMG } from '../../../utils/image.js';
import { parseTypedGrams } from './stockSheet.js';

/**
 * Topping up perfumes by hand.
 *
 * Built like the billing screen: search, pick, and the perfume drops into a
 * list you keep adding to. A delivery almost never contains exactly one
 * fragrance, and closing and reopening this dialog for each bottle was the
 * whole reason bulk upload existed — this covers the middle ground, where
 * there are six to update and writing a spreadsheet is more work than typing.
 *
 * The columns are the bulk review table's, in the same order and with the same
 * arithmetic, so the two tabs teach each other. Available stock is read from
 * the catalogue and never editable; the admin types what has ARRIVED, and the
 * final weight is worked out in front of them.
 *
 * Only the arriving grams are sent — the server adds them — so a bottle billed
 * while the list was being built is still subtracted rather than written over.
 */
const SingleStockUpdate = ({ onUpdated }) => {
  const snackbar = useSnackbar();

  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  const debouncedQuery = useDebounce(query, 300);

  const options = useApiResource(
    () => perfumeApi.stockSearch({ q: debouncedQuery, limit: 20 }),
    [debouncedQuery]
  );

  const chosen = useMemo(() => new Set(rows.map((row) => row.id)), [rows]);

  // A perfume already on the list is dropped from the dropdown rather than
  // added twice — two rows for one bottle is two chances to get the total wrong.
  const available = (options.data?.items || []).filter((option) => !chosen.has(option.id));

  const addRow = (option) => {
    if (!option || chosen.has(option.id)) return;
    setRows((current) => [
      ...current,
      { key: `${option.id}-${Date.now()}`, ...option, newStock: '' },
    ]);
  };

  const editRow = (id, value) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, newStock: value } : row)));

  const removeRow = (id) => setRows((current) => current.filter((row) => row.id !== id));

  /** What a row's typed grams are worth, and why they might not count. */
  const gramsFor = (row) => {
    const grams = parseTypedGrams(row.newStock);
    if (row.newStock === '') return { grams: NaN, error: '' };
    if (!Number.isFinite(grams)) return { grams: NaN, error: 'Not a number' };
    if (grams === 0) return { grams, error: 'Enter a weight above zero' };
    if (grams < 0 && row.stock + grams < 0) return { grams, error: `Only ${formatGrams(row.stock)} on hand` };
    return { grams, error: '' };
  };

  const payload = rows
    .map((row) => ({ row, ...gramsFor(row) }))
    .filter((entry) => !entry.error && Number.isFinite(entry.grams) && entry.grams !== 0)
    .map((entry) => ({ id: entry.row.id, addStock: entry.grams }));

  const blocked = rows.some((row) => gramsFor(row).error);
  const totalIncoming = payload.reduce((sum, entry) => sum + entry.addStock, 0);

  const submit = async () => {
    setSaving(true);
    try {
      // The same endpoint the bulk tab uses: one round trip, and each row an
      // atomic increment, whether there is one of them or sixty.
      const result = await perfumeApi.bulkAddStock(payload, 'single');
      const { updated, failed = [] } = result.data || {};

      if (failed.length) {
        snackbar.warning(`${updated} updated · ${failed.length} skipped — ${failed[0].reason}`);
      } else {
        snackbar.success(result.message);
      }

      setRows([]);
      setQuery('');
      onUpdated?.();
      // The perfumes just fixed should drop out of the "needs restocking" list.
      options.reload();
    } catch (error) {
      snackbar.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Autocomplete
        options={available}
        loading={options.loading}
        value={null}
        blurOnSelect
        clearOnBlur
        getOptionLabel={(option) => option.name || ''}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        filterOptions={(x) => x} // the server already filtered
        onInputChange={(_event, value, reason) => {
          if (reason === 'input') setQuery(value);
        }}
        onChange={(_event, option) => {
          addRow(option);
          setQuery('');
        }}
        noOptionsText={
          debouncedQuery
            ? 'No perfume matches that name or SKU'
            : rows.length
              ? 'Everything that needs restocking is already on your list'
              : 'Every perfume is above its low-stock alert'
        }
        renderOption={(props, option) => (
          <Box component="li" {...props} key={option.id}>
            <Avatar
              variant="rounded"
              src={IMG.avatar(option.image) || undefined}
              alt={option.name}
              sx={{ width: 36, height: 36, mr: 1.5, bgcolor: surface.plumSoft }}
            >
              <Inventory2Outlined sx={{ fontSize: ICON.inline, color: brand.plumLight }} />
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {option.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {[option.brand, option.sku].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            <StatusChip
              status={stockStatus(option)}
              label={formatGrams(option.stock)}
              sx={{ ml: 1, flexShrink: 0 }}
            />
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            autoFocus
            placeholder="Search a perfume by name or SKU to add it…"
            helperText={
              debouncedQuery
                ? ' '
                : 'Showing what needs restocking — lowest weight first. Type to search the whole catalogue.'
            }
            InputProps={{
              ...params.InputProps,
              startAdornment: (
                <>
                  <InputAdornment position="start">
                    <SearchRounded sx={{ fontSize: ICON.action, color: 'text.secondary' }} />
                  </InputAdornment>
                  {params.InputProps.startAdornment}
                </>
              ),
              endAdornment: (
                <>
                  {options.loading && <CircularProgress size={16} />}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
      />

      {rows.length === 0 ? (
        <Box sx={{ mt: 2, py: 5, px: 3, textAlign: 'center', borderRadius: `${CARD_RADIUS}px`, bgcolor: surface.plumFaint }}>
          <Inventory2Outlined sx={{ fontSize: ICON.illustration, color: brand.plumLight, mb: 0.5 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Pick a perfume to restock
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Add as many as you like — their stock on hand appears here, and whatever you add goes on top of it.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
              On your list
            </Typography>
            <Chip size="small" color="primary" variant="outlined" label={`${rows.length} perfume${rows.length === 1 ? '' : 's'}`} />
            <Button size="small" onClick={() => setRows([])} disabled={saving}>
              Clear all
            </Button>
          </Stack>

          {/* The bulk tab's review table, column for column. */}
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: `${CARD_RADIUS}px`, overflow: 'hidden' }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 640 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Perfume name</TableCell>
                    <TableCell align="right">Available stock</TableCell>
                    <TableCell align="right" sx={{ width: 158 }}>
                      New stock (gm)
                    </TableCell>
                    <TableCell align="right">Final stock</TableCell>
                    <TableCell align="center" sx={{ width: 56 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    const { grams, error } = gramsFor(row);
                    const settled = !error && Number.isFinite(grams) && grams !== 0;

                    return (
                      <TableRow key={row.key}>
                        <TableCell>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <Avatar
                              variant="rounded"
                              src={IMG.avatar(row.image) || undefined}
                              alt={row.name}
                              sx={{ width: 34, height: 34, bgcolor: surface.plumSoft, flexShrink: 0 }}
                            >
                              <Inventory2Outlined sx={{ fontSize: ICON.inline, color: brand.plumLight }} />
                            </Avatar>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                {row.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {row.sku}
                              </Typography>
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Read from the catalogue — it cannot be edited here">
                            <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                              {formatGrams(row.stock)}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            type="text"
                            inputMode="decimal"
                            value={row.newStock}
                            onChange={(event) => editRow(row.id, event.target.value.replace(/[^\d.]/g, ''))}
                            disabled={saving}
                            error={Boolean(error)}
                            // No blank placeholder line when the row is fine: a
                            // reserved helper row is laid out with the field, so
                            // it lifts the box off the row's centre line and the
                            // column reads as misaligned against the name beside it.
                            helperText={error}
                            inputProps={{ style: { textAlign: 'right' } }}
                            InputProps={{ endAdornment: <InputAdornment position="end">gm</InputAdornment> }}
                            sx={{ width: 146 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            sx={{
                              ...numericText,
                              fontSize: FONT.body,
                              color: settled ? 'text.primary' : 'text.disabled',
                            }}
                          >
                            {settled ? formatGrams(Math.max(0, row.stock + grams)) : 'NA'}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title="Remove from the list">
                            <IconButton
                              size="small"
                              color="error"
                              disabled={saving}
                              onClick={() => removeRow(row.id)}
                            >
                              <DeleteOutline sx={{ fontSize: ICON.action }} />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </Box>

          <Divider sx={{ my: 2.25 }} />

          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            justifyContent="space-between"
            sx={{ flexWrap: 'wrap', gap: 1.5 }}
          >
            <Typography variant="body2" color="text.secondary">
              {payload.length ? (
                <>
                  {formatNumber(payload.length)} perfume{payload.length === 1 ? '' : 's'} ·{' '}
                  <Box component="span" sx={{ ...numericText, fontSize: FONT.body, color: 'text.primary' }}>
                    {formatGrams(totalIncoming)}
                  </Box>{' '}
                  going in. Nothing is saved until you press Update stock.
                </>
              ) : (
                'Type the weight that has arrived against each perfume.'
              )}
            </Typography>

            <Button
              variant="contained"
              onClick={submit}
              disabled={saving || blocked || !payload.length}
              startIcon={saving ? <CircularProgress size={15} color="inherit" /> : <AddchartOutlined />}
            >
              {saving ? 'Updating…' : `Update stock (${payload.length})`}
            </Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
};

export default SingleStockUpdate;
