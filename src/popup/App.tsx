import browser from 'webextension-polyfill';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { format as formatDate, getISOWeek } from 'date-fns';
import { AMAZON_ORDER_HISTORY_URLS, MAX_ORDERS_PER_RUN } from '@shared/constants';
import { sendRuntimeMessage } from '@shared/messaging';
import { ordersToCsv } from '@shared/csv';
import type { OrderSummary, ScrapeSessionSnapshot } from '@shared/types';
import type { TimeFilterOption } from '@shared/timeFilters';
import { formatCurrency } from '@shared/format';
import heroOrders from '../assets/hero-orders.svg';
import './App.css';

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

type Highlights = {
  totalOrders: number;
  nonCancelledOrders: number;
  totalSpend: number;
  avgOrderValue: number;
  currency: string;
  formattedSpend: string;
  formattedAvg: string;
  busiestDay?: string;
  topPeriod?: { label: string; count: number };
  topItems: Array<{ label: string; count: number }>;
  uniqueItems: number;
  repeatItems: number;
};

const computeHighlights = (orders: OrderSummary[], timeFilterValue?: string): Highlights => {
  const isNonCancelled = (status?: string) => {
    const normalized = (status ?? '').toLowerCase();
    return !normalized.includes('cancel') && !normalized.includes('return');
  };
  const safeOrders = orders.filter((order) => isNonCancelled(order.status));
  const totalSpend = safeOrders.reduce((sum, order) => {
    const amt = order.total.amount ?? 0;
    return sum + (Number.isFinite(amt) ? amt : 0);
  }, 0);
  const currency = safeOrders.find((o) => o.total.currencySymbol)?.total.currencySymbol ?? '';
  const avgOrderValue = safeOrders.length ? totalSpend / safeOrders.length : 0;

  const getDate = (order: OrderSummary) => {
    if (order.orderDateISO) return new Date(order.orderDateISO);
    if (order.orderDateText) return new Date(order.orderDateText);
    return null;
  };

  const dayCounts = new Map<string, number>();
  const periodCounts = new Map<string, number>();
  const periodLabels = new Map<string, string>();
  const useMonthly = timeFilterValue?.startsWith('year-');
  safeOrders.forEach((order) => {
    const date = getDate(order);
    if (!date || Number.isNaN(date.getTime())) return;
    const dayLabel = formatDate(date, 'EEE');
    dayCounts.set(dayLabel, (dayCounts.get(dayLabel) ?? 0) + 1);
    if (useMonthly) {
      const key = formatDate(date, 'yyyy-MM');
      periodCounts.set(key, (periodCounts.get(key) ?? 0) + 1);
      periodLabels.set(key, formatDate(date, 'MMM yyyy'));
    } else {
      const week = getISOWeek(date);
      const key = `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
      periodCounts.set(key, (periodCounts.get(key) ?? 0) + 1);
      periodLabels.set(key, `Week ${week}, ${date.getFullYear()}`);
    }
  });

  const busiestDay = Array.from(dayCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topPeriodEntry = Array.from(periodCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  const topPeriod = topPeriodEntry
    ? { label: periodLabels.get(topPeriodEntry[0]) ?? topPeriodEntry[0], count: topPeriodEntry[1] }
    : undefined;

  const itemCounts = new Map<string, { label: string; count: number }>();
  orders.forEach((order) => {
    order.shipments.forEach((shipment) => {
      shipment.items.forEach((item) => {
        const key = item.asin ?? item.title ?? '';
        if (!key) return;
        const current = itemCounts.get(key) ?? { label: item.title || key, count: 0 };
        current.count += 1;
        itemCounts.set(key, current);
      });
    });
  });
  const topItems = Array.from(itemCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const uniqueItems = Array.from(itemCounts.values()).filter((i) => i.count === 1).length;
  const repeatItems = Array.from(itemCounts.values()).filter((i) => i.count > 1).length;

  return {
    totalOrders: orders.length,
    nonCancelledOrders: safeOrders.length,
    totalSpend,
    avgOrderValue,
    currency,
    formattedSpend: formatCurrency(totalSpend, currency),
    formattedAvg: formatCurrency(avgOrderValue, currency),
    busiestDay,
    topPeriod,
    topItems,
    uniqueItems,
    repeatItems,
  };
};

const App = () => {
  const { session, setSession, loading, setLoading, error, setError, refresh } = useSessionState();
  const [selectedFilter, setSelectedFilter] = useState<string>('');
  const [availableFilters, setAvailableFilters] = useState<TimeFilterOption[]>([]);
  const [isOnOrderPage, setIsOnOrderPage] = useState<boolean | null>(null);
  const [downloadInvoices, setDownloadInvoices] = useState<boolean>(false);
  const [showHighlights, setShowHighlights] = useState<boolean>(false);
  const [view, setView] = useState<'main' | 'highlights'>('main');
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const fetchContext = async () => {
      const response = await sendRuntimeMessage<{ state: ScrapeSessionSnapshot; isSupported: boolean }>({
        type: 'GET_CONTEXT',
      });
      if (response.success) {
        if (response.data?.state) {
          setSession(response.data.state);
        }
        setIsOnOrderPage(Boolean(response.data?.isSupported));
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
    if (session?.phase !== 'completed') {
      setShowHighlights(false);
      setView('main');
    }
  }, [session?.phase]);

  useEffect(() => {
    const manifest = browser.runtime.getManifest();
    if (manifest?.version) {
      setVersion(manifest.version);
    }
  }, []);

  const isRunning = session?.phase === 'running';
  const isBlockedPage = isOnOrderPage === false;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading || isRunning || isOnOrderPage === false) {
      return;
    }
    setLoading(true);
    const chosen = availableFilters.find((option) => option.value === selectedFilter);
    const parsedYear =
      chosen?.year ?? (selectedFilter.startsWith('year-') ? Number(selectedFilter.replace('year-', '')) : undefined);
    const downloadInvoicesFlag = Boolean(downloadInvoices);

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
      setError(response.error ?? 'Failed to start scraper');
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

  const statusMessage = useMemo(() => {
    if (!session) {
      return 'Initializing…';
    }
    if (session.phase === 'idle') {
      return 'Ready to start scraping.';
    }
    if (session.phase === 'running') {
      return `Running — collected ${session.ordersCollected}/${session.ordersLimit}`;
    }
    if (session.phase === 'completed') {
      const count = session.orders?.length ?? session.ordersCollected ?? 0;
      if (count === 0) {
        return 'No orders found for the selected range.';
      }
      return `Completed — ${count} orders exported`;
    }
    if (session.phase === 'error') {
      return 'Encountered an error';
    }
    return session.message ?? 'Idle';
  }, [session]);

  const activeError = error ?? session?.errorMessage ?? null;
  const showReset =
    Boolean(session && session.phase !== 'idle') || session?.ordersCollected || session?.invoicesQueued;
  const canDownload = Boolean(session?.orders?.length && session?.phase === 'completed');
  const canDownloadInvoicesOnly = Boolean(
    session?.orders?.length &&
    session?.phase === 'completed' &&
    session?.downloadInvoicesRequested &&
    (session?.invoicesDownloaded ?? 0) === 0,
  );
  const showCancelInvoices = Boolean(session?.invoiceDownloadsStarted && (session?.invoicesDownloaded ?? 0) < (session?.invoicesQueued ?? 0));
  const showCancelScrape = session?.phase === 'running';
  const canStart = !loading && !isRunning && isOnOrderPage !== false;
  const canShowHighlights = Boolean(session?.orders?.length && session?.phase === 'completed');
  const summary = useMemo(() => computeHighlights(session?.orders ?? [], session?.timeFilterValue), [
    session?.orders,
    session?.timeFilterValue,
  ]);

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
    const ordersUrl = AMAZON_ORDER_HISTORY_URLS[0];
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
              <p className="hero-title">Head to your Amazon.in order history</p>
              <p className="hero-copy">
                Open the Orders page, then click “Start scrape” to export your orders to CSV.
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
        {version ? <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>Version {version}</div> : null}
      </footer>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <header className="popup-header sticky-header">
        <div className="header-row">
          {view === 'highlights' ? (
            <button
              type="button"
              className="secondary-button"
              style={{ width: 'auto', padding: '6px 10px', marginBottom: 0 }}
              onClick={() => {
                setView('main');
                setShowHighlights(false);
              }}
            >
              ← Back
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
                onChange={(event) => setDownloadInvoices(event.target.checked)}
                disabled={isBlockedPage}
              />
              <span>Download invoices after scrape</span>
            </label>

            <button
              type="submit"
              disabled={!canStart || !selectedFilter}
              className={`primary-button ${canStart && selectedFilter ? '' : 'disabled'}`}
            >
              {isRunning ? 'Scrape in progress…' : loading ? 'Working…' : 'Start scrape'}
            </button>
          </form>

          {canShowHighlights && view === 'main' ? (
            <button
              type="button"
              className="secondary-button"
              style={{ marginTop: '8px' }}
              onClick={() => {
                setShowHighlights(true);
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
              Download invoices for last scrape
            </button>
          )}

          {showReset && (
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
              Stop scrape
            </button>
          )}
        </section>

        {view === 'highlights' && canShowHighlights ? (
          <section className="status-block">
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
              <div className="highlight-value">{summary.topPeriod ? `${summary.topPeriod.label} (${summary.topPeriod.count})` : '—'}</div>
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
          </section>
        ) : (
          <section className="status-block">
            {isBlockedPage && <p className="status-warning">Please open the Amazon.in order history page before starting a scrape.</p>}
            <p style={{ margin: '0 0 8px' }}>
              <strong>Status:</strong> {statusMessage}
            </p>
          <p style={{ margin: 0 }}>
            Filtering: {session?.timeFilterLabel ?? session?.yearFilter ?? 'All'}
          </p>
          <div className="progress-container" style={{ marginTop: '8px' }}>
            <div className="progress-label">
              Orders:{' '}
              {session?.phase === 'completed'
                ? `${session?.orders?.length ?? 0}/${session?.orders?.length ?? 0}`
                : `${session?.ordersCollected ?? 0} (cap ${session?.ordersLimit ?? MAX_ORDERS_PER_RUN})`}
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${Math.min(
                    100,
                    session?.phase === 'completed'
                      ? 100
                      : ((session?.ordersCollected ?? 0) / Math.max(session?.ordersLimit ?? MAX_ORDERS_PER_RUN, 1)) * 100,
                  ).toFixed(1)}%`,
                }}
              />
            </div>
          </div>
          <dl className="definition-list">
            <dt>Orders collected:</dt>
            <dd>
              {session?.phase === 'completed'
                ? `${session?.orders?.length ?? 0}/${session?.orders?.length ?? 0}`
                : `${session?.ordersCollected ?? 0}/${session?.ordersLimit ?? MAX_ORDERS_PER_RUN}`}
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
          {activeError ? <p className="error-text">{activeError}</p> : session?.message && <p style={{ marginTop: '8px' }}>{session.message}</p>}
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
          {session?.invoiceErrors && session.invoiceErrors > 0 && session.invoiceDownloadsStarted ? (
            <p className="error-text" style={{ marginTop: '8px' }}>
              Some invoices failed to download. Enable multiple downloads in your browser and try again.
            </p>
          ) : null}
        </section>
      )}
    </div>

    <footer className="privacy-note sticky-footer">
        All scraping, CSVs, and invoice downloads run locally in your browser. No data leaves your device.
      </footer>
    </div>
  );
};

export default App;
