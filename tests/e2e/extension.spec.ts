import { createServer } from 'node:http';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { chromium, expect, test } from '@playwright/test';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 4173);
const baseUrl = `http://localhost:${port}`;
const fixtureDir = path.resolve(process.cwd(), 'docs', 'samples', 'amazon.in');
const ordersFixture = path.join(fixtureDir, 'e2e-orders.html');
const headless = process.env.E2E_HEADLESS === '1';
const slowMo = Number(process.env.E2E_SLOWMO ?? 0) || undefined;
const recordVideo = process.env.E2E_VIDEO === '1';
const traceEnabled = process.env.E2E_TRACE !== '0';
const debugLogs: string[] = [];

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

const trackPage = (page: Page) => {
  page.on('console', (msg) => {
    debugLogs.push(`[console:${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    debugLogs.push(`[pageerror] ${error.message}`);
  });
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
      headless,
      slowMo,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
      recordVideo: recordVideo ? { dir: path.resolve(process.cwd(), 'test-results', 'videos') } : undefined,
      viewport: { width: 1280, height: 800 },
    });
    extensionId = await getExtensionId(context);
    if (traceEnabled) {
      await context.tracing.start({ screenshots: true, snapshots: true });
    }
  });

  test.afterAll(async () => {
    await context.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test.beforeEach(async ({}, testInfo) => {
    debugLogs.length = 0;
    if (traceEnabled) {
      await context.tracing.startChunk({ title: testInfo.title });
    }
  });

  test.afterEach(async ({}, testInfo) => {
    const failed = testInfo.status !== testInfo.expectedStatus;
    if (traceEnabled) {
      if (failed) {
        await context.tracing.stopChunk({ path: testInfo.outputPath('trace.zip') });
      } else {
        await context.tracing.stopChunk();
      }
    }

    if (!failed) {
      return;
    }

    const page = context.pages().find((candidate) => !candidate.isClosed()) ?? null;
    if (page) {
      const screenshotPath = testInfo.outputPath('failure.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await testInfo.attach('screenshot', { path: screenshotPath, contentType: 'image/png' });
      const video = page.video();
      if (video) {
        const videoPath = await video.path();
        await testInfo.attach('video', { path: videoPath, contentType: 'video/webm' });
      }
    }

    if (debugLogs.length) {
      await testInfo.attach('console', {
        body: debugLogs.join('\n'),
        contentType: 'text/plain',
      });
    }
  });

  test('shows empty state when not on order history', async () => {
    const nonOrderPage = await context.newPage();
    trackPage(nonOrderPage);
    await nonOrderPage.goto(`${baseUrl}/not-orders`);
    await nonOrderPage.bringToFront();

    const popupPage = await context.newPage();
    trackPage(popupPage);
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(popupPage.getByText('Head to your Amazon.in order history')).toBeVisible();
    await popupPage.close();
    await nonOrderPage.close();
  });

  test('scrapes fixtures and shows download CTA', async () => {
    const orderPage = await context.newPage();
    trackPage(orderPage);
    await orderPage.goto(`${baseUrl}/your-orders/orders`);
    await orderPage.bringToFront();

    const popupPage = await context.newPage();
    trackPage(popupPage);
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await ensurePopupReady(popupPage, orderPage);

    await popupPage.selectOption('#timeFilter', { value: 'months-3' });
    await popupPage.getByRole('button', { name: 'Start scrape' }).click();

    await expect(popupPage.getByRole('button', { name: 'Download CSV' })).toBeVisible();
    await expect(popupPage.getByText('Invoices queued:')).toBeVisible();

    await popupPage.close();
    await orderPage.close();
  });
});
