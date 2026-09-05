import { Stack, TextField, InputAdornment, IconButton, Tooltip } from '@mui/material';
import { SearchRounded, RefreshRounded } from '@mui/icons-material';
import { ICON } from '../../theme/index.js';


/**
 * One-line filter bar: search grows, every control sits on the same row.
 * Wraps only on narrow screens, where a single row would be unusable.
 */
export const FilterBar = ({ children, sx }) => (
  <Stack
    direction="row"
    spacing={1.25}
    alignItems="center"
    useFlexGap
    sx={{
      p: 1.75,
      borderBottom: 1,
      borderColor: 'divider',
      flexWrap: { xs: 'wrap', lg: 'nowrap' },
      ...sx,
    }}
  >
    {children}
  </Stack>
);

/** Search box — the only control that takes the leftover width. */
export const FilterSearch = ({ sx, ...props }) => (
  <TextField
    {...props}
    sx={{ flex: 1, minWidth: 200, ...sx }}
    InputProps={{
      startAdornment: (
        <InputAdornment position="start">
          <SearchRounded sx={{ fontSize: ICON.action, color: 'text.secondary' }} />
        </InputAdornment>
      ),
    }}
  />
);

/**
 * Fixed-width dropdown. `fullWidth` is on by default from the theme, which is
 * what pushed each select onto its own line — it is switched off here.
 */
export const FilterSelect = ({ width = 160, sx, children, SelectProps, ...props }) => (
  <TextField
    select
    fullWidth={false}
    InputLabelProps={{ shrink: true }}
    {...props}
    // displayEmpty keeps the "All …" option visible when its value is ''
    SelectProps={{ displayEmpty: true, ...SelectProps }}
    sx={{ width, flexShrink: 0, ...sx }}
  >
    {children}
  </TextField>
);

/**
 * Refresh is one affordance everywhere: a bordered icon button labelled
 * "Refresh". It matches the one DateRangeControl carries, so a filter bar and a
 * chart header reload the same way.
 */
export const FilterRefresh = ({ onClick }) => (
  <Tooltip title="Refresh">
    <IconButton
      size="small"
      onClick={onClick}
      sx={{ border: 1, borderColor: 'divider', borderRadius: 2, flexShrink: 0 }}
    >
      <RefreshRounded sx={{ fontSize: ICON.action }} />
    </IconButton>
  </Tooltip>
);

export default FilterBar;
