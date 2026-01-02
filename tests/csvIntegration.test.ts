import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { ordersToCsv } from '../src/shared/csv';
import { parseOrdersFromDocument } from '../src/shared/orderParser';
import type { CsvRow } from '../src/shared/csv';

const loadSample = (fileName: string) => {
  const filePath = path.resolve(__dirname, '..', 'docs', 'samples', 'amazon.in', fileName);
  const html = readFileSync(filePath, 'utf-8');
  return new JSDOM(html);
};

describe('CSV flow (order parser -> CSV)', () => {
  it('converts a parsed order into a CSV row', () => {
    const dom = loadSample('order-single.html');
    const orders = parseOrdersFromDocument(dom.window.document);
    const csvText = ordersToCsv(orders, 'https://www.amazon.in');
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const rows = parsed.data as CsvRow[];

    expect(rows).toHaveLength(2);
    expect(rows[0]['Order ID']).toBe('111-1111111-1111111');
    expect(rows[0]['Invoice URL']).toContain('https://www.amazon.in/your-orders/invoice/popover');
    expect(rows[0]['Order Details URL']).toContain(
      'https://www.amazon.in/your-orders/order-details',
    );
    expect(rows[0].Items).toContain('Test Item');
    expect(rows[1]['Order ID']).toBe('Total (non-cancelled)');
  });
});
