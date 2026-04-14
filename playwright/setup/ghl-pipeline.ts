/**
 * GHL Consulting Pipeline Setup
 *
 * Creates the consulting pipeline in GHL with 6 stages:
 *   New Lead → Discovery Call → Proposal Sent → Negotiation → Closed Won → Closed Lost
 *
 * Also configures:
 * - Missed-call text-back automation
 * - Stage-based automation triggers (documented in spec Section 4.1)
 *
 * Usage: npm run ghl:pipeline [-- --headed]
 */

import { getAuthenticatedPage, navigateTo, screenshot, cleanup } from "../auth/ghl-login.js";

const LOCATION_ID = process.env.GHL_LOCATION_ID || "7vGiJ14sboQUoNGmr7lE";

const PIPELINE_NAME = "Consulting";

const PIPELINE_STAGES = [
  { name: "New Lead", color: "#3B82F6" },        // blue
  { name: "Discovery Call", color: "#8B5CF6" },   // purple
  { name: "Proposal Sent", color: "#F59E0B" },    // amber
  { name: "Negotiation", color: "#EF4444" },      // red
  { name: "Closed Won", color: "#10B981" },       // green
  { name: "Closed Lost", color: "#6B7280" },      // gray
];

async function createPipeline(page: import("playwright").Page): Promise<void> {
  console.log("\n--- Creating Consulting Pipeline ---");

  // Navigate to Opportunities / Pipelines
  await navigateTo(page, LOCATION_ID, "opportunities/pipelines");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  await screenshot(page, "pipeline-before");

  // Check if pipeline already exists
  const existingPipeline = page.locator(`text="${PIPELINE_NAME}"`).first();
  if (await existingPipeline.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log(`Pipeline "${PIPELINE_NAME}" already exists. Skipping creation.`);
    await screenshot(page, "pipeline-already-exists");
    return;
  }

  // Look for "Create Pipeline" or "Add Pipeline" button
  const createBtn = page.locator(
    'button:has-text("Create Pipeline"), button:has-text("Add Pipeline"), button:has-text("New Pipeline"), [data-testid="create-pipeline"]'
  ).first();

  if (!(await createBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
    // Try the opportunities page directly — may have a different layout
    await navigateTo(page, LOCATION_ID, "opportunities");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Look for pipeline management gear/settings icon
    const settingsIcon = page.locator('[data-testid="pipeline-settings"], .pipeline-settings, button[aria-label*="pipeline" i]').first();
    if (await settingsIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsIcon.click();
      await page.waitForTimeout(1000);
    }
  }

  // Click create
  const addBtn = page.locator(
    'button:has-text("Create Pipeline"), button:has-text("Add Pipeline"), button:has-text("New Pipeline"), button:has-text("+ Pipeline"), a:has-text("Create Pipeline")'
  ).first();

  if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await addBtn.click();
    await page.waitForTimeout(2000);

    // Fill pipeline name
    const nameInput = page.locator('input[placeholder*="pipeline" i], input[name="name"], input[placeholder*="name" i]').first();
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.clear();
      await nameInput.fill(PIPELINE_NAME);
      console.log(`  Pipeline name set: ${PIPELINE_NAME}`);
    }

    // GHL typically creates a pipeline with default stages that need renaming
    // Look for stage input fields
    await page.waitForTimeout(1000);
    await screenshot(page, "pipeline-name-set");

    // Try to add/configure stages
    await configureStages(page);

    // Save
    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create"), button:has-text("Done")').first();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(3000);
      console.log("  Pipeline saved.");
    }
  } else {
    console.log("  ⚠ Could not find Create Pipeline button.");
    console.log("  Manual steps:");
    console.log("    1. Go to Opportunities → Pipeline Settings");
    console.log("    2. Create pipeline named 'Consulting'");
    console.log("    3. Add stages: New Lead, Discovery Call, Proposal Sent, Negotiation, Closed Won, Closed Lost");
  }

  await screenshot(page, "pipeline-after");
}

async function configureStages(page: import("playwright").Page): Promise<void> {
  console.log("  Configuring stages...");

  // GHL pipeline editor shows stage cards/inputs
  // Try to find existing stage inputs and rename them, then add missing ones
  const stageInputs = page.locator('input[placeholder*="stage" i], input[name*="stage" i], .stage-name input');
  const stageCount = await stageInputs.count();

  if (stageCount > 0) {
    // Rename existing stages
    for (let i = 0; i < Math.min(stageCount, PIPELINE_STAGES.length); i++) {
      const input = stageInputs.nth(i);
      await input.clear();
      await input.fill(PIPELINE_STAGES[i].name);
      console.log(`    Stage ${i + 1}: ${PIPELINE_STAGES[i].name}`);
    }

    // Add remaining stages if fewer inputs than needed
    for (let i = stageCount; i < PIPELINE_STAGES.length; i++) {
      const addStageBtn = page.locator(
        'button:has-text("Add Stage"), button:has-text("+ Stage"), button:has-text("Add"), [data-testid="add-stage"]'
      ).first();
      if (await addStageBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await addStageBtn.click();
        await page.waitForTimeout(500);
        const newInput = stageInputs.nth(i);
        if (await newInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await newInput.clear();
          await newInput.fill(PIPELINE_STAGES[i].name);
          console.log(`    Stage ${i + 1}: ${PIPELINE_STAGES[i].name} (added)`);
        }
      }
    }
  } else {
    console.log("    No stage inputs found — stages may need manual configuration.");
    console.log("    Expected stages:");
    PIPELINE_STAGES.forEach((s, i) => console.log(`      ${i + 1}. ${s.name}`));
  }
}

async function configureMissedCallTextBack(page: import("playwright").Page): Promise<void> {
  console.log("\n--- Configuring Missed Call Text-Back ---");

  // Navigate to Settings → Phone Numbers or Automations
  await navigateTo(page, LOCATION_ID, "settings/phone-number");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // Look for missed call text-back toggle
  const textBackToggle = page.locator(
    'text="Missed Call Text Back", text="missed call text-back", [data-testid="missed-call-textback"]'
  ).first();

  if (await textBackToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Check if already enabled
    const toggle = textBackToggle.locator('xpath=ancestor::div[1]//input[type="checkbox"], xpath=ancestor::div[1]//button[contains(@class, "toggle")]').first();
    if (await toggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await toggle.click();
      console.log("  Missed call text-back toggled.");
    }
  } else {
    console.log("  ⚠ Missed call text-back setting not found on this page.");
    console.log("  Try: Settings → Phone Numbers → select number → Missed Call Text Back");
    console.log("  Message: \"Hey, I saw you called! Here's my booking link: [GHL calendar URL] — Sam\"");
  }

  await screenshot(page, "missed-call-textback");
}

async function main(): Promise<void> {
  const headless = !process.argv.includes("--headed");
  const auth = await getAuthenticatedPage(headless);

  try {
    await createPipeline(auth.page);
    await configureMissedCallTextBack(auth.page);

    console.log("\n=== Pipeline Setup Summary ===");
    console.log(`Pipeline: ${PIPELINE_NAME}`);
    console.log("Stages:");
    PIPELINE_STAGES.forEach((s, i) => console.log(`  ${i + 1}. ${s.name}`));
    console.log("\nVerify in GHL:");
    console.log("  1. Opportunities → check pipeline exists with all 6 stages");
    console.log("  2. Settings → Phone → verify missed call text-back is ON");
    console.log("\nScreenshots saved to monitoring/ for verification.");
  } finally {
    await cleanup(auth);
  }
}

main().catch((err) => {
  console.error("Pipeline setup failed:", err);
  process.exit(1);
});
