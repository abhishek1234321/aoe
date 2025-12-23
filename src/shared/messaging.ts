import browser from 'webextension-polyfill';
import type { ScrapeCommandPayload, ScrapeSessionSnapshot } from './types';

export type RuntimeMessage =
  | {
      type: 'START_SCRAPE';
      payload: ScrapeCommandPayload;
    }
  | {
      type: 'GET_STATE';
    };

export interface RuntimeResponse<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

export type ScrapeResponse = RuntimeResponse<{ state: ScrapeSessionSnapshot }>;

export const sendRuntimeMessage = async <T>(message: RuntimeMessage) => {
  return (await browser.runtime.sendMessage(message)) as RuntimeResponse<T>;
};
