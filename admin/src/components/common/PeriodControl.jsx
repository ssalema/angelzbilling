import { useRef, useState } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  IconButton,
  Popover,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import RangeCalendar from './RangeCalendar.jsx';
import { ResetIconButton } from './FilterBar.jsx';
import {
  PERIOD_MODES,
  canStepForward,
  customPeriod,
  periodDays,
  periodLabel,
  shiftPeriod,
  withPeriodMode,
} from '../../utils/period.js';
import { CARD_PAD, FIELD_RADIUS, FONT, ICON, surface } from '../../theme/index.js';

// Local date, not UTC (toISOString() can return the wrong day).
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const dayText = (day) =>
  day ? new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const RangeEnd = ({ label, day, active }) => (
  <Box
    sx={{
      flex: 1,
      px: 1,
      py: 0.6,
      borderRadius: FIELD_RADIUS,
      border: 1,
      borderColor: active ? 'primary.main' : 'divider',
      bgcolor: active ? surface.plumFaint : 'transparent',
    }}
  >
    <Typography sx={{ fontSize: FONT.micro, color: 'text.secondary' }}>{label}</Typography>
    <Typography sx={{ fontSize: FONT.small, fontWeight: 700 }}>{dayText(day)}</Typography>
  </Box>
);

// Monthly / Yearly / All time / Custom, with arrows to step through months or financial years.
const PeriodControl = ({
  value,
  onChange,
  onReset,
  // False disables reset (e.g. already on the current month).
  canReset = true,
  label = 'Period',
}) => {
  const mode = value?.mode || 'month';
  const stepping = mode === 'month' || mode === 'year';
  const forward = canStepForward(value);

  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => periodDays(value));

  const step = (delta) => onChange(shiftPeriod(value, delta));

  // Custom applies from the popover once both dates are picked.
  const openCustom = () => {
    setDraft(periodDays(value));
    setOpen(true);
  };

  const handleMode = (next) => {
    if (next === 'custom') return openCustom();
    onChange(withPeriodMode(value, next));
  };

  const applyCustom = () => {
    if (!draft.from || !draft.to) return;
    onChange(customPeriod(draft.from, draft.to));
    setOpen(false);
  };

  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      spacing={1}
      flexWrap="wrap"
      useFlexGap
      sx={{ width: '100%' }}
    >
      <ToggleButtonGroup
        value={mode}
        exclusive
        size="small"
        onChange={(_event, next) => next && handleMode(next)}
        aria-label={label}
        sx={{
          '& .MuiToggleButton-root': {
            px: 1.3,
            py: 0.4,
            fontSize: FONT.tiny,
            textTransform: 'none',
            fontWeight: 600,
            borderColor: 'divider',
          },
          '& .Mui-selected': { bgcolor: surface.plumMuted, color: 'primary.main !important' },
        }}
      >
        {PERIOD_MODES.map((option) => (
          <ToggleButton key={option.value} value={option.value}>
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
        <Stack
          ref={anchorRef}
          direction="row"
          alignItems="center"
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.paper',
            overflow: 'hidden',
          }}
        >
          <IconButton
            size="small"
            onClick={() => step(-1)}
            disabled={!stepping}
            aria-label="Previous period"
            sx={{ borderRadius: 0, p: 0.5 }}
          >
            <ChevronLeftRounded sx={{ fontSize: ICON.action }} />
          </IconButton>

          {/* Fixed width keeps the arrows still. In custom mode, clicking reopens the picker. */}
          <ButtonBase
            disabled={mode !== 'custom'}
            onClick={openCustom}
            sx={{
              minWidth: 84,
              px: 0.5,
              py: 0.25,
              borderRadius: 0,
              '&.Mui-disabled': { color: 'inherit' },
            }}
          >
            <Typography sx={{ fontSize: FONT.small, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {periodLabel(value)}
            </Typography>
          </ButtonBase>

          <IconButton
            size="small"
            onClick={() => step(1)}
            disabled={!stepping || !forward}
            aria-label="Next period"
            sx={{ borderRadius: 0, p: 0.5 }}
          >
            <ChevronRightRounded sx={{ fontSize: ICON.action }} />
          </IconButton>
        </Stack>

        {onReset && (
          <ResetIconButton
            onClick={onReset}
            disabled={!canReset}
            title="Reset to this month"
            disabledTitle="Showing this month"
          />
        )}
      </Stack>

      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: CARD_PAD }}>
          <Stack spacing={1.75}>
            <Stack direction="row" spacing={1}>
              <RangeEnd label="From" day={draft.from} active={!draft.from || Boolean(draft.to)} />
              <RangeEnd label="To" day={draft.to} active={Boolean(draft.from) && !draft.to} />
            </Stack>

            <RangeCalendar value={draft} onChange={setDraft} max={today()} />

            {/* No Cancel button: clicking away closes the popover. */}
            <Button variant="contained" onClick={applyCustom} disabled={!draft.from || !draft.to}>
              Apply range
            </Button>
          </Stack>
        </Box>
      </Popover>
    </Stack>
  );
};

export default PeriodControl;
