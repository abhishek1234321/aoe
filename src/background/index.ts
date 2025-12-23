import browser from 'webextension-polyfill';
import type { RuntimeMessage, ScrapeResponse } from '../shared/messaging';
import {
  createEmptySession,
  OrderSummary,
  ScrapeProgressPayload,
  ScrapeSessionSnapshot,
} from '../shared/types';
import { AMAZON_ORDER_HISTORY_URLS, SCRAPER_MESSAGE_SCOPE } from '../shared/constants';
import type { ScraperStartPayload } from '../shared/scraperMessages';

let session: ScrapeSessionSnapshot = createEmptySession();

const SESSION_KEY = 'aoe:scrape-session';

const persistSession = async () => {
  try {
    await browser.storage.session.set({ [SESSION_KEY]: session });
  } catch (error) {
    console.warn('Failed to persist session state', error);
  }
};

const hydrateSession = async () => {
  try {
    const stored = (await browser.storage.session.get(SESSION_KEY)) as {
      [SESSION_KEY]?: ScrapeSessionSnapshot;
    };
    if (stored && stored[SESSION_KEY]) {
      session = stored[SESSION_KEY];
    }
  } catch (error) {
    console.warn('Failed to hydrate session state', error);
  }
};

browser.runtime.onInstalled.addListener(() => {
  session = createEmptySession();
  void persistSession();
});

void hydrateSession();

const mergeOrders = (existing: OrderSummary[], incoming: OrderSummary[]): OrderSummary[] => {
  if (!incoming.length) {
    return existing;
  }
  const map = new Map(existing.map((order) => [order.orderId, order]));
  incoming.forEach((order) => {
    map.set(order.orderId, order);
  });
  return Array.from(map.values());
};

const updateSession = (changes: Partial<ScrapeSessionSnapshot>) => {
  const mergedOrders =
    changes.orders && changes.orders.length ? mergeOrders(session.orders, changes.orders) : session.orders;
  const ordersCount =
    typeof changes.ordersCollected === 'number'
      ? Math.min(changes.ordersCollected, session.ordersLimit)
      : mergedOrders.length;
  const nextInvoices =
    typeof changes.invoicesQueued === 'number' ? Math.max(changes.invoicesQueued, 0) : session.invoicesQueued;

  session = {
    ...session,
    ...changes,
    orders: mergedOrders,
    ordersCollected: Math.min(ordersCount, session.ordersLimit),
    invoicesQueued: nextInvoices,
    updatedAt: Date.now(),
  };
  void persistSession();
};

const resetSession = () => {
  session = createEmptySession();
  void persistSession();
};

const handleStartScrape = (year?: number) => {
  const base = createEmptySession();
  session = {
    ...base,
    phase: 'running',
    yearFilter: year,
    message: year ? `Scraping orders from ${year}` : 'Scraping all available orders',
    startedAt: Date.now(),
    orders: [],
    updatedAt: Date.now(),
  };
  void persistSession();
  return session;
};

const handleProgressUpdate = (payload: ScrapeProgressPayload) => {
  const changes: Partial<ScrapeSessionSnapshot> = {};

  if (typeof payload.ordersCollected === 'number') {
    changes.ordersCollected = payload.ordersCollected;
  }
  if (typeof payload.invoicesQueued === 'number') {
    changes.invoicesQueued = payload.invoicesQueued;
  }
  if (payload.message) {
    changes.message = payload.message;
  }
  if (payload.phase) {
    changes.phase = payload.phase;
  }
  if (payload.completed || payload.phase === 'completed') {
    changes.phase = 'completed';
    changes.completedAt = Date.now();
    changes.message = payload.message ?? 'Scrape completed';
    changes.errorMessage = undefined;
  }
  if (payload.phase === 'error' || payload.errorMessage) {
    changes.phase = 'error';
    changes.errorMessage = payload.errorMessage ?? payload.message ?? 'Unknown scraping error';
    changes.message = payload.message ?? 'Encountered an error while scraping';
  }
  if (payload.orders && payload.orders.length) {
    changes.orders = payload.orders;
  }
  if (changes.ordersCollected && changes.ordersCollected >= session.ordersLimit) {
    changes.phase = 'completed';
    changes.completedAt = Date.now();
    changes.message =
      payload.message ??
      `Collected ${session.ordersLimit} orders — limit reached. Download or reset to scrape another batch.`;
  }

  updateSession(changes);
};

const orderHistoryPaths = AMAZON_ORDER_HISTORY_URLS.map((url) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
});

const isSupportedAmazonUrl = (url?: string | null) => {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return orderHistoryPaths.some((path) => parsed.pathname.startsWith(path));
  } catch {
    return false;
  }
};

const getActiveTab = async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
};

const triggerContentScraper = async (payload: ScraperStartPayload) => {
  const activeTab = await getActiveTab();
  if (!activeTab?.id) {
    throw new Error('No active tab detected. Open amazon.in order history and try again.');
  }

  if (!isSupportedAmazonUrl(activeTab.url)) {
    throw new Error('Please open the Amazon.in order history page before starting a scrape.');
  }

  try {
    await browser.tabs.sendMessage(activeTab.id, {
      scope: SCRAPER_MESSAGE_SCOPE,
      command: 'START',
      payload,
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Unable to communicate with the content script. Please refresh the page and try again.',
    );
  }
};

browser.runtime.onMessage.addListener((message: RuntimeMessage): Promise<ScrapeResponse> => {
  if (!message) {
    return Promise.resolve({ success: false, error: 'Invalid message' });
  }

  switch (message.type) {
    case 'GET_STATE':
      return Promise.resolve({ success: true, data: { state: session } });

    case 'START_SCRAPE': {
      if (session.phase === 'running') {
        return Promise.resolve({ success: false, error: 'Scraper is already running' });
      }
      const startState = handleStartScrape(message.payload.year);
      const scrapePayload: ScraperStartPayload = {
        year: message.payload.year,
        limit: session.ordersLimit,
      };
      return triggerContentScraper(scrapePayload)
        .then(() => ({ success: true, data: { state: startState } }))
        .catch((error) => {
          const messageText =
            error instanceof Error ? error.message : 'Unable to reach the Amazon order page content script.';
          updateSession({
            phase: 'error',
            message: messageText,
            errorMessage: messageText,
          });
          return { success: false, error: messageText };
        });
    }

    case 'SCRAPE_PROGRESS': {
      handleProgressUpdate(message.payload);
      return Promise.resolve({ success: true, data: { state: session } });
    }

    case 'RESET_SCRAPE': {
      resetSession();
      return Promise.resolve({ success: true, data: { state: session } });
    }

    default:
      return Promise.resolve({ success: false, error: `Unknown message: ${String(message['type'])}` });
  }
});
