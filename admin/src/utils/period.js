/**
 * The dashboard's period model: a calendar month, a financial year (April to
 * March, written 2026-27) or all time. Every period resolves to a concrete
 * from/to window, so the server keeps its existing `custom` range contract and
 * only the wording of the control changes.
 */

const pad = (value) => String(value).padStart(2, '0');

// Local wall-clock stamps: a bare `2026-09-01` is read as UTC and slips a day
// west of Greenwich, which would drop the first bill of every month.
const startStamp = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00:00`;
const endStamp = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T23:59:59`;

export const PERIOD_MODES = [
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The financial year a date falls in, named by the April it started. */
export const financialYearOf = (date) => (date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1);

/** `month` is 0-11, matching Date. */
export const monthPeriod = (year, month) => {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    mode: 'month',
    year: start.getFullYear(),
    month: start.getMonth(),
    range: 'custom',
    from: startStamp(start),
    to: endStamp(end),
  };
};

/** `startYear` is the April the financial year opened — 2026 is "2026-27". */
export const yearPeriod = (startYear) => ({
  mode: 'year',
  year: startYear,
  month: 3,
  range: 'custom',
  from: startStamp(new Date(startYear, 3, 1)),
  to: endStamp(new Date(startYear + 1, 2, 31)),
});

export const allTimePeriod = () => ({ mode: 'all', range: 'all', from: undefined, to: undefined });

/**
 * A hand-picked window. Both arguments are plain `YYYY-MM-DD` days as the date
 * inputs give them; the month either side is carried so that switching back to
 * Monthly or Yearly lands where the reader was rather than on today.
 */
export const customPeriod = (fromDay, toDay) => {
  const start = new Date(`${fromDay}T00:00:00`);
  return {
    mode: 'custom',
    year: start.getFullYear(),
    month: start.getMonth(),
    range: 'custom',
    from: `${fromDay}T00:00:00`,
    to: `${toDay}T23:59:59`,
  };
};

/** The `YYYY-MM-DD` halves of a period, for filling the date inputs back in. */
export const periodDays = (value) => ({
  from: value?.from ? value.from.slice(0, 10) : '',
  to: value?.to ? value.to.slice(0, 10) : '',
});

/** Every period control opens here, and every reset returns here. */
export const currentPeriod = () => {
  const now = new Date();
  return monthPeriod(now.getFullYear(), now.getMonth());
};

/** True while a control is still on the running month — nothing to reset. */
export const isCurrentPeriod = (value) => {
  const now = currentPeriod();
  return value?.mode === 'month' && value.year === now.year && value.month === now.month;
};

const dayLabel = (day) => {
  const date = new Date(`${day}T00:00:00`);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${pad(date.getFullYear() % 100)}`;
};

export const periodLabel = (value) => {
  if (!value || value.mode === 'all') return 'All time';
  if (value.mode === 'custom') {
    const { from, to } = periodDays(value);
    return from && to ? `${dayLabel(from)} → ${dayLabel(to)}` : 'Custom';
  }
  if (value.mode === 'year') return `${value.year}-${pad((value.year + 1) % 100)}`;
  return `${MONTHS[value.month]} ${value.year}`;
};

/** Step one month or one financial year at a time; the open-ended modes stay put. */
export const shiftPeriod = (value, step) => {
  if (value?.mode === 'year') return yearPeriod(value.year + step);
  if (value?.mode === 'month') return monthPeriod(value.year, value.month + step);
  return value;
};

/** The future holds no bills, so the forward arrow stops at the running period. */
export const canStepForward = (value) => {
  if (!value || value.mode === 'all' || value.mode === 'custom') return false;
  const now = new Date();
  if (value.mode === 'year') return value.year < financialYearOf(now);
  return value.year * 12 + value.month < now.getFullYear() * 12 + now.getMonth();
};

/**
 * Switching mode keeps the reader where they were: a month opens the financial
 * year around it, and a year drops back to a month inside itself.
 */
export const withPeriodMode = (value, mode) => {
  if (mode === 'all') return allTimePeriod();
  const now = new Date();
  const anchor = value?.mode === 'all' || !value ? { year: now.getFullYear(), month: now.getMonth() } : value;

  if (mode === 'year') return yearPeriod(financialYearOf(new Date(anchor.year, anchor.month, 1)));

  // Coming back from a financial year, stay on today's month when it belongs to
  // that year; otherwise open the April it started with.
  if (value?.mode === 'year') {
    return financialYearOf(now) === value.year ? monthPeriod(now.getFullYear(), now.getMonth()) : monthPeriod(value.year, 3);
  }
  return monthPeriod(anchor.year, anchor.month);
};
