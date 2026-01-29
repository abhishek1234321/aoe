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

  it('parses localized invoice and order details links', () => {
    const dom = new JSDOM(`
      <div class="order-card">
        <div class="order-header__header-list-item">
          <span class="a-text-caps">Order placed</span>
          <span class="a-size-base">3 June 2025</span>
        </div>
        <div class="order-header__header-list-item">
          <span class="a-text-caps">Total</span>
          <span class="a-size-base">£12.34</span>
        </div>
        <div class="yohtmlc-order-id">
          <span class="a-text-caps">Order #</span>
          <span class="a-size-base">701-0000000-0000009</span>
        </div>
        <a href="/your-orders/order-details?orderID=701-0000000-0000009">Détails de la commande</a>
        <a href="/your-orders/invoice/popover?orderId=701-0000000-0000009">Facture</a>
      </div>
    `);
    const orders = parseOrdersFromDocument(dom.window.document);
    expect(orders).toHaveLength(1);
    expect(orders[0].orderId).toBe('701-0000000-0000009');
    expect(orders[0].orderDetailsUrl).toContain('/your-orders/order-details');
    expect(orders[0].invoiceUrl).toContain('/your-orders/invoice');
  });

  describe('empty orders page', () => {
    it('returns empty array when no order cards exist', () => {
      const dom = loadSample('amazon.com', 'empty-orders.html');
      const orders = parseOrdersFromDocument(dom.window.document);
      expect(orders).toHaveLength(0);
    });

    it('handles page with only page structure but no orders', () => {
      const dom = new JSDOM(`
        <html>
          <body>
            <div class="your-orders-content-container">
              <div class="a-row a-spacing-base">
                <form class="js-time-filter-form">
                  <label class="time-filter__label">
                    <span class="num-orders">0 orders</span> placed in
                  </label>
                  <select id="time-filter">
                    <option value="months-3" selected>past 3 months</option>
                  </select>
                </form>
              </div>
              <div class="a-text-center">
                Looks like you haven't placed an order in the last 3 months.
              </div>
            </div>
          </body>
        </html>
      `);
      const orders = parseOrdersFromDocument(dom.window.document);
      expect(orders).toHaveLength(0);
    });
  });

  describe('Amazon Pay Later bill filtering', () => {
    it('filters out Amazon Pay Later bill payments (fixture)', () => {
      const dom = loadSample('amazon.in', 'pay-later-bill.html');
      const orders = parseOrdersFromDocument(dom.window.document);
      // Pay Later bills should be filtered out
      expect(orders).toHaveLength(0);
    });

    it('filters out orders with "Amazon Pay Later Bill" title', () => {
      const dom = new JSDOM(`
        <div class="order-card">
          <div class="order-header__header-list-item">
            <span class="a-text-caps">Order placed</span>
            <span class="a-size-base">28 January 2026</span>
          </div>
          <div class="order-header__header-list-item">
            <span class="a-text-caps">Total</span>
            <span class="a-size-base">₹2,500.00</span>
          </div>
          <div class="yohtmlc-order-id">
            <span dir="ltr">405-2222222-2222222</span>
          </div>
          <div class="delivery-box">
            <div class="item-box">
              <div class="yohtmlc-product-title">
                <a href="/some-other-url">Amazon Pay Later Bill</a>
              </div>
            </div>
          </div>
        </div>
      `);
      const orders = parseOrdersFromDocument(dom.window.document);
      expect(orders).toHaveLength(0);
    });

    it('filters out orders with "Amazon Pay Bill" title (variant)', () => {
      const dom = new JSDOM(`
        <div class="order-card">
          <div class="order-header__header-list-item">
            <span class="a-text-caps">Order placed</span>
            <span class="a-size-base">28 January 2026</span>
          </div>
          <div class="order-header__header-list-item">
            <span class="a-text-caps">Total</span>
            <span class="a-size-base">₹500.00</span>
          </div>
          <div class="yohtmlc-order-id">
            <span dir="ltr">405-3333333-3333333</span>
          </div>
          <div class="delivery-box">
            <div class="item-box">
              <div class="yohtmlc-product-title">
                <a href="/dp/XXXXXXXXXX">Amazon Pay Bill</a>
              </div>
            </div>
          </div>
        </div>
      `);
      const orders = parseOrdersFromDocument(dom.window.document);
      expect(orders).toHaveLength(0);
    });

    it('keeps regular product orders (not Pay Later)', () => {
      const dom = new JSDOM(`
        <div class="order-card">
          <div class="order-header__header-list-item">
            <span class="a-text-caps">Order placed</span>
            <span class="a-size-base">28 January 2026</span>
          </div>
          <div class="order-header__header-list-item">
            <span class="a-text-caps">Total</span>
            <span class="a-size-base">₹1,999.00</span>
          </div>
          <div class="yohtmlc-order-id">
            <span dir="ltr">111-4444444-4444444</span>
          </div>
          <div class="delivery-box">
            <div class="item-box">
              <div class="yohtmlc-product-title">
                <a href="/dp/B08N5WRWNW">Regular Product Item</a>
              </div>
            </div>
          </div>
        </div>
      `);
      const orders = parseOrdersFromDocument(dom.window.document);
      expect(orders).toHaveLength(1);
      expect(orders[0].orderId).toBe('111-4444444-4444444');
    });

    it('keeps orders with mixed items (not all Pay Later)', () => {
      const dom = new JSDOM(`
        <div class="order-card">
          <div class="order-header__header-list-item">
            <span class="a-text-caps">Order placed</span>
            <span class="a-size-base">28 January 2026</span>
          </div>
          <div class="order-header__header-list-item">
            <span class="a-text-caps">Total</span>
            <span class="a-size-base">₹3,500.00</span>
          </div>
          <div class="yohtmlc-order-id">
            <span dir="ltr">111-5555555-5555555</span>
          </div>
          <div class="delivery-box">
            <div class="item-box">
              <div class="yohtmlc-product-title">
                <a href="/dp/B0BWF9ZQMN">Amazon Pay Later Bill</a>
              </div>
            </div>
            <div class="item-box">
              <div class="yohtmlc-product-title">
                <a href="/dp/B08N5WRWNW">Regular Product</a>
              </div>
            </div>
          </div>
        </div>
      `);
      const orders = parseOrdersFromDocument(dom.window.document);
      // Mixed orders are kept (edge case - unlikely in practice)
      expect(orders).toHaveLength(1);
    });
  });
});
