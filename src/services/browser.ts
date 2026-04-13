import puppeteer, { Browser, Page } from 'puppeteer';
import { logger } from '../logger';

const MAX_PAGES = parseInt(process.env.MAX_CONCURRENT_PAGES || '5', 10);
const NAV_TIMEOUT = parseInt(process.env.NAVIGATION_TIMEOUT_MS || '30000', 10);

let browser: Browser | null = null;
let activePages = 0;
const waitQueue: Array<(value: void) => void> = [];

export async function launchBrowser(): Promise<void> {
  browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--single-process',
      '--no-zygote',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
    ],
  });

  browser.on('disconnected', () => {
    logger.warn('Browser disconnected, will relaunch on next request');
    browser = null;
    activePages = 0;
  });

  logger.info('Browser launched');
}

async function ensureBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    await launchBrowser();
  }
  return browser!;
}

function acquireSlot(): Promise<void> {
  if (activePages < MAX_PAGES) {
    activePages++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(resolve);
  });
}

function releaseSlot(): void {
  const next = waitQueue.shift();
  if (next) {
    next();
  } else {
    activePages--;
  }
}

export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  await acquireSlot();
  let page: Page | null = null;
  try {
    const b = await ensureBrowser();
    page = await b.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    page.setDefaultTimeout(NAV_TIMEOUT);
    return await fn(page);
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    releaseSlot();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    logger.info('Browser closed');
  }
}

export function getBrowserStats() {
  return {
    connected: browser?.connected ?? false,
    activePages,
    queueLength: waitQueue.length,
    maxPages: MAX_PAGES,
  };
}
