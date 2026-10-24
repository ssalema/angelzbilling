// Dashboard periods: month, financial year (April-March, e.g. 2026-27), all time or custom.
// Each resolves to a from/to window sent to the server as a `custom` range.

const pad = (value) => String(value).padStart(2, '0');

// Local-time stamps: a bare `2026-09-01` is parsed as UTC and can shift a day.
const startStamp = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00:00`;
const endStamp = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T23:59:59`;

export const PERIOD_MODES = [
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Financial year of a date, named by the year of its April.
export const financialYearOf = (date) => (date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1);

// `month` is 0-11, matching Date.
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

// `startYear` 2026 means financial year "2026-27".
export const yearPeriod = (startYear) => ({
  mode: 'year',
  year: startYear,
  month: 3,
  range: 'custom',
  from: startStamp(new Date(startYear, 3, 1)),
  to: endStamp(new Date(startYear + 1, 2, 31)),
});

export const allTimePeriod = () => ({ mode: 'all', range: 'all', from: undefined, to: undefined });

// Args are `YYYY-MM-DD`. Year/month are kept so switching back to Monthly/Yearly stays nearby.
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

export const periodDays = (value) => ({
  from: value?.from ? value.from.slice(0, 10) : '',
  to: value?.to ? value.to.slice(0, 10) : '',
});

// Default period, also used on reset.
export const currentPeriod = () => {
  const now = new Date();
  return monthPeriod(now.getFullYear(), now.getMonth());
};

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

// Steps a month or a year; 'all' and 'custom' don't move.
export const shiftPeriod = (value, step) => {
  if (value?.mode === 'year') return yearPeriod(value.year + step);
  if (value?.mode === 'month') return monthPeriod(value.year, value.month + step);
  return value;
};

// No stepping into the future.
export const canStepForward = (value) => {
  if (!value || value.mode === 'all' || value.mode === 'custom') return false;
  const now = new Date();
  if (value.mode === 'year') return value.year < financialYearOf(now);
  return value.year * 12 + value.month < now.getFullYear() * 12 + now.getMonth();
};

// Switching mode keeps the user near the same date.
export const withPeriodMode = (value, mode) => {
  if (mode === 'all') return allTimePeriod();
  const now = new Date();
  const anchor = value?.mode === 'all' || !value ? { year: now.getFullYear(), month: now.getMonth() } : value;

  if (mode === 'year') return yearPeriod(financialYearOf(new Date(anchor.year, anchor.month, 1)));

  // From a year: use today's month if it's in that year, else its April.
  if (value?.mode === 'year') {
    return financialYearOf(now) === value.year ? monthPeriod(now.getFullYear(), now.getMonth()) : monthPeriod(value.year, 3);
  }
  return monthPeriod(anchor.year, anchor.month);
};
