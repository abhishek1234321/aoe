import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { applyTimeFilter, extractTimeFilters } from '../src/shared/timeFilters';

const loadFilterDom = () => {
  const filePath = path.resolve(__dirname, '..', 'docs', 'samples', 'amazon.in', 'time-filter.html');
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
