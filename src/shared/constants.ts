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
const ALLOW_LOCALHOST_E2E = import.meta.env?.VITE_E2E === 'true';
export const SUPPORTED_AMAZON_HOST_KEYS = ['amazon.in', 'amazon.com'] as const;
export const SUPPORTED_AMAZON_HOSTS = AMAZON_HOSTS.filter((host) =>
  SUPPORTED_AMAZON_HOST_KEYS.includes(host.key as (typeof SUPPORTED_AMAZON_HOST_KEYS)[number]),
);

const normalizeHostname = (hostname: string) => hostname.replace(/^www\./i, '').toLowerCase();

export const getAmazonHostForUrl = (url?: string | null): AmazonHostConfig | null => {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    const parsedHost = normalizeHostname(parsed.hostname);
    return (
      AMAZON_HOSTS.find((host) => {
        try {
          const hostName = normalizeHostname(new URL(host.baseUrl).hostname);
          return hostName === parsedHost;
        } catch {
          return false;
        }
      }) ?? null
    );
  } catch {
    return null;
  }
};

export const getAmazonHostForBaseUrl = (baseUrl?: string | null): AmazonHostConfig => {
  if (!baseUrl) {
    return defaultHost;
  }
  const parsedHost = (() => {
    try {
      return normalizeHostname(new URL(baseUrl).hostname);
    } catch {
      return '';
    }
  })();
  return (
    AMAZON_HOSTS.find((host) => {
      try {
        const hostName = normalizeHostname(new URL(host.baseUrl).hostname);
        return hostName === parsedHost;
      } catch {
        return false;
      }
    }) ?? defaultHost
  );
};

export const getAmazonHostForLocale = (
  locale?: string | null,
  allowedHosts: AmazonHostConfig[] = AMAZON_HOSTS,
): AmazonHostConfig => {
  if (!locale) {
    return allowedHosts[0] ?? defaultHost;
  }
  const normalized = locale.toLowerCase();
  const region = normalized.split(/[-_]/)[1] ?? '';
  const key =
    region === 'in'
      ? 'amazon.in'
      : region === 'us'
        ? 'amazon.com'
        : region === 'ca'
          ? 'amazon.ca'
          : region === 'gb' || region === 'uk'
            ? 'amazon.co.uk'
            : '';
  const match = allowedHosts.find((host) => host.key === key);
  return match ?? allowedHosts[0] ?? defaultHost;
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
      if (ALLOW_LOCALHOST_E2E && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
        return fallbackHost.orderHistoryPaths.some((path) => parsed.pathname.startsWith(path));
      }
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
export const SUPPORT_EMAIL = 'abhishek1234321@gmail.com';
