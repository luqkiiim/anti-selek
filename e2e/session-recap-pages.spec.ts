import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { e2eDatabaseUrl } from "./env";
import { hostClubId, signInAsAdmin } from "./helpers";

test("all 29 players can be saved and shared across three recap images", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const code = `recap-pages-${randomUUID()}`;
  const db = new PrismaClient({ datasourceUrl: e2eDatabaseUrl });
  try {
    const players = Array.from({ length: 29 }, (_, index) => ({
      id: `${code}-${index}`, name: `Recap Player ${String(index + 1).padStart(2, "0")}`,
    }));
    await db.player.createMany({ data: players });
    const session = await db.session.create({ data: {
      code, clubId: hostClubId, name: "Big Session", status: "COMPLETED", endedAt: new Date(), type: "POINTS",
      courts: { create: { courtNumber: 1 } },
      players: { create: players.map((player, index) => ({ playerId: player.id, sessionPoints: 60 - index, isGuest: true })) },
    }, include: { courts: true } });
    await db.match.create({ data: {
      sessionId: session.id, courtId: session.courts[0].id, status: "COMPLETED", completedAt: new Date(), winnerTeam: 1, team1Score: 21, team2Score: 15,
      team1Player1Id: players[0].id, team1Player2Id: players[1].id,
      team2Player1Id: players[2].id, team2Player2Id: players[3].id,
    } });
  } finally { await db.$disconnect(); }

  // Desktop fallback is deterministic even on machines with a native share API.
  await page.addInitScript(() => Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false }));
  await signInAsAdmin(page);
  await page.goto(`/session/${code}`);
  const share = page.getByRole("button", { name: "Share recap", exact: true });
  await expect(share).toBeEnabled({ timeout: 60_000 });
  await share.click();
  const panel = page.getByRole("dialog", { name: "Save recap", exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("img")).toHaveCount(3);
  for (const index of [1, 2, 3]) {
    const preview = panel.getByRole("img", { name: `Recap image ${index} of 3`, exact: true });
    await expect.poll(() => preview.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(1080);
    const downloadPromise = page.waitForEvent("download");
    await panel.getByRole("button", { name: `Save image ${index}`, exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`big-session-standings-${index}-of-3.png`);
    const path = testInfo.outputPath(`recap-${index}.png`);
    await download.saveAs(path);
    expect(await sharp(path).metadata()).toMatchObject({ width: 1080, height: 1920 });
  }
  const allDownloads: string[] = [];
  page.on("download", download => allDownloads.push(download.suggestedFilename()));
  await panel.getByRole("button", { name: "Download all", exact: true }).click();
  await expect.poll(() => allDownloads).toEqual([
    "big-session-standings-1-of-3.png", "big-session-standings-2-of-3.png", "big-session-standings-3-of-3.png",
  ]);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => panel.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`save-panel-${width}.png`) });
  }
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await expect(panel).toHaveCount(0);

  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => {
      document.body.dataset.sharedRecap = JSON.stringify(data.files?.map(file => file.name));
    } });
  });
  await share.click();
  await expect(page.locator("body")).toHaveAttribute("data-shared-recap", JSON.stringify([
    "big-session-standings-1-of-3.png", "big-session-standings-2-of-3.png", "big-session-standings-3-of-3.png",
  ]));
  await expect(panel).toHaveCount(0);

  await page.evaluate(() => Object.defineProperty(navigator, "share", {
    configurable: true, value: async () => { throw new DOMException("Cancelled", "AbortError"); },
  }));
  await share.click();
  await expect(share).toBeEnabled();
  await expect(panel).toHaveCount(0);
  // Next's route announcer can leave an empty alert in the document.
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
});
