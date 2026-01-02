import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const outputDir = path.resolve(process.cwd(), 'docs', 'store', 'screenshots');
const fixtureDir = path.resolve(process.cwd(), 'docs', 'samples', 'amazon.in');
const ordersFixture = path.join(fixtureDir, 'e2e-orders.html');
const ordersNoFilterFixture = path.join(fixtureDir, 'e2e-orders-no-filter.html');
const headless = false;
const viewport = { width: 1280, height: 800 };

mkdirSync(outputDir, { recursive: true });

let baseUrl = '';

const startFixtureServer = async () => {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname.startsWith('/your-orders/no-filter')) {
      const html = readFileSync(ordersNoFilterFixture, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    if (url.pathname.startsWith('/your-orders')) {
      const html = readFileSync(ordersFixture, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><html><body><h1>Not orders</h1></body></html>');
  });

  const desiredPort = process.env.E2E_PORT ? Number(process.env.E2E_PORT) : 0;
  await new Promise((resolve) => server.listen(desiredPort, resolve));
  const address = server.address();
  if (typeof address === 'object' && address?.port) {
    baseUrl = `http://localhost:${address.port}`;
  }
  return server;
};

const getExtensionId = async (context) => {
  const background = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return background.url().split('/')[2];
};

const ensurePopupReady = async (popupPage, orderPage) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await orderPage.bringToFront();
    await popupPage.reload();
    await orderPage.bringToFront();
    const visible = await popupPage
      .locator('#timeFilter')
      .isVisible()
      .catch(() => false);
    if (visible) {
      return;
    }
  }
  throw new Error('Popup failed to detect the order page context.');
};

const sendRuntimeMessage = async (page, message) =>
  page.evaluate(
    (payload) =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage(payload, () => resolve(null));
      }),
    message,
  );

const setFilterValue = async (page, value) =>
  page.evaluate((nextValue) => {
    const select = document.querySelector('#timeFilter');
    if (!select) return;
    select.value = nextValue;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);

const submitFilterForm = async (page) =>
  page.evaluate(() => {
    const form = document.querySelector('#timeFilter')?.closest('form');
    if (!form) return;
    if ('requestSubmit' in form) {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
  });

const resetSession = async (page) => {
  await sendRuntimeMessage(page, { type: 'RESET_SCRAPE' });
  await page.reload();
};

const capture = async () => {
  const server = await startFixtureServer();
  const extensionPath = path.resolve(process.cwd(), 'dist');
  const context = await chromium.launchPersistentContext('', {
    headless,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    viewport,
  });
  const extensionId = await getExtensionId(context);

  const orderPage = await context.newPage();
  await orderPage.setViewportSize(viewport);
  await orderPage.goto(`${baseUrl}/your-orders/orders`);
  await orderPage.bringToFront();

  const popupPage = await context.newPage();
  await popupPage.setViewportSize(viewport);
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await ensurePopupReady(popupPage, orderPage);

  await resetSession(popupPage);
  await ensurePopupReady(popupPage, orderPage);
  await setFilterValue(popupPage, 'months-3');
  await popupPage.screenshot({ path: path.join(outputDir, '01-idle.png') });

  await sendRuntimeMessage(popupPage, {
    type: 'SCRAPE_PROGRESS',
    payload: {
      phase: 'running',
      ordersCollected: 120,
      ordersInRange: 400,
      invoicesQueued: 15,
      message: 'Exporting orders…',
      hasMorePages: true,
    },
  });
  await popupPage.getByText('Orders:').waitFor({ timeout: 5000 });
  await popupPage.screenshot({ path: path.join(outputDir, '02-running.png') });

  await resetSession(popupPage);
  await ensurePopupReady(popupPage, orderPage);
  await setFilterValue(popupPage, 'months-3');
  await submitFilterForm(popupPage);
  await popupPage.getByRole('button', { name: 'Download CSV' }).waitFor({ timeout: 10000 });
  await popupPage.screenshot({ path: path.join(outputDir, '03-complete.png') });

  const highlightsButton = popupPage.getByRole('button', { name: 'View highlights' });
  if (await highlightsButton.isVisible().catch(() => false)) {
    await highlightsButton.click();
    await popupPage.getByText('Total orders').waitFor({ timeout: 5000 });
    await popupPage.screenshot({ path: path.join(outputDir, '04-highlights.png') });
  }

  await popupPage.click('button[aria-label="Back"]').catch(() => undefined);
  await popupPage.evaluate(() => {
    const scroller = document.querySelector('.content-scroll');
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  });
  await popupPage.waitForTimeout(300);
  await popupPage.screenshot({ path: path.join(outputDir, '05-privacy.png') });

  await popupPage.close();
  await orderPage.close();
  await context.close();
  await new Promise((resolve) => server.close(() => resolve()));
  console.log(`Saved screenshots to ${outputDir}`);
};

capture().catch((error) => {
  console.error('Failed to capture screenshots', error);
  process.exit(1);
});
