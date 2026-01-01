import browser from 'webextension-polyfill';
import { sendRuntimeMessage } from '@shared/messaging';
import { AMAZON_ORDER_HISTORY_URLS, DEBUG_LOGGING } from '@shared/constants';
import { parseOrdersFromDocument } from '@shared/orderParser';
import type { ScrapeProgressPayload, ScrapeSessionSnapshot } from '@shared/types';
import type { ScraperStartPayload } from '@shared/scraperMessages';
import { isScraperMessage } from '@shared/scraperMessages';
import { applyTimeFilter, extractTimeFilters } from '@shared/timeFilters';

const bannerId = '__aoe-dev-banner';
let isScraping = false;
const AUTO_SCRAPE_STORAGE_KEY = '__aoe:auto-scrape';
const PAGE_COUNT_KEY = '__aoe:page-count';
const PAGE_RUN_KEY = '__aoe:page-run';
const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOGGING) {
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

const getOrdersInRange = (doc: Document): number | undefined => {
  const label = doc.querySelector('.time-filter__label .num-orders')?.textContent?.trim();
  const fallback = doc.querySelector('.num-orders')?.textContent?.trim();
  const text = label || fallback;
  if (!text) {
    return undefined;
  }
  const match = text.match(/[\d,]+/);
  if (!match) {
    return undefined;
  }
  const count = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(count) ? count : undefined;
};

const saveAutoContinuePayload = (payload: ScraperStartPayload | null) => {
  if (payload) {
    sessionStorage.setItem(AUTO_SCRAPE_STORAGE_KEY, JSON.stringify(payload));
  } else {
    sessionStorage.removeItem(AUTO_SCRAPE_STORAGE_KEY);
  }
};

const getNextPageCount = (payload: ScraperStartPayload) => {
  const runId = payload.runId ?? '';
  const storedRunId = sessionStorage.getItem(PAGE_RUN_KEY);
  if (storedRunId !== runId) {
    sessionStorage.setItem(PAGE_RUN_KEY, runId);
    sessionStorage.setItem(PAGE_COUNT_KEY, '0');
  }
  const current = Number(sessionStorage.getItem(PAGE_COUNT_KEY) ?? '0') || 0;
  const next = current + 1;
  sessionStorage.setItem(PAGE_COUNT_KEY, String(next));
  return next;
};

const waitForYearSelect = (timeoutMs = 8000, intervalMs = 150): Promise<HTMLSelectElement | null> =>
  new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const select = document.querySelector<HTMLSelectElement>('#time-filter');
      if (select) {
        resolve(select);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });

const ensureTimeFilter = async (payload: ScraperStartPayload) => {
  const { year, timeFilterValue } = payload;
  await waitForYearSelect();
  const result = applyTimeFilter(document, timeFilterValue, year);
  if (result.changed) {
    debugLog('Applying time filter and waiting for reload', { timeFilterValue, year });
    saveAutoContinuePayload(payload);
    const label = payload.timeFilterLabel ?? (year ? String(year) : timeFilterValue);
    await dispatchProgress({
      phase: 'running',
      message: `Switching to ${label ?? 'selected range'}…`,
      hasMorePages: true,
    });
  }
  return result.changed;
};

const extractFiltersWithRetry = async (timeoutMs = 8000, intervalMs = 150) => {
  const start = Date.now();
  let filters: ReturnType<typeof extractTimeFilters> = [];
  while (Date.now() - start < timeoutMs) {
    filters = extractTimeFilters(document);
    if (filters.length) {
      return filters;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return filters;
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

    const waitingForTimeFilter = await ensureTimeFilter(payload);
    if (waitingForTimeFilter) {
      debugLog('Time filter applied; waiting for page reload before scraping');
      return;
    }

    debugLog('Parsing orders for payload', payload);
    const orders = parseOrdersFromDocument(document);
    const ordersInRange = getOrdersInRange(document);
    const pagesScraped = getNextPageCount(payload);
    const invoiceCount = orders.filter((order) => Boolean(order.invoiceUrl)).length;
    const nextLink = getNextPageLink();

    debugLog('Parsed orders', { count: orders.length, invoiceCount, hasNext: Boolean(nextLink) });
    const response = await dispatchProgress({
      orders,
      ordersInRange,
      pagesScraped,
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

browser.runtime.onMessage.addListener((message: unknown, sender: browser.Runtime.MessageSender) => {
  if (sender?.id && sender.id !== browser.runtime.id) {
    return undefined;
  }
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
    (message as { command: string }).command === 'GET_FILTERS'
  ) {
    return waitForYearSelect()
      .then(() => extractFiltersWithRetry())
      .then((filters) => {
        debugLog('Extracted available filters', filters);
        return { filters };
      })
      .catch((error) => {
        debugLog('Failed to extract filters', error);
        return { filters: [] };
      });
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
