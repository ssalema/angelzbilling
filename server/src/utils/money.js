// Money as the store writes it.

const CURRENCY_LOCALES = { INR: 'en-IN' };
const DEFAULT_LOCALE = 'en-IN';
const FOREIGN_LOCALE = 'en-US';
const DEFAULT_SYMBOL = '₹';

const localeFor = (currency) => {
  const code = String(currency || '').toUpperCase();
  if (!code) return DEFAULT_LOCALE;
  return CURRENCY_LOCALES[code] || FOREIGN_LOCALE;
};

// A formatter bound to the store's currency.
export const moneyFormatter = (settings) => {
  const symbol = settings?.billing?.currencySymbol || DEFAULT_SYMBOL;
  const locale = localeFor(settings?.billing?.currency);

  return (value) =>
    `${symbol}${Number(value || 0).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
};
