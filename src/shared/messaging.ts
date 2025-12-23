import browser from 'webextension-polyfill';
import type {
  ScrapeCommandPayload,
  ScrapeProgressPayload,
  ScrapeSessionSnapshot,
} from './types';

export type RuntimeMessage =
  | {
      type: 'START_SCRAPE';
      payload: ScrapeCommandPayload;
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
    };

export interface RuntimeResponse<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

export type ScrapeResponse = RuntimeResponse<{ state: ScrapeSessionSnapshot }>;

export const sendRuntimeMessage = async <T>(message: RuntimeMessage) =>
  (await browser.runtime.sendMessage(message)) as RuntimeResponse<T>;
