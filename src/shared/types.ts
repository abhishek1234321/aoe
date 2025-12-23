import { MAX_ORDERS_PER_RUN } from './constants';

export type ScrapePhase = 'idle' | 'running' | 'completed' | 'error';

export interface OrderSummary {
  orderId: string;
  orderDate: string;
  buyerName?: string;
  totalAmount: string;
  currency?: string;
  itemCount: number;
  invoiceUrl?: string;
  status?: string;
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
