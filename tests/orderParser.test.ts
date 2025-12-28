import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { parseOrdersFromDocument } from '../src/shared/orderParser';

const loadSample = (locale: string, fileName: string) => {
  const filePath = path.resolve(__dirname, '..', 'docs', 'samples', locale, fileName);
  const html = readFileSync(filePath, 'utf-8');
  return new JSDOM(html);
};

describe('order parser', () => {
  it('parses a single order card with expected fields', () => {
    const dom = loadSample('amazon.in', 'order-single.html');
    const orders = parseOrdersFromDocument(dom.window.document);
    expect(orders).toHaveLength(1);

    const order = orders[0];
    expect(order.orderId).toBe('111-1111111-1111111');
    expect(order.total.amount).toBeCloseTo(522.75);
    expect(order.total.currencySymbol).toBe('₹');
    expect(order.invoiceUrl).toContain('/your-orders/invoice');
    expect(order.shipments).toHaveLength(1);
    expect(order.shipments[0].items).toHaveLength(1);
    expect(order.status).toContain('Arriving tomorrow');
  });

  it('parses multiple order cards from the list view', () => {
    const dom = loadSample('amazon.in', 'order-list.html');
    const orders = parseOrdersFromDocument(dom.window.document);
    expect(orders.length).toBeGreaterThanOrEqual(2);

    const firstOrder = orders[0];
    expect(firstOrder.orderId).toBe('222-2222222-2222222');
    const hasTrackAction = orders.some((order) =>
      order.shipments.some((shipment) =>
        shipment.actions.some((action) => action.label.toLowerCase().includes('track')),
      ),
    );
    expect(hasTrackAction).toBe(true);
  });

  it('parses amazon.com orders with US date format', () => {
    const dom = loadSample('amazon.com', 'order-list.html');
    const orders = parseOrdersFromDocument(dom.window.document);
    expect(orders.length).toBeGreaterThanOrEqual(2);
    expect(orders[0].orderDateISO).toBe('2025-06-03');
    expect(orders[0].total.currencySymbol).toBe('$');
  });

  it('parses amazon.ca orders with US date format', () => {
    const dom = loadSample('amazon.ca', 'order-list.html');
    const orders = parseOrdersFromDocument(dom.window.document);
    expect(orders.length).toBeGreaterThanOrEqual(2);
    expect(orders[0].orderDateISO).toBe('2025-06-03');
    expect(orders[0].total.currencySymbol).toBe('$');
  });

  it('parses amazon.co.uk orders with UK date format', () => {
    const dom = loadSample('amazon.co.uk', 'order-list.html');
    const orders = parseOrdersFromDocument(dom.window.document);
    expect(orders.length).toBeGreaterThanOrEqual(2);
    expect(orders[0].orderDateISO).toBe('2025-06-03');
    expect(orders[0].total.currencySymbol).toBe('£');
  });
});
