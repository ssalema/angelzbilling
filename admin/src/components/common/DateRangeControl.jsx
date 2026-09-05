import { useRef, useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Popover,
  Select,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import { RefreshRounded } from '@mui/icons-material';
import { DATE_RANGES } from '../../utils/constants.js';
import { FONT, ICON } from '../../theme/index.js';

/**
 * The single Month / Year / All time / Custom control.
 *
 * It replaces four near-identical implementations that had drifted apart — one
 * of which quietly dropped "Custom" from its options, so the same dashboard
 * offered a custom date range on one card and not on the next.
 *
 * The parent owns the range object: `{ range, from, to }`.
 */
const DateRangeControl = ({
  value,
  onChange,
  onRefresh,
  width = 165,
  label,
  // Custom is offered everywhere by default; a caller can opt out deliberately.
  allowCustom = true,
}) => {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: value.from || '', to: value.to || '' });

  const options = allowCustom ? DATE_RANGES : DATE_RANGES.filter((option) => option.value !== 'custom');

  const openCustom = () => {
    setDraft({ from: value.from || '', to: value.to || '' });
    setOpen(true);
  };

  const handleChange = (event) => {
    const next = event.target.value;
    // Custom is applied from the popover, not from picking the row.
    if (next === 'custom') return openCustom();
    onChange({ range: next, from: undefined, to: undefined });
  };

  const applyCustom = () => {
    if (!draft.from || !draft.to) return;
    onChange({ range: 'custom', from: draft.from, to: draft.to });
    setOpen(false);
  };

  const renderValue = (selected) => {
    if (selected === 'custom' && value.from && value.to) return `${value.from} → ${value.to}`;
    return options.find((option) => option.value === selected)?.label || 'Month';
  };

  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
      {label ? (
        <TextField
          select
          label={label}
          fullWidth={false}
          ref={anchorRef}
          value={value.range || 'month'}
          onChange={handleChange}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ displayEmpty: true, renderValue }}
          sx={{ width, flexShrink: 0 }}
        >
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.value === 'custom' ? 'Custom range…' : option.label}
            </MenuItem>
          ))}
        </TextField>
      ) : (
        <Select
          ref={anchorRef}
          value={value.range || 'month'}
          onChange={handleChange}
          size="small"
          inputProps={{ 'aria-label': 'Date range' }}
          renderValue={renderValue}
          sx={{ minWidth: width, bgcolor: 'background.paper', fontSize: FONT.small, fontWeight: 600 }}
        >
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value} sx={{ fontSize: FONT.body }}>
              {option.value === 'custom' ? 'Custom range…' : option.label}
            </MenuItem>
          ))}
        </Select>
      )}

      {onRefresh && (
        <Tooltip title="Refresh">
          <IconButton
            size="small"
            onClick={onRefresh}
            sx={{ border: 1, borderColor: 'divider', borderRadius: 2, flexShrink: 0 }}
          >
            <RefreshRounded sx={{ fontSize: ICON.action }} />
          </IconButton>
        </Tooltip>
      )}

      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={{ p: 2.5, width: 290 }}>
          <Stack spacing={2}>
            <TextField
              label="From"
              type="date"
              value={draft.from}
              onChange={(event) => setDraft((d) => ({ ...d, from: event.target.value }))}
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: draft.to || undefined }}
            />
            <TextField
              label="To"
              type="date"
              value={draft.to}
              onChange={(event) => setDraft((d) => ({ ...d, to: event.target.value }))}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: draft.from || undefined, max: new Date().toISOString().slice(0, 10) }}
            />
            {/* A popover is dismissible by clicking away, so Apply is the only
                action it needs — matching the no-Cancel rule dialogs follow. */}
            <Button variant="contained" onClick={applyCustom} disabled={!draft.from || !draft.to}>
              Apply range
            </Button>
          </Stack>
        </Box>
      </Popover>
    </Stack>
  );
};

export default DateRangeControl;
