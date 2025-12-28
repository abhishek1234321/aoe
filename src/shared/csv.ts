import Papa from 'papaparse';
import { formatCurrency } from './format';
import type { OrderSummary } from './types';

const CSV_HEADERS = [
  'Order ID',
  'Order Date',
  'Buyer Name',
  'Total Amount',
  'Currency',
  'Item Count',
  'Shipment Status',
  'Invoice URL',
  'Items',
] as const;

export type CsvRow = Record<(typeof CSV_HEADERS)[number], string>;

const formatItems = (items: OrderSummary['shipments']) => {
  const flattened = items
    .flatMap((shipment) =>
      shipment.items.map((item) => item.title || item.asin || 'Item'),
    )
    .filter(Boolean);
  return flattened.join(' | ');
};

export const ordersToCsv = (orders: OrderSummary[]) => {
  const rows: CsvRow[] = orders.map((order) => ({
    'Order ID': order.orderId,
    'Order Date': order.orderDateISO ?? order.orderDateText ?? '',
    'Buyer Name': order.buyerName ?? '',
    'Total Amount': order.total.raw ?? '',
    Currency: order.currency ?? order.total.currencySymbol ?? '',
    'Item Count': String(order.itemCount ?? order.shipments.flatMap((s) => s.items).length),
    'Shipment Status': order.status ?? order.shipments[0]?.statusPrimary ?? '',
    'Invoice URL': order.invoiceUrl ?? '',
    Items: formatItems(order.shipments),
  }));

  const nonCancelled = orders.filter(
    (order) => !((order.status ?? '').toLowerCase().includes('cancel') || (order.status ?? '').toLowerCase().includes('return')),
  );
  const totalSpend = nonCancelled.reduce((sum, order) => {
    const amt = order.total.amount ?? 0;
    return sum + (Number.isFinite(amt) ? amt : 0);
  }, 0);
  const currency = nonCancelled.find((o) => o.total.currencySymbol)?.total.currencySymbol ?? '';
  rows.push({
    'Order ID': 'Total (non-cancelled)',
    'Order Date': '',
    'Buyer Name': '',
    'Total Amount': formatCurrency(totalSpend, currency),
    Currency: currency,
    'Item Count': '',
    'Shipment Status': '',
    'Invoice URL': '',
    Items: '',
  });

  const buyerGroups = new Map<string, OrderSummary[]>();
  orders.forEach((order) => {
    const label = order.buyerName?.trim() || 'Unknown buyer';
    const existing = buyerGroups.get(label);
    if (existing) {
      existing.push(order);
    } else {
      buyerGroups.set(label, [order]);
    }
  });

  if (buyerGroups.size > 1) {
    const emptyRow: CsvRow = {
      'Order ID': '',
      'Order Date': '',
      'Buyer Name': '',
      'Total Amount': '',
      Currency: '',
      'Item Count': '',
      'Shipment Status': '',
      'Invoice URL': '',
      Items: '',
    };
    rows.push(emptyRow);
    rows.push({
      'Order ID': 'Buyer summary',
      'Order Date': '',
      'Buyer Name': '',
      'Total Amount': '',
      Currency: '',
      'Item Count': '',
      'Shipment Status': '',
      'Invoice URL': '',
      Items: '',
    });
    buyerGroups.forEach((groupOrders, buyerName) => {
      const groupNonCancelled = groupOrders.filter(
        (order) => !((order.status ?? '').toLowerCase().includes('cancel') || (order.status ?? '').toLowerCase().includes('return')),
      );
      const groupSpend = groupNonCancelled.reduce((sum, order) => {
        const amt = order.total.amount ?? 0;
        return sum + (Number.isFinite(amt) ? amt : 0);
      }, 0);
      const groupCurrency = groupNonCancelled.find((o) => o.total.currencySymbol)?.total.currencySymbol ?? '';
      const avg = groupNonCancelled.length ? groupSpend / groupNonCancelled.length : 0;
      rows.push({
        'Order ID': 'Buyer',
        'Order Date': '',
        'Buyer Name': buyerName,
        'Total Amount': formatCurrency(groupSpend, groupCurrency),
        Currency: groupCurrency,
        'Item Count': String(groupOrders.length),
        'Shipment Status': `Non-cancelled: ${groupNonCancelled.length}`,
        'Invoice URL': '',
        Items: groupNonCancelled.length ? `Avg order: ${formatCurrency(avg, groupCurrency)}` : 'Avg order: N/A',
      });
    });
  }

  return Papa.unparse(rows, { columns: CSV_HEADERS });
};
