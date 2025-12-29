import browser from 'webextension-polyfill';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_AMAZON_HOST, MAX_ORDERS_PER_RUN, SUPPORT_EMAIL, getAmazonHostForUrl, getOrderHistoryUrl } from '@shared/constants';
import { sendRuntimeMessage } from '@shared/messaging';
import { ordersToCsv } from '@shared/csv';
import type { OrderSummary, ScrapeSessionSnapshot } from '@shared/types';
import type { TimeFilterOption } from '@shared/timeFilters';
import { computeHighlights } from '@shared/highlights';
import heroOrders from '../assets/hero-orders.svg';
import './App.css';

const FEEDBACK_URL = 'https://github.com/abhishek1234321/aoe/issues/new';

const downloadCsv = (csvText: string, runId?: string) => {
  const anchor = document.createElement('a');
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  anchor.href = URL.createObjectURL(blob);
  anchor.download = runId ? `${runId}/orders.csv` : 'amazon-orders.csv';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
};

const useSessionState = () => {
  const [session, setSession] = useState<ScrapeSessionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const response = await sendRuntimeMessage<{ state: ScrapeSessionSnapshot }>({
      type: 'GET_STATE',
    });

    if (response.success && response.data?.state) {
      setSession(response.data.state);
      setError(null);
    } else {
      setError(response.error ?? 'Unable to load state');
    }
    setLoading(false);
  }, []);

  return { session, setSession, loading, setLoading, error, setError, refresh };
};

const formatTimestamp = (timestamp?: number) => {
  if (!timestamp) {
    return '—';
  }
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
  } catch {
    return new Date(timestamp).toLocaleString();
  }
};

const App = () => {
  const { session, setSession, loading, setLoading, error, setError, refresh } = useSessionState();
  const [selectedFilter, setSelectedFilter] = useState<string>('');
  const [availableFilters, setAvailableFilters] = useState<TimeFilterOption[]>([]);
  const [isOnOrderPage, setIsOnOrderPage] = useState<boolean | null>(null);
  const [downloadInvoices, setDownloadInvoices] = useState<boolean>(false);
  const [view, setView] = useState<'main' | 'highlights'>('main');
  const [showFilterOverride, setShowFilterOverride] = useState<boolean>(false);
  const [version] = useState(() => browser.runtime.getManifest().version ?? '');
  const [notifyOnCompletion, setNotifyOnCompletion] = useState<boolean>(false);
  const [diagnosticsNotice, setDiagnosticsNotice] = useState<string | null>(null);
  const [notificationTestStatus, setNotificationTestStatus] = useState<string | null>(null);
  const supportEmail = SUPPORT_EMAIL.trim();
  const [selectedBuyer, setSelectedBuyer] = useState<string>('all');
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const showNotificationTest = import.meta.env.DEV;

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const fetchContext = async () => {
      const response = await sendRuntimeMessage<{ state: ScrapeSessionSnapshot; isSupported: boolean; url?: string; amazonHost?: string }>({
        type: 'GET_CONTEXT',
      });
      if (response.success) {
        if (response.data?.state) {
          setSession(response.data.state);
        }
        setIsOnOrderPage(Boolean(response.data?.isSupported));
        setActiveUrl(response.data?.url ?? null);
      }
    };

    const fetchFilters = async () => {
      const response = await sendRuntimeMessage<{ filters: TimeFilterOption[] }>({
        type: 'GET_AVAILABLE_FILTERS',
      });
      if (response.success && response.data?.filters?.length) {
        setAvailableFilters(response.data.filters);
      }
    };

    void fetchContext();
    void fetchFilters();
  }, [setSession]);

  useEffect(() => {
    const handler: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, areaName) => {
      if (areaName !== 'session') return;
      const nextState = (changes['aoe:scrape-session'] as { newValue?: ScrapeSessionSnapshot } | undefined)?.newValue;
      if (nextState) {
        setSession(nextState);
      }
    };
    browser.storage.onChanged.addListener(handler);
    return () => {
      browser.storage.onChanged.removeListener(handler);
    };
  }, [setSession]);

  useEffect(() => {
    void browser.storage.local.get('aoe:settings').then((stored) => {
      const next = (stored['aoe:settings'] as { notifyOnCompletion?: boolean } | undefined)?.notifyOnCompletion;
      if (typeof next === 'boolean') {
        setNotifyOnCompletion(next);
      }
    });
  }, []);

  const isRunning = session?.phase === 'running';
  const isBlockedPage = isOnOrderPage === false;
  const isCompleted = session?.phase === 'completed';
  const viewMode = isCompleted ? view : 'main';

  const buildDiagnostics = () => {
    const sessionSnapshot = session
      ? {
          phase: session.phase,
          runId: session.runId,
          message: session.message,
          errorMessage: session.errorMessage,
          ordersCollected: session.ordersCollected,
          ordersInRange: session.ordersInRange,
          ordersLimit: session.ordersLimit,
          ordersCount: session.orders?.length ?? 0,
          invoicesQueued: session.invoicesQueued,
          invoicesDownloaded: session.invoicesDownloaded,
          invoiceErrors: session.invoiceErrors,
          invoiceFailures: session.invoiceFailures?.length ?? 0,
          invoiceDownloadsStarted: session.invoiceDownloadsStarted,
          downloadInvoicesRequested: session.downloadInvoicesRequested,
          hasMorePages: session.hasMorePages,
          timeFilterValue: session.timeFilterValue,
          timeFilterLabel: session.timeFilterLabel,
          yearFilter: session.yearFilter,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
          updatedAt: session.updatedAt,
        }
      : null;

    return {
      generatedAt: new Date().toISOString(),
      extensionVersion: version,
      amazonHost: session?.amazonHost ?? getAmazonHostForUrl(activeUrl)?.baseUrl ?? DEFAULT_AMAZON_HOST,
      locale: navigator.language,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userAgent: navigator.userAgent,
      popup: {
        selectedFilter,
        view: viewMode,
        isOnOrderPage,
        downloadInvoicesToggle: downloadInvoices,
        notifyOnCompletion,
      },
      session: sessionSnapshot,
      popupError: error,
    };
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading || isRunning || isOnOrderPage === false) {
      return;
    }
    setLoading(true);
    setView('main');
    setShowFilterOverride(false);
    const chosen = availableFilters.find((option) => option.value === selectedFilter);
    const parsedYear =
      chosen?.year ?? (selectedFilter.startsWith('year-') ? Number(selectedFilter.replace('year-', '')) : undefined);
    const downloadInvoicesFlag = Boolean(downloadInvoices);
    if (downloadInvoicesFlag) {
      const granted = await requestPermission('downloads');
      if (!granted) {
        setError('Enable downloads permission to save invoices.');
        setLoading(false);
        return;
      }
    }

    const response = await sendRuntimeMessage<{ state: ScrapeSessionSnapshot }>({
      type: 'START_SCRAPE',
      payload: {
        year: parsedYear,
        timeFilterValue: selectedFilter || undefined,
        timeFilterLabel: chosen?.label,
        downloadInvoices: downloadInvoicesFlag,
      },
    });

    if (!response.success) {
      setError(response.error ?? 'Failed to start export');
    } else if (response.data?.state) {
      setSession(response.data.state);
      setError(null);
      setDownloadInvoices(false);
    }

    setLoading(false);
  };

  const handleReset = async () => {
    if (loading) {
      return;
    }
    setLoading(true);
    setView('main');
    setShowFilterOverride(false);
    const response = await sendRuntimeMessage<{ state: ScrapeSessionSnapshot }>({
      type: 'RESET_SCRAPE',
    });
    if (!response.success) {
      setError(response.error ?? 'Failed to reset state');
    } else if (response.data?.state) {
      setSession(response.data.state);
      setError(null);
    }
    setLoading(false);
  };

  const handleRetryFailedInvoices = async () => {
    if (loading) {
      return;
    }
    setLoading(true);
    const granted = await requestPermission('downloads');
    if (!granted) {
      setError('Enable downloads permission to save invoices.');
      setLoading(false);
      return;
    }
    const response = await sendRuntimeMessage<{ state: ScrapeSessionSnapshot }>({
      type: 'RETRY_FAILED_INVOICES',
    });
    if (!response.success) {
      setError(response.error ?? 'Failed to retry invoices');
    } else if (response.data?.state) {
      setSession(response.data.state);
      setError(null);
    }
    setLoading(false);
  };

  const handleChooseAnotherTimeframe = async () => {
    if (loading) {
      return;
    }
    setLoading(true);
    setView('main');
    const response = await sendRuntimeMessage<{ state: ScrapeSessionSnapshot }>({
      type: 'RESET_SCRAPE',
    });
    if (!response.success) {
      setError(response.error ?? 'Failed to reset state');
    } else if (response.data?.state) {
      setSession(response.data.state);
      setError(null);
    }
    setSelectedFilter('');
    setShowFilterOverride(true);
    setLoading(false);
  };

  const openDiagnosticsIssue = () => {
    const diagnosticsText = JSON.stringify(buildDiagnostics(), null, 2);
    const issueBody = [
      'Please describe what you were doing and attach any screenshots if helpful.',
      '',
      'Diagnostics:',
      '```json',
      diagnosticsText,
      '```',
    ].join('\n');
    const issueUrl = new URL(FEEDBACK_URL);
    issueUrl.searchParams.set('title', 'Bug report: <short summary>');
    issueUrl.searchParams.set('body', issueBody);
    window.open(issueUrl.toString(), '_blank', 'noopener');
  };

  const copyDiagnostics = async () => {
    const diagnosticsText = JSON.stringify(buildDiagnostics(), null, 2);
    try {
      await navigator.clipboard.writeText(diagnosticsText);
      setDiagnosticsNotice('Diagnostics copied. Paste them into an issue or email.');
    } catch {
      window.prompt('Copy diagnostics:', diagnosticsText);
    }
  };

  const downloadDiagnostics = () => {
    const diagnosticsText = JSON.stringify(buildDiagnostics(), null, 2);
    const blob = new Blob([diagnosticsText], { type: 'text/plain;charset=utf-8;' });
    const anchor = document.createElement('a');
    const runIdSuffix = session?.runId ? `-${session.runId}` : '';
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `aoe-diagnostics${runIdSuffix}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(anchor.href);
  };

  const statusMessage = useMemo(() => {
    if (!session) {
      return 'Initializing…';
    }
    if (session.phase === 'idle') {
      return 'Ready to export orders.';
    }
    if (session.phase === 'running') {
      const total = session.ordersInRange ?? session.ordersLimit;
      const capSuffix = session.ordersInRange && session.ordersInRange > session.ordersLimit ? ` (cap ${session.ordersLimit})` : '';
      return `Exporting — collected ${session.ordersCollected}/${total}${capSuffix}`;
    }
    if (session.phase === 'completed') {
      const count = session.orders?.length ?? session.ordersCollected ?? 0;
      if (count === 0) {
        return 'No orders found for the selected range.';
      }
      return `Completed — ${count} orders ready`;
    }
    if (session.phase === 'error') {
      return 'Encountered an error';
    }
    return session.message ?? 'Idle';
  }, [session]);

  const activeError = error ?? session?.errorMessage ?? null;
  const showDiagnostics = Boolean(activeError || session?.phase === 'error');
  const canEmailDiagnostics = Boolean(supportEmail);
  const supportMailto = useMemo(() => {
    if (!supportEmail) {
      return '';
    }
    const subject = 'Amazon Order Extractor diagnostics';
    const body = [
      'Hi,',
      '',
      'I ran into an issue with Amazon Order Extractor.',
      'Please attach diagnostics.txt or paste diagnostics from the clipboard.',
      '',
      `Extension version: ${version || 'unknown'}`,
      `Run ID: ${session?.runId ?? 'n/a'}`,
      `Phase: ${session?.phase ?? 'n/a'}`,
      `Error: ${activeError ?? 'n/a'}`,
    ].join('\n');
    return `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [supportEmail, version, session?.runId, session?.phase, activeError]);
  const canDownload = Boolean(session?.orders?.length && session?.phase === 'completed');
  const canDownloadInvoicesOnly = Boolean(
    session?.orders?.length &&
      session?.phase === 'completed' &&
      session?.downloadInvoicesRequested &&
      (session?.invoicesQueued ?? 0) > 0 &&
      (session?.invoicesDownloaded ?? 0) === 0,
  );
  const showCancelInvoices = Boolean(session?.invoiceDownloadsStarted && (session?.invoicesDownloaded ?? 0) < (session?.invoicesQueued ?? 0));
  const showCancelScrape = session?.phase === 'running';
  const canStart = !loading && !isRunning && isOnOrderPage !== false;
  const canShowHighlights = Boolean(session?.orders?.length && session?.phase === 'completed');
  const isEmptyResult = session?.phase === 'completed' && (session?.orders?.length ?? 0) === 0;
  const showReset =
    Boolean(session && session.phase !== 'idle') || session?.ordersCollected || session?.invoicesQueued;
  const showResetButton = showReset && !(isEmptyResult && !showFilterOverride);
  const showProgressDetails = Boolean(session?.phase && session.phase !== 'idle');
  const ordersLimit = session?.ordersLimit ?? MAX_ORDERS_PER_RUN;
  const ordersInRange = session?.ordersInRange;
  const ordersCollectedDisplay =
    session?.phase === 'completed' ? session?.orders?.length ?? session?.ordersCollected ?? 0 : session?.ordersCollected ?? 0;
  const ordersTotalDisplay = ordersInRange ?? ordersLimit;
  const ordersCapSuffix = ordersInRange && ordersInRange > ordersLimit ? ` (cap ${ordersLimit})` : '';
  const ordersProgressTotal = Math.max(
    Math.min(typeof ordersTotalDisplay === 'number' ? ordersTotalDisplay : ordersLimit, ordersLimit),
    1,
  );
  const invoiceFailures = session?.invoiceFailures ?? [];
  const hasInvoiceFailures = invoiceFailures.length > 0;
  const canRetryFailedInvoices = Boolean(session?.phase === 'completed' && hasInvoiceFailures);
  const invoiceErrorHint =
    session?.invoiceErrors && session.invoiceErrors > 0
      ? session.lastInvoiceError ??
        'Some invoices failed to download. Check your browser download settings and try again.'
      : null;
  const canRetryScrape = Boolean(
    session?.phase === 'error' &&
      session?.errorMessage &&
      (session.errorMessage.includes('Scrape tab unavailable') ||
        session.errorMessage.includes('Helper tab unavailable') ||
        session.errorMessage.includes('Timed out waiting for scrape tab') ||
        session.errorMessage.includes('Timed out waiting for helper tab')),
  );

  const showFilterForm = !isEmptyResult || showFilterOverride;

  const requestPermission = async (permission: 'downloads' | 'notifications') => {
    try {
      const granted = await browser.permissions.request({ permissions: [permission] });
      return granted;
    } catch {
      return false;
    }
  };

  const handleTestNotification = async () => {
    setNotificationTestStatus(null);
    const granted = await requestPermission('notifications');
    if (!granted) {
      setNotificationTestStatus('Notifications permission not granted.');
      return;
    }
    const response = await sendRuntimeMessage<{ notificationId?: string }>({ type: 'TEST_NOTIFICATION' });
    if (response.success) {
      setNotificationTestStatus(
        'Test notification sent. If you do not see it, check OS/browser notification settings.',
      );
      console.info('[AOE] Test notification sent', response.data);
    } else {
      setNotificationTestStatus(response.error ?? 'Failed to send test notification.');
      console.info('[AOE] Test notification failed', response.error);
    }
  };
  const overallHighlights = useMemo(() => computeHighlights(session?.orders ?? [], session?.timeFilterValue), [
    session?.orders,
    session?.timeFilterValue,
  ]);

  const buyerGroups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; orders: OrderSummary[] }>();
    (session?.orders ?? []).forEach((order) => {
      const rawName = order.buyerName?.trim();
      const label = rawName || 'Unknown buyer';
      const key = label;
      const existing = map.get(key);
      if (existing) {
        existing.orders.push(order);
      } else {
        map.set(key, { key, label, orders: [order] });
      }
    });
    return Array.from(map.values())
      .map((group) => {
        const highlights = computeHighlights(group.orders, session?.timeFilterValue);
        return {
          ...group,
          highlights,
        };
      })
      .sort((a, b) => b.orders.length - a.orders.length || a.label.localeCompare(b.label));
  }, [session?.orders, session?.timeFilterValue]);

  const resolvedBuyerKey =
    selectedBuyer === 'all' || buyerGroups.some((group) => group.key === selectedBuyer)
      ? selectedBuyer
      : 'all';
  const selectedGroup = buyerGroups.find((group) => group.key === resolvedBuyerKey);
  const summary = resolvedBuyerKey === 'all' ? overallHighlights : selectedGroup?.highlights ?? overallHighlights;
  const summaryLabel = resolvedBuyerKey === 'all' ? 'All orders' : selectedGroup?.label ?? 'All orders';
  const buyerRows = useMemo(() => {
    const rows = [
      {
        key: 'all',
        label: 'All orders',
        orders: overallHighlights.totalOrders,
        spend: overallHighlights.formattedSpend || '—',
      },
    ];
    buyerGroups.forEach((group) => {
      rows.push({
        key: group.key,
        label: group.label,
        orders: group.highlights.totalOrders,
        spend: group.highlights.formattedSpend || '—',
      });
    });
    return rows;
  }, [buyerGroups, overallHighlights]);
  const showBuyerGroups = buyerGroups.length > 1;

  const filterOptions = useMemo(() => {
    if (availableFilters.length) {
      return availableFilters;
    }
    const current = new Date().getFullYear();
    return [
      { value: '', label: 'All available orders' },
      { value: 'months-3', label: 'past 3 months' },
      { value: `year-${current}`, label: String(current), year: current },
      { value: `year-${current - 1}`, label: String(current - 1), year: current - 1 },
      { value: `year-${current - 2}`, label: String(current - 2), year: current - 2 },
    ];
  }, [availableFilters]);

  if (isOnOrderPage === false) {
    const ordersUrl = getOrderHistoryUrl(activeUrl ?? session?.amazonHost ?? DEFAULT_AMAZON_HOST);
    return (
      <div className="popup-container">
        <header className="popup-header sticky-header">
          <div className="header-row">
            <div>
              <h1>Amazon Order Extractor</h1>
              <p>Each run is capped at {MAX_ORDERS_PER_RUN} orders to keep things stable.</p>
            </div>
          </div>
        </header>
        <section className="hero-card">
          <div className="hero-body">
            <img src={heroOrders} alt="Orders illustration" className="illustration" />
            <div>
              <p className="hero-title">Head to your Amazon order history</p>
              <p className="hero-copy">
                Open the Orders page, then click <strong>Start export</strong> to save your orders as a CSV.
              </p>
            </div>
          </div>
          <a href={ordersUrl} target="_blank" rel="noreferrer" className="hero-cta">
            Open order history
          </a>
          <p className="hero-hint">If you were already there, refresh the order page and the extension.</p>
        </section>
        <footer className="privacy-note sticky-footer">
          <div>All scraping, CSVs, and invoice downloads run locally in your browser. No data leaves your device.</div>
          <div className="footer-links">
            {version ? <span style={{ fontSize: 11, color: '#6b7280' }}>Version {version}</span> : null}
            {supportMailto ? (
              <a href={supportMailto} target="_blank" rel="noreferrer" className="footer-link">
                Email support
              </a>
            ) : null}
            <a href={FEEDBACK_URL} target="_blank" rel="noreferrer" className="footer-link">
              Send feedback
            </a>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <header className="popup-header sticky-header">
        <div className="header-row">
          {viewMode === 'highlights' ? (
            <button
              type="button"
              className="secondary-button"
              style={{ width: 'auto', padding: '6px 10px', marginBottom: 0 }}
              onClick={() => {
                setView('main');
              }}
              aria-label="Back"
              title="Back"
            >
              ←
            </button>
          ) : (
            <span />
          )}
          <div>
            <h1>Amazon Order Extractor</h1>
            <p>Each run is capped at {MAX_ORDERS_PER_RUN} orders to keep things stable.</p>
          </div>
          <div className="status-pill">
            {session?.phase === 'running'
              ? 'Running'
              : session?.phase === 'completed'
                ? 'Completed'
                : session?.phase === 'error'
                  ? 'Error'
                  : 'Idle'}
          </div>
        </div>
      </header>

      <div className="content-scroll">
        <section style={{ marginTop: '16px' }}>
          {showFilterForm && (
            <form onSubmit={handleSubmit}>
              <label htmlFor="timeFilter" className="field-label">
                Choose a time filter
              </label>
              <select
                id="timeFilter"
                value={selectedFilter}
                onChange={(event) => setSelectedFilter(event.target.value)}
                disabled={isBlockedPage}
                className="select-input"
                required
              >
                <option value="">Select a range</option>
                {filterOptions.map((option) => {
                  if (!option.value) {
                    return null;
                  }
                  return (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  );
                })}
              </select>

              <label className="field-label" style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={downloadInvoices}
                  onChange={async (event) => {
                    const next = event.target.checked;
                    if (next) {
                      const granted = await requestPermission('downloads');
                      if (!granted) {
                        setError('Enable downloads permission to save invoices.');
                        return;
                      }
                    }
                    setDownloadInvoices(next);
                  }}
                  disabled={isBlockedPage}
                />
                <span>Download invoices after export</span>
              </label>

              <label className="field-label" style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={notifyOnCompletion}
                  onChange={async (event) => {
                    const next = event.target.checked;
                    if (next) {
                      const granted = await requestPermission('notifications');
                      if (!granted) {
                        setError('Enable notifications permission to get completion alerts.');
                        return;
                      }
                    }
                    setNotifyOnCompletion(next);
                    await browser.storage.local.set({ 'aoe:settings': { notifyOnCompletion: next } });
                    await sendRuntimeMessage({
                      type: 'SET_SETTINGS',
                      payload: { notifyOnCompletion: next },
                    });
                  }}
                  disabled={isBlockedPage}
                />
                <span>Notify when export completes</span>
              </label>

              {showNotificationTest ? (
                <div style={{ marginTop: '8px' }}>
                  <button type="button" className="secondary-button" onClick={handleTestNotification}>
                    Send test notification
                  </button>
                  {notificationTestStatus ? (
                    <div className="helper-text">{notificationTestStatus}</div>
                  ) : null}
                </div>
              ) : null}

            <button
              type="submit"
              disabled={!canStart || !selectedFilter}
              className={`primary-button ${canStart && selectedFilter ? '' : 'disabled'}`}
            >
              {isRunning ? 'Export in progress…' : loading ? 'Working…' : 'Start export'}
            </button>
          </form>
          )}

          {canShowHighlights && viewMode === 'main' ? (
            <button
              type="button"
              className="secondary-button"
              style={{ marginTop: '8px' }}
              onClick={() => {
                setView('highlights');
              }}
            >
              View highlights
            </button>
          ) : null}

          {canDownloadInvoicesOnly && (
            <button
              type="button"
              onClick={async () => {
                setLoading(true);
                const granted = await requestPermission('downloads');
                if (!granted) {
                  setError('Enable downloads permission to save invoices.');
                  setLoading(false);
                  return;
                }
                const response = await sendRuntimeMessage<{ state: ScrapeSessionSnapshot }>({
                  type: 'START_SCRAPE',
                  payload: {
                    reuseExistingOrders: true,
                    downloadInvoices: true,
                  },
                });
                if (!response.success) {
                  setError(response.error ?? 'Failed to start invoice download');
                } else if (response.data?.state) {
                  setSession(response.data.state);
                  setError(null);
                }
                setLoading(false);
              }}
              className={`secondary-button ${loading ? 'disabled' : ''}`}
              disabled={loading}
              style={{ marginTop: '8px' }}
            >
              Download invoices from last export
            </button>
          )}

          {showResetButton && (
            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className={`secondary-button ${loading ? 'disabled' : ''}`}
            >
              Reset session
            </button>
          )}
          {showCancelScrape && (
            <button
              type="button"
              onClick={async () => {
                setLoading(true);
                const response = await sendRuntimeMessage<{ state: ScrapeSessionSnapshot }>({
                  type: 'CANCEL_SCRAPE',
                });
                if (response.success && response.data?.state) {
                  setSession(response.data.state);
                }
                setLoading(false);
              }}
              className={`secondary-button ${loading ? 'disabled' : ''}`}
              style={{ marginTop: '8px' }}
            >
              Stop export
            </button>
          )}
        </section>

        {viewMode === 'highlights' && canShowHighlights ? (
          <section className="status-block">
            <p className="scope-label">Showing highlights for: {summaryLabel}</p>
            {showBuyerGroups ? (
              <div className="highlight-card">
                <div className="highlight-label">Buyer breakdown</div>
                <div className="buyer-list">
                  {buyerRows.map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      className={`buyer-row ${resolvedBuyerKey === row.key ? 'active' : ''}`}
                      onClick={() => setSelectedBuyer(row.key)}
                    >
                      <span className="buyer-name">{row.label}</span>
                      <span className="buyer-meta">
                        {row.orders} orders • {row.spend}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {summary.totalOrders === 0 ? (
              <div className="highlight-card">
                <div className="highlight-label">No orders found for this buyer in the selected range.</div>
              </div>
            ) : (
              <>
                <div className="highlight-card">
                  <div className="highlight-row">
                    <div>
                      <div className="highlight-label">Total orders</div>
                      <div className="highlight-value">{summary.totalOrders}</div>
                    </div>
                    <div>
                      <div className="highlight-label">Non-cancelled</div>
                      <div className="highlight-value">{summary.nonCancelledOrders}</div>
                    </div>
                  </div>
                  <div className="highlight-row">
                    <div>
                      <div className="highlight-label">Total spend</div>
                      <div className="highlight-value">{summary.formattedSpend || '—'}</div>
                    </div>
                    <div>
                      <div className="highlight-label">Avg order</div>
                      <div className="highlight-value">{summary.formattedAvg || '—'}</div>
                    </div>
                  </div>
                </div>

                <div className="highlight-card">
                  <div className="highlight-label">Busiest day</div>
                  <div className="highlight-value">{summary.busiestDay ?? '—'}</div>
                  <div className="highlight-label" style={{ marginTop: '8px' }}>
                    Top period ({summary.topPeriod ? 'based on filter' : '—'})
                  </div>
                  <div className="highlight-value">
                    {summary.topPeriod ? `${summary.topPeriod.label} (${summary.topPeriod.count})` : '—'}
                  </div>
                </div>

                <div className="highlight-card">
                  <div className="highlight-label">Top items</div>
                  {summary.topItems.length ? (
                    summary.topItems.map((item) => (
                      <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{item.label}</span>
                        <span className="highlight-label">x{item.count}</span>
                      </div>
                    ))
                  ) : (
                    <div className="highlight-label">No items yet</div>
                  )}
                  <div className="highlight-row" style={{ marginTop: '8px' }}>
                    <div>
                      <div className="highlight-label">Unique items</div>
                      <div className="highlight-value">{summary.uniqueItems}</div>
                    </div>
                    <div>
                      <div className="highlight-label">Repeated items</div>
                      <div className="highlight-value">{summary.repeatItems}</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        ) : isEmptyResult && !showFilterForm ? (
          <section className="status-block">
            <div className="hero-card">
              <div className="hero-body">
                <img src={heroOrders} alt="No orders" className="illustration" />
                <div>
                  <p className="hero-title">No orders found</p>
                  <p className="hero-copy">
                    We couldn&apos;t find any orders for this range. Try a different timeframe or refresh the Orders page.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={loading}
                style={{ marginTop: '12px' }}
                onClick={handleChooseAnotherTimeframe}
              >
                Choose another timeframe
              </button>
            </div>
          </section>
        ) : (
          <section className="status-block">
            {isBlockedPage && <p className="status-warning">Please open the Amazon order history page before starting an export.</p>}
            <p style={{ margin: '0 0 8px' }}>
              <strong>Status:</strong> {statusMessage}
            </p>
          <p style={{ margin: 0 }}>
            Filtering: {session?.timeFilterLabel ?? session?.yearFilter ?? 'All'}
          </p>
          {showProgressDetails ? (
            <>
              <div className="progress-container" style={{ marginTop: '8px' }}>
                <div className="progress-label">
                  Orders: {ordersCollectedDisplay}/{ordersTotalDisplay}
                  {ordersCapSuffix}
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${Math.min(
                        100,
                        ((ordersCollectedDisplay ?? 0) / ordersProgressTotal) * 100,
                      ).toFixed(1)}%`,
                    }}
                  />
                </div>
              </div>
              <dl className="definition-list">
                <dt>Orders collected:</dt>
                <dd>
                  {ordersCollectedDisplay}/{ordersTotalDisplay}
                  {ordersCapSuffix}
                </dd>
                <dt>Invoices queued:</dt>
                <dd>{session?.invoicesQueued ?? 0}</dd>
                <dt>Invoices downloaded:</dt>
                <dd>{session?.invoicesDownloaded ?? 0}</dd>
                <dt>Invoice errors:</dt>
                <dd>{session?.invoiceErrors ?? 0}</dd>
                <dt>Started:</dt>
                <dd>{formatTimestamp(session?.startedAt)}</dd>
                <dt>Completed:</dt>
                <dd>{formatTimestamp(session?.completedAt)}</dd>
              </dl>
            </>
          ) : null}
          {activeError ? <p className="error-text">{activeError}</p> : session?.message && <p style={{ marginTop: '8px' }}>{session.message}</p>}
          {showDiagnostics && (
            <div className="diagnostics-card">
              <div>Share diagnostics so we can debug faster. This includes extension version, counts, and error context (no order data).</div>
              <div className="diagnostics-actions">
                <button type="button" className="secondary-button" onClick={copyDiagnostics}>
                  Copy diagnostics
                </button>
                <button type="button" className="secondary-button" onClick={downloadDiagnostics}>
                  Download diagnostics.txt
                </button>
                {canEmailDiagnostics ? (
                  <a className="secondary-button" href={supportMailto} target="_blank" rel="noreferrer">
                    Email support
                  </a>
                ) : null}
                <button type="button" className="secondary-button" onClick={openDiagnosticsIssue}>
                  Open issue
                </button>
              </div>
              {diagnosticsNotice ? <div className="diagnostics-note">{diagnosticsNotice}</div> : null}
            </div>
          )}
          {canRetryScrape && (
            <div className="retry-hint">
              <strong>Helper tab failed.</strong> Make sure the Amazon Orders page is open and you are signed in,
              then retry.
            </div>
          )}
          {canRetryScrape && (
            <button
              type="button"
              className="secondary-button"
              style={{ marginTop: '8px' }}
              onClick={async () => {
                setLoading(true);
                const response = await sendRuntimeMessage<{ state: ScrapeSessionSnapshot }>({
                  type: 'START_SCRAPE',
                  payload: {
                    year: session?.yearFilter,
                    timeFilterValue: session?.timeFilterValue,
                    timeFilterLabel: session?.timeFilterLabel,
                    downloadInvoices: session?.downloadInvoicesRequested,
                  },
                });
                if (!response.success) {
                  setError(response.error ?? 'Failed to retry export');
                } else if (response.data?.state) {
                  setSession(response.data.state);
                  setError(null);
                }
                setLoading(false);
              }}
              disabled={loading}
            >
              Retry export
            </button>
          )}
          {canDownload && (
            <button
              type="button"
              onClick={() => session?.orders && downloadCsv(ordersToCsv(session.orders), session.runId)}
              className="download-button"
            >
              Download CSV
            </button>
          )}
        {session?.invoicesQueued ? (
          <div className="progress-container">
            <div className="progress-label">
              Invoices: {session.invoicesDownloaded}/{session.invoicesQueued} (errors: {session.invoiceErrors ?? 0})
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${Math.min(
                    100,
                    ((session.invoicesDownloaded ?? 0) / Math.max(session.invoicesQueued ?? 1, 1)) * 100,
                  ).toFixed(1)}%`,
                }}
              />
            </div>
          </div>
        ) : null}
          {showCancelInvoices && (
            <button
              type="button"
              onClick={async () => {
                setLoading(true);
                const response = await sendRuntimeMessage<{ state: ScrapeSessionSnapshot }>({
                  type: 'CANCEL_INVOICE_DOWNLOADS',
                });
                if (response.success && response.data?.state) {
                  setSession(response.data.state);
                }
                setLoading(false);
              }}
              className="secondary-button"
              style={{ marginTop: '8px' }}
            >
              Cancel invoice downloads
            </button>
          )}
          {invoiceErrorHint ? (
            <div className="error-text" style={{ marginTop: '8px' }}>
              <div>{invoiceErrorHint}</div>
              {session?.lastInvoiceOrderUrl ? (
                <a
                  href={session.lastInvoiceOrderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="error-link"
                >
                  Open order details
                </a>
              ) : null}
            </div>
          ) : null}
          {hasInvoiceFailures ? (
            <div className="invoice-failure-card">
              <div className="invoice-failure-title">Failed invoices</div>
              {invoiceFailures.slice(0, 3).map((failure) => (
                <div key={failure.orderId} className="invoice-failure-entry">
                  <div className="invoice-failure-row">
                    <span>{failure.orderId}</span>
                    {failure.orderDetailsUrl ? (
                      <a href={failure.orderDetailsUrl} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : null}
                  </div>
                  <div className="invoice-failure-message">{failure.message}</div>
                </div>
              ))}
              {invoiceFailures.length > 3 ? (
                <div className="helper-text">And {invoiceFailures.length - 3} more…</div>
              ) : null}
              {canRetryFailedInvoices ? (
                <button
                  type="button"
                  className="secondary-button"
                  style={{ marginTop: '8px' }}
                  onClick={handleRetryFailedInvoices}
                  disabled={loading}
                >
                  Retry failed invoices
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      )}
    </div>

    <footer className="privacy-note sticky-footer">
      <div>All scraping, CSVs, and invoice downloads run locally in your browser. No data leaves your device.</div>
      <div className="footer-links">
        {version ? <span style={{ fontSize: 11, color: '#6b7280' }}>Version {version}</span> : null}
        {supportMailto ? (
          <a href={supportMailto} target="_blank" rel="noreferrer" className="footer-link">
            Email support
          </a>
        ) : null}
        <a href={FEEDBACK_URL} target="_blank" rel="noreferrer" className="footer-link">
          Send feedback
        </a>
      </div>
      </footer>
    </div>
  );
};

export default App;
