import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end test of the core slice on an iPhone-sized viewport.
 * Needs a disposable database (it is wiped): E2E_DATABASE_URL=postgres://…/tchelet_test
 */
const PORT = 3100;
const dbUrl = process.env.E2E_DATABASE_URL ?? "";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["iPhone 14"],
    browserName: "chromium",
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
  },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: dbUrl,
      SESSION_SECRET: "e2e-only-secret-e2e-only-secret-e2e-only-secret",
      AGENCY_NAME: "תכלת תיירות",
      ANTHROPIC_API_KEY: "",
    },
  },
});
