import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { ordersToCsv } from '../src/shared/csv';
import { parseOrdersFromDocument } from '../src/shared/orderParser';
import type { CsvRow } from '../src/shared/csv';

const loadSample = (locale: string, fileName: string) => {
  const filePath = path.resolve(__dirname, '..', 'docs', 'samples', locale, fileName);
  const html = readFileSync(filePath, 'utf-8');
  return new JSDOM(html);
};

describe('CSV flow (order parser -> CSV)', () => {
  it('converts a parsed order into a CSV row', () => {
    const dom = loadSample('amazon.in', 'order-single.html');
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

describe('CSV snapshot tests', () => {
  it('generates expected CSV structure for amazon.in orders', () => {
    const dom = loadSample('amazon.in', 'order-list.html');
    const orders = parseOrdersFromDocument(dom.window.document);
    const csvText = ordersToCsv(orders, 'https://www.amazon.in');
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const rows = parsed.data as CsvRow[];

    // Snapshot the CSV column headers (structure)
    const headers = Object.keys(rows[0] || {});
    expect(headers).toMatchSnapshot('csv-headers');

    // Snapshot a normalized version of the data (with consistent formatting)
    const normalizedRows = rows.map((row) => ({
      hasOrderId: Boolean(row['Order ID']),
      hasDate: Boolean(row.Date),
      hasBuyer: Boolean(row.Buyer),
      hasTotalAmount: Boolean(row['Total Amount']),
      hasCurrency: Boolean(row.Currency),
      hasItems: Boolean(row.Items),
      hasStatus: Boolean(row.Status),
      hasInvoiceUrl: Boolean(row['Invoice URL']),
      hasOrderDetailsUrl: Boolean(row['Order Details URL']),
    }));
    expect(normalizedRows).toMatchSnapshot('csv-row-structure');
  });

  it('generates expected CSV structure for amazon.com orders', () => {
    const dom = loadSample('amazon.com', 'order-list.html');
    const orders = parseOrdersFromDocument(dom.window.document);
    const csvText = ordersToCsv(orders, 'https://www.amazon.com');
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const rows = parsed.data as CsvRow[];

    const headers = Object.keys(rows[0] || {});
    expect(headers).toMatchSnapshot('csv-headers-us');
  });

  it('generates expected CSV structure for amazon.co.uk orders', () => {
    const dom = loadSample('amazon.co.uk', 'order-list.html');
    const orders = parseOrdersFromDocument(dom.window.document);
    const csvText = ordersToCsv(orders, 'https://www.amazon.co.uk');
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const rows = parsed.data as CsvRow[];

    const headers = Object.keys(rows[0] || {});
    expect(headers).toMatchSnapshot('csv-headers-uk');
  });
});
