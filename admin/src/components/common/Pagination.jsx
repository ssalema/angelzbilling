import { Box, IconButton, MenuItem, Select, Tooltip, Typography } from '@mui/material';
import {
  FirstPageRounded,
  ChevronLeftRounded,
  ChevronRightRounded,
  LastPageRounded,
} from '@mui/icons-material';
import { ROWS_PER_PAGE } from '../../utils/constants.js';
import { FONT, ICON } from '../../theme/index.js';

/**
 * The single pagination bar used by every list in the panel.
 *
 * Left:  rows-per-page picker + the visible range ("1–10 of 12").
 * Right: "Page 1 of 2" + first / prev / current / next / last controls.
 *
 * Controls borrow the panel's bordered-icon-button language (see FilterBar's
 * refresh button) so the bar reads as part of the same system.
 *
 * `page` is 1-based everywhere, matching the API's `?page=` parameter.
 */
const Pagination = ({
  page = 1,
  limit = 10,
  total = 0,
  onPageChange,
  onLimitChange,
  rowsPerPageOptions = ROWS_PER_PAGE,
}) => {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const current = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (current - 1) * limit + 1;
  const to = Math.min(current * limit, total);

  const go = (next) => {
    const target = Math.min(Math.max(1, next), pageCount);
    if (target !== current) onPageChange?.(target);
  };

  const navButton = (label, icon, target, disabled) => (
    <Tooltip title={label} disableInteractive>
      <span>
        <IconButton
          size="small"
          aria-label={label}
          disabled={disabled}
          onClick={() => go(target)}
          sx={{
            width: 32,
            height: 32,
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
            color: 'text.secondary',
            '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
          }}
        >
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
        px: 2,
        py: 1.5,
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          Rows per page:
        </Typography>
        <Select
          value={limit}
          onChange={(event) => {
            onLimitChange?.(Number(event.target.value));
            onPageChange?.(1);
          }}
          inputProps={{ 'aria-label': 'Rows per page' }}
          sx={{ width: 82 }}
        >
          {rowsPerPageOptions.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </Select>
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {from}–{to} of{' '}
          <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
            {total}
          </Box>
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5, whiteSpace: 'nowrap' }}>
          Page{' '}
          <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
            {current}
          </Box>{' '}
          of{' '}
          <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
            {pageCount}
          </Box>
        </Typography>

        {navButton('First page', <FirstPageRounded sx={{ fontSize: ICON.action }} />, 1, current === 1)}
        {navButton('Previous page', <ChevronLeftRounded sx={{ fontSize: ICON.action }} />, current - 1, current === 1)}

        <Box
          aria-current="page"
          sx={{
            minWidth: 32,
            height: 32,
            px: 1,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            fontSize: FONT.body,
            fontWeight: 600,
          }}
        >
          {current}
        </Box>

        {navButton('Next page', <ChevronRightRounded sx={{ fontSize: ICON.action }} />, current + 1, current === pageCount)}
        {navButton('Last page', <LastPageRounded sx={{ fontSize: ICON.action }} />, pageCount, current === pageCount)}
      </Box>
    </Box>
  );
};

export default Pagination;
