import { chromium } from "@playwright/test";

const DEFAULT_BASE_URL = "https://antiselek.com";

function normalizeBaseUrl(value) {
  const url = new URL(value || DEFAULT_BASE_URL);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

const baseURL = normalizeBaseUrl(process.env.PRODUCTION_BASE_URL);
const smokeEmail = process.env.PRODUCTION_SMOKE_EMAIL ?? "";
const smokePassword = process.env.PRODUCTION_SMOKE_PASSWORD ?? "";
const smokeCommunityId = process.env.PRODUCTION_SMOKE_COMMUNITY_ID ?? "";
const smokeSessionCode = process.env.PRODUCTION_SMOKE_SESSION_CODE ?? "";
const allowMutation = process.env.PRODUCTION_SMOKE_MUTATE === "1";

function log(message) {
  console.log(`[production-smoke] ${message}`);
}

async function assertFetchOk(pathname, label) {
  const url = new URL(pathname, baseURL);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${response.statusText}`);
  }

  log(`${label}: ${response.status}`);
}

async function smokePublicSurface(context, label) {
  const page = await context.newPage();

  await page.goto("/signin", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  await page.getByLabel("Email", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Quick access" }).waitFor();
  log(`${label} sign-in page rendered`);

  await page.goto("/", { waitUntil: "networkidle" });
  await page
    .getByText(/Anti-Selek|Welcome back|Dashboard/i)
    .first()
    .waitFor({ timeout: 20_000 });
  log(`${label} root route rendered or redirected cleanly`);

  await page.close();
}

async function signIn(page) {
  await page.goto("/signin", { waitUntil: "networkidle" });
  await page.getByLabel("Email", { exact: true }).fill(smokeEmail);
  await page.getByLabel("Password", { exact: true }).fill(smokePassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/signin"), {
    timeout: 25_000,
  });
  await page
    .getByRole("button", { name: "Logout" })
    .filter({ visible: true })
    .first()
    .waitFor({ timeout: 25_000 });
}

async function smokeSignedInSurface(context) {
  if (!smokeEmail || !smokePassword) {
    log("signed-in smoke skipped; set PRODUCTION_SMOKE_EMAIL and PRODUCTION_SMOKE_PASSWORD");
    return;
  }

  const page = await context.newPage();
  await signIn(page);
  log("signed-in dashboard loaded");

  if (smokeCommunityId) {
    await page.goto(`/community/${smokeCommunityId}`, { waitUntil: "networkidle" });
    await page.getByText("Community hub").first().waitFor({ timeout: 25_000 });
    log("community hub loaded");

    const hostSetupButton = page
      .getByRole("button", { name: "Open Host Setup" })
      .filter({ visible: true })
      .first();
    if ((await hostSetupButton.count()) > 0) {
      await hostSetupButton.click();
      await page.getByText("New tournament").first().waitFor({ timeout: 10_000 });
      log("host setup opened");
    } else {
      log("host setup skipped; smoke user is not an admin for the community");
    }
  }

  if (smokeSessionCode) {
    await page.goto(`/session/${smokeSessionCode}`, { waitUntil: "networkidle" });
    await page.getByText("Court board").first().waitFor({ timeout: 25_000 });
    log("live session loaded");

    const standingsTab = page
      .getByRole("button", { name: "Standings" })
      .filter({ visible: true })
      .first();
    if ((await standingsTab.count()) > 0) {
      await standingsTab.click();
    }
    await page.getByText("Standings").first().waitFor({ timeout: 10_000 });
    log("standings visible");

    if (allowMutation) {
      const scoreInputs = page.locator('input[type="number"]');
      if ((await scoreInputs.count()) < 2) {
        throw new Error("PRODUCTION_SMOKE_MUTATE=1 set, but score inputs are unavailable");
      }

      await scoreInputs.nth(0).fill("21");
      await scoreInputs.nth(1).fill("15");
      await page.getByRole("button", { name: "Submit Score" }).click();
      await page.getByRole("button", { name: "Confirm" }).click();
      log("score submitted");

      const approveButton = page
        .getByRole("button", { name: "Confirm Results" })
        .filter({ visible: true })
        .first();
      if ((await approveButton.count()) > 0) {
        await approveButton.click();
        log("pending score approved");
      }
    } else {
      log("score submission skipped; set PRODUCTION_SMOKE_MUTATE=1 only for a disposable production session");
    }
  }

  await page.close();
}

async function main() {
  log(`base URL: ${baseURL}`);

  await assertFetchOk("/", "home");
  await assertFetchOk("/signin", "sign in");
  await assertFetchOk("/api/auth/providers", "auth providers");
  await assertFetchOk("/manifest.webmanifest", "web manifest");

  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await browser.newContext({
      baseURL,
      viewport: { width: 1440, height: 1000 },
    });
    const mobile = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });

    await smokePublicSurface(desktop, "desktop");
    await smokePublicSurface(mobile, "mobile");
    await smokeSignedInSurface(desktop);

    await desktop.close();
    await mobile.close();
  } finally {
    await browser.close();
  }

  log("complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
