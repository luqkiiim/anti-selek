import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
import { e2eBaseURL, e2eEnv } from "./e2e/env";

// Run after npm run build: startup timings must use the shipped client bundles.
export default defineConfig({
  ...base,
  testMatch: "club-loading.spec.ts",
  use: { ...base.use, video: "off", trace: "off" },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3005",
    url: `${e2eBaseURL}/signin`,
    reuseExistingServer: false,
    env: e2eEnv,
  },
});
