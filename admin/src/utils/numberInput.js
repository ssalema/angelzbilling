/**
 * One typing rule for every amount box on the app, so a figure behaves the same
 * whether it is typed on the bill form or in the collect-payment dialog.
 *
 * Digits and a single decimal point get through. A value past the ceiling the
 * field allows lands on that ceiling instead: a limit is a hard stop, not a
 * warning the user meets only after typing an impossible amount.
 *
 * Returns a string, so it suits both a text-state field and a form field that
 * commits a number, and it keeps a half-typed "12." alive while typing.
 */
export const clampNumericInput = (value, { min, max } = {}) => {
  const cleaned = String(value ?? '')
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1');
  if (cleaned === '' || cleaned === '.') return cleaned;

  const number = Number(cleaned);
  if (!Number.isFinite(number)) return '';
  if (Number.isFinite(max) && number > max) return String(max);
  if (Number.isFinite(min) && number < min) return String(min);
  return cleaned;
};
