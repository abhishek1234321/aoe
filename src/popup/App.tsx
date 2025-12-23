import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AMAZON_ORDER_HISTORY_URLS, MAX_ORDERS_PER_RUN } from '@shared/constants';
import { sendRuntimeMessage } from '@shared/messaging';
import { ordersToCsv } from '@shared/csv';
import type { ScrapeSessionSnapshot } from '@shared/types';

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
      <div style={{ minWidth: '320px', maxWidth: '360px' }}>
        <header>
          <h1 style={{ margin: '0 0 8px', fontSize: '18px' }}>Amazon Order Extractor</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#4b5563' }}>
            Jump to Amazon.in order history to begin.
          </p>
        </header>
        <section
          style={{
            marginTop: '16px',
            padding: '16px',
            borderRadius: '10px',
            border: '1px solid #e5e7eb',
            background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
          }}
        >
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <svg
              width="64"
              height="64"
              viewBox="0 0 64 64"
              role="img"
              aria-label="Orders illustration"
            >
              <rect x="8" y="10" width="48" height="44" rx="6" fill="#fff" stroke="#c7d2fe" />
              <rect x="16" y="20" width="32" height="4" rx="2" fill="#4f46e5" />
              <rect x="16" y="30" width="24" height="4" rx="2" fill="#c7d2fe" />
              <rect x="16" y="40" width="18" height="4" rx="2" fill="#c7d2fe" />
              <circle cx="46" cy="42" r="6" fill="#22c55e" />
              <path d="M44 42.5 45.5 44 48 40" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div>
              <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#111827' }}>
                Head to your Amazon.in order history
              </p>
              <p style={{ margin: 0, color: '#4b5563', fontSize: '13px' }}>
                Open the Orders page, then click “Start scrape” to export your orders to CSV.
              </p>
            </div>
          </div>
          <a
            href={ordersUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '12px',
              padding: '10px 12px',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: '#232f3e',
              textDecoration: 'none',
              width: '100%',
            }}
          >
            Open order history
          </a>
          <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: '12px' }}>
            If you were already there, refresh the order page and the extension.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div style={{ minWidth: '320px', maxWidth: '360px' }}>
      <header>
        <h1 style={{ margin: '0 0 8px', fontSize: '18px' }}>Amazon Order Extractor</h1>
        <p style={{ margin: 0, fontSize: '13px', color: '#4b5563' }}>
          Each run is capped at {MAX_ORDERS_PER_RUN} orders to keep things stable.
        </p>
      </header>

      <section style={{ marginTop: '16px' }}>
        <form onSubmit={handleSubmit}>
          <label
            htmlFor="year"
            style={{ display: 'block', fontSize: '13px', marginBottom: '4px', fontWeight: 600 }}
          >
            Optional year filter
          </label>
          <select
            id="year"
            value={year}
            onChange={(event) => setYear(event.target.value)}
            disabled={isBlockedPage}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              marginBottom: '8px',
              backgroundColor: '#fff',
            }}
          >
            <option value="">All years</option>
            {yearOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={!canStart}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: 'none',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: canStart ? '#232f3e' : '#94a3b8',
              cursor: canStart ? 'pointer' : 'not-allowed',
            }}
          >
            {isRunning ? 'Scrape in progress…' : loading ? 'Working…' : 'Start scrape'}
          </button>
        </form>

        {showReset && (
          <button
            type="button"
            onClick={handleReset}
            disabled={loading}
            style={{
              width: '100%',
              marginTop: '10px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #cbd5f5',
              backgroundColor: '#f8fafc',
              color: '#1e3a8a',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            Reset session
          </button>
        )}
      </section>

      <section style={{ marginTop: '16px', fontSize: '13px', color: '#1f2937' }}>
        {isOnOrderPage === false && (
          <p style={{ color: '#b91c1c', marginBottom: '8px' }}>
            Please open the Amazon.in order history page before starting a scrape.
          </p>
        )}
        <p style={{ margin: '0 0 8px' }}>
          <strong>Status:</strong> {statusMessage}
        </p>
        {session?.yearFilter ? (
          <p style={{ margin: 0 }}>Filtering year: {session.yearFilter}</p>
        ) : (
          <p style={{ margin: 0 }}>Filtering year: All</p>
        )}
        <dl style={{ margin: '12px 0', display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: '6px' }}>
          <dt style={{ fontWeight: 600 }}>Orders collected:</dt>
          <dd style={{ margin: 0 }}>
            {session?.ordersCollected ?? 0}/{session?.ordersLimit ?? MAX_ORDERS_PER_RUN}
          </dd>
          <dt style={{ fontWeight: 600 }}>Invoices queued:</dt>
          <dd style={{ margin: 0 }}>{session?.invoicesQueued ?? 0}</dd>
          <dt style={{ fontWeight: 600 }}>Started:</dt>
          <dd style={{ margin: 0 }}>{formatTimestamp(session?.startedAt)}</dd>
          <dt style={{ fontWeight: 600 }}>Completed:</dt>
          <dd style={{ margin: 0 }}>{formatTimestamp(session?.completedAt)}</dd>
        </dl>
        {activeError ? (
          <p style={{ color: '#b91c1c', marginTop: '8px' }}>{activeError}</p>
        ) : (
          session?.message && <p style={{ marginTop: '8px' }}>{session.message}</p>
        )}
        {canDownload && (
          <button
            type="button"
            onClick={() => session?.orders && downloadCsv(ordersToCsv(session.orders))}
            style={{
              width: '100%',
              marginTop: '12px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #065f46',
              backgroundColor: '#d1fae5',
              color: '#065f46',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Download CSV
          </button>
        )}
      </section>
    </div>
  );
};

export default App;
