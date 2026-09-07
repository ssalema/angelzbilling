import { Box, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';

import { formatCurrency } from '../../../utils/format.js';
import { CARD_RADIUS, FONT, numericText, surface } from '../../../theme/index.js';

/**
 * One perfume's sizes, with what each costs now beside what it would cost.
 *
 * Shared by both repricing flows so the figures an admin approves are laid out
 * the same whether they came from the search box or a spreadsheet row. Current
 * price is muted and struck through, the new one carries the weight — the eye
 * should land on what is about to change.
 *
 * Rows the ladder has no rule for (an odd fill like 200gm) are shown rather
 * than hidden, marked "unchanged", because a size quietly missing from a
 * preview is how a perfume ends up half repriced.
 */
const PriceLadderTable = ({ rows, dense = false }) => (
  /**
   * The panel hugs the table rather than filling the row it sits in.
   *
   * Three short columns stretched across a full-width dialog put every price
   * against the far edge and left a lake of nothing after the size chip. With
   * `fit-content` the table is only as wide as it needs to be, so the sizes and
   * their prices stay next to each other and read as one line. `maxWidth` keeps
   * that honest on a narrow window, where the inner box scrolls instead.
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
          `minWidth` then buys the columns a little air, so shrink-to-fit does
          not leave the prices crammed against the size chips. */}
      <Table size="small" sx={{ width: 'auto', minWidth: dense ? 560 : 720 }}>
        <TableHead>
          <TableRow>
            <TableCell>Size</TableCell>
            {!dense && <TableCell>SKU</TableCell>}
            <TableCell align="right">Current price</TableCell>
            <TableCell align="right">New price</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const changed = row.priced && row.newMrp !== null && row.newMrp !== row.currentMrp;

            return (
              <TableRow key={row.sku || row.label} sx={changed ? { bgcolor: surface.plumFaint } : undefined}>
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
                    sx={changed ? { textDecoration: 'line-through' } : undefined}
                  >
                    {formatCurrency(row.currentMrp)}
                  </Typography>
                </TableCell>

                <TableCell align="right">
                  {row.newMrp === null ? (
                    <Typography variant="body2" color="text.disabled">
                      NA
                    </Typography>
                  ) : !row.priced ? (
                    <Typography variant="caption" color="text.secondary">
                      unchanged
                    </Typography>
                  ) : (
                    /* No arrow: the struck-through price in the column beside
                       this one already says "was", so a glyph pointing at the
                       figure only crowds it. */
                    <Typography
                      sx={{
                        ...numericText,
                        fontSize: FONT.body,
                        fontWeight: changed ? 700 : 400,
                        color: changed ? 'text.primary' : 'text.secondary',
                      }}
                    >
                      {formatCurrency(row.newMrp)}
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  </Box>
);

export default PriceLadderTable;
