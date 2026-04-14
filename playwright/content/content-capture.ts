/**
 * Content Capture — Screen Record Site Demos
 *
 * Records browser-based demos of websites (Dark Factory portfolio,
 * product pages, etc.) using Playwright's video recording.
 *
 * Usage: npm run content:capture -- --url https://example.com [--duration 30] [--name demo]
 *
 * Output: monitoring/<name>-<timestamp>.webm
 */

import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", "..", ".env") });

interface CaptureOptions {
  url: string;
  duration: number;  // seconds
  name: string;
  width: number;
  height: number;
  scroll: boolean;   // auto-scroll the page during recording
}

function parseArgs(): CaptureOptions {
  const args = process.argv.slice(2);

  if (args.includes("-h") || args.includes("--help") || args.length === 0) {
    console.log(`
Content Capture — Screen record site demos

Usage:
  npm run content:capture -- --url <URL> [options]

Options:
  --url <URL>        URL to record (required)
  --duration <sec>   Recording duration in seconds (default: 30)
  --name <name>      Output filename prefix (default: "capture")
  --width <px>       Viewport width (default: 1920)
  --height <px>      Viewport height (default: 1080)
  --scroll           Auto-scroll during recording (default: false)
  -h, --help         Show this help
`);
    process.exit(0);
  }

  const getArg = (flag: string, fallback: string): string => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : fallback;
  };

  const url = getArg("--url", "");
  if (!url) {
    console.error("Error: --url is required");
    process.exit(1);
  }

  return {
    url,
    duration: parseInt(getArg("--duration", "30"), 10),
    name: getArg("--name", "capture"),
    width: parseInt(getArg("--width", "1920"), 10),
    height: parseInt(getArg("--height", "1080"), 10),
    scroll: args.includes("--scroll"),
  };
}

async function autoScroll(page: import("playwright").Page, durationMs: number): Promise<void> {
  const scrollStep = 300;
  const interval = 100;
  const steps = Math.floor(durationMs / interval);

  for (let i = 0; i < steps; i++) {
    await page.evaluate((step) => window.scrollBy(0, step), scrollStep);
    await page.waitForTimeout(interval);

    // If we've hit the bottom, scroll back to top and continue
    const atBottom = await page.evaluate(
      () => window.innerHeight + window.scrollY >= document.body.scrollHeight - 10
    );
    if (atBottom) {
      await page.waitForTimeout(1000);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
    }
  }
}

async function main(): Promise<void> {
  const opts = parseArgs();
  const outputDir = resolve(__dirname, "..", "..", "monitoring");

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Recording: ${opts.url}`);
  console.log(`Duration: ${opts.duration}s`);
  console.log(`Viewport: ${opts.width}x${opts.height}`);

  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    recordVideo: {
      dir: outputDir,
      size: { width: opts.width, height: opts.height },
    },
  });

  const page = await context.newPage();

  try {
    await page.goto(opts.url, { waitUntil: "networkidle" });
    console.log("Page loaded. Recording...");

    if (opts.scroll) {
      await autoScroll(page, opts.duration * 1000);
    } else {
      await page.waitForTimeout(opts.duration * 1000);
    }

    console.log("Recording complete.");
  } finally {
    await page.close();

    // Playwright saves the video on page close — get the path
    const videoPath = await page.video()?.path();
    if (videoPath) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const finalName = `${opts.name}-${timestamp}.webm`;
      const finalPath = resolve(outputDir, finalName);

      // Rename from Playwright's auto-generated name
      const { renameSync } = await import("node:fs");
      try {
        renameSync(videoPath, finalPath);
        console.log(`Video saved: ${finalPath}`);
      } catch {
        console.log(`Video saved: ${videoPath}`);
      }
    }

    await context.close();
    await browser.close();
  }

  console.log("\nNext steps:");
  console.log(`  1. Trim:      ./ffmpeg/clip.sh monitoring/${opts.name}-*.webm clip.mp4 00:00:05 00:00:25`);
  console.log(`  2. Formats:   ./ffmpeg/batch.sh clip.mp4 output/`);
  console.log(`  3. Thumbnail: ./ffmpeg/thumbnail.sh clip.mp4 thumb.png --text "Demo Title"`);
  console.log(`  4. Post:      npm run ghl:social-post -- --text "Check this out" --media output/youtube-16x9.mp4`);
}

main().catch((err) => {
  console.error("Content capture failed:", err);
  process.exit(1);
});
