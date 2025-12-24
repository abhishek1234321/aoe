import { describe, expect, it } from 'vitest';
import { formatCurrency } from '../src/shared/format';

describe('formatCurrency', () => {
  it('formats with currency code when provided', () => {
    const formatted = formatCurrency(1234.5, undefined, { currencyCode: 'INR', locale: 'en-IN' });
    expect(formatted).toContain('₹');
  });

  it('falls back to symbol prefix when no code is provided', () => {
    const formatted = formatCurrency(1234.5, '₹', { locale: 'en-IN' });
    expect(formatted.startsWith('₹')).toBe(true);
  });

  it('returns empty string for invalid input', () => {
    expect(formatCurrency(undefined, '₹')).toBe('');
  });
});
