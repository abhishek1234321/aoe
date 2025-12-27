import { createServer } from 'node:http';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { chromium, expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 4173);
const baseUrl = `http://localhost:${port}`;
const fixtureDir = path.resolve(process.cwd(), 'docs', 'samples', 'amazon.in');
const ordersFixture = path.join(fixtureDir, 'e2e-orders.html');

const startFixtureServer = async () => {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', baseUrl);
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname.startsWith('/your-orders')) {
      const html = readFileSync(ordersFixture, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><html><body><h1>Not orders</h1></body></html>');
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  return server;
};

const getExtensionId = async (context: BrowserContext) => {
  const background = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return background.url().split('/')[2];
};

const ensurePopupReady = async (popupPage: Page, orderPage: Page) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await orderPage.bringToFront();
    await popupPage.reload();
    await orderPage.bringToFront();
    const visible = await popupPage.locator('#timeFilter').isVisible().catch(() => false);
    if (visible) {
      return;
    }
  }
  throw new Error('Popup failed to detect the order page context.');
};

test.describe('extension e2e (fixtures)', () => {
  let server: Awaited<ReturnType<typeof startFixtureServer>>;
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>;
  let extensionId: string;

  test.beforeAll(async () => {
    server = await startFixtureServer();
    const extensionPath = path.resolve(process.cwd(), 'dist');
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    extensionId = await getExtensionId(context);
  });

  test.afterAll(async () => {
    await context.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('shows empty state when not on order history', async () => {
    const nonOrderPage = await context.newPage();
    await nonOrderPage.goto(`${baseUrl}/not-orders`);
    await nonOrderPage.bringToFront();

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(popupPage.getByText('Head to your Amazon.in order history')).toBeVisible();
    await popupPage.close();
    await nonOrderPage.close();
  });

  test('scrapes fixtures and shows download CTA', async () => {
    const orderPage = await context.newPage();
    await orderPage.goto(`${baseUrl}/your-orders/orders`);
    await orderPage.bringToFront();

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await ensurePopupReady(popupPage, orderPage);

    await popupPage.selectOption('#timeFilter', { value: 'months-3' });
    await popupPage.getByRole('button', { name: 'Start scrape' }).click();

    await expect(popupPage.getByRole('button', { name: 'Download CSV' })).toBeVisible();
    await expect(popupPage.getByText('Invoices queued:')).toBeVisible();
    await expect(popupPage.getByText('Invoices queued: 0')).toBeVisible();

    await popupPage.close();
    await orderPage.close();
  });
});
