import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AMAZON_ORDER_HISTORY_URLS, MAX_ORDERS_PER_RUN } from '@shared/constants';
import { sendRuntimeMessage } from '@shared/messaging';
import { ordersToCsv } from '@shared/csv';
import type { ScrapeSessionSnapshot } from '@shared/types';
import heroOrders from '../assets/hero-orders.svg';
import './App.css';

const downloadCsv = (csvText: string) => {
  const anchor = document.createElement('a');
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  anchor.href = URL.createObjectURL(blob);
  anchor.download = 'amazon-orders.csv';
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
  return new Date(timestamp).toLocaleString();
};

const App = () => {
  const { session, setSession, loading, setLoading, error, setError, refresh } = useSessionState();
  const [year, setYear] = useState<string>('');
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [isOnOrderPage, setIsOnOrderPage] = useState<boolean | null>(null);

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

    const fetchYears = async () => {
      const response = await sendRuntimeMessage<{ years: number[] }>({
        type: 'GET_AVAILABLE_YEARS',
      });
      if (response.success && response.data?.years?.length) {
        setAvailableYears(response.data.years);
      }
    };

    void fetchContext();
    void fetchYears();
  }, [setSession]);

  const isRunning = session?.phase === 'running';
  const isBlockedPage = isOnOrderPage === false;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading || isRunning || isOnOrderPage === false) {
      return;
    }
    setLoading(true);
    const parsedYear = year ? Number(year) : undefined;

    const response = await sendRuntimeMessage<{ state: ScrapeSessionSnapshot }>({
      type: 'START_SCRAPE',
      payload: { year: parsedYear },
    });

    if (!response.success) {
      setError(response.error ?? 'Failed to start scraper');
    } else if (response.data?.state) {
      setSession(response.data.state);
      setError(null);
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
      return `Completed — ${session.ordersCollected} orders exported`;
    }
    if (session.phase === 'error') {
      return 'Encountered an error';
    }
    return session.message ?? 'Idle';
  }, [session]);

  const activeError = error ?? session?.errorMessage ?? null;
  const showReset =
    Boolean(session && session.phase !== 'idle') || session?.ordersCollected || session?.invoicesQueued;
  const canDownload = Boolean(session?.orders?.length);
  const canStart = !loading && !isRunning && isOnOrderPage !== false;

  const yearOptions = useMemo(() => {
    if (availableYears.length) {
      return availableYears;
    }
    const current = new Date().getFullYear();
    return [current, current - 1, current - 2];
  }, [availableYears]);

  if (isOnOrderPage === false) {
    const ordersUrl = AMAZON_ORDER_HISTORY_URLS[0];
    return (
      <div className="popup-container">
        <header className="popup-header">
          <h1>Amazon Order Extractor</h1>
          <p>Jump to Amazon.in order history to begin.</p>
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
      </div>
    );
  }

  return (
    <div className="popup-container">
      <header className="popup-header">
        <h1>Amazon Order Extractor</h1>
        <p>Each run is capped at {MAX_ORDERS_PER_RUN} orders to keep things stable.</p>
      </header>

      <section style={{ marginTop: '16px' }}>
        <form onSubmit={handleSubmit}>
          <label htmlFor="year" className="field-label">
            Optional year filter
          </label>
          <select
            id="year"
            value={year}
            onChange={(event) => setYear(event.target.value)}
            disabled={isBlockedPage}
            className="select-input"
          >
            <option value="">All years</option>
            {yearOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <button type="submit" disabled={!canStart} className={`primary-button ${canStart ? '' : 'disabled'}`}>
            {isRunning ? 'Scrape in progress…' : loading ? 'Working…' : 'Start scrape'}
          </button>
        </form>

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
      </section>

      <section className="status-block">
        {isOnOrderPage === false && <p className="status-warning">Please open the Amazon.in order history page before starting a scrape.</p>}
        <p style={{ margin: '0 0 8px' }}>
          <strong>Status:</strong> {statusMessage}
        </p>
        {session?.yearFilter ? <p style={{ margin: 0 }}>Filtering year: {session.yearFilter}</p> : <p style={{ margin: 0 }}>Filtering year: All</p>}
        <dl className="definition-list">
          <dt>Orders collected:</dt>
          <dd>
            {session?.ordersCollected ?? 0}/{session?.ordersLimit ?? MAX_ORDERS_PER_RUN}
          </dd>
          <dt>Invoices queued:</dt>
          <dd>{session?.invoicesQueued ?? 0}</dd>
          <dt>Started:</dt>
          <dd>{formatTimestamp(session?.startedAt)}</dd>
          <dt>Completed:</dt>
          <dd>{formatTimestamp(session?.completedAt)}</dd>
        </dl>
        {activeError ? <p className="error-text">{activeError}</p> : session?.message && <p style={{ marginTop: '8px' }}>{session.message}</p>}
        {canDownload && (
          <button
            type="button"
            onClick={() => session?.orders && downloadCsv(ordersToCsv(session.orders))}
            className="download-button"
          >
            Download CSV
          </button>
        )}
      </section>
    </div>
  );
};

export default App;
