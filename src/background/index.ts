import browser from 'webextension-polyfill';
import type { RuntimeMessage, ScrapeResponse } from '../shared/messaging';
import { createEmptySession, ScrapeSessionSnapshot } from '../shared/types';

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

browser.runtime.onMessage.addListener((message: RuntimeMessage): Promise<ScrapeResponse> => {
  if (!message) {
    return Promise.resolve({ success: false, error: 'Invalid message' });
  }

  if (message.type === 'GET_STATE') {
    return Promise.resolve({ success: true, data: { state: session } });
  }

  if (message.type === 'START_SCRAPE') {
    session = {
      ...session,
      phase: 'running',
      yearFilter: message.payload.year,
      message: message.payload.year
        ? `Scraping orders for ${message.payload.year}`
        : 'Scraping all available orders',
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    void persistSession();

    // TODO: kick off actual scraping workflow.
    return Promise.resolve({ success: true, data: { state: session } });
  }

  return Promise.resolve({ success: false, error: `Unknown message: ${String(message['type'])}` });
});
