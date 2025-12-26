import { describe, expect, it } from 'vitest';
import { computeHighlights } from '../src/shared/highlights';
import type { OrderSummary } from '../src/shared/types';

describe('computeHighlights', () => {
  it('summarizes totals and item repeats', () => {
    const orders: OrderSummary[] = [
      {
        orderId: 'ORDER-1',
        orderDateISO: '2025-01-10',
        buyerName: 'Test Buyer',
        totalAmount: '₹100.00',
        total: { raw: '₹100.00', amount: 100, currencySymbol: '₹' },
        currency: 'INR',
        itemCount: 2,
        invoiceUrl: '',
        status: 'Delivered',
        shipments: [
          {
            statusPrimary: 'Delivered',
            statusSecondary: '',
            actions: [],
            items: [{ title: 'Item A' }, { title: 'Item B' }],
          },
        ],
      },
      {
        orderId: 'ORDER-2',
        orderDateISO: '2025-01-15',
        buyerName: 'Test Buyer',
        totalAmount: '₹50.00',
        total: { raw: '₹50.00', amount: 50, currencySymbol: '₹' },
        currency: 'INR',
        itemCount: 1,
        invoiceUrl: '',
        status: 'Delivered',
        shipments: [
          {
            statusPrimary: 'Delivered',
            statusSecondary: '',
            actions: [],
            items: [{ title: 'Item A' }],
          },
        ],
      },
      {
        orderId: 'ORDER-3',
        orderDateISO: '2025-02-05',
        buyerName: 'Test Buyer',
        totalAmount: '₹25.00',
        total: { raw: '₹25.00', amount: 25, currencySymbol: '₹' },
        currency: 'INR',
        itemCount: 1,
        invoiceUrl: '',
        status: 'Cancelled',
        shipments: [
          {
            statusPrimary: 'Cancelled',
            statusSecondary: '',
            actions: [],
            items: [{ title: 'Item C' }],
          },
        ],
      },
    ];

    const highlights = computeHighlights(orders, 'year-2025');

    expect(highlights.totalOrders).toBe(3);
    expect(highlights.nonCancelledOrders).toBe(2);
    expect(highlights.totalSpend).toBe(150);
    expect(highlights.avgOrderValue).toBe(75);
    expect(highlights.formattedSpend).toContain('150');
    expect(highlights.topItems[0]).toMatchObject({ label: 'Item A', count: 2 });
    expect(highlights.uniqueItems).toBe(2);
    expect(highlights.repeatItems).toBe(1);
    expect(highlights.topPeriod?.count).toBe(2);
    expect(highlights.topPeriod?.label).toContain('2025');
  });
});
