import {
  Box,
  Chip,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

import { formatCurrency } from '../../../utils/format.js';
import { CARD_RADIUS, FONT, numericText, surface } from '../../../theme/index.js';

/**
 * One perfume's sizes, with what each costs now beside what it would cost.
 *
 * Shared by both repricing flows so the figures an admin approves are laid out
 * the same whether they were typed here or read out of a spreadsheet. Current
 * price is muted and struck through once a size moves; the new one carries the
 * weight, because the eye should land on what is about to change.
 *
 * With `editable`, the New price column is where the repricing actually
 * happens — one independent box per size. Leaving a box blank is not a change:
 * it keeps that size at the price it already has, which is why the placeholder
 * shows the current figure rather than nothing.
 */
const SizePriceTable = ({ rows, dense = false, editable = false, onEdit, disabled = false }) => (
  /**
   * The panel hugs the table rather than filling the row it sits in — three
   * short columns stretched across a full-width dialog left a lake of nothing
   * after the size chip. `maxWidth` keeps that honest on a narrow window, where
   * the inner box scrolls instead.
   */
  <Box
    sx={{
      border: 1,
      borderColor: 'divider',
      borderRadius: `${CARD_RADIUS}px`,
      overflow: 'hidden',
      width: 'fit-content',
      maxWidth: '100%',
    }}
  >
    <Box sx={{ overflowX: 'auto' }}>
      {/* `width: auto` overrides MUI's 100%, which is what forced the stretch;
          `minWidth` then buys the columns a little air. */}
      <Table
        size="small"
        sx={{
          width: 'auto',
          minWidth: dense ? 560 : 720,
          // A row holding an input does not also need the theme's 12px above
          // and below it — the field brings its own height.
          ...(editable && { '& tbody td': { py: 0.75 } }),
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell>Size</TableCell>
            {!dense && <TableCell>SKU</TableCell>}
            <TableCell align="right">Current price</TableCell>
            <TableCell align="right" sx={editable ? { width: 170 } : undefined}>
              New price
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.sku || row.sizeGrams}
              sx={row.changed ? { bgcolor: surface.plumFaint } : undefined}
            >
              <TableCell>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Chip size="small" label={row.label} sx={{ fontWeight: 600 }} />
                  {!row.isActive && (
                    <Typography variant="caption" color="text.secondary">
                      inactive
                    </Typography>
                  )}
                </Stack>
              </TableCell>

              {!dense && (
                <TableCell>
                  <Typography variant="caption" color="text.secondary" sx={numericText}>
                    {row.sku}
                  </Typography>
                </TableCell>
              )}

              <TableCell align="right">
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={row.changed ? { textDecoration: 'line-through' } : undefined}
                >
                  {row.currentMrp > 0 ? formatCurrency(row.currentMrp) : 'NA'}
                </Typography>
              </TableCell>

              <TableCell align="right">
                {editable ? (
                  <TextField
                    type="number"
                    value={row.input}
                    onChange={(event) => onEdit?.(row.sizeGrams, event.target.value)}
                    disabled={disabled}
                    error={Boolean(row.issue)}
                    // Only when there is something to say. A permanently blank
                    // helper line under all six boxes was most of this table's
                    // height, and it never carried a word.
                    helperText={row.issue || undefined}
                    // The current price as the placeholder says what happens if
                    // this box is left alone, without pre-filling a value the
                    // admin would then have to clear.
                    placeholder={row.currentMrp > 0 ? String(row.currentMrp) : ''}
                    // The theme makes every TextField fullWidth, which turns it
                    // into a block box that the cell's right-alignment cannot
                    // shift. Inline-flex lets it sit under the column heading.
                    fullWidth={false}
                    inputProps={{ step: 'any', min: 0, style: { textAlign: 'right' } }}
                    InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                    sx={{ width: 150, verticalAlign: 'middle' }}
                  />
                ) : (
                  <Typography
                    sx={{
                      ...numericText,
                      fontSize: FONT.body,
                      fontWeight: row.changed ? 700 : 400,
                      color: row.changed ? 'text.primary' : 'text.secondary',
                    }}
                  >
                    {row.newMrp > 0 ? formatCurrency(row.newMrp) : 'NA'}
                  </Typography>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  </Box>
);

export default SizePriceTable;
