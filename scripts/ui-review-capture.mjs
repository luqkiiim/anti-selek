import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { chromium } from "@playwright/test";

const cwd = process.cwd();
const baseURL = "http://127.0.0.1:3005";
const sourceDb = path.resolve(cwd, "prisma", "dev.db");
const reviewDb = path.resolve(cwd, "prisma", "ui-review.db");
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

async function isServerReady(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
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
          gender: index % 2 === 0 ? "MALE" : "FEMALE",
          partnerPreference: index % 2 === 0 ? "OPEN" : "FEMALE_FLEX",
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
        mode: "MEXICANO",
        status: "ACTIVE",
        courts: {
          create: [
            { id: ids.scoreCourtId, courtNumber: 1 },
            { id: "court-ui-review-active-2", courtNumber: 2 },
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
              gender: "FEMALE",
              partnerPreference: "FEMALE_FLEX",
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
              gender: "FEMALE",
              partnerPreference: "FEMALE_FLEX",
            },
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
  } finally {
    await prisma.$disconnect();
  }
}

function startReviewServer() {
  console.log("Starting local review server...");
  return spawn(
    "cmd.exe",
    ["/c", "npm.cmd", "run", "start", "--", "--hostname", "127.0.0.1", "--port", "3005"],
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

async function signIn(context) {
  const page = await context.newPage();
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
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });

    const desktopPage = await signIn(desktop);
    await desktopPage.goto(`${baseURL}/community/${ids.hostCommunityId}`);
    await desktopPage
      .getByRole("heading", { name: "UI Review Host Club" })
      .waitFor();
    await desktopPage.screenshot({
      path: path.join(screenshotDir, "community-overview-desktop.png"),
      fullPage: true,
    });
    await desktopPage
      .getByRole("button", { name: "Open Host Setup" })
      .first()
      .click();
    await desktopPage
      .getByRole("heading", { name: "Build the next tournament in three quick steps" })
      .waitFor();
    await desktopPage.screenshot({
      path: path.join(screenshotDir, "community-host-setup-desktop.png"),
      fullPage: true,
    });
    await desktopPage.goto(`${baseURL}/session/${ids.scoreSessionId}`);
    await desktopPage
      .getByRole("heading", { name: "UI Review Active Session" })
      .waitFor();
    await desktopPage.screenshot({
      path: path.join(screenshotDir, "session-active-desktop.png"),
      fullPage: true,
    });

    const mobilePage = await signIn(mobile);
    await mobilePage.goto(`${baseURL}/community/${ids.hostCommunityId}`);
    await mobilePage
      .getByRole("heading", { name: "UI Review Host Club" })
      .waitFor();
    await mobilePage.screenshot({
      path: path.join(screenshotDir, "community-overview-mobile.png"),
      fullPage: true,
    });
    await mobilePage
      .getByRole("button", { name: "Open Host Setup" })
      .first()
      .click();
    await mobilePage
      .getByRole("heading", { name: "Build the next tournament in three quick steps" })
      .waitFor();
    await mobilePage.screenshot({
      path: path.join(screenshotDir, "community-host-setup-mobile.png"),
      fullPage: true,
    });
    await mobilePage.goto(`${baseURL}/session/${ids.scoreSessionId}`);
    await mobilePage
      .getByRole("heading", { name: "UI Review Active Session" })
      .waitFor();
    await mobilePage.screenshot({
      path: path.join(screenshotDir, "session-active-mobile.png"),
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  const reviewDbExists = await fs
    .access(reviewDb)
    .then(() => true)
    .catch(() => false);
  const serverAlreadyRunning = await isServerReady(`${baseURL}/signin`);

  if (!skipSetup && !reviewDbExists) {
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
      server.kill();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
