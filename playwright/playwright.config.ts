import { defineConfig } from "playwright/test";

export default defineConfig({
  timeout: 60_000,
  use: {
    headless: true,
    viewport: { width: 1920, height: 1080 },
    screenshot: "on",
    video: "retain-on-failure",
    baseURL: "https://app.gohighlevel.com",
  },
  outputDir: "../monitoring",
});
