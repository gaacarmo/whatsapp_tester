import { chromium } from 'playwright';
import { STATUS, classify, readPageState } from './detect.js';

const HOME = 'https://web.whatsapp.com/';
const POLL_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A real, visible Chromium window with a persistent profile. You log in once
 * by scanning the QR code; the session lives in `profileDir` on your machine
 * (git-ignored) and is reused on the next run.
 */
export class WhatsAppWeb {
  /** @param {{ profileDir: string, headless?: boolean }} options */
  constructor({ profileDir, headless = false }) {
    this.profileDir = profileDir;
    this.headless = headless;
    this.context = null;
    this.page = null;
  }

  async open() {
    this.context = await chromium.launchPersistentContext(this.profileDir, {
      headless: this.headless,
      viewport: null,
      args: ['--disable-notifications'],
    });
    this.page = this.context.pages()[0] ?? (await this.context.newPage());
    await this.page.goto(HOME, { waitUntil: 'domcontentloaded' });
  }

  /**
   * Resolves once the chat list is on screen. Calls `onQr` once if a QR code
   * is shown, so the CLI can tell the user to scan it.
   */
  async waitForLogin({ timeoutMs, onQr }) {
    const deadline = Date.now() + timeoutMs;
    let announced = false;
    while (Date.now() < deadline) {
      const state = await this.#state();
      if (state.ready) return;
      if (state.unsupported) {
        throw new Error('WhatsApp Web refused this browser ("update Chrome" page). Run with a visible window, not headless.');
      }
      if (state.qr && !announced) {
        announced = true;
        onQr?.();
      }
      await sleep(POLL_MS);
    }
    throw new Error('Timed out waiting for WhatsApp Web login.');
  }

  /**
   * @param {string} digits international number, digits only (e.g. 5541999998888)
   * @param {{ timeoutMs?: number }} [options]
   * @returns {Promise<string>} a STATUS value
   */
  async check(digits, { timeoutMs = 30_000 } = {}) {
    if (!/^\d{8,15}$/.test(digits)) throw new Error('check() expects 8-15 digits');
    await this.page.goto(`${HOME}send?phone=${digits}`, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      // evaluate() can throw while WhatsApp redirects internally; just poll again.
      const state = await this.page.evaluate(readPageState).catch(() => null);
      if (state?.loggedOut) throw new Error('WhatsApp Web logged out. Run again and scan the QR code.');
      const verdict = state && classify(state);
      if (verdict) return verdict;
      await sleep(POLL_MS);
    }
    return STATUS.UNKNOWN;
  }

  async close() {
    await this.context?.close().catch(() => {});
  }

  async #state() {
    return this.page.evaluate(() => ({
      ready: Boolean(document.querySelector('#pane-side, [data-testid="chat-list"]')),
      qr: Boolean(document.querySelector('[data-testid="link-device-qr-code"], [data-ref] canvas')),
      unsupported: /works with Google Chrome \d+\+|funciona com o Google Chrome/i.test(
        document.body?.innerText ?? '',
      ),
    }));
  }
}

/**
 * Offline stand-in used by `--demo`: same interface, no browser, no network,
 * deterministic answers. Lets you see the whole flow without a session.
 */
export class DemoWhatsApp {
  async open() {}
  async waitForLogin() {}
  async close() {}
  async check(digits) {
    await sleep(350);
    const sum = [...digits].reduce((acc, d) => acc + Number(d), 0);
    if (digits.endsWith('0000')) return STATUS.UNKNOWN;
    return sum % 3 === 0 ? STATUS.OFF : STATUS.ON;
  }
}
