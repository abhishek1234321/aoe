import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseInvoiceLinks, selectInvoiceLink } from '../src/shared/invoice';

const loadPopover = () => {
  const filePath = path.resolve(__dirname, '..', 'docs', 'samples', 'amazon.in', 'invoice-popover.html');
  return readFileSync(filePath, 'utf-8');
};

describe('invoice link parsing', () => {
  it('extracts all links from the invoice popover', () => {
    const html = loadPopover();
    const links = parseInvoiceLinks(html);
    expect(links).toHaveLength(3);
    expect(links.map((l) => l.label)).toContain('Invoice');
    expect(links.some((l) => l.href.includes('invoice.pdf'))).toBe(true);
  });

  it('prefers invoice PDF over other links', () => {
    const html = loadPopover();
    const links = parseInvoiceLinks(html);
    const selected = selectInvoiceLink(links);
    expect(selected?.href).toContain('invoice.pdf');
  });

  it('falls back to first link when no invoice is present', () => {
    const links = parseInvoiceLinks('<a href="/foo">Foo</a><a href="/bar">Bar</a>');
    const selected = selectInvoiceLink(links);
    expect(selected?.href).toBe('/foo');
  });
});
