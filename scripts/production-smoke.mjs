import "dotenv/config";

import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
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
const preflightOnly = process.argv.includes("--preflight");
const legacyCommunityContractSunsetDate =
  process.env.LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE ?? "";
const legacyDeprecationMessage =
  "Use club routes and club fields; community compatibility will be removed in a future phase.";
const desktopContextOptions = {
  baseURL,
  viewport: { width: 1440, height: 1000 },
};
const mobileContextOptions = {
  baseURL,
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};

function log(message) {
  console.log(`[production-smoke] ${message}`);
}

function failPreflight(message) {
  throw new Error(`Production smoke preflight failed: ${message}`);
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

  const sunset = getHeader(headers, "Sunset");
  if (sunset) {
    throw new Error(
      `${label} unexpectedly returned Sunset header "${sunset}"`
    );
  }
}

function getExpectedLegacySunsetHeader() {
  if (!legacyCommunityContractSunsetDate) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
    legacyCommunityContractSunsetDate
  );
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toUTCString();
}

function assertLegacySunsetHeader(headers, label) {
  const sunset = getHeader(headers, "Sunset");
  const expectedSunset = getExpectedLegacySunsetHeader();

  if (!expectedSunset) {
    if (sunset) {
      throw new Error(
        `${label} unexpectedly returned Sunset header "${sunset}"`
      );
    }

    return;
  }

  if (sunset !== expectedSunset) {
    throw new Error(
      `${label} missing Sunset header; expected "${expectedSunset}", received "${sunset}"`
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

  assertLegacySunsetHeader(headers, label);
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

async function smokePublicSurface(
  context,
  label,
  { checkSignInPage = false } = {}
) {
  const page = await context.newPage();
  try {
    if (checkSignInPage) {
      await page.goto("/signin", { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Welcome back" }).waitFor();
      await page.getByLabel("Email", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Quick access" }).waitFor();
      log(`${label} sign-in page rendered`);
    }

    await page.goto("/", { waitUntil: "networkidle" });
    await page
      .getByText(/Anti-Selek|Welcome back|Dashboard/i)
      .first()
      .waitFor({ timeout: 20_000 });
    log(`${label} root route rendered or redirected cleanly`);
  } finally {
    await page.close();
  }
}

async function readBodyText(page) {
  return page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
}

async function throwIfRecognizedSignInFailure(page) {
  const currentUrl = new URL(page.url());
  const bodyText = await readBodyText(page);
  if (/rate limit exceeded/i.test(bodyText)) {
    throw new Error(
      "Production smoke sign-in was rate-limited by /api/auth; wait for the auth rate-limit window to clear before rerunning."
    );
  }

  if (/invalid email or password/i.test(bodyText)) {
    throw new Error(
      "Production smoke sign-in was rejected by the credentials flow. Verify PRODUCTION_SMOKE_EMAIL and PRODUCTION_SMOKE_PASSWORD; if they are correct, wait 15 minutes for the auth:signin rate-limit window to clear before rerunning."
    );
  }

  if (currentUrl.pathname.startsWith("/api/auth/error")) {
    throw new Error(
      "Production smoke sign-in reached /api/auth/error. Check smoke credentials and production auth logs."
    );
  }
}

async function signIn(page) {
  await page.goto("/signin", { waitUntil: "networkidle" });
  await page.getByLabel("Email", { exact: true }).fill(smokeEmail);
  await page.getByLabel("Password", { exact: true }).fill(smokePassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  const logoutButton = page
    .getByRole("button", { name: "Logout" })
    .filter({ visible: true })
    .first();
  try {
    await Promise.any([
      page.waitForURL((url) => !url.pathname.startsWith("/signin"), {
        timeout: 25_000,
      }),
      logoutButton.waitFor({ timeout: 25_000 }),
    ]);
  } catch (error) {
    await throwIfRecognizedSignInFailure(page);
    throw error;
  }
  await throwIfRecognizedSignInFailure(page);

  try {
    await logoutButton.waitFor({ timeout: 25_000 });
  } catch {
    await throwIfRecognizedSignInFailure(page);
    throw new Error(
      "Production smoke sign-in completed navigation but did not show a visible Logout button."
    );
  }
}

async function installCachedAuthSessionRoute(context) {
  const response = await context.request.get("/api/auth/session");
  if (!response.ok()) {
    throw new Error(
      `Production smoke authenticated session check failed: ${response.status()} ${response.statusText()}`
    );
  }

  const body = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("Production smoke authenticated session check did not return JSON.");
  }

  if (!payload?.user) {
    throw new Error("Production smoke authenticated session check returned no user.");
  }

  const contentType =
    response.headers()["content-type"] ?? "application/json; charset=utf-8";
  await context.route("**/api/auth/session", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      body,
      contentType,
      headers: {
        "cache-control": "no-store",
      },
      status: 200,
    });
  });
  log("authenticated session cached for browser checks");
}

async function createAuthenticatedContext(browser) {
  const context = await browser.newContext(desktopContextOptions);
  try {
    const page = await context.newPage();
    try {
      await signIn(page);
      await installCachedAuthSessionRoute(context);
      log("authenticated browser context created");
      return context;
    } finally {
      await page.close();
    }
  } catch (error) {
    await context.close();
    throw error;
  }
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

  if (
    legacyCommunityContractSunsetDate &&
    !getExpectedLegacySunsetHeader()
  ) {
    throw new Error(
      "Invalid LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE; expected YYYY-MM-DD."
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

function getSignedInSmokeEnvState() {
  const entries = [
    ["PRODUCTION_SMOKE_EMAIL", smokeEmail],
    ["PRODUCTION_SMOKE_PASSWORD", smokePassword],
    [
      process.env.PRODUCTION_SMOKE_CLUB_ID
        ? "PRODUCTION_SMOKE_CLUB_ID"
        : "PRODUCTION_SMOKE_CLUB_ID or PRODUCTION_SMOKE_COMMUNITY_ID",
      smokeClubId,
    ],
    ["PRODUCTION_SMOKE_SESSION_CODE", smokeSessionCode],
  ];
  const configured = entries.some(([, value]) => !!value);
  const missing = configured
    ? entries.filter(([, value]) => !value).map(([name]) => name)
    : [];

  return {
    configured,
    complete: configured && missing.length === 0,
    missing,
  };
}

function hasTursoSmokePreflightConfig() {
  return !!process.env.TURSO_DATABASE_URL && !!process.env.TURSO_AUTH_TOKEN;
}

function createTursoSmokeClient() {
  return createClient({
    authToken: process.env.TURSO_AUTH_TOKEN,
    url: process.env.TURSO_DATABASE_URL,
  });
}

async function getSingleRow(db, sql, args, label) {
  const result = await db.execute({ sql, args });
  if (result.rows.length > 1) {
    failPreflight(`${label} returned more than one row.`);
  }

  return result.rows[0] ?? null;
}

async function verifySmokeAccountAndTargets(db) {
  const normalizedEmail = smokeEmail.trim().toLowerCase();
  const user = await getSingleRow(
    db,
    `SELECT "id", "passwordHash", "isClaimed" FROM "User" WHERE lower("email") = ?`,
    [normalizedEmail],
    "smoke user lookup"
  );
  if (!user) {
    failPreflight("smoke user was not found in Turso.");
  }
  if (!user.passwordHash) {
    failPreflight("smoke user exists but has no password hash.");
  }

  const passwordMatches = await bcrypt.compare(
    smokePassword,
    String(user.passwordHash)
  );
  if (!passwordMatches) {
    failPreflight("smoke user password does not match PRODUCTION_SMOKE_PASSWORD.");
  }
  log("preflight smoke user verified");

  const club = await getSingleRow(
    db,
    `SELECT "id" FROM "Community" WHERE "id" = ?`,
    [smokeClubId],
    "smoke club lookup"
  );
  if (!club) {
    failPreflight("smoke club was not found in Turso.");
  }

  const membership = await getSingleRow(
    db,
    `SELECT "id" FROM "CommunityMember" WHERE "communityId" = ? AND "userId" = ?`,
    [smokeClubId, user.id],
    "smoke club membership lookup"
  );
  if (!membership) {
    failPreflight("smoke user is not a member of the smoke club.");
  }
  log("preflight smoke club membership verified");

  const session = await getSingleRow(
    db,
    `SELECT "id", "communityId" FROM "Session" WHERE "code" = ?`,
    [smokeSessionCode],
    "smoke session lookup"
  );
  if (!session) {
    failPreflight("smoke session was not found in Turso.");
  }

  const linkedDirectly = session.communityId === smokeClubId;
  const linkedBySessionClub = await getSingleRow(
    db,
    `SELECT "id" FROM "SessionCommunity" WHERE "sessionId" = ? AND "communityId" = ?`,
    [session.id, smokeClubId],
    "smoke session club lookup"
  );
  if (!linkedDirectly && !linkedBySessionClub) {
    failPreflight("smoke session is not linked to the smoke club.");
  }
  log("preflight smoke session verified");
}

function getRelevantRateLimitScopes() {
  return new Map([
    ["api:auth:nextauth:get", 10],
    ["api:auth:nextauth:post", 10],
    ["auth:signin", 10],
    ["api:communities:get", 30],
    ["api:communities:id:get", 30],
    ["api:sessions:get", 30],
    ["api:sessions:code:get", 30],
    ["api:user:me:get", 30],
  ]);
}

async function verifySmokeRateLimitBuckets(db) {
  const scopeLimits = getRelevantRateLimitScopes();
  const result = await db.execute({
    args: [...scopeLimits.keys()],
    sql: `SELECT "scope", "count", "resetAt" FROM "RateLimitBucket" WHERE "scope" IN (${[...scopeLimits.keys()].map(() => "?").join(", ")})`,
  });
  const now = Date.now();
  const hotBuckets = result.rows
    .map((row) => {
      const scope = String(row.scope);
      const resetAt = new Date(String(row.resetAt)).getTime();
      const limit = scopeLimits.get(scope) ?? 30;

      return {
        count: Number(row.count),
        limit,
        resetInSeconds: Math.max(0, Math.ceil((resetAt - now) / 1000)),
        scope,
      };
    })
    .filter(
      (bucket) =>
        bucket.resetInSeconds > 0 &&
        Number.isFinite(bucket.count) &&
        bucket.count >= bucket.limit
    );

  if (hotBuckets.length > 0) {
    const details = hotBuckets
      .map(
        (bucket) =>
          `${bucket.scope} ${bucket.count}/${bucket.limit}, retry in ${bucket.resetInSeconds}s`
      )
      .join("; ");
    failPreflight(`rate-limit buckets are hot: ${details}.`);
  }

  log("preflight rate-limit buckets verified");
}

async function runProductionSmokePreflight() {
  log("preflight started");
  validateSmokeConfiguration();

  const signedInEnv = getSignedInSmokeEnvState();
  if (!signedInEnv.configured) {
    log(
      "signed-in preflight skipped; set PRODUCTION_SMOKE_EMAIL, PRODUCTION_SMOKE_PASSWORD, PRODUCTION_SMOKE_CLUB_ID, and PRODUCTION_SMOKE_SESSION_CODE"
    );
    log("preflight complete");
    return;
  }

  if (signedInEnv.missing.length > 0) {
    failPreflight(`missing signed-in smoke env: ${signedInEnv.missing.join(", ")}.`);
  }

  if (!hasTursoSmokePreflightConfig()) {
    log(
      "Turso preflight skipped; set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to verify smoke data and rate-limit buckets"
    );
    log("preflight complete");
    return;
  }

  const db = createTursoSmokeClient();
  await verifySmokeAccountAndTargets(db);
  await verifySmokeRateLimitBuckets(db);
  log("preflight complete");
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

async function smokeSignedInSurface(
  context,
  label,
  {
    allowScoreMutation = false,
    checkApiAliasContracts = true,
    checkDashboard = true,
    checkLegacyCompatibility = false,
    checkSessionApiAliasContracts = true,
    viewport = null,
  } = {}
) {
  if (!smokeEmail || !smokePassword) {
    log("signed-in smoke skipped; set PRODUCTION_SMOKE_EMAIL and PRODUCTION_SMOKE_PASSWORD");
    return;
  }

  const page = await context.newPage();
  try {
    if (viewport) {
      await page.setViewportSize(viewport);
    }

    if (checkDashboard) {
      await page.goto("/", { waitUntil: "networkidle" });
      await page
        .getByRole("button", { name: "Logout" })
        .filter({ visible: true })
        .first()
        .waitFor({ timeout: 25_000 });
      log(`${label} signed-in dashboard loaded`);
    }

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

      if (checkApiAliasContracts) {
        await smokeClubApiAliasContracts(context, label);
      }
      if (checkLegacyCompatibility) {
        await smokeLegacyCommunityCompatibility(context, page, label);
      }
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
      if (checkSessionApiAliasContracts) {
        await smokeSessionApiAliasContracts(context, label);
      }

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
  } finally {
    await page.close();
  }
}

async function main() {
  log(`base URL: ${baseURL}`);
  await runProductionSmokePreflight();
  if (preflightOnly) {
    return;
  }

  await assertFetchOk("/", "home");
  await assertFetchOk("/manifest.webmanifest", "web manifest");
  if (!smokeEmail || !smokePassword) {
    await assertFetchOk("/signin", "sign in");
    await assertFetchOk("/api/auth/providers", "auth providers");
  }

  const browser = await chromium.launch({ headless: true });
  try {
    if (smokeEmail && smokePassword) {
      const authenticated = await createAuthenticatedContext(browser);
      try {
        await smokeSignedInSurface(authenticated, "mobile", {
          allowScoreMutation: allowMutation,
          viewport: mobileContextOptions.viewport,
        });
        await smokeSignedInSurface(authenticated, "desktop", {
          allowScoreMutation: false,
          checkApiAliasContracts: false,
          checkDashboard: false,
          checkLegacyCompatibility: true,
          checkSessionApiAliasContracts: false,
          viewport: desktopContextOptions.viewport,
        });
      } finally {
        await authenticated.close();
      }
    } else {
      const publicDesktop = await browser.newContext(desktopContextOptions);
      const publicMobile = await browser.newContext(mobileContextOptions);
      try {
        await smokePublicSurface(publicDesktop, "desktop", {
          checkSignInPage: true,
        });
        await smokePublicSurface(publicMobile, "mobile");
      } finally {
        await publicDesktop.close();
        await publicMobile.close();
      }

      const mobile = await browser.newContext(mobileContextOptions);
      try {
        await smokeSignedInSurface(mobile, "mobile");
      } finally {
        await mobile.close();
      }
    }
  } finally {
    await browser.close();
  }

  log("complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
