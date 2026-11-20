import { defineConfig } from "@playwright/test";

// Browser verification must never inherit the Neon application database from .env.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("Set TEST_DATABASE_URL to a disposable local raterready_test* PostgreSQL database.");
const url = new URL(testDatabaseUrl);
if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "localhost"].includes(url.hostname)
  || !/^\/raterready_test[a-zA-Z0-9_]*$/.test(url.pathname) || url.searchParams.has("host")) {
  throw new Error("Browser tests require a local raterready_test* database without a host override.");
}

export default defineConfig({
  testDir: "./tests/browser",
  globalSetup: "./tests/browser/setup.ts",
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure", launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } },
  webServer: {
    command: "npm run dev -- --webpack --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 120000,
    env: { DATABASE_URL: testDatabaseUrl, DIRECT_URL: testDatabaseUrl,
      AUTH_SECRET: "DEMO - SYNTHETIC browser test secret only at least 32 characters",
      AUTH_URL: "http://127.0.0.1:3100", AUTH_TRUST_HOST: "true", ENABLE_LIVE_ZDR_GRADING: "false" },
  },
});
