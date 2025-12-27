import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { parseOrdersFromDocument } from '../src/shared/orderParser';

const loadSample = (fileName: string) => {
  const filePath = path.resolve(__dirname, '..', 'docs', 'samples', 'amazon.in', fileName);
  const html = readFileSync(filePath, 'utf-8');
  return new JSDOM(html);
};

describe('order parser', () => {
  it('parses a single order card with expected fields', () => {
    const dom = loadSample('order-single.html');
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
    const dom = loadSample('order-list.html');
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
});
