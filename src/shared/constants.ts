import amazonHosts from './amazonHosts.json';

interface AmazonHostConfig {
  key: string;
  baseUrl: string;
  orderHistoryPaths: string[];
}

const primaryHost = (amazonHosts as AmazonHostConfig[])[0];

export const AMAZON_HOST = primaryHost.baseUrl;
export const AMAZON_ORDER_HISTORY_URLS = primaryHost.orderHistoryPaths.map(
  (path) => `${primaryHost.baseUrl}${path}`,
);
export const MAX_ORDERS_PER_RUN = 1000;
export const SCRAPER_MESSAGE_SCOPE = 'aoe:scraper';
export const DEBUG_LOGGING = Boolean(import.meta.env?.DEV);
