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
const sourceDb = path.resolve(cwd, "prisma", "dev.db");
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
  hostCommunityId: "community-ui-review-host",
  scoreCommunityId: "community-ui-review-score",
  scoreSessionId: "session-ui-review-active",
  scoreCourtId: "court-ui-review-active-1",
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
  console.log("Preparing review database copy...");
  await fs.rm(reviewDb, { force: true });
  await fs.copyFile(sourceDb, reviewDb);

  process.env.DATABASE_URL = reviewDbUrl;
  process.env.TURSO_DATABASE_URL = "";
  process.env.TURSO_AUTH_TOKEN = "";

  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash("Password123!", 10);

  try {
    await prisma.match.deleteMany({
      where: { id: "match-ui-review-active" },
    });
    await prisma.queuedMatch.deleteMany({
      where: {
        sessionId: { in: [ids.scoreSessionId, ids.waitingSessionId] },
      },
    });
    await prisma.sessionPlayer.deleteMany({
      where: {
        sessionId: { in: [ids.scoreSessionId, ids.waitingSessionId] },
      },
    });
    await prisma.court.deleteMany({
      where: {
        sessionId: { in: [ids.scoreSessionId, ids.waitingSessionId] },
      },
    });
    await prisma.match.deleteMany({
      where: {
        sessionId: { in: [ids.scoreSessionId, ids.waitingSessionId] },
      },
    });
    await prisma.session.deleteMany({
      where: {
        id: { in: [ids.scoreSessionId, ids.waitingSessionId] },
      },
    });
    await prisma.communityMember.deleteMany({
      where: {
        communityId: { in: [ids.hostCommunityId, ids.scoreCommunityId] },
      },
    });
    await prisma.community.deleteMany({
      where: {
        id: { in: [ids.hostCommunityId, ids.scoreCommunityId] },
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

    await prisma.community.createMany({
      data: [
        {
          id: ids.hostCommunityId,
          name: "UI Review Host Club",
          createdById: ids.adminUserId,
        },
        {
          id: ids.scoreCommunityId,
          name: "UI Review Score Club",
          createdById: ids.adminUserId,
        },
      ],
    });

    await prisma.communityMember.createMany({
      data: [
        {
          communityId: ids.hostCommunityId,
          userId: ids.adminUserId,
          role: "ADMIN",
        },
        ...hostPlayerIds.map((userId) => ({
          communityId: ids.hostCommunityId,
          userId,
          role: "MEMBER",
        })),
        {
          communityId: ids.scoreCommunityId,
          userId: ids.adminUserId,
          role: "ADMIN",
        },
        ...scorePlayerIds.map((userId) => ({
          communityId: ids.scoreCommunityId,
          userId,
          role: "MEMBER",
        })),
      ],
    });

    await prisma.session.create({
      data: {
        id: ids.waitingSessionId,
        code: ids.waitingSessionId,
        communityId: ids.hostCommunityId,
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

    await prisma.session.create({
      data: {
        id: ids.scoreSessionId,
        code: ids.scoreSessionId,
        communityId: ids.scoreCommunityId,
        name: "UI Review Active Session",
        type: "POINTS",
        mode: "OPEN",
        status: "ACTIVE",
        courts: {
          create: [
            { id: ids.scoreCourtId, courtNumber: 1 },
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
            {
              userId: scorePlayerIds[0],
              isGuest: false,
              gender: "MALE",
              partnerPreference: "OPEN",
            },
            {
              userId: scorePlayerIds[1],
              isGuest: false,
              gender: "MALE",
              partnerPreference: "OPEN",
            },
            {
              userId: scorePlayerIds[2],
              isGuest: false,
              gender: "MALE",
              partnerPreference: "OPEN",
            },
            ...scorePlayerIds.slice(3).map((userId) => ({
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
        id: "match-ui-review-active",
        sessionId: ids.scoreSessionId,
        courtId: ids.scoreCourtId,
        status: "IN_PROGRESS",
        team1User1Id: ids.adminUserId,
        team1User2Id: scorePlayerIds[0],
        team2User1Id: scorePlayerIds[1],
        team2User2Id: scorePlayerIds[2],
      },
    });

    await prisma.court.update({
      where: { id: ids.scoreCourtId },
      data: { currentMatchId: activeMatch.id },
    });

    await prisma.queuedMatch.create({
      data: {
        sessionId: ids.scoreSessionId,
        team1User1Id: scorePlayerIds[3],
        team1User2Id: scorePlayerIds[4],
        team2User1Id: scorePlayerIds[5],
        team2User2Id: scorePlayerIds[6],
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

function startReviewServer() {
  console.log("Starting local review server...");
  return spawn(
    "cmd.exe",
    ["/c", "npm.cmd", "run", "start", "--", "--hostname", "127.0.0.1", "--port", port],
    {
      cwd,
      env: {
        ...process.env,
        DATABASE_URL: reviewDbUrl,
        TURSO_DATABASE_URL: "",
        TURSO_AUTH_TOKEN: "",
        AUTH_SECRET:
          process.env.AUTH_SECRET ||
          "your-secret-key-change-in-production-min-32-chars",
        NEXTAUTH_URL: baseURL,
        AUTH_URL: baseURL,
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
  await page.getByLabel("Email").fill("ui-review-admin@example.com");
  await page.getByLabel("Password").fill("Password123!");
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
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 1400 },
    });

    const desktopPage = await signIn(desktop);
    await desktopPage.goto(`${baseURL}/session/${ids.scoreSessionId}`);
    await desktopPage
      .getByRole("heading", { name: "UI Review Active Session" })
      .waitFor();
    await desktopPage.screenshot({
      path: path.join(screenshotDir, "session-active-desktop.png"),
      fullPage: true,
    });
    const scoreInputs = desktopPage.locator('input[type="number"]');
    await scoreInputs.nth(0).fill("21");
    await scoreInputs.nth(1).fill("15");
    await desktopPage.getByRole("button", { name: "Submit Score" }).click();
    await desktopPage.getByRole("button", { name: "Confirm" }).waitFor();
    await desktopPage.screenshot({
      path: path.join(screenshotDir, "queue-promotion-confirm-desktop.png"),
      fullPage: true,
    });
    await desktopPage.getByRole("button", { name: "Confirm" }).click();
    await desktopPage.getByRole("button", { name: "Confirm Results" }).waitFor();
    await desktopPage.screenshot({
      path: path.join(screenshotDir, "queue-promotion-pending-desktop.png"),
      fullPage: true,
    });
    await desktopPage.getByRole("button", { name: "Confirm Results" }).click();

    const frameDelays = [40, 140, 280, 520, 900];
    const debugFrames = [];
    let elapsed = 0;
    for (const [index, delay] of frameDelays.entries()) {
      await desktopPage.waitForTimeout(delay - elapsed);
      elapsed = delay;
      debugFrames.push(
        await desktopPage.evaluate((frameNumber) => {
          const ghost = document.querySelector("[data-queue-promotion-ghost='true']");
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
      await desktopPage.screenshot({
        path: path.join(
          screenshotDir,
          `queue-promotion-frame-${String(index + 1).padStart(2, "0")}.png`
        ),
      });
    }
    await fs.writeFile(
      path.join(screenshotDir, "queue-promotion-debug.json"),
      JSON.stringify(debugFrames, null, 2)
    );
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
