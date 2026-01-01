import browser from 'webextension-polyfill';
import type { RuntimeMessage, RuntimeResponse } from '../shared/messaging';
import {
  createEmptySession,
  InvoiceFailure,
  OrderSummary,
  ScrapeProgressPayload,
  ScrapeSessionSnapshot,
} from '../shared/types';
import {
  DEFAULT_AMAZON_HOST,
  DEBUG_LOGGING,
  SCRAPER_MESSAGE_SCOPE,
  getAmazonHostForUrl,
  isAmazonOrderHistoryUrl,
  resolveAmazonUrl,
} from '../shared/constants';
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
let invoiceFailureMap = new Map<string, InvoiceFailure>();

const SESSION_KEY = 'aoe:scrape-session';
const SETTINGS_KEY = 'aoe:settings';

const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOGGING) {
    console.info('[AOE:bg]', ...args);
  }
};

const ALLOW_E2E = import.meta.env?.VITE_E2E === 'true';

const isAuthorizedSender = (sender?: browser.Runtime.MessageSender) =>
  !sender?.id || sender.id === browser.runtime.id;

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
      setInvoiceFailures(session.invoiceFailures);
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

const setInvoiceFailures = (failures?: InvoiceFailure[]) => {
  invoiceFailureMap = new Map((failures ?? []).map((failure) => [failure.orderId, failure]));
};

const getInvoiceFailures = () => Array.from(invoiceFailureMap.values());

const updateSession = (changes: Partial<ScrapeSessionSnapshot>) => {
  debugLog('updateSession', changes);
  if (changes.invoiceFailures) {
    setInvoiceFailures(changes.invoiceFailures);
  }
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
  invoiceFailureMap.clear();
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
    message: 'Export cancelled by user',
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
  amazonHost,
}: {
  year?: number;
  timeFilterValue?: string;
  timeFilterLabel?: string;
  downloadInvoices?: boolean;
  reuseExistingOrders?: boolean;
  amazonHost?: string | null;
}) => {
  debugLog('handleStartScrape', {
    year,
    timeFilterValue,
    timeFilterLabel,
    downloadInvoices,
    reuseExistingOrders,
    amazonHost,
  });
  invoiceFailureMap.clear();
  const base = reuseExistingOrders ? { ...session, orders: session.orders ?? [] } : createEmptySession();
  const runId = base.runId || buildRunId();
  const existingOrders = base.orders ?? [];
  const resolvedHost = amazonHost ?? base.amazonHost ?? DEFAULT_AMAZON_HOST;
  session = {
    ...base,
    amazonHost: resolvedHost,
    phase: reuseExistingOrders ? 'completed' : 'running',
    runId,
    downloadInvoicesRequested: Boolean(downloadInvoices),
    ordersInRange: reuseExistingOrders ? base.ordersInRange : undefined,
    lastInvoiceError: undefined,
    pagesScraped: reuseExistingOrders ? base.pagesScraped : 0,
    yearFilter: year,
    timeFilterValue,
    timeFilterLabel,
    invoiceDownloadsStarted: false,
    invoicesDownloaded: 0,
    invoiceErrors: 0,
    invoiceFailures: [],
    invoicesQueued: downloadInvoices ? base.invoicesQueued : 0,
    ordersCollected: reuseExistingOrders ? existingOrders.length : 0,
    message: reuseExistingOrders
      ? `Using existing ${existingOrders.length} orders`
      : timeFilterLabel
        ? `Exporting orders from ${timeFilterLabel}`
        : year
          ? `Exporting orders from ${year}`
          : 'Exporting all available orders',
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
  if (typeof payload.ordersInRange === 'number') {
    changes.ordersInRange = payload.ordersInRange;
  }
  if (typeof payload.pagesScraped === 'number') {
    changes.pagesScraped = payload.pagesScraped;
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
    changes.message = payload.message ?? 'Export completed';
    changes.errorMessage = undefined;
  }
  if (payload.phase === 'error' || payload.errorMessage) {
    changes.phase = 'error';
    changes.errorMessage = payload.errorMessage ?? payload.message ?? 'Unknown export error';
    changes.message = payload.message ?? 'Encountered an error while exporting';
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
      `Collected ${session.ordersLimit} orders — limit reached. Download or reset to export another batch.`;
  }

  updateSession(changes);
  updateBadge();
  if (session.phase !== 'running') {
    void closeScrapeTab();
  }

  // Invoice downloads are triggered explicitly by the user after completion.
  void maybeNotifyCompletion();
};

const isSupportedAmazonUrl = (url?: string | null) => isAmazonOrderHistoryUrl(url);

type OrderHistoryTab = {
  id: number;
  url: string;
};

let lastOrderHistoryTab: OrderHistoryTab | null = null;

const getActiveTab = async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
};

const recordOrderHistoryTab = (tab?: browser.Tabs.Tab) => {
  if (!tab?.id || !tab.url) {
    return;
  }
  if (isSupportedAmazonUrl(tab.url)) {
    lastOrderHistoryTab = { id: tab.id, url: tab.url };
  }
};

const getActiveOrLastOrderTab = async () => {
  const activeTab = await getActiveTab();
  if (activeTab?.url && isSupportedAmazonUrl(activeTab.url)) {
    return activeTab;
  }
  if (ALLOW_E2E && lastOrderHistoryTab?.id) {
    try {
      const fallbackTab = await browser.tabs.get(lastOrderHistoryTab.id);
      if (fallbackTab?.url && isSupportedAmazonUrl(fallbackTab.url)) {
        return fallbackTab;
      }
    } catch {
      return activeTab;
    }
  }
  return activeTab;
};

if (ALLOW_E2E) {
  browser.tabs.onActivated.addListener(({ tabId }) => {
    void browser.tabs.get(tabId).then(recordOrderHistoryTab).catch(() => undefined);
  });
  browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
      recordOrderHistoryTab(tab);
    }
  });
}

const getActiveAmazonHost = async () => {
  const tab = await getActiveOrLastOrderTab();
  const host = getAmazonHostForUrl(tab?.url ?? null);
  return host?.baseUrl ?? DEFAULT_AMAZON_HOST;
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

const resolveSessionUrl = (href: string) => resolveAmazonUrl(href, session.amazonHost ?? DEFAULT_AMAZON_HOST);

const buildInvoiceQueue = (
  onlyOrderIds?: string[],
): Array<{ orderId: string; invoiceUrl: string; orderDetailsUrl?: string }> => {
  const seen = new Set<string>();
  const allowed = onlyOrderIds && onlyOrderIds.length ? new Set(onlyOrderIds) : null;
  const buildOrderDetailsUrl = (orderId: string, orderDetailsUrl?: string) => {
    if (orderDetailsUrl) {
      return resolveSessionUrl(orderDetailsUrl);
    }
    const encoded = encodeURIComponent(orderId);
    return resolveSessionUrl(`/your-orders/order-details?orderID=${encoded}`);
  };
  const tasks = session.orders
    .filter((order) => order.invoiceUrl && (!allowed || allowed.has(order.orderId)))
    .map((order) => ({
      orderId: order.orderId,
      invoiceUrl: order.invoiceUrl as string,
      orderDetailsUrl: buildOrderDetailsUrl(order.orderId, order.orderDetailsUrl),
    }))
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
  const absoluteUrl = resolveSessionUrl(invoiceUrl);
  const response = await fetch(absoluteUrl, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Invoice request failed with status ${response.status}`);
  }
  const html = await response.text();
  const links = parseInvoiceLinks(html);
  const selected = selectInvoiceLink(links);
  if (selected?.href) {
    return resolveSessionUrl(selected.href);
  }
  if (absoluteUrl.toLowerCase().includes('.pdf') || absoluteUrl.toLowerCase().includes('print.html')) {
    return absoluteUrl;
  }
  throw new Error('No invoice link found in invoice response');
};

const ensureDownloadsPermission = async () => {
  try {
    const granted = await browser.permissions.contains({ permissions: ['downloads'] });
    if (!granted) {
      updateSession({
        message: 'Enable downloads permission to save invoices.',
        invoiceErrors: (session.invoiceErrors ?? 0) + 1,
        lastInvoiceError: 'Downloads permission not granted.',
      });
    }
    return granted;
  } catch (error) {
    debugLog('Failed to check downloads permission', error);
    updateSession({
      message: 'Unable to verify downloads permission.',
      invoiceErrors: (session.invoiceErrors ?? 0) + 1,
      lastInvoiceError: 'Unable to verify downloads permission.',
    });
    return false;
  }
};

const downloadInvoice = async (url: string, orderId: string) => {
  const folder = session.runId ? `${session.runId}/` : '';
  const extension = url.toLowerCase().includes('.pdf') ? 'pdf' : 'html';
  await browser.downloads.download({
    url,
    filename: `${folder}${orderId}-invoice.${extension}`,
    saveAs: false,
    conflictAction: 'uniquify',
  });
};

const recordInvoiceFailure = (
  task: { orderId: string; orderDetailsUrl?: string },
  message: string,
) => {
  invoiceFailureMap.set(task.orderId, {
    orderId: task.orderId,
    orderDetailsUrl: task.orderDetailsUrl,
    message,
  });
  return getInvoiceFailures();
};

const clearInvoiceFailure = (orderId: string) => {
  if (!invoiceFailureMap.has(orderId)) {
    return session.invoiceFailures;
  }
  invoiceFailureMap.delete(orderId);
  return getInvoiceFailures();
};

const processInvoiceTask = async (task: { orderId: string; invoiceUrl: string; orderDetailsUrl?: string }) => {
  try {
    const downloadUrl = await fetchInvoiceDownloadUrl(task.invoiceUrl);
    await downloadInvoice(downloadUrl, task.orderId);
    updateSession({
      invoicesDownloaded: (session.invoicesDownloaded ?? 0) + 1,
      lastInvoiceOrderId: task.orderId,
      lastInvoiceOrderUrl: task.orderDetailsUrl,
      invoiceFailures: clearInvoiceFailure(task.orderId),
      message: `Downloaded invoice ${Math.min(
        (session.invoicesDownloaded ?? 0) + 1,
        session.invoicesQueued,
      )}/${session.invoicesQueued}`,
    });
  } catch (error) {
    debugLog('Invoice download failed', error);
    const message =
      error instanceof Error && error.message.toLowerCase().includes('user gesture')
        ? 'Enable multiple downloads in your browser to save invoices.'
        : `Invoice download failed for ${task.orderId}`;
    updateSession({
      invoiceErrors: (session.invoiceErrors ?? 0) + 1,
      lastInvoiceError: message,
      lastInvoiceOrderId: task.orderId,
      lastInvoiceOrderUrl: task.orderDetailsUrl,
      invoiceFailures: recordInvoiceFailure(task, message),
      message,
    });
  }
};

const startInvoiceDownloads = async (onlyOrderIds?: string[]) => {
  if (invoiceQueueRunning) {
    return;
  }
  if (!session.downloadInvoicesRequested && !(onlyOrderIds && onlyOrderIds.length)) {
    return;
  }
  const hasPermission = await ensureDownloadsPermission();
  if (!hasPermission) {
    return;
  }
  invoiceQueueRunning = true;
  cancelInvoiceQueue = false;
  invoiceFailureMap.clear();
  const tasks = buildInvoiceQueue(onlyOrderIds);

  updateSession({
    invoicesQueued: tasks.length,
    invoicesDownloaded: 0,
    invoiceErrors: 0,
    lastInvoiceError: undefined,
    lastInvoiceOrderId: undefined,
    lastInvoiceOrderUrl: undefined,
    invoiceFailures: [],
    invoiceDownloadsStarted: true,
    message: tasks.length ? `Starting invoice downloads (${tasks.length})...` : 'No invoices to download.',
  });

  if (!tasks.length) {
    updateSession({ invoiceDownloadsStarted: false });
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
      await processInvoiceTask(task);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  updateSession({
    invoiceDownloadsStarted: false,
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
    debugLog('Notification skipped', {
      notifyOnCompletion,
      notifiedAt: session.notifiedAt,
      phase: session.phase,
    });
    return;
  }
  try {
    const granted = await browser.permissions.contains({ permissions: ['notifications'] });
    if (!granted) {
      debugLog('Notifications permission not granted');
      return;
    }
    const count = session.orders.length;
    const notificationId = await browser.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Amazon Order Extractor',
      message: count === 0 ? 'No orders found for the selected range.' : `Export complete: ${count} orders ready.`,
    });
    debugLog('Notification created', { notificationId });
    updateSession({ notifiedAt: Date.now() });
  } catch (error) {
    debugLog('Failed to send completion notification', error);
  }
};

const sendTestNotification = async () => {
  const granted = await browser.permissions.contains({ permissions: ['notifications'] });
  if (!granted) {
    debugLog('Test notification blocked: permission missing');
    return { success: false, error: 'Notifications permission not granted.' };
  }
  try {
    const notificationId = await browser.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Amazon Order Extractor',
      message: 'Test notification — if you cannot see this, check OS/browser settings.',
    });
    debugLog('Test notification created', { notificationId });
    return { success: true, data: { notificationId } };
  } catch (error) {
    debugLog('Failed to send test notification', error);
    return { success: false, error: 'Failed to send test notification.' };
  }
};

const triggerContentScraper = async (payload: ScraperStartPayload) => {
  const activeTab = await getActiveOrLastOrderTab();
  if (!activeTab?.id) {
    debugLog('No active tab detected');
    throw new Error('No active tab detected. Open the Amazon order history page and try again.');
  }

  if (!isSupportedAmazonUrl(activeTab.url)) {
    debugLog('Active tab not supported', activeTab.url);
    throw new Error('Please open the Amazon order history page before starting an export.');
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
      throw new Error('Failed to create helper tab');
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
          reject(new Error('Timed out waiting for helper tab to load'));
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
      throw new Error('Helper tab unavailable');
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

browser.runtime.onMessage.addListener((
  message: unknown,
  sender: browser.Runtime.MessageSender,
): Promise<RuntimeResponse<unknown>> => {
  debugLog('runtime message received', message);
  if (!isAuthorizedSender(sender)) {
    return Promise.resolve({ success: false, error: 'Unauthorized sender' });
  }
  if (!message || typeof message !== 'object' || !('type' in message)) {
    return Promise.resolve({ success: false, error: 'Invalid message' });
  }

  const typedMessage = message as RuntimeMessage;

  switch (typedMessage.type) {
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
      return getActiveOrLastOrderTab().then((tab) => {
        const host = getAmazonHostForUrl(tab?.url ?? null);
        return {
          success: true,
          data: {
            state: session,
            isSupported: isSupportedAmazonUrl(tab?.url ?? null),
            url: tab?.url,
            amazonHost: host?.baseUrl ?? session.amazonHost ?? DEFAULT_AMAZON_HOST,
          },
        };
      });
    }

    case 'GET_AVAILABLE_FILTERS': {
      return getActiveOrLastOrderTab()
        .then(async (tab) => {
          if (!tab?.id || !isSupportedAmazonUrl(tab.url)) {
            return { success: true, data: { filters: getFilterFallback() } };
          }
          try {
            const response = await browser.tabs.sendMessage(tab.id, {
              scope: SCRAPER_MESSAGE_SCOPE,
              command: 'GET_FILTERS',
            });
            const filters = (response as { filters?: unknown } | undefined)?.filters;
            if (Array.isArray(filters) && filters.length) {
              return { success: true, data: { filters: filters as TimeFilterOption[] } };
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
        return Promise.resolve({ success: false, error: 'Export is already running' });
      }
      return getActiveAmazonHost().then((amazonHost) => {
        const startState = handleStartScrape({
          year: typedMessage.payload.year,
          timeFilterValue: typedMessage.payload.timeFilterValue,
          timeFilterLabel: typedMessage.payload.timeFilterLabel,
          downloadInvoices: typedMessage.payload.downloadInvoices,
          reuseExistingOrders: typedMessage.payload.reuseExistingOrders,
          amazonHost,
        });
        if (typedMessage.payload.reuseExistingOrders) {
          updateSession({
            phase: 'completed',
            ordersCollected: session.orders.length,
          });
          if (typedMessage.payload.downloadInvoices) {
            void startInvoiceDownloads();
          }
          return { success: true, data: { state: session } };
        }
        const scrapePayload: ScraperStartPayload = {
          runId: session.runId,
          year: typedMessage.payload.year,
          timeFilterValue: typedMessage.payload.timeFilterValue,
          timeFilterLabel: typedMessage.payload.timeFilterLabel,
          downloadInvoices: typedMessage.payload.downloadInvoices,
          reuseExistingOrders: typedMessage.payload.reuseExistingOrders,
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
      });
    }

    case 'SCRAPE_PROGRESS': {
      handleProgressUpdate(typedMessage.payload);
      return Promise.resolve({ success: true, data: { state: session } });
    }

    case 'RESET_SCRAPE': {
      resetSession();
      cancelInvoiceQueue = true;
      return Promise.resolve({ success: true, data: { state: session } });
    }
    case 'CANCEL_INVOICE_DOWNLOADS': {
      cancelInvoiceQueue = true;
      if (!invoiceQueueRunning) {
        updateSession({ message: 'No invoice downloads in progress.', invoiceDownloadsStarted: false });
      } else {
        updateSession({ message: 'Cancelling invoice downloads...' });
      }
      return Promise.resolve({ success: true, data: { state: session } });
    }
    case 'RETRY_FAILED_INVOICES': {
      if (invoiceQueueRunning) {
        return Promise.resolve({ success: false, error: 'Invoice downloads are already running.' });
      }
      const failedIds = (session.invoiceFailures ?? []).map((failure) => failure.orderId);
      if (!failedIds.length) {
        return Promise.resolve({ success: false, error: 'No failed invoices to retry.' });
      }
      updateSession({
        downloadInvoicesRequested: true,
        message: `Retrying ${failedIds.length} failed invoice${failedIds.length === 1 ? '' : 's'}...`,
      });
      void startInvoiceDownloads(failedIds);
      return Promise.resolve({ success: true, data: { state: session } });
    }
    case 'SET_SETTINGS': {
      if (typedMessage.payload && typeof typedMessage.payload.notifyOnCompletion === 'boolean') {
        notifyOnCompletion = typedMessage.payload.notifyOnCompletion;
        void browser.storage.local.set({ [SETTINGS_KEY]: { notifyOnCompletion } });
        if (notifyOnCompletion) {
          void maybeNotifyCompletion();
        }
      }
      return Promise.resolve({ success: true, data: { state: session } });
    }
    case 'TEST_NOTIFICATION': {
      return sendTestNotification();
    }
    case 'CANCEL_SCRAPE': {
      return cancelScrape().then(() => ({ success: true, data: { state: session } }));
    }

    default:
      return Promise.resolve({ success: false, error: `Unknown message: ${String((typedMessage as { type?: string }).type)}` });
  }
});
