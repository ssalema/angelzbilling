import { useMemo, useState } from 'react';
import { Box, ButtonBase, IconButton, Stack, Typography } from '@mui/material';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ArrowDropDownRounded from '@mui/icons-material/ArrowDropDownRounded';
import { FIELD_RADIUS, FONT, ICON, brand, surface } from '../../theme/index.js';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const SHORT_MONTHS = MONTHS.map((month) => month.slice(0, 3));
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** How many years one page of the year grid shows. */
const YEAR_PAGE = 12;

const pad = (value) => String(value).padStart(2, '0');
const dayKey = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;
const todayKey = () => {
  const now = new Date();
  return dayKey(now.getFullYear(), now.getMonth(), now.getDate());
};

// Monday-first grid, blanks before the first of the month.
const buildCells = (year, month) => {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const length = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= length; day += 1) cells.push(dayKey(year, month, day));
  while (cells.length % 7) cells.push(null);
  return cells;
};

const CELL = 34;
const GRID_WIDTH = CELL * 7;

// Month and year cells share one look, so a tap on either reads the same way.
const PickerCell = ({ children, selected, disabled, onClick }) => (
  <ButtonBase
    disabled={disabled}
    onClick={onClick}
    sx={{
      height: 40,
      borderRadius: FIELD_RADIUS,
      fontSize: FONT.small,
      fontWeight: selected ? 700 : 500,
      color: selected ? '#fff' : disabled ? 'text.disabled' : 'text.primary',
      bgcolor: selected ? brand.plum : 'transparent',
      '&:hover': { bgcolor: selected ? brand.plumLight : surface.goldSoft },
    }}
  >
    {children}
  </ButtonBase>
);

/**
 * The two-click range picker behind Custom. One calendar rather than two date
 * fields: the first click opens the window, the second closes it, and the days
 * between light up as you go — which the browser's own date popup cannot show.
 *
 * The title is also a way up: days to months to years, so last year's figures
 * are two taps away rather than a dozen presses of the back arrow.
 */
const RangeCalendar = ({ value, onChange, max = todayKey() }) => {
  const { from, to } = value;

  // Open on the month already selected, else on the running month.
  const [view, setView] = useState(() => {
    const anchor = from ? new Date(`${from}T00:00:00`) : new Date();
    return { year: anchor.getFullYear(), month: anchor.getMonth() };
  });
  const [level, setLevel] = useState('days');
  const [hover, setHover] = useState(null);

  const cells = useMemo(() => buildCells(view.year, view.month), [view.year, view.month]);
  const maxYear = Number(max.slice(0, 4));
  const yearPageStart = view.year - ((view.year % YEAR_PAGE) + YEAR_PAGE) % YEAR_PAGE;

  const step = (direction) => {
    if (level === 'days') {
      const next = new Date(view.year, view.month + direction, 1);
      return setView({ year: next.getFullYear(), month: next.getMonth() });
    }
    const years = level === 'months' ? 1 : YEAR_PAGE;
    setView((current) => ({ ...current, year: current.year + direction * years }));
  };

  // Nothing to pick past the running month, so the forward arrow stops there.
  const canGoForward =
    level === 'days'
      ? dayKey(view.year, view.month + 1, 1) <= max
      : level === 'months'
        ? view.year < maxYear
        : yearPageStart + YEAR_PAGE <= maxYear;

  const pick = (key) => {
    // A complete window starts over; a half-open one closes, either way round.
    if (!from || to) return onChange({ from: key, to: '' });
    return onChange(key < from ? { from: key, to: from } : { from, to: key });
  };

  // While the second end is still open, the hovered day previews the window.
  const end = to || (from && hover && hover > from ? hover : to);

  const title =
    level === 'days'
      ? `${MONTHS[view.month]} ${view.year}`
      : level === 'months'
        ? view.year
        : `${yearPageStart} – ${yearPageStart + YEAR_PAGE - 1}`;

  return (
    <Box sx={{ width: GRID_WIDTH }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <IconButton size="small" onClick={() => step(-1)} aria-label="Previous">
          <ChevronLeftRounded sx={{ fontSize: ICON.action }} />
        </IconButton>

        <ButtonBase
          onClick={() => setLevel(level === 'days' ? 'months' : level === 'months' ? 'years' : 'days')}
          aria-label="Change month or year"
          sx={{ px: 0.75, py: 0.25, borderRadius: FIELD_RADIUS, '&:hover': { bgcolor: surface.plumFaint } }}
        >
          <Typography sx={{ fontSize: FONT.small, fontWeight: 700 }}>{title}</Typography>
          <ArrowDropDownRounded
            sx={{
              fontSize: ICON.action,
              ml: 0.25,
              transition: 'transform 120ms',
              transform: level === 'days' ? 'none' : 'rotate(180deg)',
            }}
          />
        </ButtonBase>

        <IconButton size="small" onClick={() => step(1)} disabled={!canGoForward} aria-label="Next">
          <ChevronRightRounded sx={{ fontSize: ICON.action }} />
        </IconButton>
      </Stack>

      {level === 'years' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5 }}>
          {Array.from({ length: YEAR_PAGE }, (_, index) => yearPageStart + index).map((year) => (
            <PickerCell
              key={year}
              selected={year === view.year}
              disabled={year > maxYear}
              onClick={() => {
                setView((current) => ({ ...current, year }));
                setLevel('months');
              }}
            >
              {year}
            </PickerCell>
          ))}
        </Box>
      )}

      {level === 'months' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5 }}>
          {SHORT_MONTHS.map((month, index) => (
            <PickerCell
              key={month}
              selected={index === view.month}
              disabled={dayKey(view.year, index, 1) > max}
              onClick={() => {
                setView({ year: view.year, month: index });
                setLevel('days');
              }}
            >
              {month}
            </PickerCell>
          ))}
        </Box>
      )}

      {level === 'days' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(7, ${CELL}px)` }}>
          {WEEKDAYS.map((weekday) => (
            <Typography
              key={weekday}
              sx={{ fontSize: FONT.micro, fontWeight: 700, color: 'text.secondary', textAlign: 'center', pb: 0.5 }}
            >
              {weekday}
            </Typography>
          ))}

          {cells.map((key, index) => {
            if (!key) return <Box key={`blank-${index}`} sx={{ height: CELL }} />;

            const disabled = key > max;
            const isFrom = key === from;
            const isTo = key === to;
            const inRange = from && end && key > from && key < end;
            const isEdge = isFrom || isTo;

            return (
              <Box
                key={key}
                // The wash runs edge to edge so a week reads as one band.
                sx={{
                  height: CELL,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: inRange || (isEdge && from && end && from !== end) ? surface.plumMuted : 'transparent',
                  borderTopLeftRadius: isFrom || !inRange ? '50%' : 0,
                  borderBottomLeftRadius: isFrom || !inRange ? '50%' : 0,
                  borderTopRightRadius: isTo || !inRange ? '50%' : 0,
                  borderBottomRightRadius: isTo || !inRange ? '50%' : 0,
                }}
              >
                <ButtonBase
                  disabled={disabled}
                  onClick={() => pick(key)}
                  onMouseEnter={() => setHover(key)}
                  onMouseLeave={() => setHover(null)}
                  sx={{
                    width: CELL - 4,
                    height: CELL - 4,
                    borderRadius: '50%',
                    fontSize: FONT.small,
                    fontWeight: isEdge ? 700 : 500,
                    color: isEdge ? '#fff' : disabled ? 'text.disabled' : 'text.primary',
                    bgcolor: isEdge ? brand.plum : 'transparent',
                    border: key === todayKey() && !isEdge ? 1 : 0,
                    borderColor: brand.gold,
                    '&:hover': { bgcolor: isEdge ? brand.plumLight : surface.goldSoft },
                  }}
                >
                  {Number(key.slice(8))}
                </ButtonBase>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default RangeCalendar;
