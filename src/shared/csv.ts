import Papa from 'papaparse';
import { resolveAmazonUrl } from './constants';
import { formatCurrency } from './format';
import type { OrderSummary } from './types';

const CSV_HEADERS = [
  'Order ID',
  'Order Date',
  'Items',
  'Item Count',
  'Buyer Name',
  'Total Amount',
  'Currency',
  'Shipment Status',
  'Order Details URL',
  'Invoice URL',
] as const;

export type CsvRow = Record<(typeof CSV_HEADERS)[number], string>;

const formatItems = (items: OrderSummary['shipments']) => {
  const flattened = items
    .flatMap((shipment) => shipment.items.map((item) => item.title || item.asin || 'Item'))
    .filter(Boolean);
  return flattened.join(' | ');
};

const formatOrderDetailsUrl = (order: OrderSummary, baseUrl?: string | null) => {
  if (order.orderDetailsUrl) {
    return resolveAmazonUrl(order.orderDetailsUrl, baseUrl);
  }
  if (order.orderId) {
    return resolveAmazonUrl(
      `/your-orders/order-details?orderID=${encodeURIComponent(order.orderId)}`,
      baseUrl,
    );
  }
  return '';
};

const formatInvoiceUrl = (order: OrderSummary, baseUrl?: string | null) => {
  if (!order.invoiceUrl) {
    return '';
  }
  return resolveAmazonUrl(order.invoiceUrl, baseUrl);
};

export const ordersToCsv = (orders: OrderSummary[], baseUrl?: string | null) => {
  const rows: CsvRow[] = orders.map((order) => ({
    'Order ID': order.orderId,
    'Order Date': order.orderDateISO ?? order.orderDateText ?? '',
    Items: formatItems(order.shipments),
    'Item Count': String(order.itemCount ?? order.shipments.flatMap((s) => s.items).length),
    'Buyer Name': order.buyerName ?? '',
    'Total Amount': order.total.raw ?? '',
    Currency: order.currency ?? order.total.currencySymbol ?? '',
    'Shipment Status': order.status ?? order.shipments[0]?.statusPrimary ?? '',
    'Order Details URL': formatOrderDetailsUrl(order, baseUrl),
    'Invoice URL': formatInvoiceUrl(order, baseUrl),
  }));

  const nonCancelled = orders.filter(
    (order) =>
      !(
        (order.status ?? '').toLowerCase().includes('cancel') ||
        (order.status ?? '').toLowerCase().includes('return')
      ),
  );
  const totalSpend = nonCancelled.reduce((sum, order) => {
    const amt = order.total.amount ?? 0;
    return sum + (Number.isFinite(amt) ? amt : 0);
  }, 0);
  const currency = nonCancelled.find((o) => o.total.currencySymbol)?.total.currencySymbol ?? '';
  rows.push({
    'Order ID': 'Total (non-cancelled)',
    'Order Date': '',
    Items: '',
    'Item Count': '',
    'Buyer Name': '',
    'Total Amount': formatCurrency(totalSpend, currency),
    Currency: currency,
    'Shipment Status': '',
    'Order Details URL': '',
    'Invoice URL': '',
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
      Items: '',
      'Item Count': '',
      'Buyer Name': '',
      'Total Amount': '',
      Currency: '',
      'Shipment Status': '',
      'Order Details URL': '',
      'Invoice URL': '',
    };
    rows.push(emptyRow);
    rows.push({
      'Order ID': 'Buyer summary',
      'Order Date': '',
      Items: '',
      'Item Count': '',
      'Buyer Name': '',
      'Total Amount': '',
      Currency: '',
      'Shipment Status': '',
      'Order Details URL': '',
      'Invoice URL': '',
    });
    buyerGroups.forEach((groupOrders, buyerName) => {
      const groupNonCancelled = groupOrders.filter(
        (order) =>
          !(
            (order.status ?? '').toLowerCase().includes('cancel') ||
            (order.status ?? '').toLowerCase().includes('return')
          ),
      );
      const groupSpend = groupNonCancelled.reduce((sum, order) => {
        const amt = order.total.amount ?? 0;
        return sum + (Number.isFinite(amt) ? amt : 0);
      }, 0);
      const groupCurrency =
        groupNonCancelled.find((o) => o.total.currencySymbol)?.total.currencySymbol ?? '';
      const avg = groupNonCancelled.length ? groupSpend / groupNonCancelled.length : 0;
      rows.push({
        'Order ID': 'Buyer',
        'Order Date': '',
        Items: groupNonCancelled.length
          ? `Avg order: ${formatCurrency(avg, groupCurrency)}`
          : 'Avg order: N/A',
        'Item Count': String(groupOrders.length),
        'Buyer Name': buyerName,
        'Total Amount': formatCurrency(groupSpend, groupCurrency),
        Currency: groupCurrency,
        'Shipment Status': `Non-cancelled: ${groupNonCancelled.length}`,
        'Order Details URL': '',
        'Invoice URL': '',
      });
    });
  }

  return Papa.unparse(rows, { columns: CSV_HEADERS });
};
