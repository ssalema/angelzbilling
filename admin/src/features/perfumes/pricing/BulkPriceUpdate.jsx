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
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import SellOutlined from '@mui/icons-material/SellOutlined';

import Dropzone from '../../../components/common/Dropzone.jsx';
import Pagination from '../../../components/common/Pagination.jsx';
import PriceLadderTable from './PriceLadderTable.jsx';
import { perfumeApi } from '../../../api/endpoints.js';
import { useSnackbar } from '../../../context/SnackbarContext.jsx';
import { formatCurrency, formatNumber, truncate } from '../../../utils/format.js';
import { readSheet, SheetError, SHEET_TYPES } from '../../../utils/spreadsheet.js';
import { brand, CARD_RADIUS, FONT, ICON, numericText, surface } from '../../../theme/index.js';
import { IMG } from '../../../utils/image.js';
import { BASE_LABEL, repriceVariants } from './priceLadder.js';
import { COLUMN_NAME, COLUMN_PRICE, SHEET_RULES, applyMatches, buildSheetRows, findColumns } from './priceSheet.js';

/** How many review rows are drawn at once — a thousand-row sheet is normal here. */
const PAGE_SIZE = 25;

/**
 * Repricing a whole catalogue from a spreadsheet.
 *
 * The file is read in the browser and thrown away: it is never uploaded, never
 * written to the media library, never parked on the server or in the database.
 * What leaves this screen is a list of names to look up, and — only after the
 * admin has reviewed and pressed the update button — a list of ids and kilo
 * prices. Close the dialog before that and nothing has happened at all.
 *
 * The sheet carries ONE price per perfume: what a kilo costs. Every other fill
 * is derived by the size ladder, previewed per perfume here, and derived again
 * server-side on submit — the sheet never dictates a per-size figure, so a
 * hand-edited column cannot smuggle one in.
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
  // A Set, not one open row: reviewing a sheet means comparing perfumes, and
  // the single tab opens the same way.
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
      if (!columns.name || !columns.price) {
        const missing = [!columns.name && COLUMN_NAME, !columns.price && COLUMN_PRICE].filter(Boolean);
        throw new SheetError(
          `This sheet has no ${missing.map((column) => `"${column}"`).join(' or ')} column. ` +
            `Rename the header row to exactly "${COLUMN_NAME}" and "${COLUMN_PRICE}" and try again.`
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
      // The ladder is laid over each match here so the admin reviews real
      // per-size figures, not just the kilo price they typed into the sheet.
      setRows(
        applyMatches(sheetRows, matches).map((row) =>
          row.matched ? { ...row, ladder: repriceVariants(row, row.basePrice) } : row
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

  /** Only the base price travels — the server runs the ladder itself. */
  const payload = useMemo(
    () => matched.map((row) => ({ id: row.id, basePrice: row.basePrice })),
    [matched]
  );

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
          Nothing has been saved yet. Each perfume below shows its new {BASE_LABEL} price — open a row to
          see every size the ladder generated for it.
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
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: `${CARD_RADIUS}px`, overflow: 'hidden' }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 620 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 44 }} />
                    <TableCell>Perfume name</TableCell>
                    <TableCell align="right">Current {BASE_LABEL}</TableCell>
                    <TableCell align="right">New {BASE_LABEL}</TableCell>
                    <TableCell align="center">Sizes changing</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visible.map((row) => {
                    const open = expanded.has(row.key);
                    const changing = row.ladder.filter(
                      (size) => size.priced && size.newMrp !== size.currentMrp
                    ).length;

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
                              </Box>
                            </Stack>
                          </TableCell>

                          <TableCell align="right">
                            <Typography variant="body2" color="text.secondary">
                              {row.currentBase > 0 ? formatCurrency(row.currentBase) : 'NA'}
                            </Typography>
                          </TableCell>

                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
                              <ArrowForwardRounded sx={{ fontSize: ICON.inline, color: 'text.disabled' }} />
                              <Typography sx={{ ...numericText, fontSize: FONT.body, fontWeight: 700 }}>
                                {formatCurrency(row.basePrice)}
                              </Typography>
                            </Stack>
                          </TableCell>

                          <TableCell align="center">
                            {changing ? (
                              <Chip
                                size="small"
                                color="primary"
                                variant="outlined"
                                label={`${changing} of ${row.ladder.length}`}
                              />
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                no change
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* The ladder itself, in the shared table both flows use. */}
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
                                <PriceLadderTable rows={row.ladder} dense />
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
            {payload.length
              ? `${formatNumber(payload.length)} perfume${payload.length === 1 ? '' : 's'} ready to reprice.`
              : 'No row matched a perfume in the catalogue.'}
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

      {/* What the sheet has to look like, rather than four more lines of prose.
          Centred on a Card's 14px corner, same as the stock dialog's specimen. */}
      <Box sx={{ mb: 2, mx: 'auto', maxWidth: 380 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', textAlign: 'center', mb: 0.75 }}
        >
          Sample — this is how your sheet should look
        </Typography>

        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: `${CARD_RADIUS}px`, overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{COLUMN_NAME}</TableCell>
                <TableCell align="right">{COLUMN_PRICE}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[
                ['ZUMAR BY AHMED AL MAGRIBI', '34750'],
                ['ZUBEIDA', '5500'],
              ].map(([name, price]) => (
                <TableRow key={name}>
                  <TableCell>
                    <Typography variant="caption">{name}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="caption" sx={{ ...numericText, fontSize: FONT.tiny }}>
                      {price}
                    </Typography>
                  </TableCell>
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
    sx={{ px: 3, py: 1.5, borderRadius: `${CARD_RADIUS}px`, bgcolor: surface.plumFaint, textAlign: 'center', minWidth: 120 }}
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
