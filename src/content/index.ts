import browser from 'webextension-polyfill';
import { sendRuntimeMessage } from '@shared/messaging';
import { AMAZON_ORDER_HISTORY_URLS } from '@shared/constants';
import { parseOrdersFromDocument } from '@shared/orderParser';
import type { ScrapeProgressPayload } from '@shared/types';
import type { ScraperStartPayload } from '@shared/scraperMessages';
import { isScraperMessage } from '@shared/scraperMessages';

const bannerId = '__aoe-dev-banner';
let isScraping = false;

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

const dispatchProgress = async (payload: ScrapeProgressPayload) => {
  await sendRuntimeMessage({
    type: 'SCRAPE_PROGRESS',
    payload,
  });
};

const executeScrape = async (payload: ScraperStartPayload) => {
  if (isScraping) {
    return;
  }
  isScraping = true;

  try {
    if (!isOrderHistoryPage()) {
      await dispatchProgress({
        phase: 'error',
        errorMessage: 'This page does not look like Amazon order history.',
      });
      return;
    }

    const orders = parseOrdersFromDocument(document);
    const limited = payload.limit ? orders.slice(0, payload.limit) : orders;
    const invoiceCount = limited.filter((order) => Boolean(order.invoiceUrl)).length;

    await dispatchProgress({
      orders: limited,
      ordersCollected: limited.length,
      invoicesQueued: invoiceCount,
      message: `Collected ${limited.length} orders from current page.`,
      completed: true,
    });
  } catch (error) {
    await dispatchProgress({
      phase: 'error',
      errorMessage: error instanceof Error ? error.message : 'Failed to parse the current page.',
    });
  } finally {
    isScraping = false;
  }
};

browser.runtime.onMessage.addListener((message: unknown) => {
  if (!isScraperMessage(message)) {
    return undefined;
  }

  if (message.command === 'START') {
    void executeScrape(message.payload);
  }

  return undefined;
});

injectDevBanner();
