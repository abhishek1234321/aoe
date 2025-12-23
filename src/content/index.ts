import browser from 'webextension-polyfill';
import { sendRuntimeMessage } from '@shared/messaging';
import { AMAZON_ORDER_HISTORY_URLS, DEBUG_LOGGING } from '@shared/constants';
import { parseOrdersFromDocument } from '@shared/orderParser';
import type { ScrapeProgressPayload, ScrapeSessionSnapshot } from '@shared/types';
import type { ScraperStartPayload } from '@shared/scraperMessages';
import { isScraperMessage } from '@shared/scraperMessages';

const bannerId = '__aoe-dev-banner';
let isScraping = false;
const AUTO_SCRAPE_STORAGE_KEY = '__aoe:auto-scrape';
const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOGGING) {
    // eslint-disable-next-line no-console
    console.info('[AOE:content]', ...args);
  }
};

const allowedPaths = AMAZON_ORDER_HISTORY_URLS.map((url) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
});

const isOrderHistoryPage = () => {
  try {
    return allowedPaths.some((path) => window.location.pathname.startsWith(path));
  } catch {
    return false;
  }
};

const injectDevBanner = () => {
  if (!import.meta.env.DEV) {
    return;
  }
  if (document.getElementById(bannerId)) {
    return;
  }

  const banner = document.createElement('div');
  banner.id = bannerId;
  banner.textContent = 'Amazon Order Extractor ready';
  banner.style.position = 'fixed';
  banner.style.bottom = '16px';
  banner.style.right = '16px';
  banner.style.padding = '4px 8px';
  banner.style.fontSize = '12px';
  banner.style.background = '#232f3e';
  banner.style.color = '#fff';
  banner.style.borderRadius = '4px';
  banner.style.zIndex = '2147483647';
  banner.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.3)';
  banner.style.pointerEvents = 'none';
  document.body.appendChild(banner);
};

const dispatchProgress = async (payload: ScrapeProgressPayload) =>
  sendRuntimeMessage<{ state: ScrapeSessionSnapshot }>({
    type: 'SCRAPE_PROGRESS',
    payload,
  });

const getNextPageLink = (): HTMLAnchorElement | null => {
  const pagination = document.querySelector('.a-pagination');
  if (!pagination) {
    return null;
  }
  const lastItem = pagination.querySelector<HTMLLIElement>('li.a-last');
  if (!lastItem || lastItem.classList.contains('a-disabled')) {
    return null;
  }
  return lastItem.querySelector<HTMLAnchorElement>('a') ?? null;
};

const saveAutoContinuePayload = (payload: ScraperStartPayload | null) => {
  if (payload) {
    sessionStorage.setItem(AUTO_SCRAPE_STORAGE_KEY, JSON.stringify(payload));
  } else {
    sessionStorage.removeItem(AUTO_SCRAPE_STORAGE_KEY);
  }
};

const executeScrape = async (payload: ScraperStartPayload) => {
  if (isScraping) {
    debugLog('Scrape already running, skipping duplicate');
    return;
  }
  isScraping = true;

  try {
    if (!isOrderHistoryPage()) {
      debugLog('Not an order history page');
      await dispatchProgress({
        phase: 'error',
        errorMessage: 'This page does not look like Amazon order history.',
      });
      return;
    }

    debugLog('Parsing orders for payload', payload);
    const orders = parseOrdersFromDocument(document);
    const invoiceCount = orders.filter((order) => Boolean(order.invoiceUrl)).length;
    const nextLink = getNextPageLink();

    debugLog('Parsed orders', { count: orders.length, invoiceCount, hasNext: Boolean(nextLink) });
    const response = await dispatchProgress({
      orders,
      invoicesQueued: invoiceCount,
      hasMorePages: Boolean(nextLink),
      message: `Collected ${orders.length} orders from current page.`,
      completed: !nextLink,
    });

    const nextState = response.success ? response.data?.state : undefined;
    const shouldContinue =
      Boolean(nextLink) &&
      nextState?.phase === 'running' &&
      (nextState?.ordersCollected ?? 0) < (nextState?.ordersLimit ?? payload.limit ?? Infinity);

    if (shouldContinue && nextLink) {
      debugLog('Auto-advancing to next page');
      saveAutoContinuePayload(payload);
      nextLink.click();
    } else {
      debugLog('Stopping auto-advance', { shouldContinue, hasNext: Boolean(nextLink) });
      saveAutoContinuePayload(null);
    }
  } catch (error) {
    debugLog('Error during scrape', error);
    await dispatchProgress({
      phase: 'error',
      errorMessage: error instanceof Error ? error.message : 'Failed to parse the current page.',
    });
  } finally {
    isScraping = false;
  }
};

const extractAvailableYears = (): number[] => {
  const select = document.querySelector<HTMLSelectElement>('#time-filter');
  if (!select) {
    return [];
  }
  const years = new Set<number>();
  select.querySelectorAll('option').forEach((option) => {
    const value = option.value ?? option.getAttribute('value') ?? '';
    const match = value.match(/year-(\d{4})/i);
    if (match) {
      const parsed = Number(match[1]);
      if (!Number.isNaN(parsed)) {
        years.add(parsed);
      }
    }
  });
  return Array.from(years).sort((a, b) => b - a);
};

browser.runtime.onMessage.addListener((message: unknown) => {
  if (isScraperMessage(message)) {
    if (message.command === 'START') {
      debugLog('Received START command', message.payload);
      void executeScrape(message.payload);
    }
    return undefined;
  }

  if (
    typeof message === 'object' &&
    message !== null &&
    'command' in message &&
    (message as { command: string }).command === 'GET_YEARS'
  ) {
    const years = extractAvailableYears();
    debugLog('Extracted available years', years);
    return Promise.resolve({ years });
  }

  return undefined;
});

injectDevBanner();

const autoPayloadRaw = sessionStorage.getItem(AUTO_SCRAPE_STORAGE_KEY);
if (autoPayloadRaw) {
  try {
    const parsed = JSON.parse(autoPayloadRaw) as ScraperStartPayload;
    saveAutoContinuePayload(parsed);
    void executeScrape(parsed);
  } catch {
    saveAutoContinuePayload(null);
  }
}
