import amazonHosts from './amazonHosts.json';

export interface AmazonHostConfig {
  key: string;
  baseUrl: string;
  orderHistoryPaths: string[];
}

export const AMAZON_HOSTS = amazonHosts as AmazonHostConfig[];
const fallbackHost: AmazonHostConfig = {
  key: 'amazon.in',
  baseUrl: 'https://www.amazon.in',
  orderHistoryPaths: ['/gp/css/order-history', '/gp/your-account/order-history', '/your-orders'],
};
const defaultHost = AMAZON_HOSTS[0] ?? fallbackHost;

export const DEFAULT_AMAZON_HOST = defaultHost.baseUrl;
export const AMAZON_ORDER_HISTORY_URLS = AMAZON_HOSTS.flatMap((host) =>
  host.orderHistoryPaths.map((path) => `${host.baseUrl}${path}`),
);

export const getAmazonHostForUrl = (url?: string | null): AmazonHostConfig | null => {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    return AMAZON_HOSTS.find((host) => host.baseUrl === parsed.origin) ?? null;
  } catch {
    return null;
  }
};

export const getAmazonHostForBaseUrl = (baseUrl?: string | null): AmazonHostConfig => {
  if (!baseUrl) {
    return defaultHost;
  }
  return AMAZON_HOSTS.find((host) => host.baseUrl === baseUrl) ?? defaultHost;
};

export const getOrderHistoryUrl = (urlOrBase?: string | null): string => {
  const host = getAmazonHostForUrl(urlOrBase) ?? getAmazonHostForBaseUrl(urlOrBase);
  const path = host.orderHistoryPaths[0] ?? '/your-orders';
  return `${host.baseUrl}${path}`;
};

export const isAmazonOrderHistoryUrl = (url?: string | null): boolean => {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const host = getAmazonHostForUrl(url);
    if (!host) {
      return false;
    }
    return host.orderHistoryPaths.some((path) => parsed.pathname.startsWith(path));
  } catch {
    return false;
  }
};

export const resolveAmazonUrl = (href: string, baseUrl?: string | null): string => {
  try {
    return new URL(href, baseUrl ?? DEFAULT_AMAZON_HOST).href;
  } catch {
    return href;
  }
};

export const MAX_ORDERS_PER_RUN = 1000;
export const SCRAPER_MESSAGE_SCOPE = 'aoe:scraper';
export const DEBUG_LOGGING = Boolean(import.meta.env?.DEV);
export const SUPPORT_EMAIL = 'aoesupport@gmail.com';
