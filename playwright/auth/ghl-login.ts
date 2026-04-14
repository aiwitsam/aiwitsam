/**
 * GHL Authentication Module
 *
 * Shared auth for all Playwright GHL automation scripts.
 * Logs in via email/password, stores session for reuse,
 * and re-authenticates when session expires.
 *
 * Usage:
 *   import { getAuthenticatedPage } from './ghl-login.js';
 *   const { browser, page } = await getAuthenticatedPage();
 */

import { chromium, type Browser, type Page, type BrowserContext } from "playwright";
import { config } from "dotenv";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_STATE_PATH = resolve(__dirname, ".state", "auth.json");

config({ path: resolve(__dirname, "..", "..", ".env") });

const GHL_EMAIL = process.env.GHL_EMAIL;
const GHL_PASSWORD = process.env.GHL_PASSWORD;
const GHL_LOGIN_URL = "https://app.gohighlevel.com/login";
const GHL_DASHBOARD_URL = "https://app.gohighlevel.com/dashboard";

function ensureCredentials(): void {
  if (!GHL_EMAIL || !GHL_PASSWORD) {
    console.error("Missing GHL_EMAIL or GHL_PASSWORD in .env");
    process.exit(1);
  }
}

async function login(page: Page): Promise<void> {
  ensureCredentials();

  console.log(`Logging into GHL as ${GHL_EMAIL}...`);
  await page.goto(GHL_LOGIN_URL, { waitUntil: "networkidle" });

  await page.fill('input[type="email"]', GHL_EMAIL!);
  await page.fill('input[type="password"]', GHL_PASSWORD!);
  await page.click('button[type="submit"]');

  // Wait for dashboard or 2FA prompt
  await page.waitForURL((url) => {
    const path = url.pathname;
    return path.includes("/dashboard") || path.includes("/v2/location") || path.includes("/two-factor");
  }, { timeout: 30_000 });

  const currentUrl = page.url();
  if (currentUrl.includes("two-factor")) {
    console.log("\n⚠ Two-factor authentication required.");
    console.log("Please complete 2FA in the browser window, then the script will continue.\n");
    await page.waitForURL((url) => !url.pathname.includes("two-factor"), { timeout: 120_000 });
  }

  console.log("Login successful.");
}

async function saveAuthState(context: BrowserContext): Promise<void> {
  const stateDir = dirname(AUTH_STATE_PATH);
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
  await context.storageState({ path: AUTH_STATE_PATH });
  console.log("Auth state saved.");
}

async function hasValidSession(): Promise<boolean> {
  if (!existsSync(AUTH_STATE_PATH)) return false;
  // Session file exists — we'll try to use it
  return true;
}

export interface AuthResult {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

/**
 * Returns an authenticated Playwright page connected to GHL.
 * Reuses saved session state if available, falls back to fresh login.
 *
 * @param headless - Run browser headless (default: true, set false for 2FA)
 */
export async function getAuthenticatedPage(headless = true): Promise<AuthResult> {
  ensureCredentials();

  const browser = await chromium.launch({
    headless,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  let context: BrowserContext;
  let page: Page;

  // Try restoring saved session
  if (await hasValidSession()) {
    console.log("Restoring saved session...");
    context = await browser.newContext({
      storageState: AUTH_STATE_PATH,
      viewport: { width: 1920, height: 1080 },
    });
    page = await context.newPage();
    await page.goto(GHL_DASHBOARD_URL, { waitUntil: "networkidle" });

    // Check if session is still valid (not redirected to login)
    if (!page.url().includes("/login")) {
      console.log("Session restored successfully.");
      return { browser, context, page };
    }

    console.log("Saved session expired. Re-authenticating...");
    await context.close();
  }

  // Fresh login
  context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  page = await context.newPage();
  await login(page);
  await saveAuthState(context);

  return { browser, context, page };
}

/**
 * Navigate to a specific GHL location settings page.
 */
export async function navigateToSettings(page: Page, locationId: string, section?: string): Promise<void> {
  const base = `https://app.gohighlevel.com/v2/location/${locationId}/settings`;
  const url = section ? `${base}/${section}` : base;
  await page.goto(url, { waitUntil: "networkidle" });
}

/**
 * Navigate to a specific GHL section.
 */
export async function navigateTo(page: Page, locationId: string, path: string): Promise<void> {
  const url = `https://app.gohighlevel.com/v2/location/${locationId}/${path}`;
  await page.goto(url, { waitUntil: "networkidle" });
}

/**
 * Take a timestamped screenshot and save to monitoring/.
 */
export async function screenshot(page: Page, name: string): Promise<string> {
  const monitoringDir = resolve(__dirname, "..", "..", "monitoring");
  if (!existsSync(monitoringDir)) {
    mkdirSync(monitoringDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filepath = resolve(monitoringDir, `${name}-${timestamp}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`Screenshot saved: ${filepath}`);
  return filepath;
}

/**
 * Graceful cleanup.
 */
export async function cleanup(result: AuthResult): Promise<void> {
  await result.context.close();
  await result.browser.close();
}

// If run directly: test auth and take a dashboard screenshot
if (process.argv[1] && process.argv[1].includes("ghl-login")) {
  const headless = !process.argv.includes("--headed");
  const { browser, page } = await getAuthenticatedPage(headless);
  await screenshot(page, "dashboard");
  console.log("Auth test complete.");
  await browser.close();
}
