import { Fragment, useMemo, useState } from 'react';
import {
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
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
import SellOutlined from '@mui/icons-material/SellOutlined';
import PriceChangeOutlined from '@mui/icons-material/PriceChangeOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';

import SizePriceTable from './SizePriceTable.jsx';
import { perfumeApi } from '../../../api/endpoints.js';
import useApiResource from '../../../hooks/useApiResource.js';
import useDebounce from '../../../hooks/useDebounce.js';
import { useSnackbar } from '../../../context/SnackbarContext.jsx';
import { formatNumber } from '../../../utils/format.js';
import { brand, CARD_RADIUS, FONT, ICON, numericText, surface } from '../../../theme/index.js';
import { IMG } from '../../../utils/image.js';
import { changedPrices, currentRange, formatRange, newRange, sizeRows } from './sizePricing.js';

/**
 * Repricing perfumes by hand.
 *
 * Search, pick, and the perfume drops into a list you keep adding to — a price
 * revision is rarely one fragrance, and reopening this dialog for each one was
 * the only alternative to writing a spreadsheet.
 *
 * Every size is priced on its own, in the table that opens under each row.
 * Nothing is derived from anything else: setting the 1000gm price does not move
 * the 25gm, and a box left blank keeps that size exactly as it is. Only the
 * sizes actually edited are sent, so a perfume can be part-repriced safely.
 */
const SinglePriceUpdate = ({ onUpdated }) => {
  const snackbar = useSnackbar();

  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  const debouncedQuery = useDebounce(query, 300);

  const options = useApiResource(
    () => perfumeApi.priceSearch({ q: debouncedQuery, limit: 20 }),
    [debouncedQuery]
  );

  const chosen = useMemo(() => new Set(rows.map((row) => row.id)), [rows]);

  // A perfume already on the list is dropped from the dropdown rather than
  // added twice — two rows for one perfume is two sets of prices for it.
  const available = (options.data?.items || []).filter((option) => !chosen.has(option.id));

  const addRow = (option) => {
    if (!option || chosen.has(option.id)) return;
    // Newly added rows open on their sizes, because that is where the prices
    // are actually typed. Later rows can be collapsed away.
    setExpanded((current) => new Set(current).add(option.id));
    setRows((current) => [...current, { key: `${option.id}-${Date.now()}`, ...option, edits: {} }]);
  };

  /** One size of one perfume. Every box is independent of every other box. */
  const editSize = (id, sizeGrams, value) =>
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, edits: { ...row.edits, [sizeGrams]: value } } : row
      )
    );

  const clearRow = (id) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, edits: {} } : row)));

  const removeRow = (id) => setRows((current) => current.filter((row) => row.id !== id));

  const toggleRow = (id) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * Each row's sizes, worked out from whatever is in its boxes right now.
   *
   * Derived rather than stored, so a preview can never be left standing beside
   * a price that has since been edited.
   */
  const previews = rows.map((row) => {
    const sizes = sizeRows(row, row.edits);
    return {
      row,
      sizes,
      current: currentRange(sizes),
      next: newRange(sizes),
      changes: sizes.filter((size) => size.changed).length,
      blocked: sizes.some((size) => size.issue),
    };
  });

  const payload = previews
    .map((entry) => ({ id: entry.row.id, prices: changedPrices(entry.sizes) }))
    .filter((entry) => entry.prices.length);

  const blocked = previews.some((entry) => entry.blocked);
  const sizesAffected = previews.reduce((sum, entry) => sum + entry.changes, 0);

  const submit = async () => {
    setSaving(true);
    try {
      // Only the sizes that moved are sent; the server leaves the rest alone.
      const result = await perfumeApi.bulkUpdatePrices(payload);
      const { updated, failed = [] } = result.data || {};

      if (failed.length) {
        snackbar.warning(`${updated} repriced · ${failed.length} skipped — ${failed[0].reason}`);
      } else {
        snackbar.success(result.message);
      }

      setRows([]);
      setExpanded(new Set());
      setQuery('');
      onUpdated?.();
      // The perfumes just repriced should read back at their new prices.
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
          rows.length && !debouncedQuery
            ? 'Everything found is already on your list'
            : 'No perfume matches that name, brand or SKU'
        }
        renderOption={(props, option) => (
          <Box component="li" {...props} key={option.id}>
            <Avatar
              variant="rounded"
              src={IMG.avatar(option.image) || undefined}
              alt={option.name}
              sx={{ width: 36, height: 36, mr: 1.5, bgcolor: surface.plumSoft }}
            >
              <SellOutlined sx={{ fontSize: ICON.inline, color: brand.plumLight }} />
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {option.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {[option.brand, option.sku].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            {option.priceMax > 0 && (
              <Chip
                size="small"
                variant="outlined"
                label={formatRange({ min: option.priceMin, max: option.priceMax })}
                sx={{ ml: 1, flexShrink: 0 }}
              />
            )}
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            autoFocus
            placeholder="Search a perfume by name, brand or SKU to add it…"
            helperText="Open a perfume to set a price for any size. A box left blank keeps that price as it is."
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
        <Box
          sx={{
            mt: 2,
            py: 5,
            px: 3,
            textAlign: 'center',
            borderRadius: `${CARD_RADIUS}px`,
            bgcolor: surface.plumFaint,
          }}
        >
          <SellOutlined sx={{ fontSize: ICON.illustration, color: brand.plumLight, mb: 0.5 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Pick a perfume to reprice
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Add as many as you like. Each size is priced on its own — change only the ones you mean to.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
              On your list
            </Typography>
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={`${rows.length} perfume${rows.length === 1 ? '' : 's'}`}
            />
            <Button size="small" onClick={() => setRows([])} disabled={saving}>
              Clear all
            </Button>
          </Stack>

          <Box
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: `${CARD_RADIUS}px`,
              overflow: 'hidden',
            }}
          >
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 680 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 44 }} />
                    <TableCell>Perfume name</TableCell>
                    <TableCell align="right">Current price range</TableCell>
                    <TableCell align="right">New price range</TableCell>
                    <TableCell align="center">Sizes changing</TableCell>
                    <TableCell align="center" sx={{ width: 56 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previews.map(({ row, sizes, current, next, changes }) => {
                    const open = expanded.has(row.id);

                    return (
                      <Fragment key={row.key}>
                        <TableRow>
                          <TableCell>
                            <Tooltip title={open ? 'Hide sizes' : 'Show every size'}>
                              <IconButton size="small" onClick={() => toggleRow(row.id)}>
                                <KeyboardArrowDownRounded
                                  sx={{
                                    fontSize: ICON.action,
                                    transform: open ? 'rotate(180deg)' : 'none',
                                    transition: 'transform .18s ease',
                                  }}
                                />
                              </IconButton>
                            </Tooltip>
                          </TableCell>

                          <TableCell>
                            <Stack direction="row" spacing={1.25} alignItems="center">
                              <Avatar
                                variant="rounded"
                                src={IMG.avatar(row.image) || undefined}
                                alt={row.name}
                                sx={{ width: 34, height: 34, bgcolor: surface.plumSoft, flexShrink: 0 }}
                              >
                                <SellOutlined sx={{ fontSize: ICON.inline, color: brand.plumLight }} />
                              </Avatar>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                  {row.name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {row.sku} · {sizes.length} size{sizes.length === 1 ? '' : 's'}
                                </Typography>
                              </Box>
                            </Stack>
                          </TableCell>

                          <TableCell align="right">
                            <Tooltip title="Read from the catalogue — it cannot be edited here">
                              <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                                {formatRange(current)}
                              </Typography>
                            </Tooltip>
                          </TableCell>

                          <TableCell align="right">
                            <Typography
                              sx={{
                                ...numericText,
                                fontSize: FONT.body,
                                fontWeight: changes ? 700 : 400,
                                color: changes ? 'text.primary' : 'text.secondary',
                              }}
                            >
                              {formatRange(next)}
                            </Typography>
                          </TableCell>

                          <TableCell align="center">
                            {changes ? (
                              <Chip
                                size="small"
                                color="primary"
                                variant="outlined"
                                label={`${changes} of ${sizes.length}`}
                              />
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                no change
                              </Typography>
                            )}
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

                        {/* Where the repricing actually happens — one box per size. */}
                        <TableRow sx={{ '&:hover': { bgcolor: 'transparent' } }}>
                          <TableCell colSpan={6} sx={{ py: 0, border: 0 }}>
                            <Collapse in={open} timeout="auto" unmountOnExit>
                              <Box sx={{ py: 1.5 }}>
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  alignItems="center"
                                  sx={{ mb: 0.75, flexWrap: 'wrap', gap: 1 }}
                                >
                                  <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                                    Set a new price for any size. Leave a box blank and that price stays
                                    exactly as it is.
                                  </Typography>
                                  {changes > 0 && (
                                    <Button size="small" onClick={() => clearRow(row.id)} disabled={saving}>
                                      Reset sizes
                                    </Button>
                                  )}
                                </Stack>
                                <SizePriceTable
                                  rows={sizes}
                                  dense
                                  editable
                                  disabled={saving}
                                  onEdit={(sizeGrams, value) => editSize(row.id, sizeGrams, value)}
                                />
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </Fragment>
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
                    {sizesAffected}
                  </Box>{' '}
                  size{sizesAffected === 1 ? '' : 's'} will change price. Nothing is saved until you press
                  Apply.
                </>
              ) : (
                'Open a perfume and price the sizes you want to change.'
              )}
            </Typography>

            <Button
              variant="contained"
              onClick={submit}
              disabled={saving || blocked || !payload.length}
              startIcon={saving ? <CircularProgress size={15} color="inherit" /> : <PriceChangeOutlined />}
            >
              {saving ? 'Updating…' : `Apply price update (${payload.length})`}
            </Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
};

export default SinglePriceUpdate;
