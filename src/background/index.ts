import browser from 'webextension-polyfill';
import type { RuntimeMessage, ScrapeResponse } from '../shared/messaging';
import {
  createEmptySession,
  ScrapeProgressPayload,
  ScrapeSessionSnapshot,
} from '../shared/types';

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

const updateSession = (changes: Partial<ScrapeSessionSnapshot>) => {
  const nextOrders =
    typeof changes.ordersCollected === 'number'
      ? Math.min(changes.ordersCollected, session.ordersLimit)
      : session.ordersCollected;
  const nextInvoices =
    typeof changes.invoicesQueued === 'number' ? Math.max(changes.invoicesQueued, 0) : session.invoicesQueued;

  session = {
    ...session,
    ...changes,
    ordersCollected: nextOrders,
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
  if (changes.ordersCollected && changes.ordersCollected >= session.ordersLimit) {
    changes.phase = 'completed';
    changes.completedAt = Date.now();
    changes.message =
      payload.message ??
      `Collected ${session.ordersLimit} orders — limit reached. Download or reset to scrape another batch.`;
  }

  updateSession(changes);
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
      // TODO: trigger content-script orchestration here.
      return Promise.resolve({ success: true, data: { state: startState } });
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
