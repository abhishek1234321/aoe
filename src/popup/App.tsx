import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { MAX_ORDERS_PER_RUN } from '@shared/constants';
import { sendRuntimeMessage } from '@shared/messaging';
import type { ScrapeSessionSnapshot } from '@shared/types';

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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isRunning = session?.phase === 'running';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading || isRunning) {
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
          <input
            id="year"
            type="number"
            min={2004}
            max={new Date().getFullYear()}
            placeholder="All years"
            value={year}
            onChange={(event) => setYear(event.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              marginBottom: '8px',
            }}
          />

          <button
            type="submit"
            disabled={loading || isRunning}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: 'none',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: loading || isRunning ? '#94a3b8' : '#232f3e',
              cursor: loading || isRunning ? 'not-allowed' : 'pointer',
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
        <p style={{ margin: '0 0 8px' }}>
          <strong>Status:</strong> {statusMessage}
        </p>
        {session?.yearFilter ? (
          <p style={{ margin: 0 }}>Filtering year: {session.yearFilter}</p>
        ) : (
          <p style={{ margin: 0 }}>Filtering year: All</p>
        )}
        <ul style={{ paddingLeft: '20px', margin: '12px 0' }}>
          <li>
            Orders collected:{' '}
            <strong>
              {session?.ordersCollected ?? 0}/{session?.ordersLimit ?? MAX_ORDERS_PER_RUN}
            </strong>
          </li>
          <li>
            Invoices queued: <strong>{session?.invoicesQueued ?? 0}</strong>
          </li>
          <li>Started: {formatTimestamp(session?.startedAt)}</li>
          <li>Completed: {formatTimestamp(session?.completedAt)}</li>
        </ul>
        {activeError ? (
          <p style={{ color: '#b91c1c', marginTop: '8px' }}>{activeError}</p>
        ) : (
          session?.message && <p style={{ marginTop: '8px' }}>{session.message}</p>
        )}
      </section>
    </div>
  );
};

export default App;
