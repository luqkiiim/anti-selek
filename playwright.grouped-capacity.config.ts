import { defineConfig, devices } from "@playwright/test";
import { e2eBaseURL, e2eEnv } from "./e2e/env";

if (process.env.E2E_DATABASE_FILE !== "prisma/grouped-capacity-e2e.db" || e2eBaseURL !== "http://127.0.0.1:3005") {
  throw new Error("Run with E2E_DATABASE_FILE=prisma/grouped-capacity-e2e.db against the local server on port 3005.");
}

export default defineConfig({
  tsconfig: "./e2e/tsconfig.json",
  testDir: "./e2e",
  testMatch: "grouped-capacity.spec.ts",
  outputDir: "test-results/grouped-capacity",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  globalSetup: "./e2e/global.setup.ts",
  reporter: "list",
  use: { baseURL: e2eBaseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `${process.platform === "win32" ? "npm.cmd" : "npm"} run dev -- --hostname 127.0.0.1 --port 3005`,
    url: `${e2eBaseURL}/signin`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: e2eEnv,
  },
});
