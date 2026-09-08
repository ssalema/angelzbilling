import { Fragment, useMemo, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import CloudUpload from '@mui/icons-material/CloudUpload';
import PriceChangeOutlined from '@mui/icons-material/PriceChangeOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';
import SellOutlined from '@mui/icons-material/SellOutlined';

import Dropzone from '../../../components/common/Dropzone.jsx';
import Pagination from '../../../components/common/Pagination.jsx';
import SizePriceTable from './SizePriceTable.jsx';
import { perfumeApi } from '../../../api/endpoints.js';
import { useSnackbar } from '../../../context/SnackbarContext.jsx';
import { formatNumber, truncate } from '../../../utils/format.js';
import { readSheet, SheetError, SHEET_TYPES } from '../../../utils/spreadsheet.js';
import { brand, CARD_RADIUS, FONT, ICON, numericText, surface } from '../../../theme/index.js';
import { IMG } from '../../../utils/image.js';
import { currentRange, formatRange, newRange } from './sizePricing.js';
import {
  COLUMN_NAME,
  PRICE_COLUMNS,
  SHEET_RULES,
  applyMatches,
  buildSheetRows,
  findColumns,
  reviewRowsFor,
} from './priceSheet.js';

/** How many review rows are drawn at once — a thousand-row sheet is normal here. */
const PAGE_SIZE = 25;

/**
 * Repricing a whole catalogue from a spreadsheet.
 *
 * The file is read in the browser and thrown away: it is never uploaded, never
 * written to the media library, never parked on the server or in the database.
 * What leaves this screen is a list of names to look up, and — only after the
 * admin has reviewed and pressed the update button — a list of ids and the
 * per-size prices they approved. Close the dialog before that and nothing has
 * happened at all.
 *
 * The sheet carries one column per fill. Every size is independent, and a blank
 * cell means that size keeps the price it has — never that a price should be
 * worked out for it.
 */
const BulkPriceUpdate = ({ onUpdated }) => {
  const snackbar = useSnackbar();

  // 'idle' → 'reading' → 'review' → 'saving' → 'done'
  const [stage, setStage] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(() => new Set());

  const reset = () => {
    setStage('idle');
    setProgress(0);
    setFileName('');
    setRows([]);
    setSummary(null);
    setPage(1);
    setExpanded(new Set());
  };

  const toggleRow = (key) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /**
   * Reads the chosen file and matches it against the catalogue.
   *
   * `file` is only ever a local handle — it is read into rows here and goes out
   * of scope when this returns, so nothing holds the spreadsheet afterwards.
   */
  const handleFiles = async (fileList) => {
    const file = [...(fileList || [])][0];
    if (!file) return;

    setStage('reading');
    setProgress(0);
    setFileName(file.name);

    try {
      // The sheet itself is 0–80% of the bar; matching it is the rest.
      const { headers, rows: records } = await readSheet(file, (value) =>
        setProgress(Math.round(value * 0.8))
      );

      const columns = findColumns(headers);
      if (!columns.name) {
        throw new SheetError(
          `This sheet has no "${COLUMN_NAME}" column. Rename the header row and try again.`
        );
      }
      if (!columns.sizes.length) {
        throw new SheetError(
          'This sheet has no size price columns. Add at least one — for example ' +
            `"${PRICE_COLUMNS[PRICE_COLUMNS.length - 1]}" — and try again.`
        );
      }
      if (!records.length) throw new SheetError('That sheet has a header row but no perfumes under it.');

      const sheetRows = buildSheetRows(records, columns);

      // Only rows that survived the sheet's own rules are worth a lookup.
      const names = sheetRows.filter((row) => !row.issue).map((row) => row.name);
      if (!names.length) {
        setRows(sheetRows.map((row) => ({ ...row, matched: false })));
        setStage('review');
        return;
      }

      setProgress(90);
      const matches = await perfumeApi.resolvePriceNames(names);

      setProgress(100);
      // Each match is expanded into per-size rows here so the admin reviews the
      // real before/after for every fill, not just the cells they typed.
      setRows(
        applyMatches(sheetRows, matches).map((row) =>
          row.matched ? { ...row, sizes: reviewRowsFor(row) } : row
        )
      );
      setPage(1);
      setStage('review');
    } catch (error) {
      snackbar.error(error.message);
      reset();
    }
  };

  const matched = useMemo(() => rows.filter((row) => row.matched), [rows]);
  const flagged = useMemo(() => rows.filter((row) => !row.matched), [rows]);

  /** Only the sizes that actually move travel — the server leaves the rest alone. */
  const payload = useMemo(
    () =>
      matched
        .map((row) => ({
          id: row.id,
          prices: row.sizes.filter((size) => size.changed).map((s) => ({ sizeGrams: s.sizeGrams, mrp: s.newMrp })),
        }))
        .filter((row) => row.prices.length),
    [matched]
  );

  const sizesAffected = payload.reduce((sum, row) => sum + row.prices.length, 0);
  const visible = matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const submit = async () => {
    setStage('saving');
    try {
      const result = await perfumeApi.bulkUpdatePrices(payload);
      // The parsed rows are dropped here along with everything read from the
      // file — only the counts stay on screen.
      setSummary({ ...result.data, message: result.message, flagged });
      setRows([]);
      setStage('done');
      onUpdated?.();
    } catch (error) {
      snackbar.error(error.message);
      setStage('review');
    }
  };

  /* ───────────────────────────── Reading ───────────────────────────── */

  if (stage === 'reading') {
    return (
      <Box sx={{ py: 6, px: 3, textAlign: 'center' }}>
        <Stack alignItems="center" spacing={1.5}>
          <CircularProgress size={30} />
          <Typography variant="body2" color="text.secondary">
            Uploading… {progress}%
          </Typography>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ width: '85%', borderRadius: 2, height: 6 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ pt: 0.5 }}>
            Reading {truncate(fileName, 46)} in your browser — the file is not being uploaded anywhere.
          </Typography>
        </Stack>
      </Box>
    );
  }

  /* ───────────────────────────── Done ───────────────────────────── */

  if (stage === 'done') {
    return (
      <Box>
        <Stack alignItems="center" spacing={1} sx={{ py: 3, textAlign: 'center' }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: surface.successSoft,
            }}
          >
            <CheckCircleOutline sx={{ fontSize: ICON.illustration, color: 'success.main' }} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {summary.message}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460 }}>
            The spreadsheet has been discarded — nothing from it was saved anywhere in the app.
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1.5} justifyContent="center" sx={{ mb: 2.5 }}>
          <SummaryTile label="Repriced" value={summary.updated} tone="success.main" />
          <SummaryTile label="Sizes updated" value={summary.repricedSizes} tone="text.primary" />
          <SummaryTile
            label="Skipped"
            value={summary.skipped + summary.flagged.length}
            tone={summary.skipped + summary.flagged.length ? 'warning.main' : 'text.secondary'}
          />
        </Stack>

        {(summary.flagged.length > 0 || summary.failed.length > 0) && (
          <Alert severity="warning" icon={<ReportProblemOutlined />} sx={{ alignItems: 'flex-start' }}>
            <AlertTitle sx={{ fontWeight: 700 }}>
              {summary.flagged.length + summary.failed.length} row(s) were not applied
            </AlertTitle>
            <Box component="ul" sx={{ m: 0, pl: 2.25, maxHeight: 220, overflow: 'auto' }}>
              {summary.flagged.map((row) => (
                <Box component="li" key={row.key}>
                  <Typography variant="caption" color="text.secondary">
                    Row {row.line} · <strong>{row.name || '(blank)'}</strong> — {row.issue}
                  </Typography>
                </Box>
              ))}
              {summary.failed.map((row, index) => (
                <Box component="li" key={`failed-${index}`}>
                  <Typography variant="caption" color="text.secondary">
                    {row.name ? <strong>{row.name}</strong> : 'Some rows'} — {row.reason}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Alert>
        )}

        <Divider sx={{ my: 2.25 }} />
        <Stack direction="row" justifyContent="flex-end">
          <Button variant="outlined" startIcon={<RestartAltRounded />} onClick={reset}>
            Upload another sheet
          </Button>
        </Stack>
      </Box>
    );
  }

  /* ───────────────────────────── Review ───────────────────────────── */

  if (stage === 'review' || stage === 'saving') {
    const saving = stage === 'saving';

    return (
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
            {truncate(fileName, 40)}
          </Typography>
          <Chip size="small" color="primary" variant="outlined" label={`${matched.length} matched`} />
          {flagged.length > 0 && (
            <Chip size="small" color="warning" variant="outlined" label={`${flagged.length} flagged`} />
          )}
          <Button size="small" onClick={reset} disabled={saving} startIcon={<RestartAltRounded />}>
            Choose a different file
          </Button>
        </Stack>

        <Alert severity="info" sx={{ mb: 2 }}>
          Nothing has been saved yet. Open a row to see every size — the ones your sheet priced, and the
          ones left blank, which keep the price they already have.
        </Alert>

        {flagged.length > 0 && (
          <Alert severity="warning" icon={<ReportProblemOutlined />} sx={{ mb: 2, alignItems: 'flex-start' }}>
            <AlertTitle sx={{ fontWeight: 700 }}>{flagged.length} row(s) will be skipped</AlertTitle>
            <Box component="ul" sx={{ m: 0, pl: 2.25, maxHeight: 150, overflow: 'auto' }}>
              {flagged.map((row) => (
                <Box component="li" key={row.key}>
                  <Typography variant="caption" color="text.secondary">
                    Row {row.line} · <strong>{row.name || '(blank)'}</strong> — {row.issue}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Alert>
        )}

        {matched.length > 0 && (
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
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visible.map((row) => {
                    const open = expanded.has(row.key);
                    const changing = row.sizes.filter((size) => size.changed).length;

                    return (
                      <Fragment key={row.key}>
                        <TableRow>
                          <TableCell>
                            <Tooltip title={open ? 'Hide sizes' : 'Show every size'}>
                              <IconButton size="small" onClick={() => toggleRow(row.key)}>
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
                                alt={row.perfumeName}
                                sx={{ width: 34, height: 34, bgcolor: surface.plumSoft, flexShrink: 0 }}
                              >
                                <SellOutlined sx={{ fontSize: ICON.inline, color: brand.plumLight }} />
                              </Avatar>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                  {row.perfumeName}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {row.sku} · row {row.line}
                                </Typography>
                                {row.skippedSizes?.length > 0 && (
                                  <Typography
                                    variant="caption"
                                    color="warning.main"
                                    sx={{ display: 'block' }}
                                  >
                                    Not sold in {row.skippedSizes.join(', ')} — those cells were ignored
                                  </Typography>
                                )}
                              </Box>
                            </Stack>
                          </TableCell>

                          <TableCell align="right">
                            <Typography variant="body2" color="text.secondary">
                              {formatRange(currentRange(row.sizes))}
                            </Typography>
                          </TableCell>

                          <TableCell align="right">
                            <Typography
                              sx={{
                                ...numericText,
                                fontSize: FONT.body,
                                fontWeight: changing ? 700 : 400,
                                color: changing ? 'text.primary' : 'text.secondary',
                              }}
                            >
                              {formatRange(newRange(row.sizes))}
                            </Typography>
                          </TableCell>

                          <TableCell align="center">
                            {changing ? (
                              <Chip
                                size="small"
                                color="primary"
                                variant="outlined"
                                label={`${changing} of ${row.sizes.length}`}
                              />
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                no change
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* The sizes themselves, in the table both flows share. */}
                        <TableRow sx={{ '&:hover': { bgcolor: 'transparent' } }}>
                          <TableCell colSpan={5} sx={{ py: 0, border: 0 }}>
                            <Collapse in={open} timeout="auto" unmountOnExit>
                              <Box sx={{ py: 1.5 }}>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ display: 'block', mb: 0.75 }}
                                >
                                  What this perfume would sell at once applied
                                </Typography>
                                <SizePriceTable rows={row.sizes} dense />
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

            {matched.length > PAGE_SIZE && (
              <Pagination
                page={page}
                limit={PAGE_SIZE}
                total={matched.length}
                onPageChange={setPage}
                rowsPerPageOptions={[PAGE_SIZE]}
              />
            )}
          </Box>
        )}

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
                size{sizesAffected === 1 ? '' : 's'} will change price.
              </>
            ) : (
              'No row would change a price.'
            )}
          </Typography>

          <Button
            variant="contained"
            onClick={submit}
            disabled={saving || !payload.length}
            startIcon={saving ? <CircularProgress size={15} color="inherit" /> : <PriceChangeOutlined />}
          >
            {saving ? 'Updating…' : `Update ${payload.length} perfume${payload.length === 1 ? '' : 's'}`}
          </Button>
        </Stack>
      </Box>
    );
  }

  /* ───────────────────────────── Instructions ───────────────────────────── */

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2, alignItems: 'flex-start' }}>
        <AlertTitle sx={{ fontWeight: 700 }}>Before you upload</AlertTitle>
        <Box component="ol" sx={{ m: 0, pl: 2.25 }}>
          {SHEET_RULES.map((rule) => (
            <Box component="li" key={rule} sx={{ mb: 0.25 }}>
              <Typography variant="body2" color="text.secondary">
                {rule}
              </Typography>
            </Box>
          ))}
        </Box>
      </Alert>

      {/* What the sheet has to look like, rather than four more lines of prose. */}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: 0.75, textAlign: 'center' }}
      >
        Sample — this is how your sheet should look. The blank 100gm cell leaves that price unchanged.
      </Typography>
      <Box
        sx={{
          mb: 2,
          borderRadius: `${CARD_RADIUS}px`,
          border: 1,
          borderColor: 'divider',
          overflow: 'hidden',
          width: 'fit-content',
          maxWidth: '100%',
          // Centred under its caption: a shrink-to-fit table pinned left in a
          // wide dialog reads as though it had drifted out of place.
          mx: 'auto',
        }}
      >
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ width: 'auto' }}>
            <TableHead>
              <TableRow>
                <TableCell>{COLUMN_NAME}</TableCell>
                <TableCell align="right">25gm Price</TableCell>
                <TableCell align="right">100gm Price</TableCell>
                <TableCell align="right">1000gm Price</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[
                ['ZUMAR BY AHMED AL MAGRIBI', '900', '3600', '35000'],
                ['ZUBEIDA', '150', '', '5600'],
              ].map(([name, ...cells]) => (
                <TableRow key={name}>
                  <TableCell>
                    <Typography variant="caption">{name}</Typography>
                  </TableCell>
                  {cells.map((cell, index) => (
                    <TableCell key={index} align="right">
                      <Typography variant="caption" sx={{ ...numericText, fontSize: FONT.tiny }}>
                        {cell}
                      </Typography>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>

      <Dropzone accept={SHEET_TYPES} label="Choose a price spreadsheet" onFiles={handleFiles} sx={{ py: 4, px: 3 }}>
        <CloudUpload sx={{ fontSize: ICON.illustration, color: brand.plumLight, mb: 1 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Drag & drop your price sheet here
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          or click to browse · .xlsx or .csv up to 5MB
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          Read in your browser only — the file is never uploaded or stored
        </Typography>
      </Dropzone>
    </Box>
  );
};

/** One figure from the run — repriced, sizes touched, or skipped. */
const SummaryTile = ({ label, value, tone }) => (
  <Box
    sx={{
      px: 3,
      py: 1.5,
      borderRadius: `${CARD_RADIUS}px`,
      bgcolor: surface.plumFaint,
      textAlign: 'center',
      minWidth: 120,
    }}
  >
    <Typography sx={{ ...numericText, fontSize: FONT.figureMd, color: tone }}>
      {formatNumber(value)}
    </Typography>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
  </Box>
);

export default BulkPriceUpdate;
