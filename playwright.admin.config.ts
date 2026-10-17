import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// These tests intercept application APIs and exercise the real client lifecycle.
// No database setup or seed is needed.
const baseURL = "http://127.0.0.1:3005";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "admin-save-recovery.spec.ts",
  tsconfig: "./e2e/tsconfig.json",
  outputDir: "./test-results-admin",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `${process.platform === "win32" ? "npm.cmd" : "npm"} run dev -- --hostname 127.0.0.1 --port 3005`,
    url: `${baseURL}/signin`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      USE_TURSO: "false",
      TURSO_DATABASE_URL: "",
      TURSO_AUTH_TOKEN: "",
      DATABASE_URL: `file:${path.resolve("test-results-admin/unused.db").replace(/\\/g, "/")}`,
      AUTH_SECRET: "isolated-admin-browser-tests-secret",
      AUTH_URL: baseURL,
      NEXTAUTH_URL: baseURL,
      E2E_DISABLE_RATE_LIMITS: "true",
    },
  },
});
