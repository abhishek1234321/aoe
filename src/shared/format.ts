export const formatCurrency = (
  amount?: number | null,
  currencySymbol?: string,
  options?: { currencyCode?: string; locale?: string },
) => {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '';
  }
  const locale =
    options?.locale ??
    (typeof navigator !== 'undefined' ? (navigator.languages?.[0] ?? navigator.language) : 'en-IN');
  try {
    if (options?.currencyCode) {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: options.currencyCode,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    }
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return currencySymbol ? `${currencySymbol} ${formatted}` : formatted;
  } catch {
    return currencySymbol ? `${currencySymbol} ${amount.toFixed(2)}` : amount.toFixed(2);
  }
};
