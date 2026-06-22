import { chromium } from "@playwright/test";

const DEFAULT_BASE_URL = "https://antiselek.com";
const DEFAULT_ALLOWED_HOSTS = ["antiselek.com", "www.antiselek.com"];

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
const smokeClubId =
  process.env.PRODUCTION_SMOKE_CLUB_ID ??
  process.env.PRODUCTION_SMOKE_COMMUNITY_ID ??
  "";
const smokeSessionCode = process.env.PRODUCTION_SMOKE_SESSION_CODE ?? "";
const allowMutation = process.env.PRODUCTION_SMOKE_MUTATE === "1";
const allowNonProductionTarget =
  process.env.ALLOW_NON_PROD_SMOKE_TARGET === "1";
const legacyDeprecationMessage =
  "Use club routes and club fields; community compatibility will be removed in a future phase.";

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

function getHeader(headers, name) {
  return headers[name.toLowerCase()] ?? headers[name] ?? "";
}

function isJsonObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function jsonValuesEqual(left, right) {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => jsonValuesEqual(item, right[index]))
    );
  }

  if (isJsonObject(left) || isJsonObject(right)) {
    if (!isJsonObject(left) || !isJsonObject(right)) {
      return false;
    }

    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] &&
          jsonValuesEqual(left[key], right[key])
      )
    );
  }

  return false;
}

function formatJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function assertJsonObject(value, label) {
  if (!isJsonObject(value)) {
    throw new Error(`${label} did not return a JSON object`);
  }
}

function assertJsonArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} did not return a JSON array`);
  }
}

function assertAliasPair(value, canonicalKey, legacyKey, label) {
  assertJsonObject(value, label);

  if (!Object.prototype.hasOwnProperty.call(value, canonicalKey)) {
    throw new Error(`${label} missing ${canonicalKey}`);
  }
  if (!Object.prototype.hasOwnProperty.call(value, legacyKey)) {
    throw new Error(`${label} missing ${legacyKey}`);
  }
  if (!jsonValuesEqual(value[canonicalKey], value[legacyKey])) {
    throw new Error(
      `${label} ${canonicalKey}/${legacyKey} mismatch; received ${formatJson(value[canonicalKey])} and ${formatJson(value[legacyKey])}`
    );
  }
}

function assertNoLegacyDeprecationHeaders(headers, label) {
  const deprecation = getHeader(headers, "Deprecation");
  if (deprecation) {
    throw new Error(
      `${label} unexpectedly returned Deprecation header "${deprecation}"`
    );
  }

  const link = getHeader(headers, "Link");
  if (link.includes('rel="successor-version"')) {
    throw new Error(
      `${label} unexpectedly returned legacy successor Link header "${link}"`
    );
  }

  const guidance = getHeader(headers, "X-Anti-Selek-Deprecated");
  if (guidance) {
    throw new Error(
      `${label} unexpectedly returned legacy guidance header "${guidance}"`
    );
  }
}

function assertLegacyDeprecationHeaders(headers, { label, successorPath }) {
  const deprecation = getHeader(headers, "Deprecation");
  if (deprecation !== "true") {
    throw new Error(
      `${label} missing Deprecation header; expected "true", received "${deprecation}"`
    );
  }

  const link = getHeader(headers, "Link");
  const expectedLink = `<${successorPath}>; rel="successor-version"`;
  if (!link.includes(expectedLink)) {
    throw new Error(
      `${label} missing successor Link header; expected to include "${expectedLink}", received "${link}"`
    );
  }

  const guidance = getHeader(headers, "X-Anti-Selek-Deprecated");
  if (!guidance.includes(legacyDeprecationMessage)) {
    throw new Error(
      `${label} missing legacy guidance header; received "${guidance}"`
    );
  }
}

async function fetchJson(context, pathname, label) {
  const response = await context.request.get(pathname);
  if (!response.ok()) {
    throw new Error(
      `${label} failed: ${response.status()} ${response.statusText()}`
    );
  }

  return {
    body: await response.json(),
    response,
  };
}

function assertClubDetailAliases(body, label) {
  assertJsonObject(body, label);
  assertAliasPair(body, "club", "community", label);
  assertAliasPair(body.club, "clubId", "communityId", `${label} club`);
  assertAliasPair(body.club, "clubName", "communityName", `${label} club`);
  assertAliasPair(body.community, "clubId", "communityId", `${label} community`);
  assertAliasPair(body.community, "clubName", "communityName", `${label} community`);
  assertAliasPair(body, "clubMembers", "communityMembers", label);
  assertAliasPair(body, "clubPulse", "communityPulse", label);
}

function assertClubCollectionAliases(body, label) {
  assertJsonArray(body, label);
  if (body.length === 0) {
    log(`${label} alias check skipped; no clubs returned`);
    return;
  }

  for (const [index, club] of body.entries()) {
    assertAliasPair(club, "clubId", "communityId", `${label} row ${index + 1}`);
    assertAliasPair(club, "clubName", "communityName", `${label} row ${index + 1}`);
  }
}

function assertSessionListAliases(body, label) {
  assertJsonArray(body, label);
  if (body.length === 0) {
    log(`${label} alias check skipped; no sessions returned`);
    return;
  }

  for (const [index, session] of body.entries()) {
    assertAliasPair(
      session,
      "clubId",
      "communityId",
      `${label} session ${index + 1}`
    );
    assertAliasPair(
      session,
      "clubs",
      "communities",
      `${label} session ${index + 1}`
    );
  }
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

function validateSmokeConfiguration() {
  const targetHost = new URL(baseURL).hostname.toLowerCase();
  const allowedHosts = (
    process.env.PRODUCTION_SMOKE_ALLOWED_HOSTS?.split(",") ??
    DEFAULT_ALLOWED_HOSTS
  )
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const usesCredentials = !!smokeEmail || !!smokePassword || allowMutation;

  if (
    usesCredentials &&
    !allowNonProductionTarget &&
    !allowedHosts.includes(targetHost)
  ) {
    throw new Error(
      `Refusing to submit production smoke credentials to ${targetHost}. Set PRODUCTION_SMOKE_ALLOWED_HOSTS or ALLOW_NON_PROD_SMOKE_TARGET=1 for non-production credentials.`
    );
  }

  if (!allowMutation) {
    return;
  }

  const missing = [];
  if (!smokeEmail) missing.push("PRODUCTION_SMOKE_EMAIL");
  if (!smokePassword) missing.push("PRODUCTION_SMOKE_PASSWORD");
  if (!smokeSessionCode) missing.push("PRODUCTION_SMOKE_SESSION_CODE");

  if (missing.length > 0) {
    throw new Error(
      `PRODUCTION_SMOKE_MUTATE=1 requires disposable production data. Missing: ${missing.join(", ")}`
    );
  }
}

async function showMobileTab(page, navLabel, tabLabel) {
  const tab = page
    .locator(`nav[aria-label="${navLabel}"] button[aria-label="${tabLabel}"]`)
    .filter({ visible: true })
    .first();

  if ((await tab.count()) === 0) {
    return false;
  }

  await tab.click();
  await page.waitForFunction(
    ({ navLabel: targetNavLabel, tabLabel: targetTabLabel }) => {
      const activeTab = document.querySelector(
        `nav[aria-label="${targetNavLabel}"] button[aria-label="${targetTabLabel}"]`
      );
      return activeTab?.getAttribute("aria-current") === "page";
    },
    { navLabel, tabLabel }
  );
  return true;
}

async function smokeLegacyCommunityCompatibility(context, page, label) {
  const legacyPageResponse = await page.goto(`/community/${smokeClubId}`, {
    waitUntil: "networkidle",
  });
  if (!legacyPageResponse) {
    throw new Error(`${label} legacy community page did not return a response`);
  }
  if (!legacyPageResponse.ok()) {
    throw new Error(
      `${label} legacy community page failed: ${legacyPageResponse.status()} ${legacyPageResponse.statusText()}`
    );
  }
  assertLegacyDeprecationHeaders(legacyPageResponse.headers(), {
    label: `${label} legacy community page`,
    successorPath: `/club/${smokeClubId}`,
  });
  await page.getByText("Club hub").first().waitFor({ timeout: 25_000 });
  log(`${label} legacy community page deprecation headers verified`);

  const legacyApiResponse = await context.request.get(
    `/api/communities/${smokeClubId}`
  );
  if (!legacyApiResponse.ok()) {
    throw new Error(
      `${label} legacy communities API failed: ${legacyApiResponse.status()} ${legacyApiResponse.statusText()}`
    );
  }
  assertLegacyDeprecationHeaders(legacyApiResponse.headers(), {
    label: `${label} legacy communities API`,
    successorPath: `/api/clubs/${smokeClubId}`,
  });

  const body = await legacyApiResponse.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`${label} legacy communities API did not return JSON object`);
  }
  assertClubDetailAliases(body, `${label} legacy communities API`);
  log(`${label} legacy communities API deprecation headers verified`);
}

async function smokeClubApiAliasContracts(context, label) {
  const clubCollection = await fetchJson(context, "/api/clubs", `${label} clubs API`);
  assertNoLegacyDeprecationHeaders(
    clubCollection.response.headers(),
    `${label} clubs API`
  );
  assertClubCollectionAliases(clubCollection.body, `${label} clubs API`);
  log(`${label} clubs API alias contracts verified`);

  const clubDetail = await fetchJson(
    context,
    `/api/clubs/${smokeClubId}`,
    `${label} club detail API`
  );
  assertNoLegacyDeprecationHeaders(
    clubDetail.response.headers(),
    `${label} club detail API`
  );
  assertClubDetailAliases(clubDetail.body, `${label} club detail API`);
  log(`${label} club detail API alias contracts verified`);

  const currentUser = await fetchJson(context, "/api/user/me", `${label} user API`);
  assertNoLegacyDeprecationHeaders(
    currentUser.response.headers(),
    `${label} user API`
  );
  assertJsonObject(currentUser.body, `${label} user API`);
  assertAliasPair(
    currentUser.body.user,
    "quickAccessClubId",
    "quickAccessCommunityId",
    `${label} user API user`
  );
  log(`${label} user API quick-access alias contracts verified`);

  const sessions = await fetchJson(
    context,
    `/api/sessions?clubId=${encodeURIComponent(smokeClubId)}`,
    `${label} sessions API`
  );
  assertNoLegacyDeprecationHeaders(
    sessions.response.headers(),
    `${label} sessions API`
  );
  assertSessionListAliases(sessions.body, `${label} sessions API`);
  log(`${label} sessions API alias contracts verified`);
}

async function smokeSessionApiAliasContracts(context, label) {
  const session = await fetchJson(
    context,
    `/api/sessions/${encodeURIComponent(smokeSessionCode)}`,
    `${label} session detail API`
  );
  assertNoLegacyDeprecationHeaders(
    session.response.headers(),
    `${label} session detail API`
  );
  assertAliasPair(
    session.body,
    "clubId",
    "communityId",
    `${label} session detail API`
  );
  assertAliasPair(
    session.body,
    "clubs",
    "communities",
    `${label} session detail API`
  );
  assertAliasPair(
    session.body,
    "viewerClubRole",
    "viewerCommunityRole",
    `${label} session detail API`
  );
  log(`${label} session detail API alias contracts verified`);
}

async function smokeSignedInSurface(context, label, { allowScoreMutation = false } = {}) {
  if (!smokeEmail || !smokePassword) {
    log("signed-in smoke skipped; set PRODUCTION_SMOKE_EMAIL and PRODUCTION_SMOKE_PASSWORD");
    return;
  }

  const page = await context.newPage();
  await signIn(page);
  log(`${label} signed-in dashboard loaded`);

  if (smokeClubId) {
    await page.goto(`/club/${smokeClubId}`, { waitUntil: "networkidle" });
    await page.getByText("Club hub").first().waitFor({ timeout: 25_000 });
    log(`${label} club hub loaded`);

    const hostSetupButton = page
      .getByRole("button", { name: "Open Host Setup" })
      .filter({ visible: true })
      .first();
    if ((await hostSetupButton.count()) > 0) {
      await hostSetupButton.click();
      await page.getByText("New tournament").first().waitFor({ timeout: 10_000 });
      log(`${label} host setup opened`);
    } else {
      log(`${label} host setup skipped; smoke user is not an admin for the club`);
    }

    await smokeClubApiAliasContracts(context, label);
    await smokeLegacyCommunityCompatibility(context, page, label);
  } else {
    log(
      `${label} club smoke skipped; set PRODUCTION_SMOKE_CLUB_ID or PRODUCTION_SMOKE_COMMUNITY_ID`
    );
  }

  if (smokeSessionCode) {
    await page.goto(`/session/${smokeSessionCode}`, { waitUntil: "networkidle" });
    await page
      .getByText(/Court board|Court layout|Standings/i)
      .first()
      .waitFor({ timeout: 25_000 });
    await showMobileTab(page, "Session navigation", "Courts");
    log(`${label} live session loaded`);
    await smokeSessionApiAliasContracts(context, label);

    await showMobileTab(page, "Session navigation", "Standings");
    await page.getByText("Standings").first().waitFor({ timeout: 10_000 });
    log(`${label} standings visible`);

    if (allowScoreMutation) {
      await showMobileTab(page, "Session navigation", "Courts");
      const scoreInputs = page.locator('input[type="number"]');
      if ((await scoreInputs.count()) < 2) {
        throw new Error("PRODUCTION_SMOKE_MUTATE=1 set, but score inputs are unavailable");
      }

      await scoreInputs.nth(0).fill("21");
      await scoreInputs.nth(1).fill("15");
      await page.getByRole("button", { name: "Submit Score" }).click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      log(`${label} score submitted`);

      const approveButton = page
        .getByRole("button", { name: "Confirm Results" })
        .filter({ visible: true })
        .first();
      if ((await approveButton.count()) > 0) {
        await approveButton.click();
        log(`${label} pending score approved`);
      }
    } else {
      log(`${label} score submission skipped; set PRODUCTION_SMOKE_MUTATE=1 only for a disposable production session`);
    }
  } else {
    log(`${label} session smoke skipped; set PRODUCTION_SMOKE_SESSION_CODE`);
  }

  await page.close();
}

async function main() {
  log(`base URL: ${baseURL}`);
  validateSmokeConfiguration();

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
    if (smokeEmail && smokePassword) {
      await smokeSignedInSurface(mobile, "mobile", {
        allowScoreMutation: allowMutation,
      });
      await smokeSignedInSurface(desktop, "desktop", {
        allowScoreMutation: false,
      });
    } else {
      await smokeSignedInSurface(mobile, "mobile");
    }

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
