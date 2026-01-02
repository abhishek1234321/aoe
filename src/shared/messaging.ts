import browser from 'webextension-polyfill';
import type { ScrapeCommandPayload, ScrapeProgressPayload, ScrapeSessionSnapshot } from './types';

export type RuntimeMessage =
  | {
      type: 'START_SCRAPE';
      payload: ScrapeCommandPayload;
    }
  | {
      type: 'GET_CONTEXT';
    }
  | {
      type: 'GET_AVAILABLE_FILTERS';
    }
  | {
      type: 'GET_STATE';
    }
  | {
      type: 'SCRAPE_PROGRESS';
      payload: ScrapeProgressPayload;
    }
  | {
      type: 'RESET_SCRAPE';
    }
  | {
      type: 'RETRY_FAILED_INVOICES';
    }
  | {
      type: 'CANCEL_INVOICE_DOWNLOADS';
    }
  | {
      type: 'CANCEL_SCRAPE';
    }
  | {
      type: 'SET_SETTINGS';
      payload: { notifyOnCompletion?: boolean };
    }
  | {
      type: 'TEST_NOTIFICATION';
    };

export interface RuntimeResponse<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

export type ScrapeResponse = RuntimeResponse<{ state: ScrapeSessionSnapshot }>;

export const sendRuntimeMessage = async <T>(message: RuntimeMessage) =>
  (await browser.runtime.sendMessage(message)) as RuntimeResponse<T>;
