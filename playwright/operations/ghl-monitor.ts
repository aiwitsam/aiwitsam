/**
 * GHL Monitor — Dashboard Screenshots + Status
 *
 * Captures screenshots of key GHL pages for monitoring:
 * - Dashboard overview
 * - Pipeline / Opportunities
 * - Conversations inbox
 * - Calendar
 * - Social planner
 *
 * Usage: npm run ghl:monitor [-- --headed] [-- --pages dashboard,pipeline,inbox]
 */

import { getAuthenticatedPage, navigateTo, screenshot, cleanup } from "../auth/ghl-login.js";

const LOCATION_ID = process.env.GHL_LOCATION_ID || "7vGiJ14sboQUoNGmr7lE";

interface MonitorPage {
  name: string;
  path: string;
  waitSelector?: string;
}

const MONITOR_PAGES: MonitorPage[] = [
  { name: "dashboard", path: "dashboard" },
  { name: "pipeline", path: "opportunities" },
  { name: "inbox", path: "conversations" },
  { name: "calendar", path: "calendars" },
  { name: "social", path: "marketing/social-planner" },
  { name: "contacts", path: "contacts" },
  { name: "reputation", path: "reputation" },
];

function parseRequestedPages(args: string[]): string[] {
  const pagesIdx = args.indexOf("--pages");
  if (pagesIdx === -1 || pagesIdx + 1 >= args.length) {
    return MONITOR_PAGES.map((p) => p.name);
  }
  return args[pagesIdx + 1].split(",").map((p) => p.trim().toLowerCase());
}

async function main(): Promise<void> {
  const headless = !process.argv.includes("--headed");
  const requestedPages = parseRequestedPages(process.argv);
  const pagesToCapture = MONITOR_PAGES.filter((p) => requestedPages.includes(p.name));

  if (pagesToCapture.length === 0) {
    console.error("No valid pages specified. Available:", MONITOR_PAGES.map((p) => p.name).join(", "));
    process.exit(1);
  }

  console.log(`Monitoring ${pagesToCapture.length} pages: ${pagesToCapture.map((p) => p.name).join(", ")}`);

  const auth = await getAuthenticatedPage(headless);
  const { page } = auth;
  const results: { name: string; path: string; status: string }[] = [];

  try {
    for (const monitorPage of pagesToCapture) {
      console.log(`\nCapturing: ${monitorPage.name}...`);
      try {
        await navigateTo(page, LOCATION_ID, monitorPage.path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000);

        if (monitorPage.waitSelector) {
          await page.waitForSelector(monitorPage.waitSelector, { timeout: 10_000 }).catch(() => {});
        }

        const filepath = await screenshot(page, `monitor-${monitorPage.name}`);
        results.push({ name: monitorPage.name, path: filepath, status: "captured" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  Failed to capture ${monitorPage.name}: ${msg}`);
        results.push({ name: monitorPage.name, path: "", status: `error: ${msg}` });
      }
    }

    // Summary
    console.log("\n=== Monitor Summary ===");
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Pages captured: ${results.filter((r) => r.status === "captured").length}/${results.length}`);
    console.log("");
    for (const r of results) {
      const icon = r.status === "captured" ? "[OK]" : "[!!]";
      console.log(`  ${icon} ${r.name}: ${r.status}`);
    }
    console.log("\nScreenshots saved to monitoring/");
  } finally {
    await cleanup(auth);
  }
}

main().catch((err) => {
  console.error("Monitor failed:", err);
  process.exit(1);
});
