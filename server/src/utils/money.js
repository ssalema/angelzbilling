/**
 * Money as the store writes it.
 *
 * An amount only ever appears in server output inside a message a human reads —
 * "Only ₹5,550.00 is pending on bill AP-2609-0142". The symbol in it is a store
 * setting (Settings > Billing), so it is read from the settings document rather
 * than baked in; the ISO code only picks the grouping style, which is the one
 * thing it can be trusted for: 12,34,567 in India, 1,234,567 nearly everywhere
 * else. The admin mirrors this in `admin/src/utils/format.js`.
 */

const CURRENCY_LOCALES = { INR: 'en-IN' };
const DEFAULT_LOCALE = 'en-IN';
const FOREIGN_LOCALE = 'en-US';
const DEFAULT_SYMBOL = '₹';

/**
 * Indian grouping is this app's starting point, not its assumption: an UNSET
 * code means settings have not loaded yet and the boot default stands, while a
 * code that is set and is not INR groups the way the rest of the world does.
 */
const localeFor = (currency) => {
  const code = String(currency || '').toUpperCase();
  if (!code) return DEFAULT_LOCALE;
  return CURRENCY_LOCALES[code] || FOREIGN_LOCALE;
};

/**
 * A formatter bound to the store's currency. Takes the settings document
 * (`Settings.getCached()` is the cheap way to get one) so a caller resolves
 * settings once and formats as many figures as the message needs.
 */
export const moneyFormatter = (settings) => {
  const symbol = settings?.billing?.currencySymbol || DEFAULT_SYMBOL;
  const locale = localeFor(settings?.billing?.currency);

  return (value) =>
    `${symbol}${Number(value || 0).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
};

export default moneyFormatter;
