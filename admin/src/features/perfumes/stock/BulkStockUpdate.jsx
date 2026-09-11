import { useMemo, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  InputAdornment,
  LinearProgress,
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
import CloudUpload from '@mui/icons-material/CloudUpload';
import AddchartOutlined from '@mui/icons-material/AddchartOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';

import Dropzone from '../../../components/common/Dropzone.jsx';
import Pagination from '../../../components/common/Pagination.jsx';
import { perfumeApi } from '../../../api/endpoints.js';
import { useSnackbar } from '../../../context/SnackbarContext.jsx';
import { formatGrams, formatNumber, truncate } from '../../../utils/format.js';
import { readSheet, SheetError, SHEET_TYPES } from '../../../utils/spreadsheet.js';
import { brand, CARD_RADIUS, FONT, ICON, numericText, surface } from '../../../theme/index.js';
import {
  COLUMN_NAME,
  COLUMN_STOCK,
  SHEET_RULES,
  applyMatches,
  buildSheetRows,
  findColumns,
  parseTypedGrams,
} from './stockSheet.js';

/** How many review rows are drawn at once — a thousand-row sheet is normal here. */
const PAGE_SIZE = 25;

// Restocking a whole delivery from a spreadsheet.
const BulkStockUpdate = ({ onUpdated }) => {
  const snackbar = useSnackbar();

  // 'idle' → 'reading' → 'review' → 'saving' → 'done'
  const [stage, setStage] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(1);

  const reset = () => {
    setStage('idle');
    setProgress(0);
    setFileName('');
    setRows([]);
    setSummary(null);
    setPage(1);
  };

  // Reads the chosen file and matches it against the catalogue.
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
      if (!columns.name || !columns.stock) {
        const missing = [!columns.name && COLUMN_NAME, !columns.stock && COLUMN_STOCK].filter(Boolean);
        throw new SheetError(
          `This sheet has no ${missing.map((column) => `"${column}"`).join(' or ')} column. ` +
            `Rename the header row to exactly "${COLUMN_NAME}" and "${COLUMN_STOCK}" and try again.`
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
      const matches = await perfumeApi.resolveStockNames(names);

      setProgress(100);
      setRows(applyMatches(sheetRows, matches));
      setPage(1);
      setStage('review');
    } catch (error) {
      snackbar.error(error.message);
      reset();
    }
  };

  /** Editing one row's grams. Everything downstream is derived, never stored. */
  const editRow = (key, value) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, newStock: value } : row)));

  const matched = useMemo(() => rows.filter((row) => row.matched), [rows]);
  const flagged = useMemo(() => rows.filter((row) => !row.matched), [rows]);

  /** The rows that will actually be sent — a matched row with valid grams on it. */
  const payload = useMemo(
    () =>
      matched
        .map((row) => ({ id: row.id, addStock: parseTypedGrams(row.newStock) }))
        .filter((row) => Number.isFinite(row.addStock) && row.addStock > 0),
    [matched]
  );

  const invalidEdits = matched.length - payload.length;

  const totalIncoming = payload.reduce((sum, row) => sum + row.addStock, 0);

  const visible = matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const submit = async () => {
    setStage('saving');
    try {
      const result = await perfumeApi.bulkAddStock(payload);
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
          <SummaryTile label="Updated" value={summary.updated} tone="success.main" />
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
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}
        >
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
          Nothing has been saved yet. Every <strong>New stock</strong> figure below is added to what the
          perfume already holds — edit any of them, then press Update stock to commit the lot.
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
                    <TableCell>Perfume name</TableCell>
                    <TableCell align="right">Available stock</TableCell>
                    <TableCell align="right" sx={{ width: 150 }}>
                      New stock (gm)
                    </TableCell>
                    <TableCell align="right">Final stock</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visible.map((row) => {
                    const grams = parseTypedGrams(row.newStock);
                    const invalid = !Number.isFinite(grams) || grams <= 0;

                    return (
                      <TableRow key={row.key}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {row.perfumeName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.sku} · row {row.line}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Read from the catalogue — it cannot be edited here">
                            <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                              {formatGrams(row.available)}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            type="text"
                            inputMode="decimal"
                            value={row.newStock}
                            onChange={(event) => editRow(row.key, event.target.value.replace(/[^\d.]/g, ''))}
                            disabled={saving}
                            error={invalid}
                            inputProps={{ style: { textAlign: 'right' } }}
                            InputProps={{
                              endAdornment: <InputAdornment position="end">gm</InputAdornment>,
                            }}
                            sx={{ width: 138 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            sx={{
                              ...numericText,
                              fontSize: FONT.body,
                              color: invalid ? 'text.disabled' : 'text.primary',
                            }}
                          >
                            {invalid ? 'NA' : formatGrams(row.available + grams)}
                          </Typography>
                        </TableCell>
                      </TableRow>
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
                  {formatGrams(totalIncoming)}
                </Box>{' '}
                going in
                {invalidEdits > 0 && ` · ${invalidEdits} row(s) left blank or invalid will be skipped`}
              </>
            ) : (
              'No row carries a valid weight to add.'
            )}
          </Typography>

          <Button
            variant="contained"
            onClick={submit}
            disabled={saving || !payload.length}
            startIcon={saving ? <CircularProgress size={15} color="inherit" /> : <AddchartOutlined />}
          >
            {saving ? 'Updating…' : `Update stock (${payload.length})`}
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
          Centred, and on the same 14px corner every Card in the panel carries,
          so the specimen sits in the system rather than beside it. */}
      <Box sx={{ mb: 2, mx: 'auto', maxWidth: 360 }}>
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
                <TableCell align="right">{COLUMN_STOCK}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[
                ['ZUMAR BY AHMED AL MAGRIBI', '1500'],
                ['ZUBEIDA', '500'],
              ].map(([name, stock]) => (
                <TableRow key={name}>
                  <TableCell>
                    <Typography variant="caption">{name}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="caption" sx={{ ...numericText, fontSize: FONT.tiny }}>
                      {stock}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>

      <Dropzone accept={SHEET_TYPES} label="Choose a stock spreadsheet" onFiles={handleFiles} sx={{ py: 4, px: 3 }}>
        <CloudUpload sx={{ fontSize: ICON.illustration, color: brand.plumLight, mb: 1 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Drag & drop your stock sheet here
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

/** One figure from the run — updated, or skipped. */
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

export default BulkStockUpdate;
