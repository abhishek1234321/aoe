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
  orders: OrderSummary[];
  hasMorePages?: boolean;
  message?: string;
  yearFilter?: number;
  startedAt?: number;
  completedAt?: number;
  errorMessage?: string;
  updatedAt: number;
}

export interface ScrapeCommandPayload {
  year?: number;
}

export interface ScrapeProgressPayload {
  ordersCollected?: number;
  invoicesQueued?: number;
  message?: string;
  phase?: ScrapePhase;
  completed?: boolean;
  errorMessage?: string;
  orders?: OrderSummary[];
  hasMorePages?: boolean;
}

export const createEmptySession = (): ScrapeSessionSnapshot => ({
  phase: 'idle',
  ordersCollected: 0,
  invoicesQueued: 0,
  ordersLimit: MAX_ORDERS_PER_RUN,
  orders: [],
  hasMorePages: undefined,
  message: undefined,
  yearFilter: undefined,
  startedAt: undefined,
  completedAt: undefined,
  errorMessage: undefined,
  updatedAt: Date.now(),
});
