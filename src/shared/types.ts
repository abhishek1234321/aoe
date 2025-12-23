import { MAX_ORDERS_PER_RUN } from './constants';

export type ScrapePhase = 'idle' | 'running' | 'completed' | 'error';

export interface OrderAction {
  label: string;
  href: string;
}

export interface OrderItem {
  title: string;
  url?: string;
  asin?: string;
  imageUrl?: string;
}

export interface OrderShipment {
  statusPrimary?: string;
  statusSecondary?: string;
  actions: OrderAction[];
  items: OrderItem[];
}

export interface OrderTotal {
  raw: string | null;
  amount?: number;
  currencySymbol?: string;
}

export interface OrderSummary {
  orderId: string;
  orderDateText?: string;
  orderDateISO?: string;
  buyerName?: string;
  totalAmount?: string;
  total: OrderTotal;
  currency?: string;
  itemCount: number;
  invoiceUrl?: string;
  status?: string;
  shipments: OrderShipment[];
}

export interface ScrapeSessionSnapshot {
  phase: ScrapePhase;
  ordersCollected: number;
  invoicesQueued: number;
  ordersLimit: number;
  message?: string;
  yearFilter?: number;
  startedAt?: number;
  updatedAt: number;
}

export interface ScrapeCommandPayload {
  year?: number;
}

export const createEmptySession = (): ScrapeSessionSnapshot => ({
  phase: 'idle',
  ordersCollected: 0,
  invoicesQueued: 0,
  ordersLimit: MAX_ORDERS_PER_RUN,
  message: undefined,
  yearFilter: undefined,
  startedAt: undefined,
  updatedAt: Date.now(),
});
