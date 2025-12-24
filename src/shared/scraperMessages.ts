import { SCRAPER_MESSAGE_SCOPE } from './constants';

export interface ScraperStartPayload {
  year?: number;
  timeFilterValue?: string;
  timeFilterLabel?: string;
  downloadInvoices?: boolean;
  reuseExistingOrders?: boolean;
  limit: number;
}

export type ScraperMessage = {
  scope: typeof SCRAPER_MESSAGE_SCOPE;
  command: 'START';
  payload: ScraperStartPayload;
};

export const isScraperMessage = (message: unknown): message is ScraperMessage => {
  if (!message || typeof message !== 'object') {
    return false;
  }
  const scoped = message as Partial<ScraperMessage>;
  return scoped.scope === SCRAPER_MESSAGE_SCOPE && scoped.command === 'START';
};
