import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { ordersToCsv } from '../src/shared/csv';
import type { CsvRow } from '../src/shared/csv';
import type { OrderSummary } from '../src/shared/types';

describe('ordersToCsv', () => {
  it('includes a totals row and flattens item titles', () => {
    const orders: OrderSummary[] = [
      {
        orderId: 'ORDER-1',
        orderDateISO: '2025-01-10',
        buyerName: 'Test Buyer',
        totalAmount: '₹100.00',
        total: { raw: '₹100.00', amount: 100, currencySymbol: '₹' },
        currency: 'INR',
        itemCount: 2,
        invoiceUrl: '/your-orders/invoice/popover?orderId=ORDER-1',
        orderDetailsUrl: '/your-orders/order-details?orderID=ORDER-1',
        status: 'Delivered',
        shipments: [
          {
            statusPrimary: 'Delivered',
            statusSecondary: '',
            actions: [],
            items: [{ title: 'Item One' }, { title: 'Item Two' }],
          },
        ],
      },
      {
        orderId: 'ORDER-2',
        orderDateISO: '2025-01-12',
        buyerName: 'Test Buyer',
        totalAmount: '₹50.00',
        total: { raw: '₹50.00', amount: 50, currencySymbol: '₹' },
        currency: 'INR',
        itemCount: 1,
        invoiceUrl: '',
        status: 'Cancelled',
        shipments: [
          {
            statusPrimary: 'Cancelled',
            statusSecondary: '',
            actions: [],
            items: [{ title: 'Item Three' }],
          },
        ],
      },
    ];

    const csvText = ordersToCsv(orders, 'https://www.amazon.in');
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const rows = parsed.data as CsvRow[];

    expect(rows).toHaveLength(3);
    expect(rows[0]['Order ID']).toBe('ORDER-1');
    expect(rows[0].Items).toBe('Item One | Item Two');
    expect(rows[0]['Order Details URL']).toBe('https://www.amazon.in/your-orders/order-details?orderID=ORDER-1');
    expect(rows[0]['Invoice URL']).toBe('https://www.amazon.in/your-orders/invoice/popover?orderId=ORDER-1');
    expect(rows[1]['Order ID']).toBe('ORDER-2');
    expect(rows[2]['Order ID']).toBe('Total (non-cancelled)');
    expect(rows[2]['Total Amount']).toBe('₹ 100.00');
    expect(rows[2].Currency).toBe('₹');
  });
});
