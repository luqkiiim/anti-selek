import fs from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { chromium } from "@playwright/test";

const cwd = process.cwd();
const port = process.env.UI_REVIEW_PORT ?? "3013";
const baseURL = `http://127.0.0.1:${port}`;
const reviewDb = path.resolve(
  cwd,
  "prisma",
  `ui-review-${randomUUID().slice(0, 8)}.db`
);
const reviewDbUrl = `file:${reviewDb.replace(/\\/g, "/")}`;
const screenshotDir = path.resolve(cwd, "test-results", "ui-review");
const skipSetup = process.env.UI_REVIEW_SKIP_SETUP === "1";
const skipServerStart = process.env.UI_REVIEW_SKIP_SERVER === "1";

const ids = {
  adminUserId: "user-ui-review-admin",
  hostClubId: "community-ui-review-host",
  scoreClubId: "community-ui-review-score",
  scoreSessionId: "session-ui-review-active",
  scoreCourtId: "court-ui-review-active-1",
  mobileScoreSessionId: "session-ui-review-mobile-active",
  mobileScoreCourtId: "court-ui-review-mobile-active-1",
  waitingSessionId: "session-ui-review-waiting",
};

const hostPlayerIds = [
  "user-ui-review-host-1",
  "user-ui-review-host-2",
  "user-ui-review-host-3",
  "user-ui-review-host-4",
  "user-ui-review-host-5",
  "user-ui-review-host-6",
  "user-ui-review-host-7",
];

const scorePlayerIds = [
  "user-ui-review-score-1",
  "user-ui-review-score-2",
  "user-ui-review-score-3",
  "user-ui-review-score-4",
  "user-ui-review-score-5",
  "user-ui-review-score-6",
  "user-ui-review-score-7",
  "user-ui-review-score-8",
  "user-ui-review-score-9",
  "user-ui-review-score-10",
  "user-ui-review-score-11",
];

async function waitForServer(url, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Server not ready: ${url}`);
}

async function prepareReviewDatabase() {
  console.log("Preparing review database...");
  await fs.rm(reviewDb, { force: true });
  await fs.writeFile(reviewDb, "");

  process.env.DATABASE_URL = reviewDbUrl;
  process.env.TURSO_DATABASE_URL = "";
  process.env.TURSO_AUTH_TOKEN = "";

  const prismaCli = path.join(
    cwd,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prisma.cmd" : "prisma"
  );
  const schemaPush = spawnSync(
    process.platform === "win32" ? "cmd.exe" : prismaCli,
    process.platform === "win32"
      ? ["/c", prismaCli, "db", "push", "--skip-generate"]
      : ["db", "push", "--skip-generate"],
    {
      cwd,
      env: {
        ...process.env,
        DATABASE_URL: reviewDbUrl,
        TURSO_DATABASE_URL: "",
        TURSO_AUTH_TOKEN: "",
      },
      stdio: "inherit",
    }
  );

  if (schemaPush.status !== 0) {
    const fallbackDb = path.resolve(cwd, "prisma", "e2e.db");
    try {
      console.warn(
        "Prisma schema push failed; falling back to the current e2e database schema."
      );
      await fs.rm(reviewDb, { force: true });
      await fs.copyFile(fallbackDb, reviewDb);
    } catch {
      throw new Error("Failed to prepare UI review database schema");
    }
  }

  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash("Password123!", 10);

  try {
    await prisma.match.deleteMany({
      where: { id: "match-ui-review-active" },
    });
    await prisma.queuedMatch.deleteMany({
      where: {
        sessionId: {
          in: [ids.scoreSessionId, ids.mobileScoreSessionId, ids.waitingSessionId],
        },
      },
    });
    await prisma.sessionPlayer.deleteMany({
      where: {
        sessionId: {
          in: [ids.scoreSessionId, ids.mobileScoreSessionId, ids.waitingSessionId],
        },
      },
    });
    await prisma.court.deleteMany({
      where: {
        sessionId: {
          in: [ids.scoreSessionId, ids.mobileScoreSessionId, ids.waitingSessionId],
        },
      },
    });
    await prisma.match.deleteMany({
      where: {
        sessionId: {
          in: [ids.scoreSessionId, ids.mobileScoreSessionId, ids.waitingSessionId],
        },
      },
    });
    await prisma.session.deleteMany({
      where: {
        id: {
          in: [ids.scoreSessionId, ids.mobileScoreSessionId, ids.waitingSessionId],
        },
      },
    });
    await prisma.clubMember.deleteMany({
      where: {
        clubId: { in: [ids.hostClubId, ids.scoreClubId] },
      },
    });
    await prisma.club.deleteMany({
      where: {
        id: { in: [ids.hostClubId, ids.scoreClubId] },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [ids.adminUserId, ...hostPlayerIds, ...scorePlayerIds],
        },
      },
    });

    await prisma.user.create({
      data: {
        id: ids.adminUserId,
        email: "ui-review-admin@example.com",
        name: "UI Review Admin",
        passwordHash,
        isClaimed: true,
        gender: "MALE",
        partnerPreference: "OPEN",
      },
    });

    await prisma.user.createMany({
      data: [
        ...hostPlayerIds.map((id, index) => ({
          id,
          email: `ui-review-host-${index + 1}@example.com`,
          name: `Host Player ${index + 1}`,
          passwordHash,
          isClaimed: true,
          gender: index % 2 === 0 ? "MALE" : "FEMALE",
          partnerPreference: index % 2 === 0 ? "OPEN" : "FEMALE_FLEX",
        })),
        ...scorePlayerIds.map((id, index) => ({
          id,
          email: `ui-review-score-${index + 1}@example.com`,
          name: `Score Player ${index + 1}`,
          passwordHash,
          isClaimed: true,
          gender: "MALE",
          partnerPreference: "OPEN",
        })),
      ],
    });

    await prisma.club.createMany({
      data: [
        {
          id: ids.hostClubId,
          name: "UI Review Host Club",
          createdById: ids.adminUserId,
        },
        {
          id: ids.scoreClubId,
          name: "UI Review Score Club",
          createdById: ids.adminUserId,
        },
      ],
    });

    await prisma.clubMember.createMany({
      data: [
        {
          clubId: ids.hostClubId,
          userId: ids.adminUserId,
          role: "ADMIN",
        },
        ...hostPlayerIds.map((userId) => ({
          clubId: ids.hostClubId,
          userId,
          role: "MEMBER",
        })),
        {
          clubId: ids.scoreClubId,
          userId: ids.adminUserId,
          role: "ADMIN",
        },
        ...scorePlayerIds.map((userId) => ({
          clubId: ids.scoreClubId,
          userId,
          role: "MEMBER",
        })),
      ],
    });

    await prisma.session.create({
      data: {
        id: ids.waitingSessionId,
        code: ids.waitingSessionId,
        clubId: ids.hostClubId,
        name: "Waiting Session Example",
        type: "POINTS",
        mode: "MEXICANO",
        status: "WAITING",
        courts: {
          create: [
            { id: "court-ui-review-waiting-1", courtNumber: 1 },
            { id: "court-ui-review-waiting-2", courtNumber: 2 },
          ],
        },
        players: {
          create: [
            {
              userId: ids.adminUserId,
              isGuest: false,
              gender: "MALE",
              partnerPreference: "OPEN",
            },
            ...hostPlayerIds.slice(0, 5).map((userId, index) => ({
              userId,
              isGuest: false,
              gender: index % 2 === 0 ? "MALE" : "FEMALE",
              partnerPreference:
                index % 2 === 0 ? "OPEN" : "FEMALE_FLEX",
            })),
          ],
        },
      },
    });

    async function createActiveScoreSession({
      sessionId,
      courtId,
      matchId,
      name,
    }) {
      await prisma.session.create({
        data: {
          id: sessionId,
          code: sessionId,
          clubId: ids.scoreClubId,
          name,
          type: "POINTS",
          mode: "OPEN",
          status: "ACTIVE",
          courts: {
            create: [
              { id: courtId, courtNumber: 1 },
              { id: `${courtId}-empty`, courtNumber: 2 },
            ],
          },
          players: {
            create: [
              {
                userId: ids.adminUserId,
                isGuest: false,
                gender: "MALE",
                partnerPreference: "OPEN",
              },
              ...scorePlayerIds.map((userId) => ({
                userId,
                isGuest: false,
                gender: "MALE",
                partnerPreference: "OPEN",
              })),
            ],
          },
        },
      });

      const activeMatch = await prisma.match.create({
        data: {
          id: matchId,
          sessionId,
          courtId,
          status: "IN_PROGRESS",
          team1User1Id: ids.adminUserId,
          team1User2Id: scorePlayerIds[0],
          team2User1Id: scorePlayerIds[1],
          team2User2Id: scorePlayerIds[2],
        },
      });

      await prisma.court.update({
        where: { id: courtId },
        data: { currentMatchId: activeMatch.id },
      });

      await prisma.queuedMatch.create({
        data: {
          sessionId,
          team1User1Id: scorePlayerIds[3],
          team1User2Id: scorePlayerIds[4],
          team2User1Id: scorePlayerIds[5],
          team2User2Id: scorePlayerIds[6],
        },
      });
    }

    await createActiveScoreSession({
      sessionId: ids.scoreSessionId,
      courtId: ids.scoreCourtId,
      matchId: "match-ui-review-active",
      name: "UI Review Active Session",
    });
    await createActiveScoreSession({
      sessionId: ids.mobileScoreSessionId,
      courtId: ids.mobileScoreCourtId,
      matchId: "match-ui-review-mobile-active",
      name: "UI Review Mobile Active Session",
    });
  } finally {
    await prisma.$disconnect();
  }
}

function startReviewServer() {
  console.log("Starting local review server...");
  return spawn(
    "cmd.exe",
    ["/c", "npm.cmd", "run", "dev", "--", "--hostname", "127.0.0.1", "--port", port],
    {
      cwd,
      env: {
        ...process.env,
        DATABASE_URL: reviewDbUrl,
        TURSO_DATABASE_URL: "",
        TURSO_AUTH_TOKEN: "",
        AUTH_SECRET: process.env.AUTH_SECRET,
        NEXTAUTH_URL: baseURL,
        AUTH_URL: baseURL,
        E2E_DISABLE_RATE_LIMITS: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
}

function stopReviewServer(server) {
  if (!server || server.killed) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    return;
  }

  server.kill("SIGTERM");
}

async function signIn(context) {
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${baseURL}/signin`);
  await page
    .getByLabel("Email", { exact: true })
    .fill("ui-review-admin@example.com");
  await page.getByLabel("Password", { exact: true }).fill("Password123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${baseURL}/`);
  await page.getByRole("heading", { name: "Anti-Selek" }).waitFor();
  return page;
}

async function captureScreens() {
  await fs.rm(screenshotDir, { recursive: true, force: true });
  await fs.mkdir(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    async function saveScreenshot(page, name, options = {}) {
      await page.addStyleTag({
        content: `
          nextjs-portal,
          [data-nextjs-dev-tools-button],
          [data-nextjs-dev-tools],
          [data-nextjs-toast],
          [aria-label="Open Next.js Dev Tools"] {
            display: none !important;
            visibility: hidden !important;
          }
        `,
      });
      await page.screenshot({
        path: path.join(screenshotDir, name),
        fullPage: options.fullPage ?? true,
      });
    }

    async function saveFlowScreenshot(page, name, label, options = {}) {
      await saveScreenshot(page, name, {
        ...options,
        fullPage: options.fullPage ?? label !== "mobile",
      });
    }

    async function closeTopModal(page) {
      await page.getByLabel("Close").filter({ visible: true }).first().click();
      await page.waitForTimeout(150);
    }

    async function captureDashboardPopups(page, label) {
      if (label !== "mobile") {
        return;
      }

      await page.getByRole("button", { name: "Create Club" }).click();
      await page
        .getByRole("heading", { name: "Create club" })
        .waitFor();
      await saveScreenshot(page, "popup-create-club-mobile.png", {
        fullPage: false,
      });
      await closeTopModal(page);

      await page.getByRole("button", { name: "Join Club" }).click();
      await page.getByRole("heading", { name: "Join club" }).waitFor();
      await saveScreenshot(page, "popup-join-club-mobile.png", {
        fullPage: false,
      });
      await closeTopModal(page);
    }

    async function captureHostSetupPopups(page, label) {
      if (label !== "mobile") {
        return;
      }

      await page.getByRole("button", { name: "Choose" }).first().click();
      await page.getByRole("heading", { name: "Add Players" }).waitFor();
      await saveScreenshot(page, "popup-host-player-picker-mobile.png", {
        fullPage: false,
      });
      await closeTopModal(page);
    }

    async function captureManualMatchPopup(page, label) {
      if (label !== "mobile") {
        return;
      }

      await showSessionMobileTab(page, "Courts", 1);
      await page
        .locator('[data-empty-court-create-root] button')
        .filter({ hasText: "Create" })
        .first()
        .click();
      await page.getByRole("button", { name: "Manual" }).click();
      await page.getByRole("heading", { name: "Manual Match" }).waitFor();
      await saveScreenshot(page, "popup-manual-match-mobile.png", {
        fullPage: false,
      });
      await closeTopModal(page);
    }

    async function captureAdminConfirmPopup(page, label) {
      if (label !== "mobile") {
        return;
      }

      await page.goto(`${baseURL}/club/${ids.hostClubId}/admin`);
      await page.getByRole("heading", { name: "Club controls" }).waitFor();
      await page.getByRole("button", { name: "Settings" }).click();
      await page.getByRole("button", { name: "Delete club" }).click();
      await page
        .getByRole("heading", { name: "Delete club permanently?" })
        .waitFor();
      await saveScreenshot(page, "popup-admin-delete-confirm-mobile.png", {
        fullPage: false,
      });
      await closeTopModal(page);
    }

    async function showSessionMobileTab(page, tabLabel, sectionIndex) {
      const mobileTab = page
        .locator(`nav[aria-label="Session navigation"] button[aria-label="${tabLabel}"]`)
        .filter({ visible: true })
        .first();

      if ((await mobileTab.count()) === 0) {
        return false;
      }

      await mobileTab.click();
      await page.waitForFunction(
        ({ tabLabel: targetTabLabel, sectionIndex: targetSectionIndex }) => {
          const activeTab = document.querySelector(
            `nav[aria-label="Session navigation"] button[aria-label="${targetTabLabel}"]`
          );
          const pager = document.querySelector(".app-swipe-track");

          if (activeTab?.getAttribute("aria-current") !== "page") {
            return false;
          }

          if (!pager) {
            return true;
          }

          const targetLeft = (pager.clientWidth || 1) * targetSectionIndex;
          return Math.abs(pager.scrollLeft - targetLeft) < 6;
        },
        { tabLabel, sectionIndex }
      );
      return true;
    }

    async function showSessionStandings(page) {
      if (await showSessionMobileTab(page, "Standings", 2)) {
        return;
      }

      await page
        .getByText("Standings")
        .filter({ visible: true })
        .first()
        .scrollIntoViewIfNeeded();
    }

    async function waitForClubMobileSection(page, section) {
      const labelsBySection = {
        overview: "Overview",
        tournaments: "Tournaments",
        host: "Host setup",
        leaderboard: "Leaderboard",
        profile: "Player profile",
      };
      const tabLabel = labelsBySection[section];
      if (!tabLabel) return;

      const mobileTab = page
        .locator(`nav[aria-label="Club navigation"] button[aria-label="${tabLabel}"]`)
        .filter({ visible: true })
        .first();

      if ((await mobileTab.count()) === 0) {
        return;
      }

      await page.waitForFunction(
        ({ section: targetSection, tabLabel: targetTabLabel }) => {
          const activeTab = document.querySelector(
            `nav[aria-label="Club navigation"] button[aria-label="${targetTabLabel}"]`
          );
          const pager = document.querySelector(
            "div.app-swipe-track.overflow-x-auto"
          );
          const panel = document.querySelector(
            `[data-club-section="${targetSection}"]`
          );

          if (activeTab?.getAttribute("aria-current") !== "page") {
            return false;
          }

          if (!pager || !panel) {
            return true;
          }

          const pagerRect = pager.getBoundingClientRect();
          const panelRect = panel.getBoundingClientRect();
          return Math.abs(panelRect.left - pagerRect.left) < 6;
        },
        { section, tabLabel }
      );
    }

    async function captureSignIn(context, label) {
      const page = await context.newPage();
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(`${baseURL}/signin`);
      await page.getByLabel("Email", { exact: true }).waitFor();
      await saveScreenshot(page, `sign-in-${label}.png`);
      await page.close();
    }

    async function captureQueuePromotionFrames(page) {
      const frameDelays = [40, 140, 280, 520, 900];
      const debugFrames = [];
      let elapsed = 0;

      for (const [index, delay] of frameDelays.entries()) {
        await page.waitForTimeout(delay - elapsed);
        elapsed = delay;
        debugFrames.push(
          await page.evaluate((frameNumber) => {
            const ghost = document.querySelector(
              "[data-queue-promotion-ghost='true']"
            );
            const ghostScoreSlots = Array.from(
              document.querySelectorAll("[data-queue-promotion-ghost-score-slot]")
            );
            const queueSurface = document.querySelector(
              "[data-queued-promotion-surface='true']"
            );

            const toRect = (element) => {
              if (!element) return null;
              const rect = element.getBoundingClientRect();
              return {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                opacity: window.getComputedStyle(element).opacity,
              };
            };

            return {
              frame: frameNumber,
              ghost: toRect(ghost),
              ghostScoreSlots: ghostScoreSlots.map((slot) => toRect(slot)),
              queueSurface: toRect(queueSurface),
              courtCards: Array.from(
                document.querySelectorAll("[data-live-court-card]")
              ).map((card) => ({
                courtId: card.getAttribute("data-live-court-card"),
                text: card.textContent,
              })),
            };
          }, index + 1)
        );
        await saveScreenshot(
          page,
          `queue-promotion-frame-${String(index + 1).padStart(2, "0")}.png`,
          { fullPage: false }
        );
      }

      await fs.writeFile(
        path.join(screenshotDir, "queue-promotion-debug.json"),
        JSON.stringify(debugFrames, null, 2)
      );

      const stretchedGhostFrame = debugFrames.find((frame) =>
        frame.ghostScoreSlots.some((slot) => {
          if (!slot) {
            return false;
          }

          const aspectRatio = slot.width / Math.max(slot.height, 1);
          return aspectRatio < 0.92 || aspectRatio > 1.08;
        })
      );

      if (stretchedGhostFrame) {
        throw new Error(
          `Queue promotion ghost stretched score slot on frame ${stretchedGhostFrame.frame}`
        );
      }

      const missingGhostSlotFrame = debugFrames.find(
        (frame) => frame.ghost && frame.ghostScoreSlots.length === 0
      );

      if (missingGhostSlotFrame) {
        throw new Error(
          `Queue promotion ghost score slots were not measurable on frame ${missingGhostSlotFrame.frame}`
        );
      }
    }

    async function captureSignedInReviewFlow({
      context,
      label,
      scoreSessionId,
      sessionHeading,
      captureQueueFrames = false,
    }) {
      const page = await signIn(context);
      await saveFlowScreenshot(page, `dashboard-${label}.png`, label);
      await captureDashboardPopups(page, label);

      await page.goto(`${baseURL}/club/${ids.hostClubId}`);
      await page
        .getByRole("heading", { name: "UI Review Host Club" })
        .waitFor();
      await saveFlowScreenshot(page, `club-hub-${label}.png`, label);

      await page.getByRole("button", { name: "Open Host Setup" }).click();
      await page
        .getByText("New tournament")
        .filter({ visible: true })
        .first()
        .waitFor();
      await waitForClubMobileSection(page, "host");
      await saveFlowScreenshot(page, `host-setup-${label}.png`, label);
      await captureHostSetupPopups(page, label);
      await captureAdminConfirmPopup(page, label);

      await page.goto(`${baseURL}/session/${scoreSessionId}`);
      await page.getByRole("heading", { name: sessionHeading }).waitFor();
      await saveFlowScreenshot(page, `session-active-${label}.png`, label);
      await captureManualMatchPopup(page, label);

      await showSessionStandings(page);
      await saveScreenshot(page, `standings-${label}.png`, { fullPage: false });
      await showSessionMobileTab(page, "Courts", 1);

      const scoreInputs = page.locator('input[type="number"]');
      await scoreInputs.nth(0).fill("21");
      await scoreInputs.nth(1).fill("15");
      await page.getByRole("button", { name: "Submit Score" }).click();
      await page.getByRole("button", { name: "Confirm" }).waitFor();
      await saveFlowScreenshot(page, `score-confirmation-${label}.png`, label);

      await page.getByRole("button", { name: "Confirm" }).click();
      await page.getByRole("button", { name: "Confirm Results" }).waitFor();
      await saveFlowScreenshot(page, `pending-approval-${label}.png`, label);

      if (captureQueueFrames) {
        await page.getByRole("button", { name: "Confirm Results" }).click();
        await captureQueuePromotionFrames(page);
      }

      await page.close();
    }

    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 1400 },
    });
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });

    await captureSignIn(desktop, "desktop");
    await captureSignIn(mobile, "mobile");
    await captureSignedInReviewFlow({
      context: desktop,
      label: "desktop",
      scoreSessionId: ids.scoreSessionId,
      sessionHeading: "UI Review Active Session",
      captureQueueFrames: true,
    });
    await captureSignedInReviewFlow({
      context: mobile,
      label: "mobile",
      scoreSessionId: ids.mobileScoreSessionId,
      sessionHeading: "UI Review Mobile Active Session",
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  const serverAlreadyRunning = false;

  if (!skipSetup) {
    await prepareReviewDatabase();
  }

  let server = null;
  if (!skipServerStart && !serverAlreadyRunning) {
    server = startReviewServer();
    server.stdout.on("data", (chunk) => process.stdout.write(chunk));
    server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  }

  try {
    await waitForServer(`${baseURL}/signin`);
    console.log("Server ready. Capturing screenshots...");
    await captureScreens();
    console.log(`Screenshots written to ${screenshotDir}`);
  } finally {
    if (server) {
      stopReviewServer(server);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
