/** Shared helpers for pagination, sorting and date-range filtering. */

export const getPagination = (query = {}) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const rawLimit = Number.parseInt(query.limit, 10) || 10;
  const limit = Math.min(100, Math.max(1, rawLimit)); // hard cap protects the DB
  return { page, limit, skip: (page - 1) * limit };
};

/** `?sort=-createdAt,name` -> `{ createdAt: -1, name: 1 }`, restricted to an allowlist. */
export const getSort = (sortParam, allowed = [], fallback = { createdAt: -1 }) => {
  if (!sortParam) return fallback;
  const sort = {};
  String(sortParam)
    .split(',')
    .forEach((token) => {
      const desc = token.startsWith('-');
      const field = desc ? token.slice(1) : token;
      if (allowed.includes(field)) sort[field] = desc ? -1 : 1;
    });
  return Object.keys(sort).length ? sort : fallback;
};

export const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Resolves the dashboard/report date filters into a concrete window.
export const resolveDateRange = ({ range = 'month', from, to } = {}) => {
  const now = new Date();
  let start = null;
  let end = new Date(now);
  end.setHours(23, 59, 59, 999);

  switch (range) {
    case 'today':
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      break;
    case 'week':
      start = new Date(now);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case 'year':
      start = new Date(now);
      start.setDate(start.getDate() - 364);
      start.setHours(0, 0, 0, 0);
      break;
    case 'all':
      start = null;
      end = null;
      break;
    case 'custom': {
      start = from ? new Date(from) : null;
      end = to ? new Date(to) : new Date(now);
      if (start) start.setHours(0, 0, 0, 0);
      if (end) end.setHours(23, 59, 59, 999);
      break;
    }
    case 'month':
    default:
      start = new Date(now);
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      break;
  }

  const isValid = (d) => d instanceof Date && !Number.isNaN(d.getTime());
  return {
    start: isValid(start) ? start : null,
    end: isValid(end) ? end : null,
    range,
  };
};

/** The equally sized window immediately before the current one, for growth %. */
export const previousPeriod = ({ start, end }) => {
  if (!start || !end) return { start: null, end: null };
  const span = end.getTime() - start.getTime();
  return {
    start: new Date(start.getTime() - span - 1),
    end: new Date(start.getTime() - 1),
  };
};

export const buildDateMatch = ({ start, end }, field = 'createdAt') => {
  if (!start && !end) return {};
  const match = {};
  if (start) match.$gte = start;
  if (end) match.$lte = end;
  return { [field]: match };
};

/** Day / month buckets so a 30-day chart is daily and a 1-year chart is monthly. */
export const pickGranularity = ({ start, end, range }) => {
  if (range === 'all') return 'month';
  if (!start || !end) return 'month';
  const days = (end - start) / 86400000;
  if (days <= 62) return 'day';
  if (days <= 730) return 'month';
  return 'year';
};

export const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
