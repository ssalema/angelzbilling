import { Stack, TextField, InputAdornment, IconButton, Tooltip } from '@mui/material';
import SearchRounded from '@mui/icons-material/SearchRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import { ICON } from '../../theme/index.js';

// One-line filter bar: search grows, every control sits on the same row.
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

// Fixed-width dropdown.
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

// Reset is one affordance everywhere: a bordered icon button carrying the RestartAlt glyph.
export const ResetIconButton = ({ onClick, disabled = false, title, disabledTitle }) => (
  <Tooltip title={disabled ? disabledTitle : title}>
    {/* A disabled button fires no events, so the tooltip needs a live wrapper. */}
    <span style={{ display: 'inline-flex', flexShrink: 0 }}>
      <IconButton
        size="small"
        onClick={onClick}
        disabled={disabled}
        aria-label={title}
        sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}
      >
        <RestartAltRounded sx={{ fontSize: ICON.action }} />
      </IconButton>
    </span>
  </Tooltip>
);

/** The filter-bar and chart-header flavour: clears filters back to defaults. */
export const FilterReset = (props) => (
  <ResetIconButton title="Reset filters" disabledTitle="No filters applied" {...props} />
);

export default FilterBar;
