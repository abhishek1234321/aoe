import Papa from 'papaparse';
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
    .flatMap((shipment) => shipment.items.map((item) => item.title))
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

  return Papa.unparse(rows, { columns: CSV_HEADERS });
};
