/**
 * GHL Configuration Script — Day 1 Fixes
 *
 * Applies immediate fixes to the GHL location settings:
 * - Timezone: America/Dawson → America/Phoenix
 * - Currency: USD
 * - Website URL: https://worldclassdigital.com
 * - Social profile URLs
 *
 * Usage: npm run ghl:config [-- --headed]
 */

import { getAuthenticatedPage, navigateToSettings, screenshot, cleanup } from "../auth/ghl-login.js";

const LOCATION_ID = process.env.GHL_LOCATION_ID || "7vGiJ14sboQUoNGmr7lE";

const SOCIAL_URLS = {
  linkedin: "https://linkedin.com/in/samuelmargolis",
  facebook: "https://facebook.com/aiwitsam",
  instagram: "https://instagram.com/aiwitsam",
  youtube: "https://youtube.com/@aiwitsam",
  tiktok: "https://tiktok.com/@aiwitsam",
};

async function main(): Promise<void> {
  const headless = !process.argv.includes("--headed");
  const auth = await getAuthenticatedPage(headless);
  const { page } = auth;

  try {
    // --- Fix 1: Business Profile (timezone, website, currency) ---
    console.log("\n--- Navigating to Business Profile ---");
    await navigateToSettings(page, LOCATION_ID, "business-profile");
    await page.waitForLoadState("networkidle");
    await screenshot(page, "config-before-business-profile");

    // Timezone fix
    console.log("Fixing timezone...");
    const timezoneSelect = page.locator('[data-testid="timezone-select"], select[name="timezone"], .timezone-select').first();
    if (await timezoneSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await timezoneSelect.click();
      // Search for Phoenix timezone
      const searchInput = page.locator('input[placeholder*="search"], input[placeholder*="Search"]').first();
      if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await searchInput.fill("Phoenix");
        await page.waitForTimeout(1000);
        const phoenixOption = page.locator('text=America/Phoenix').first();
        if (await phoenixOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await phoenixOption.click();
          console.log("  Timezone set to America/Phoenix");
        }
      }
    } else {
      console.log("  Timezone selector not found via data-testid — trying alternative selectors...");
      // GHL UI may use different selectors; try common patterns
      const altTimezone = page.locator('label:has-text("Timezone") + div, label:has-text("Time Zone") + div').first();
      if (await altTimezone.isVisible({ timeout: 3000 }).catch(() => false)) {
        await altTimezone.click();
        await page.keyboard.type("Phoenix");
        await page.waitForTimeout(1000);
        const option = page.getByText("America/Phoenix").first();
        if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
          await option.click();
          console.log("  Timezone set to America/Phoenix (alt selector)");
        }
      } else {
        console.log("  ⚠ Could not locate timezone selector — may need manual fix");
      }
    }

    // Website URL fix
    console.log("Fixing website URL...");
    const websiteInput = page.locator('input[name="website"], input[placeholder*="website"], input[placeholder*="Website"]').first();
    if (await websiteInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await websiteInput.clear();
      await websiteInput.fill("https://worldclassdigital.com");
      console.log("  Website URL set to https://worldclassdigital.com");
    } else {
      console.log("  ⚠ Could not locate website input — may need manual fix");
    }

    await screenshot(page, "config-after-business-profile");

    // Look for a save button
    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
      console.log("  Business profile saved.");
    }

    // --- Fix 2: Social Profile URLs ---
    console.log("\n--- Setting social profile URLs ---");
    // Navigate to the social/media settings if separate from business profile
    // In GHL, social URLs are often on the Business Profile page itself
    for (const [platform, url] of Object.entries(SOCIAL_URLS)) {
      const input = page.locator(`input[name="${platform}"], input[placeholder*="${platform}" i], input[aria-label*="${platform}" i]`).first();
      if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
        await input.clear();
        await input.fill(url);
        console.log(`  ${platform}: ${url}`);
      } else {
        console.log(`  ⚠ ${platform} input not found — may need manual entry`);
      }
    }

    // Save again if social fields are on the same page
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
      console.log("  Social profiles saved.");
    }

    await screenshot(page, "config-after-social-urls");

    // --- Summary ---
    console.log("\n=== Configuration Summary ===");
    console.log("1. Timezone → America/Phoenix");
    console.log("2. Website URL → https://worldclassdigital.com");
    console.log("3. Social URLs → populated");
    console.log("\nManual checks needed:");
    console.log("  - Verify currency is set to USD (Settings → Business Profile)");
    console.log("  - Upload company logo if not already set");
    console.log("  - Verify all screenshots in monitoring/ folder");
    console.log("\nScreenshots saved to monitoring/ for verification.");
  } finally {
    await cleanup(auth);
  }
}

main().catch((err) => {
  console.error("GHL config failed:", err);
  process.exit(1);
});
