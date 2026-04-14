/**
 * GHL Social Connect — Link @aiwitsam accounts to Social Planner
 *
 * Navigates to GHL Social Planner integration settings and guides
 * through connecting social accounts. Most social OAuth flows require
 * interactive login (headed mode), so this script runs headed by default.
 *
 * Usage: npm run ghl:social-connect [-- --headless]
 *
 * Supported platforms: LinkedIn, Facebook, Instagram, YouTube, TikTok
 */

import { getAuthenticatedPage, navigateTo, screenshot, cleanup } from "../auth/ghl-login.js";

const LOCATION_ID = process.env.GHL_LOCATION_ID || "7vGiJ14sboQUoNGmr7lE";

const PLATFORMS = [
  { name: "Facebook", icon: "facebook" },
  { name: "Instagram", icon: "instagram" },
  { name: "LinkedIn", icon: "linkedin" },
  { name: "YouTube", icon: "youtube" },
  { name: "TikTok", icon: "tiktok" },
  { name: "Google Business Profile", icon: "google" },
];

async function main(): Promise<void> {
  // Default to headed mode since social OAuth requires interactive login
  const headless = process.argv.includes("--headless");
  const auth = await getAuthenticatedPage(headless);
  const { page } = auth;

  try {
    console.log("\n--- Navigating to Social Planner Settings ---");
    await navigateTo(page, LOCATION_ID, "marketing/social-planner");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await screenshot(page, "social-connect-before");

    // Check for connected accounts
    console.log("\nChecking connected accounts...");
    for (const platform of PLATFORMS) {
      const connected = page.locator(
        `text="${platform.name}", [data-testid*="${platform.icon}"], img[alt*="${platform.icon}" i]`
      ).first();

      const isConnected = await connected.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`  ${platform.name}: ${isConnected ? "connected" : "not connected"}`);
    }

    // Look for "Connect Account" or "Add Account" button
    const connectBtn = page.locator(
      'button:has-text("Connect"), button:has-text("Add Account"), button:has-text("Link Account"), a:has-text("Connect")'
    ).first();

    if (await connectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("\nConnect Account button found.");
      if (!headless) {
        console.log("Running in headed mode — you can interact with the browser to complete OAuth flows.");
        console.log("Click 'Connect' for each platform and complete the login in the browser window.");
        console.log("\nWaiting 120 seconds for manual connections...");
        console.log("(Press Ctrl+C to exit early when done)\n");

        // Wait for user to complete manual connections
        await page.waitForTimeout(120_000);
      } else {
        console.log("Running headless — cannot complete OAuth flows.");
        console.log("Run with --headed (default) to connect accounts interactively.");
      }
    } else {
      console.log("\nNo Connect button found. Accounts may already be connected,");
      console.log("or navigation to Social Planner settings may require different path.");
      console.log("\nManual steps:");
      console.log("  1. Go to Marketing → Social Planner");
      console.log("  2. Click Settings/Account icon");
      console.log("  3. Connect each platform (@aiwitsam accounts)");
    }

    await screenshot(page, "social-connect-after");

    console.log("\n=== Social Connect Summary ===");
    console.log("Platforms to connect for @aiwitsam:");
    PLATFORMS.forEach((p) => console.log(`  - ${p.name}`));
    console.log("\nScreenshots saved to monitoring/");
  } finally {
    await cleanup(auth);
  }
}

main().catch((err) => {
  console.error("Social connect failed:", err);
  process.exit(1);
});
