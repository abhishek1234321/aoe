export const formatCurrency = (amount?: number | null, currencySymbol?: string, locale = 'en-IN') => {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '';
  }
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return currencySymbol ? `${currencySymbol} ${formatted}` : formatted;
};
