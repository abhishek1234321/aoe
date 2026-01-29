import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  applyTimeFilter,
  extractTimeFilters,
  extractTimeFiltersWithSelection,
} from '../src/shared/timeFilters';

const loadFilterDom = () => {
  const filePath = path.resolve(
    __dirname,
    '..',
    'docs',
    'samples',
    'amazon.in',
    'time-filter.html',
  );
  const html = readFileSync(filePath, 'utf-8');
  return new JSDOM(html);
};

const loadSample = (locale: string, fileName: string) => {
  const filePath = path.resolve(__dirname, '..', 'docs', 'samples', locale, fileName);
  const html = readFileSync(filePath, 'utf-8');
  return new JSDOM(html);
};

describe('time filter helpers', () => {
  it('extracts time filters including months and years', () => {
    const dom = loadFilterDom();
    const filters = extractTimeFilters(dom.window.document);
    const labels = filters.map((f) => f.label);
    expect(labels).toContain('past 3 months');
    expect(filters.find((f) => f.value === 'months-3')).toBeTruthy();
    const years = filters.filter((f) => f.year).map((f) => f.year);
    expect(years).toContain(2025);
    expect(years).toContain(2020);
  });

  describe('extractTimeFiltersWithSelection', () => {
    it('returns filters and currently selected value', () => {
      const dom = loadFilterDom();
      const result = extractTimeFiltersWithSelection(dom.window.document);

      expect(result.filters.length).toBeGreaterThan(0);
      expect(result.selectedValue).toBeTruthy();
      // The fixture has a selected option - verify it's returned
      const select = dom.window.document.querySelector<HTMLSelectElement>('#time-filter');
      expect(result.selectedValue).toBe(select?.value);
    });

    it('returns selected value from empty orders page', () => {
      const dom = loadSample('amazon.com', 'empty-orders.html');
      const result = extractTimeFiltersWithSelection(dom.window.document);

      expect(result.filters.length).toBeGreaterThan(0);
      // The fixture has "months-3" (past 3 months) selected
      expect(result.selectedValue).toBe('months-3');
    });

    it('returns null selectedValue when dropdown is missing', () => {
      const dom = new JSDOM('<!doctype html><html><body><div>No filters</div></body></html>');
      const result = extractTimeFiltersWithSelection(dom.window.document);

      expect(result.filters).toHaveLength(0);
      expect(result.selectedValue).toBeNull();
    });

    it('detects year selection correctly', () => {
      const dom = new JSDOM(`
        <select id="time-filter">
          <option value="last30">last 30 days</option>
          <option value="months-3">past 3 months</option>
          <option value="year-2026" selected>2026</option>
          <option value="year-2025">2025</option>
        </select>
      `);
      const result = extractTimeFiltersWithSelection(dom.window.document);

      expect(result.selectedValue).toBe('year-2026');
      expect(result.filters.find((f) => f.value === 'year-2026')?.year).toBe(2026);
    });
  });

  it('applies a year filter when present', () => {
    const dom = loadFilterDom();
    const select = dom.window.document.querySelector<HTMLSelectElement>('#time-filter');
    let changed = false;
    select?.addEventListener('change', () => {
      changed = true;
    });

    const result = applyTimeFilter(dom.window.document, 'year-2024', 2024);

    expect(result.changed).toBe(true);
    expect(result.matched).toBe(true);
    expect(select?.value).toBe('year-2024');
    expect(changed).toBe(true);
  });

  it('does nothing when the requested filter is missing', () => {
    const dom = loadFilterDom();
    const select = dom.window.document.querySelector<HTMLSelectElement>('#time-filter');
    const initialValue = select?.value;

    const result = applyTimeFilter(dom.window.document, 'year-2001', 2001);

    expect(result.changed).toBe(false);
    expect(result.matched).toBe(false);
    expect(select?.value).toBe(initialValue);
  });

  it('returns empty filters when the dropdown is missing', () => {
    const dom = new JSDOM('<!doctype html><html><body><div>No filters</div></body></html>');
    const filters = extractTimeFilters(dom.window.document);
    const result = applyTimeFilter(dom.window.document, 'months-3');

    expect(filters).toHaveLength(0);
    expect(result.changed).toBe(false);
    expect(result.matched).toBe(false);
  });
});
