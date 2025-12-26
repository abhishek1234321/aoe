import browser from 'webextension-polyfill';
import type { RuntimeMessage, RuntimeResponse } from '../shared/messaging';
import {
  createEmptySession,
  OrderSummary,
  ScrapeProgressPayload,
  ScrapeSessionSnapshot,
} from '../shared/types';
import { AMAZON_HOST, AMAZON_ORDER_HISTORY_URLS, DEBUG_LOGGING, SCRAPER_MESSAGE_SCOPE } from '../shared/constants';
import type { ScraperStartPayload } from '../shared/scraperMessages';
import type { TimeFilterOption } from '../shared/timeFilters';
import { parseInvoiceLinks, selectInvoiceLink } from '../shared/invoice';

let session: ScrapeSessionSnapshot = createEmptySession();
let scrapeTabId: number | null = null;
let invoiceQueueRunning = false;
let cancelInvoiceQueue = false;
let notifyOnCompletion = false;
let badgeClearTimeout: ReturnType<typeof setTimeout> | undefined;
let badgeAcknowledgedAt: number | null = null;

const SESSION_KEY = 'aoe:scrape-session';
const SETTINGS_KEY = 'aoe:settings';

const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOGGING) {
    // eslint-disable-next-line no-console
    console.info('[AOE:bg]', ...args);
  }
};

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
      updateBadge();
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

const hydrateSettings = async () => {
  try {
    const stored = (await browser.storage.local.get(SETTINGS_KEY)) as {
      [SETTINGS_KEY]?: { notifyOnCompletion?: boolean };
    };
    notifyOnCompletion = Boolean(stored?.[SETTINGS_KEY]?.notifyOnCompletion);
  } catch (error) {
    console.warn('Failed to hydrate settings', error);
  }
};

void hydrateSettings();

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  const next = changes[SETTINGS_KEY]?.newValue as { notifyOnCompletion?: boolean } | undefined;
  if (next && typeof next.notifyOnCompletion === 'boolean') {
    notifyOnCompletion = next.notifyOnCompletion;
  }
});

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
  debugLog('updateSession', changes);
  const mergedOrders =
    changes.orders && changes.orders.length ? mergeOrders(session.orders, changes.orders) : session.orders;
  const ordersCount =
    typeof changes.ordersCollected === 'number'
      ? Math.min(changes.ordersCollected, session.ordersLimit)
      : mergedOrders.length;
  const nextInvoices =
    typeof changes.invoicesQueued === 'number' ? Math.max(changes.invoicesQueued, 0) : session.invoicesQueued;
  const nextInvoicesDownloaded =
    typeof changes.invoicesDownloaded === 'number'
      ? Math.max(changes.invoicesDownloaded, 0)
      : session.invoicesDownloaded ?? 0;
  const nextInvoiceErrors =
    typeof changes.invoiceErrors === 'number' ? Math.max(changes.invoiceErrors, 0) : session.invoiceErrors ?? 0;

  session = {
    ...session,
    ...changes,
    orders: mergedOrders,
    ordersCollected: Math.min(ordersCount, session.ordersLimit),
    invoicesQueued: nextInvoices,
    invoicesDownloaded: nextInvoicesDownloaded,
    invoiceErrors: nextInvoiceErrors,
    invoiceDownloadsStarted: changes.invoiceDownloadsStarted ?? session.invoiceDownloadsStarted ?? false,
    downloadInvoicesRequested:
      typeof changes.downloadInvoicesRequested === 'boolean'
        ? changes.downloadInvoicesRequested
        : session.downloadInvoicesRequested ?? false,
    notifiedAt:
      typeof changes.notifiedAt === 'number' ? changes.notifiedAt : session.notifiedAt ?? undefined,
    updatedAt: Date.now(),
    hasMorePages:
      typeof changes.hasMorePages === 'boolean' ? changes.hasMorePages : session.hasMorePages ?? undefined,
  };
  void persistSession();
};

const resetSession = () => {
  session = createEmptySession();
  void persistSession();
  badgeAcknowledgedAt = null;
  updateBadge();
};

const closeScrapeTab = async () => {
  if (!scrapeTabId) {
    return;
  }
  try {
    await browser.tabs.remove(scrapeTabId);
  } catch (error) {
    debugLog('Failed to close scrape tab', error);
  } finally {
    scrapeTabId = null;
  }
};

const cancelScrape = async () => {
  await closeScrapeTab();
  updateSession({
    phase: 'error',
    hasMorePages: false,
    message: 'Scrape cancelled by user',
    errorMessage: undefined,
  });
};

const buildRunId = () => {
  const date = new Date();
  const pad = (num: number) => String(num).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `aoe-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
};

const handleStartScrape = ({
  year,
  timeFilterValue,
  timeFilterLabel,
  downloadInvoices,
  reuseExistingOrders,
}: {
  year?: number;
  timeFilterValue?: string;
  timeFilterLabel?: string;
  downloadInvoices?: boolean;
  reuseExistingOrders?: boolean;
}) => {
  debugLog('handleStartScrape', { year, timeFilterValue, timeFilterLabel, downloadInvoices, reuseExistingOrders });
  const base = reuseExistingOrders ? { ...session, orders: session.orders ?? [] } : createEmptySession();
  const runId = base.runId || buildRunId();
  const existingOrders = base.orders ?? [];
  session = {
    ...base,
    phase: reuseExistingOrders ? 'completed' : 'running',
    runId,
    downloadInvoicesRequested: Boolean(downloadInvoices),
    yearFilter: year,
    timeFilterValue,
    timeFilterLabel,
    invoiceDownloadsStarted: false,
    invoicesDownloaded: 0,
    invoiceErrors: 0,
    invoicesQueued: downloadInvoices ? base.invoicesQueued : 0,
    ordersCollected: reuseExistingOrders ? existingOrders.length : 0,
    message: reuseExistingOrders
      ? `Using existing ${existingOrders.length} orders`
      : timeFilterLabel
        ? `Scraping orders from ${timeFilterLabel}`
        : year
          ? `Scraping orders from ${year}`
          : 'Scraping all available orders',
    startedAt: Date.now(),
    completedAt: reuseExistingOrders ? Date.now() : undefined,
    orders: reuseExistingOrders ? base.orders : [],
    updatedAt: Date.now(),
  };
  void persistSession();
  return session;
};

const handleProgressUpdate = (payload: ScrapeProgressPayload) => {
  debugLog('handleProgressUpdate', payload);
  const changes: Partial<ScrapeSessionSnapshot> = {};

  if (typeof payload.ordersCollected === 'number') {
    changes.ordersCollected = payload.ordersCollected;
  }
  if (session.downloadInvoicesRequested && typeof payload.invoicesQueued === 'number') {
    changes.invoicesQueued = payload.invoicesQueued;
  }
  if (typeof payload.invoicesDownloaded === 'number') {
    changes.invoicesDownloaded = payload.invoicesDownloaded;
  }
  if (typeof payload.invoiceErrors === 'number') {
    changes.invoiceErrors = payload.invoiceErrors;
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
    if (payload.phase === 'completed' || payload.completed) {
      changes.ordersCollected = payload.orders.length;
    }
  }
  if (typeof payload.hasMorePages === 'boolean') {
    changes.hasMorePages = payload.hasMorePages;
  }
  if (changes.ordersCollected && changes.ordersCollected >= session.ordersLimit) {
    changes.phase = 'completed';
    changes.completedAt = Date.now();
    changes.message =
      payload.message ??
      `Collected ${session.ordersLimit} orders — limit reached. Download or reset to scrape another batch.`;
  }

  updateSession(changes);
  updateBadge();
  if (session.phase !== 'running') {
    void closeScrapeTab();
  }

  if (
    session.phase === 'completed' &&
    !session.invoiceDownloadsStarted &&
    session.invoicesQueued &&
    session.downloadInvoicesRequested
  ) {
    void startInvoiceDownloads();
  }
  void maybeNotifyCompletion();
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

const getFilterFallback = (count = 3): TimeFilterOption[] => {
  const current = new Date().getFullYear();
  const years = Array.from({ length: count }, (_, index) => current - index).map((year) => ({
    value: `year-${year}`,
    label: String(year),
    year,
  }));
  return [
    { value: 'last30', label: 'last 30 days' },
    { value: 'months-3', label: 'past 3 months' },
    ...years,
  ];
};

const resolveAmazonUrl = (href: string) => {
  try {
    return new URL(href, AMAZON_HOST).href;
  } catch {
    return href;
  }
};

const buildInvoiceQueue = (): Array<{ orderId: string; invoiceUrl: string }> => {
  const seen = new Set<string>();
  const tasks = session.orders
    .filter((order) => order.invoiceUrl)
    .map((order) => ({ orderId: order.orderId, invoiceUrl: order.invoiceUrl as string }))
    .filter((task) => {
      const key = `${task.orderId}:${task.invoiceUrl}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  return tasks;
};

const fetchInvoiceDownloadUrl = async (invoiceUrl: string) => {
  const absoluteUrl = resolveAmazonUrl(invoiceUrl);
  const response = await fetch(absoluteUrl, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Invoice popover failed with status ${response.status}`);
  }
  const html = await response.text();
  const links = parseInvoiceLinks(html);
  const selected = selectInvoiceLink(links);
  if (!selected?.href) {
    throw new Error('No invoice link found in popover response');
  }
  return resolveAmazonUrl(selected.href);
};

const ensureDownloadsPermission = async () => {
  try {
    const granted = await browser.permissions.contains({ permissions: ['downloads'] });
    if (!granted) {
      updateSession({
        message: 'Enable downloads permission to save invoices.',
        invoiceErrors: (session.invoiceErrors ?? 0) + 1,
      });
    }
    return granted;
  } catch (error) {
    debugLog('Failed to check downloads permission', error);
    updateSession({
      message: 'Unable to verify downloads permission.',
      invoiceErrors: (session.invoiceErrors ?? 0) + 1,
    });
    return false;
  }
};

const downloadInvoice = async (url: string, orderId: string) => {
  const folder = session.runId ? `${session.runId}/` : '';
  await browser.downloads.download({
    url,
    filename: `${folder}${orderId}-invoice.pdf`,
    saveAs: false,
    conflictAction: 'uniquify',
  });
};

const processInvoiceTask = async (task: { orderId: string; invoiceUrl: string }) => {
  try {
    const downloadUrl = await fetchInvoiceDownloadUrl(task.invoiceUrl);
    await downloadInvoice(downloadUrl, task.orderId);
    updateSession({
      invoicesDownloaded: (session.invoicesDownloaded ?? 0) + 1,
      message: `Downloaded invoice ${Math.min(
        (session.invoicesDownloaded ?? 0) + 1,
        session.invoicesQueued,
      )}/${session.invoicesQueued}`,
    });
  } catch (error) {
    debugLog('Invoice download failed', error);
    updateSession({
      invoiceErrors: (session.invoiceErrors ?? 0) + 1,
      message:
        error instanceof Error && error.message.toLowerCase().includes('user gesture')
          ? 'Enable multiple downloads in your browser to save invoices.'
          : `Invoice download failed for ${task.orderId}`,
    });
  }
};

const startInvoiceDownloads = async () => {
  if (!session.downloadInvoicesRequested) {
    return;
  }
  if (invoiceQueueRunning) {
    return;
  }
  const hasPermission = await ensureDownloadsPermission();
  if (!hasPermission) {
    return;
  }
  invoiceQueueRunning = true;
  cancelInvoiceQueue = false;
  const tasks = buildInvoiceQueue();

  updateSession({
    invoicesQueued: session.downloadInvoicesRequested ? tasks.length : 0,
    invoicesDownloaded: 0,
    invoiceErrors: 0,
    invoiceDownloadsStarted: true,
    message: tasks.length ? `Starting invoice downloads (${tasks.length})...` : 'No invoices to download.',
  });

  if (!tasks.length) {
    invoiceQueueRunning = false;
    return;
  }

  const concurrency = Math.min(2, tasks.length);
  let index = 0;
  const worker = async () => {
    while (index < tasks.length) {
      if (cancelInvoiceQueue) {
        return;
      }
      const task = tasks[index];
      index += 1;
      // eslint-disable-next-line no-await-in-loop
      await processInvoiceTask(task);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  updateSession({
    message: cancelInvoiceQueue ? 'Invoice downloads cancelled.' : 'Invoice downloads complete.',
  });
  invoiceQueueRunning = false;
};

const updateBadge = () => {
  if (!browser.action) {
    return;
  }
  if (badgeClearTimeout) {
    clearTimeout(badgeClearTimeout);
    badgeClearTimeout = undefined;
  }
  const acknowledged = badgeAcknowledgedAt ?? 0;
  const now = Date.now();
  const lastUpdate = session.completedAt ?? session.updatedAt;
  const shouldClearBecauseAcknowledged =
    session.phase !== 'running' && lastUpdate && acknowledged >= lastUpdate;
  const shouldClear =
    session.phase !== 'running' && lastUpdate && now - lastUpdate > 120000;
  if (shouldClear || shouldClearBecauseAcknowledged || session.phase === 'idle') {
    void browser.action.setBadgeText({ text: '' });
    void browser.action.setTitle({ title: 'Amazon Order Extractor' });
    return;
  }
  let text = '';
  let color = '#64748b';
  if (session.phase === 'running') {
    text = session.ordersCollected ? String(Math.min(session.ordersCollected, 999)) : '...';
    color = '#1d4ed8';
  } else if (session.phase === 'completed') {
    text = 'DONE';
    color = '#16a34a';
  } else if (session.phase === 'error') {
    text = 'ERR';
    color = '#dc2626';
  }
  void browser.action.setBadgeText({ text });
  void browser.action.setBadgeBackgroundColor({ color });
  if (session.phase === 'running') {
    void browser.action.setTitle({
      title: `Amazon Order Extractor — Running (${session.ordersCollected}/${session.ordersLimit})`,
    });
  } else if (session.phase === 'completed') {
    const count = session.orders.length;
    void browser.action.setTitle({
      title: count ? `Amazon Order Extractor — Completed (${count} orders)` : 'Amazon Order Extractor — No orders found',
    });
  } else if (session.phase === 'error') {
    void browser.action.setTitle({ title: 'Amazon Order Extractor — Error' });
  }
  if (session.phase === 'completed' || session.phase === 'error') {
    badgeClearTimeout = setTimeout(() => {
      void browser.action.setBadgeText({ text: '' });
    }, 120000);
  }
};

const maybeNotifyCompletion = async () => {
  if (!notifyOnCompletion || session.notifiedAt || session.phase !== 'completed') {
    return;
  }
  try {
    const granted = await browser.permissions.contains({ permissions: ['notifications'] });
    if (!granted) {
      return;
    }
    const count = session.orders.length;
    await browser.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Amazon Order Extractor',
      message: count === 0 ? 'No orders found for the selected range.' : `Scrape complete: ${count} orders ready.`,
    });
    updateSession({ notifiedAt: Date.now() });
  } catch (error) {
    debugLog('Failed to send completion notification', error);
  }
};

const triggerContentScraper = async (payload: ScraperStartPayload) => {
  const activeTab = await getActiveTab();
  if (!activeTab?.id) {
    debugLog('No active tab detected');
    throw new Error('No active tab detected. Open amazon.in order history and try again.');
  }

  if (!isSupportedAmazonUrl(activeTab.url)) {
    debugLog('Active tab not supported', activeTab.url);
    throw new Error('Please open the Amazon.in order history page before starting a scrape.');
  }

  if (!payload.reuseExistingOrders) {
    if (scrapeTabId) {
      await closeScrapeTab();
    }

    const scrapeTab = await browser.tabs.create({
      url: activeTab.url,
      active: false,
    });
    scrapeTabId = scrapeTab.id ?? null;
    if (!scrapeTabId) {
      throw new Error('Failed to create scrape tab');
    }

    const waitForReady = (tabId: number) =>
      new Promise<void>((resolve, reject) => {
        const checkImmediate = () => {
          browser.tabs
            .get(tabId)
            .then((tab) => {
              if (tab.status === 'complete') {
                cleanup();
                resolve();
              }
            })
            .catch(() => undefined);
        };
        const cleanup = () => {
          clearTimeout(timeout);
          browser.tabs.onUpdated.removeListener(onUpdated);
        };
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Timed out waiting for scrape tab to load'));
        }, 10000);
        const onUpdated = (tabIdUpdated: number, info: browser.Tabs.OnUpdatedChangeInfoType) => {
          if (tabIdUpdated === tabId && info.status === 'complete') {
            cleanup();
            resolve();
          }
        };
        browser.tabs.onUpdated.addListener(onUpdated);
        checkImmediate();
      });

    await waitForReady(scrapeTabId);
  }

  try {
    debugLog('Sending START to content script', payload);
    if (!scrapeTabId) {
      throw new Error('Scrape tab unavailable');
    }
    await browser.tabs.sendMessage(scrapeTabId, {
      scope: SCRAPER_MESSAGE_SCOPE,
      command: 'START',
      payload,
    });
  } catch (error) {
    debugLog('Failed to reach content script', error);
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Unable to communicate with the content script. Please refresh the page and try again.',
    );
  }
};

browser.runtime.onMessage.addListener((message: RuntimeMessage): Promise<RuntimeResponse<unknown>> => {
  debugLog('runtime message received', message);
  if (!message) {
    return Promise.resolve({ success: false, error: 'Invalid message' });
  }

  switch (message.type) {
    case 'GET_STATE':
      if (session.phase !== 'running') {
        badgeAcknowledgedAt = Date.now();
      }
      updateBadge();
      return Promise.resolve({ success: true, data: { state: session } });

    case 'GET_CONTEXT': {
      if (session.phase !== 'running') {
        badgeAcknowledgedAt = Date.now();
      }
      updateBadge();
      return getActiveTab().then((tab) => ({
        success: true,
        data: { state: session, isSupported: isSupportedAmazonUrl(tab?.url ?? null), url: tab?.url },
      }));
    }

    case 'GET_AVAILABLE_FILTERS': {
      return getActiveTab()
        .then(async (tab) => {
          if (!tab?.id || !isSupportedAmazonUrl(tab.url)) {
            return { success: true, data: { filters: getFilterFallback() } };
          }
          try {
            const response = await browser.tabs.sendMessage(tab.id, {
              scope: SCRAPER_MESSAGE_SCOPE,
              command: 'GET_FILTERS',
            });
            if (Array.isArray(response?.filters) && response.filters.length) {
              return { success: true, data: { filters: response.filters as TimeFilterOption[] } };
            }
          } catch (error) {
            console.warn('Failed to query years from content script', error);
          }
          return { success: true, data: { filters: getFilterFallback() } };
        })
        .catch(() => ({ success: true, data: { filters: getFilterFallback() } }));
    }

    case 'START_SCRAPE': {
      if (session.phase === 'running') {
        return Promise.resolve({ success: false, error: 'Scraper is already running' });
      }
      const startState = handleStartScrape({
        year: message.payload.year,
        timeFilterValue: message.payload.timeFilterValue,
        timeFilterLabel: message.payload.timeFilterLabel,
        downloadInvoices: message.payload.downloadInvoices,
        reuseExistingOrders: message.payload.reuseExistingOrders,
      });
      if (message.payload.reuseExistingOrders) {
        updateSession({
          phase: 'completed',
          ordersCollected: session.orders.length,
        });
        if (message.payload.downloadInvoices) {
          void startInvoiceDownloads();
        }
        return Promise.resolve({ success: true, data: { state: session } });
      }
      const scrapePayload: ScraperStartPayload = {
        year: message.payload.year,
        timeFilterValue: message.payload.timeFilterValue,
        timeFilterLabel: message.payload.timeFilterLabel,
        downloadInvoices: message.payload.downloadInvoices,
        reuseExistingOrders: message.payload.reuseExistingOrders,
        limit: session.ordersLimit,
      };
      return triggerContentScraper(scrapePayload)
        .then(() => {
          if (scrapePayload.reuseExistingOrders) {
            updateSession({
              phase: 'completed',
              message: 'Reusing existing orders, starting invoice downloads...',
            });
            if (scrapePayload.downloadInvoices) {
              void startInvoiceDownloads();
            }
            return { success: true, data: { state: session } };
          }
          return { success: true, data: { state: startState } };
        })
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
      cancelInvoiceQueue = true;
      return Promise.resolve({ success: true, data: { state: session } });
    }
    case 'CANCEL_INVOICE_DOWNLOADS': {
      cancelInvoiceQueue = true;
      updateSession({ message: 'Cancelling invoice downloads...' });
      return Promise.resolve({ success: true, data: { state: session } });
    }
    case 'SET_SETTINGS': {
      if (message.payload && typeof message.payload.notifyOnCompletion === 'boolean') {
        notifyOnCompletion = message.payload.notifyOnCompletion;
        void browser.storage.local.set({ [SETTINGS_KEY]: { notifyOnCompletion } });
      }
      return Promise.resolve({ success: true, data: { state: session } });
    }
    case 'CANCEL_SCRAPE': {
      return cancelScrape().then(() => ({ success: true, data: { state: session } }));
    }

    default:
      return Promise.resolve({ success: false, error: `Unknown message: ${String(message['type'])}` });
  }
});
