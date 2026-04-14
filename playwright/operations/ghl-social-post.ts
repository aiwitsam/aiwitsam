/**
 * GHL Social Post — Post content via Social Planner
 *
 * Posts content to connected social platforms through GHL's Social Planner.
 * Supports text, media attachments, platform selection, and scheduling.
 *
 * Usage:
 *   npm run ghl:social-post -- --text "Post content" [options]
 *
 * Options:
 *   --text <text>        Post text (required)
 *   --media <path>       Media file to attach (image or video)
 *   --platforms <list>   Comma-separated: facebook,instagram,linkedin,youtube,tiktok (default: all)
 *   --schedule <date>    ISO date string for scheduled post (default: post now)
 *   --draft              Save as draft instead of posting
 *   --headed             Run browser visibly
 */

import { getAuthenticatedPage, navigateTo, screenshot, cleanup } from "../auth/ghl-login.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const LOCATION_ID = process.env.GHL_LOCATION_ID || "7vGiJ14sboQUoNGmr7lE";

interface PostOptions {
  text: string;
  mediaPath?: string;
  platforms: string[];
  schedule?: string;
  draft: boolean;
  headed: boolean;
}

function parseArgs(): PostOptions {
  const args = process.argv.slice(2);

  if (args.includes("-h") || args.includes("--help") || args.length === 0) {
    console.log(`
GHL Social Post — Post content via Social Planner

Usage:
  npm run ghl:social-post -- --text "Post content" [options]

Options:
  --text <text>        Post text (required)
  --media <path>       Media file to attach
  --platforms <list>   Comma-separated platforms (default: all connected)
  --schedule <date>    ISO date for scheduled post (default: now)
  --draft              Save as draft
  --headed             Show browser window
  -h, --help           Show this help
`);
    process.exit(0);
  }

  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };

  const text = getArg("--text");
  if (!text) {
    console.error("Error: --text is required");
    process.exit(1);
  }

  const mediaPath = getArg("--media");
  if (mediaPath && !existsSync(mediaPath)) {
    console.error(`Error: media file not found: ${mediaPath}`);
    process.exit(1);
  }

  const platformsStr = getArg("--platforms");
  const platforms = platformsStr
    ? platformsStr.split(",").map((p) => p.trim().toLowerCase())
    : ["facebook", "instagram", "linkedin", "youtube", "tiktok"];

  return {
    text,
    mediaPath: mediaPath ? resolve(mediaPath) : undefined,
    platforms,
    schedule: getArg("--schedule"),
    draft: args.includes("--draft"),
    headed: args.includes("--headed"),
  };
}

async function main(): Promise<void> {
  const opts = parseArgs();
  const auth = await getAuthenticatedPage(!opts.headed);
  const { page } = auth;

  try {
    console.log("\n--- Navigating to Social Planner ---");
    await navigateTo(page, LOCATION_ID, "marketing/social-planner");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Click "New Post" or "Create Post" button
    const newPostBtn = page.locator(
      'button:has-text("New Post"), button:has-text("Create Post"), button:has-text("Create"), [data-testid="create-post"]'
    ).first();

    if (!(await newPostBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.error("Could not find 'Create Post' button in Social Planner.");
      console.error("Ensure social accounts are connected first: npm run ghl:social-connect");
      await screenshot(page, "social-post-no-create-btn");
      process.exit(1);
    }

    await newPostBtn.click();
    await page.waitForTimeout(2000);

    // Select platforms
    console.log(`Selecting platforms: ${opts.platforms.join(", ")}`);
    for (const platform of opts.platforms) {
      const platformCheckbox = page.locator(
        `[data-testid*="${platform}"], label:has-text("${platform}") input, text="${platform}"`
      ).first();
      if (await platformCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
        const isChecked = await platformCheckbox.isChecked().catch(() => false);
        if (!isChecked) {
          await platformCheckbox.click();
        }
        console.log(`  [x] ${platform}`);
      } else {
        console.log(`  [ ] ${platform} — not found (may not be connected)`);
      }
    }

    // Enter post text
    console.log("Entering post text...");
    const textArea = page.locator(
      'textarea, [contenteditable="true"], div[role="textbox"], .post-content textarea'
    ).first();
    if (await textArea.isVisible({ timeout: 5000 }).catch(() => false)) {
      await textArea.click();
      await textArea.fill(opts.text);
      console.log(`  Text entered (${opts.text.length} chars)`);
    } else {
      console.error("Could not find post text input");
      await screenshot(page, "social-post-no-textarea");
      process.exit(1);
    }

    // Attach media if provided
    if (opts.mediaPath) {
      console.log(`Attaching media: ${opts.mediaPath}`);
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles(opts.mediaPath);
        await page.waitForTimeout(3000); // Wait for upload
        console.log("  Media attached.");
      } else {
        // Try clicking an upload button to reveal the file input
        const uploadBtn = page.locator(
          'button:has-text("Upload"), button[aria-label*="media" i], button[aria-label*="image" i], .media-upload'
        ).first();
        if (await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await uploadBtn.click();
          await page.waitForTimeout(1000);
          const revealedInput = page.locator('input[type="file"]').first();
          if (await revealedInput.count() > 0) {
            await revealedInput.setInputFiles(opts.mediaPath);
            await page.waitForTimeout(3000);
            console.log("  Media attached.");
          }
        } else {
          console.log("  ⚠ Could not find media upload — skipping attachment");
        }
      }
    }

    // Schedule if requested
    if (opts.schedule) {
      console.log(`Scheduling for: ${opts.schedule}`);
      const scheduleBtn = page.locator(
        'button:has-text("Schedule"), button:has-text("Later"), [data-testid="schedule"]'
      ).first();
      if (await scheduleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await scheduleBtn.click();
        await page.waitForTimeout(1000);
        // Fill in schedule date — GHL UI varies
        const dateInput = page.locator('input[type="datetime-local"], input[placeholder*="date" i]').first();
        if (await dateInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await dateInput.fill(opts.schedule);
        }
      }
    }

    await screenshot(page, "social-post-ready");

    // Post or save draft
    if (opts.draft) {
      console.log("Saving as draft...");
      const draftBtn = page.locator('button:has-text("Draft"), button:has-text("Save Draft")').first();
      if (await draftBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await draftBtn.click();
        await page.waitForTimeout(2000);
        console.log("Draft saved.");
      } else {
        console.log("⚠ Draft button not found — post NOT published.");
      }
    } else {
      const publishLabel = opts.schedule ? "Schedule" : "Post";
      console.log(`${publishLabel}ing...`);
      const postBtn = page.locator(
        `button:has-text("${publishLabel}"), button:has-text("Publish"), button:has-text("Post Now"), button[type="submit"]`
      ).first();
      if (await postBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await postBtn.click();
        await page.waitForTimeout(3000);
        console.log(`${publishLabel}ed successfully.`);
      } else {
        console.log(`⚠ ${publishLabel} button not found — post NOT published.`);
      }
    }

    await screenshot(page, "social-post-after");

    console.log("\n=== Post Summary ===");
    console.log(`Text: ${opts.text.substring(0, 80)}${opts.text.length > 80 ? "..." : ""}`);
    console.log(`Platforms: ${opts.platforms.join(", ")}`);
    console.log(`Media: ${opts.mediaPath || "none"}`);
    console.log(`Mode: ${opts.draft ? "draft" : opts.schedule ? `scheduled (${opts.schedule})` : "posted now"}`);
    console.log("\nScreenshots saved to monitoring/");
  } finally {
    await cleanup(auth);
  }
}

main().catch((err) => {
  console.error("Social post failed:", err);
  process.exit(1);
});
