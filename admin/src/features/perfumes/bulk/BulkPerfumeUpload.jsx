import { useMemo, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
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
import LibraryAddOutlined from '@mui/icons-material/LibraryAddOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined';

import Dropzone from '../../../components/common/Dropzone.jsx';
import Pagination from '../../../components/common/Pagination.jsx';
import StatusChip from '../../../components/common/StatusChip.jsx';
import { perfumeApi, uploadApi } from '../../../api/endpoints.js';
import { useSnackbar } from '../../../context/SnackbarContext.jsx';
import { formatCurrency, formatGrams, formatNumber, truncate } from '../../../utils/format.js';
import { readSheet, SheetError, SHEET_TYPES } from '../../../utils/spreadsheet.js';
import { IMAGE_TYPES, MAX_UPLOAD_BYTES } from '../../../utils/constants.js';
import { IMG } from '../../../utils/image.js';
import { brand, CARD_RADIUS, FONT, ICON, numericText, surface } from '../../../theme/index.js';
import {
  COLUMN_CATEGORY,
  COLUMN_NAME,
  COLUMN_STOCK,
  MAX_SHEET_ROWS,
  SHEET_RULES,
  applyChecks,
  buildSheetRows,
  findColumns,
  statusFor,
  toPayload,
} from './catalogueSheet.js';

/** How many review rows are drawn at once — a thousand-row sheet is the point here. */
const PAGE_SIZE = 25;

/**
 * Adding a whole catalogue from a spreadsheet.
 *
 * The wizard next door is untouched and stays the way to add one perfume
 * properly — with its media, features, FAQs and every field it asks for. This
 * screen is for the other job: getting a thousand fragrances into the catalogue
 * in one go, with the handful of fields a shop actually has for all of them.
 *
 * The file is read in the browser and thrown away, exactly as the stock and
 * price sheets are: it is never uploaded, never written to the media library
 * and never parked on the server. What leaves this screen is a list of names to
 * check, and — only after the admin has reviewed the rows and pressed Add
 * perfumes — the rows themselves. Close the dialog before that and nothing has
 * happened at all.
 *
 * SKUs are never read from the sheet. The catalogue numbers its own new rows
 * and the server hands the block out, so the review table shows the number each
 * perfume is about to be given rather than one this screen made up.
 */
const BulkPerfumeUpload = ({ onCreated }) => {
  const snackbar = useSnackbar();

  // 'idle' → 'reading' → 'review' → 'saving' → 'done'
  const [stage, setStage] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(1);

  const reset = () => {
    // Photos added on the review screen are already in the media library, so
    // walking away from the sheet has to take them with it — otherwise every
    // abandoned run leaves images nothing will ever point at.
    rows.forEach((row) => {
      if (row.photoPublicId) uploadApi.remove(row.photoPublicId, 'image').catch(() => {});
    });

    setStage('idle');
    setProgress(0);
    setFileName('');
    setRows([]);
    setSizes([]);
    setSummary(null);
    setPage(1);
  };

  /**
   * A photo the admin picked for one row, already uploaded.
   *
   * Replacing a picture drops the one it replaces, so a row that was
   * photographed twice does not leave the first attempt behind.
   */
  const setPhoto = (key, asset) =>
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row;
        if (row.photoPublicId && row.photoPublicId !== asset.publicId) {
          uploadApi.remove(row.photoPublicId, 'image').catch(() => {});
        }
        return { ...row, photo: asset.url, photoPublicId: asset.publicId || '' };
      })
    );

  /**
   * Reads the chosen file and checks it against the catalogue.
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
      // The sheet itself is 0–80% of the bar; checking it is the rest.
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
          'This sheet has no price columns. Add at least one — for example "100gm Price" — and try again.'
        );
      }
      if (!records.length) throw new SheetError('That sheet has a header row but no perfumes under it.');
      if (records.length > MAX_SHEET_ROWS) {
        throw new SheetError(
          `That sheet has ${formatNumber(records.length)} rows. Up to ${formatNumber(MAX_SHEET_ROWS)} ` +
            'perfumes can be uploaded at once — split it and upload the halves one after the other.'
        );
      }

      const sheetRows = buildSheetRows(records, columns);
      setSizes(columns.sizes.map((size) => size.grams));

      // Only rows that survived the sheet's own rules are worth checking.
      const names = sheetRows.filter((row) => !row.issue).map((row) => row.name);
      if (!names.length) {
        setRows(sheetRows.map((row) => ({ ...row, ready: false })));
        setStage('review');
        return;
      }

      setProgress(90);
      const checks = await perfumeApi.previewBulkCreate(names);

      setProgress(100);
      setRows(applyChecks(sheetRows, checks));
      setPage(1);
      setStage('review');
    } catch (error) {
      snackbar.error(error.message);
      reset();
    }
  };

  const ready = useMemo(() => rows.filter((row) => row.ready), [rows]);
  const flagged = useMemo(() => rows.filter((row) => !row.ready), [rows]);

  /** The sizes actually priced by at least one row — the table's price columns. */
  const pricedSizes = useMemo(() => {
    const used = new Set();
    ready.forEach((row) => row.prices.forEach((price) => used.add(price.sizeGrams)));
    return sizes.filter((grams) => used.has(grams));
  }, [ready, sizes]);

  const drafts = useMemo(() => ready.filter((row) => !row.photo).length, [ready]);

  const visible = ready.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const submit = async () => {
    setStage('saving');
    try {
      const result = await perfumeApi.bulkCreatePerfumes(toPayload(ready));
      // The parsed rows are dropped here along with everything read from the
      // file — only the counts stay on screen.
      setSummary({ ...result.data, message: result.message, flagged });
      setRows([]);
      setStage('done');
      onCreated?.();
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
    const notAdded = summary.skipped + summary.flagged.length;

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
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480 }}>
            The spreadsheet has been discarded — nothing from it was saved anywhere in the app.
            {summary.drafts > 0 &&
              ' The perfumes with no photo were saved as drafts; add an image to publish them.'}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1.5} justifyContent="center" sx={{ mb: 2.5, flexWrap: 'wrap', gap: 1.5 }}>
          <SummaryTile label="Published" value={summary.published} tone="success.main" />
          <SummaryTile label="Drafts" value={summary.drafts} tone={summary.drafts ? 'warning.main' : 'text.secondary'} />
          <SummaryTile label="Skipped" value={notAdded} tone={notAdded ? 'warning.main' : 'text.secondary'} />
        </Stack>

        {notAdded > 0 && (
          <Alert severity="warning" icon={<ReportProblemOutlined />} sx={{ alignItems: 'flex-start' }}>
            <AlertTitle sx={{ fontWeight: 700 }}>{notAdded} row(s) were not added</AlertTitle>
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
          <Chip size="small" color="primary" variant="outlined" label={`${ready.length} ready`} />
          {flagged.length > 0 && (
            <Chip size="small" color="warning" variant="outlined" label={`${flagged.length} flagged`} />
          )}
          <Button size="small" onClick={reset} disabled={saving} startIcon={<RestartAltRounded />}>
            Choose a different file
          </Button>
        </Stack>

        <Alert severity="info" sx={{ mb: 2 }}>
          Nothing has been saved yet. Each perfume below will be created with the{' '}
          <strong>SKU shown</strong>, carrying on from the last one in your catalogue. Click a{' '}
          <strong>photo slot</strong> to add that perfume’s picture from your computer — a row left
          without one is saved as a draft. Press Add perfumes to create the lot.
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

        {ready.length > 0 && (
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: `${CARD_RADIUS}px`, overflow: 'hidden' }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 260 + pricedSizes.length * 92 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 72 }}>Photo</TableCell>
                    <TableCell>Perfume name</TableCell>
                    <TableCell align="right">Stock</TableCell>
                    {pricedSizes.map((grams) => (
                      <TableCell key={grams} align="right">
                        {grams}gm
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visible.map((row) => {
                    const bySize = new Map(row.prices.map((price) => [price.sizeGrams, price.mrp]));

                    return (
                      <TableRow key={row.key}>
                        <TableCell>
                          <RowPhoto row={row} disabled={saving} onPhoto={setPhoto} />
                        </TableCell>

                        <TableCell>
                          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {row.name}
                            </Typography>
                            <StatusChip status={statusFor(row)} />
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {row.sku} · row {row.line}
                            {row.category ? ` · ${row.category}` : ''}
                          </Typography>
                        </TableCell>

                        <TableCell align="right">
                          <Typography
                            sx={{
                              ...numericText,
                              fontSize: FONT.body,
                              color: row.stock ? 'text.primary' : 'text.disabled',
                            }}
                          >
                            {row.stock ? formatGrams(row.stock) : 'NA'}
                          </Typography>
                        </TableCell>

                        {pricedSizes.map((grams) => {
                          const mrp = bySize.get(grams);
                          return (
                            <TableCell key={grams} align="right">
                              {mrp === undefined ? (
                                <Tooltip title="Left blank in the sheet — this perfume will not be sold in this size">
                                  <Typography variant="body2" color="text.disabled" sx={{ cursor: 'help' }}>
                                    NA
                                  </Typography>
                                </Tooltip>
                              ) : (
                                <Typography sx={{ ...numericText, fontSize: FONT.body }}>
                                  {formatCurrency(mrp)}
                                </Typography>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>

            {ready.length > PAGE_SIZE && (
              <Pagination
                page={page}
                limit={PAGE_SIZE}
                total={ready.length}
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
            {ready.length ? (
              <>
                {formatNumber(ready.length)} perfume{ready.length === 1 ? '' : 's'} will be created
                {drafts > 0 && ` · ${drafts} without a photo will be saved as draft${drafts === 1 ? '' : 's'}`}
              </>
            ) : (
              'No row in this sheet can be created — fix the rows above and upload it again.'
            )}
          </Typography>

          <Button
            variant="contained"
            onClick={submit}
            disabled={saving || !ready.length}
            startIcon={saving ? <CircularProgress size={15} color="inherit" /> : <LibraryAddOutlined />}
          >
            {saving ? 'Adding…' : `Add perfumes (${ready.length})`}
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
      <Box sx={{ mb: 2, mx: 'auto', maxWidth: 640 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', textAlign: 'center', mb: 0.75 }}
        >
          Sample — this is how your sheet should look. The blank 100gm cell means that size is not sold.
        </Typography>

        <Box
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: `${CARD_RADIUS}px`,
            overflow: 'hidden',
          }}
        >
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 560 }}>
              <TableHead>
                <TableRow>
                  {[COLUMN_NAME, COLUMN_CATEGORY, COLUMN_STOCK].map((column) => (
                    <TableCell key={column}>{column}</TableCell>
                  ))}
                  {['25gm Price', '100gm Price', '1000gm Price'].map((column) => (
                    <TableCell key={column} align="right">
                      {column}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {[
                  ['ZUMAR BY AHMED AL MAGRIBI', 'Perfume', '1500', '900', '3600', '35000'],
                  ['ZUBEIDA', 'Perfume', '500', '150', '', '5600'],
                ].map(([name, category, stock, p25, p100, p1000]) => (
                  <TableRow key={name}>
                    <TableCell>
                      <Typography variant="caption">{name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">{category}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ ...numericText, fontSize: FONT.tiny }}>
                        {stock}
                      </Typography>
                    </TableCell>
                    {[p25, p100, p1000].map((price, index) => (
                      <TableCell key={index} align="right">
                        <Typography variant="caption" sx={{ ...numericText, fontSize: FONT.tiny }}>
                          {price}
                        </Typography>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Box>
      </Box>

      <Dropzone
        accept={SHEET_TYPES}
        label="Choose a catalogue spreadsheet"
        onFiles={handleFiles}
        sx={{ py: 4, px: 3 }}
      >
        <CloudUpload sx={{ fontSize: ICON.illustration, color: brand.plumLight, mb: 1 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Drag & drop your catalogue sheet here
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

/**
 * The picture slot on one review row.
 *
 * The sheet carries no photographs — a spreadsheet cell cannot hold one the
 * catalogue can read — so this is where they come from: click the slot, pick
 * the file, and the picture is in the row a moment later. The alternative would
 * be editing the sheet and uploading it again to add a single image, which is
 * the whole reason this screen exists.
 *
 * The upload happens immediately and the row keeps only `{url, publicId}`, the
 * same contract the wizard's MediaUploader works to. Nothing is written to the
 * catalogue until Add perfumes; a picture added and then abandoned is cleaned
 * up when the screen resets.
 */
const RowPhoto = ({ row, disabled, onPhoto }) => {
  const snackbar = useSnackbar();
  const [progress, setProgress] = useState(null);
  const uploading = progress !== null;

  const handleFiles = async (fileList) => {
    const file = [...(fileList || [])][0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      snackbar.warning('That is not an image — pick a JPEG, PNG, WEBP or GIF.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      snackbar.warning('That image is larger than 5MB. Save a smaller copy and try again.');
      return;
    }

    setProgress(0);
    try {
      const [asset] = await uploadApi.upload([file], 'perfumes', setProgress);
      if (asset?.url) onPhoto(row.key, asset);
    } catch (error) {
      snackbar.error(error.message);
    } finally {
      setProgress(null);
    }
  };

  const label = row.photo ? `Replace the photo for ${row.name}` : `Add a photo for ${row.name}`;
  const hint = row.photo
    ? 'Click to replace this photo'
    : 'Click to add a photo from your computer — without one, this perfume is saved as a draft';

  return (
    <Tooltip title={uploading ? `Uploading… ${progress}%` : hint}>
      {/* A span, because a disabled Dropzone fires no events of its own and a
          Tooltip needs something that does. */}
      <Box component="span" sx={{ display: 'inline-block' }}>
        <Dropzone
          variant="frame"
          outline={row.photo ? 'solid' : 'dashed'}
          accept={IMAGE_TYPES}
          disabled={disabled || uploading}
          label={label}
          onFiles={handleFiles}
          sx={{ width: 44, height: 44, display: 'grid', placeItems: 'center', overflow: 'hidden' }}
        >
          {uploading ? (
            <CircularProgress size={18} />
          ) : row.photo ? (
            <Box
              component="img"
              src={IMG.thumb(row.photo)}
              alt={row.name}
              sx={{ width: 42, height: 42, objectFit: 'cover', borderRadius: '7px', display: 'block' }}
            />
          ) : (
            <AddPhotoAlternateOutlined sx={{ fontSize: ICON.action, color: brand.plumLight }} />
          )}
        </Dropzone>
      </Box>
    </Tooltip>
  );
};

/** One figure from the run — published, draft, or skipped. */
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

export default BulkPerfumeUpload;
