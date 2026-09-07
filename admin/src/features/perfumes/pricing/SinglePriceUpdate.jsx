import { useMemo, useState } from 'react';
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

import PriceLadderTable from './PriceLadderTable.jsx';
import { perfumeApi } from '../../../api/endpoints.js';
import useApiResource from '../../../hooks/useApiResource.js';
import useDebounce from '../../../hooks/useDebounce.js';
import { useSnackbar } from '../../../context/SnackbarContext.jsx';
import { formatCurrency, formatNumber } from '../../../utils/format.js';
import { brand, CARD_RADIUS, FONT, ICON, numericText, surface } from '../../../theme/index.js';
import { IMG } from '../../../utils/image.js';
import { BASE_LABEL, basePriceIssue, parseBasePrice, repriceVariants } from './priceLadder.js';

/**
 * Repricing perfumes by hand.
 *
 * Built like the stock screen beside it: search, pick, and the perfume drops
 * into a list you keep adding to. A price revision is rarely one fragrance, and
 * closing and reopening this dialog for each one was the only alternative to
 * writing a spreadsheet.
 *
 * Only the kilo price is ever typed. The ladder is laid over the perfume's real
 * variants as you type — expand a row to see every size, old beside new — and
 * nothing is written until Apply. Those figures are a PREVIEW: the server
 * re-runs the same ladder from the base price on submit, so what lands in the
 * catalogue is the rule's answer rather than whatever the browser drew.
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
  // added twice — two rows for one perfume is two different prices for it.
  const available = (options.data?.items || []).filter((option) => !chosen.has(option.id));

  const addRow = (option) => {
    if (!option || chosen.has(option.id)) return;
    // Newly added rows open on their ladder, so the sizes being repriced are
    // visible without a second click. Later rows can be collapsed away.
    setExpanded((current) => new Set(current).add(option.id));
    setRows((current) => [...current, { key: `${option.id}-${Date.now()}`, ...option, newPrice: '' }]);
  };

  const editRow = (id, value) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, newPrice: value } : row)));

  const removeRow = (id) => setRows((current) => current.filter((row) => row.id !== id));

  const toggleRow = (id) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * A row's ladder, worked out from whatever is typed right now.
   *
   * Derived rather than stored, so a preview can never be left standing beside
   * a price that has since been edited — the reason the old single-perfume
   * screen needed a Generate button and a hook to clear it again.
   */
  const previewFor = (row) => {
    const typed = parseBasePrice(row.newPrice);
    const issue = row.newPrice === '' ? '' : basePriceIssue(typed);
    const priced = row.newPrice !== '' && !issue;

    const ladder = repriceVariants(row, priced ? typed : null);
    const changes = priced
      ? ladder.filter((size) => size.priced && size.newMrp !== null && size.newMrp !== size.currentMrp).length
      : 0;

    return { typed, issue, priced, ladder, changes };
  };

  const previews = rows.map((row) => ({ row, ...previewFor(row) }));

  const payload = previews
    .filter((entry) => entry.priced && entry.changes > 0)
    .map((entry) => ({ id: entry.row.id, basePrice: entry.typed }));

  const blocked = previews.some((entry) => entry.issue);
  const sizesAffected = previews.reduce((sum, entry) => sum + (entry.changes || 0), 0);

  const submit = async () => {
    setSaving(true);
    try {
      // Only the base prices are sent — the server derives every size itself.
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
            {option.basePrice > 0 && (
              <Chip
                size="small"
                variant="outlined"
                label={`${BASE_LABEL} ${formatCurrency(option.basePrice)}`}
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
            helperText={`Give each perfume its new ${BASE_LABEL} price — every other size follows from it.`}
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
          <SellOutlined sx={{ fontSize: ICON.illustration, color: brand.plumLight, mb: 0.5 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Pick a perfume to reprice
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Add as many as you like. Give each one the new {BASE_LABEL} price and the rest are worked out
            for you.
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

          {/* The stock tab's list, with the ladder folded in under each row. */}
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: `${CARD_RADIUS}px`, overflow: 'hidden' }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 680 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 44 }} />
                    <TableCell>Perfume name</TableCell>
                    <TableCell align="right">Current {BASE_LABEL} price</TableCell>
                    <TableCell align="right" sx={{ width: 172 }}>
                      New {BASE_LABEL} price
                    </TableCell>
                    <TableCell align="center">Sizes changing</TableCell>
                    <TableCell align="center" sx={{ width: 56 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previews.map(({ row, issue, priced, ladder, changes }) => {
                    const open = expanded.has(row.id);

                    return [
                      <TableRow key={row.key}>
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
                                {row.sku} · {ladder.length} size{ladder.length === 1 ? '' : 's'}
                              </Typography>
                            </Box>
                          </Stack>
                        </TableCell>

                        <TableCell align="right">
                          {/* "NA" is the catalogue's own way of saying a figure
                              is absent, so the reason moves into the tooltip
                              rather than filling the column with a sentence. */}
                          <Tooltip
                            title={
                              row.basePrice > 0
                                ? 'Read from the catalogue — it cannot be edited here'
                                : `This perfume is not sold in a ${BASE_LABEL} size`
                            }
                          >
                            <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                              {row.basePrice > 0 ? formatCurrency(row.basePrice) : 'NA'}
                            </Typography>
                          </Tooltip>
                        </TableCell>

                        <TableCell align="right">
                          <TextField
                            type="number"
                            value={row.newPrice}
                            onChange={(event) => editRow(row.id, event.target.value)}
                            disabled={saving}
                            error={Boolean(issue)}
                            // No blank placeholder line when the row is fine — it
                            // is laid out with the field and lifts the box off the
                            // row's centre line. Same as the stock table.
                            helperText={issue}
                            inputProps={{ step: 'any', min: 0, style: { textAlign: 'right' } }}
                            InputProps={{
                              startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                            }}
                            sx={{ width: 160 }}
                          />
                        </TableCell>

                        <TableCell align="center">
                          {!priced ? (
                            <Typography variant="body2" color="text.disabled">
                              NA
                            </Typography>
                          ) : changes ? (
                            <Chip size="small" color="primary" variant="outlined" label={`${changes} of ${ladder.length}`} />
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
                      </TableRow>,

                      /* The ladder itself, in the shared table both flows use. */
                      <TableRow key={`${row.key}-sizes`} sx={{ '&:hover': { bgcolor: 'transparent' } }}>
                        <TableCell colSpan={6} sx={{ py: 0, border: 0 }}>
                          <Collapse in={open} timeout="auto" unmountOnExit>
                            <Box sx={{ py: 1.5 }}>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block', mb: 0.75 }}
                              >
                                {priced
                                  ? 'What this perfume would sell at once applied'
                                  : 'Selling at these prices today'}
                              </Typography>
                              <PriceLadderTable rows={ladder} dense />
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>,
                    ];
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
                `Enter the new ${BASE_LABEL} price against each perfume.`
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
