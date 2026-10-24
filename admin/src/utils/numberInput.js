// Shared rule for amount inputs: digits and one decimal point, clamped to min/max.
// Returns a string so a half-typed "12." survives while typing.
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
