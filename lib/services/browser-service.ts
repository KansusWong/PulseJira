/**
 * BrowserService — browser automation via Playwright CDP + Crawl4AI content extraction.
 *
 * Architecture:
 *   browse_url -> Crawl4AI endpoint (content extraction, markdown)
 *   browser    -> Playwright CDP (interactive: click/type/scroll/screenshot)
 *
 * CDP connects to a Chrome DevTools instance (via BROWSER_CDP_URL env).
 * Each session gets an isolated BrowserContext for cookie separation.
 */

import type { Browser, BrowserContext, Page } from 'playwright-core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrowserSession {
  context: BrowserContext;
  page: Page;
  createdAt: Date;
  lastUsedAt: Date;
}

export interface ScreenshotResult {
  base64: string;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: BrowserService | null = null;

export function getBrowserService(): BrowserService {
  if (!_instance) {
    _instance = new BrowserService();
  }
  return _instance;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BrowserService {
  private cdpUrl: string;
  private browser: Browser | null = null;
  private sessions = new Map<string, BrowserSession>();

  constructor() {
    this.cdpUrl = process.env.BROWSER_CDP_URL || 'ws://127.0.0.1:9222';
  }

  // -------------------------------------------------------------------------
  // Connection management
  // -------------------------------------------------------------------------

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    try {
      // Dynamic import to avoid bundling issues with Next.js
      const pw = await import('playwright-core');
      this.browser = await pw.chromium.connectOverCDP(this.cdpUrl, {
        timeout: 10_000,
      });
      return this.browser;
    } catch (err: any) {
      throw new Error(
        `Failed to connect to browser CDP at ${this.cdpUrl}: ${err.message}. ` +
        `Set BROWSER_CDP_URL env or start a Chrome instance with --remote-debugging-port=9222.`
      );
    }
  }

  async getSession(sessionId: string): Promise<BrowserSession> {
    let session = this.sessions.get(sessionId);
    if (session) {
      session.lastUsedAt = new Date();
      return session;
    }

    const browser = await this.ensureBrowser();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    session = {
      context,
      page,
      createdAt: new Date(),
      lastUsedAt: new Date(),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  // -------------------------------------------------------------------------
  // Browser commands
  // -------------------------------------------------------------------------

  async goto(sessionId: string, url: string, timeout = 30000): Promise<string> {
    const session = await this.getSession(sessionId);
    await session.page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    const title = await session.page.title();
    return `Navigated to: ${url}\nTitle: ${title}`;
  }

  async click(sessionId: string, selector: string, timeout = 5000): Promise<string> {
    const session = await this.getSession(sessionId);
    await session.page.click(selector, { timeout });
    return `Clicked: ${selector}`;
  }

  async type(sessionId: string, selector: string, text: string, timeout = 5000): Promise<string> {
    const session = await this.getSession(sessionId);
    await session.page.fill(selector, text, { timeout });
    return `Typed "${text}" into ${selector}`;
  }

  async screenshot(sessionId: string): Promise<ScreenshotResult> {
    const session = await this.getSession(sessionId);
    const buffer = await session.page.screenshot({
      type: 'jpeg',
      quality: 40,
      fullPage: false,
    });
    const viewport = session.page.viewportSize() || { width: 1280, height: 720 };
    return {
      base64: buffer.toString('base64'),
      width: viewport.width,
      height: viewport.height,
    };
  }

  async getContent(sessionId: string): Promise<string> {
    const session = await this.getSession(sessionId);
    const text = await session.page.evaluate(() => document.body.innerText);
    // Truncate to 50KB
    return typeof text === 'string' ? text.slice(0, 50_000) : '';
  }

  async waitForSelector(sessionId: string, selector: string, timeout = 30000): Promise<string> {
    const session = await this.getSession(sessionId);
    await session.page.waitForSelector(selector, { timeout });
    return `Element found: ${selector}`;
  }

  async scroll(sessionId: string, direction: 'up' | 'down' = 'down', amount = 500): Promise<string> {
    const session = await this.getSession(sessionId);
    const delta = direction === 'down' ? amount : -amount;
    await session.page.evaluate((d) => window.scrollBy(0, d), delta);
    return `Scrolled ${direction} by ${amount}px`;
  }

  async closeSession(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.context.close();
      this.sessions.delete(sessionId);
      return `Browser session ${sessionId} closed.`;
    }
    return `No active session: ${sessionId}`;
  }

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  isAvailable(): boolean {
    return !!process.env.BROWSER_CDP_URL;
  }

  getActiveSessions(): number {
    return this.sessions.size;
  }
}
