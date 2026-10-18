import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page, type APIResponse } from "@playwright/test";
import { e2eDatabaseUrl } from "./env";
import { signInAsAdmin } from "./helpers";

type Participant = { id: string; name: string };
type Match = {
  id: string;
  courtId?: string;
  courtGroupType: string;
  team1User1: Participant;
  team1User2: Participant;
  team2User1: Participant;
  team2User2: Participant;
};
type Snapshot = {
  players: Array<{ userId: string; pool: string; gender: string; isPaused: boolean; skipNextMatchAt: string | null; arrivalPriorityAt: string | null; user: Participant }>;
  courts: Array<{ id: string; courtNumber: number; currentMatch: Match | null }>;
  queuedMatch: Match | null;
};
const ids = (match: Match) => [match.team1User1.id, match.team1User2.id, match.team2User1.id, match.team2User2.id];
async function ok(response: APIResponse) {
  expect(response.ok(), `${response.status()}: ${await response.text()}`).toBe(true);
  return response;
}
async function read(page: Page, code: string): Promise<Snapshot> {
  return (await ok(await page.request.get(`/api/sessions/${code}`))).json();
}
async function fixture(count: number) {
  // The dedicated config requires this disposable filename before global setup
  // resets/seeds it; this client never uses the application's environment URL.
  expect(process.env.E2E_DATABASE_FILE).toBe("prisma/grouped-capacity-e2e.db");
  const db = new PrismaClient({ datasourceUrl: e2eDatabaseUrl });
  const prefix = `grouped-browser-${randomUUID()}`;
  const players = Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-p${index}`,
    name: `Capacity ${count} Player ${index + 1}`,
    gender: index % 2 ? "FEMALE" : "MALE",
    partnerPreference: index % 2 ? "FEMALE_FLEX" : "OPEN",
    pool: index < 12 ? "A" : "B",
  }));
  try {
    await db.club.create({ data: { id: prefix, name: `Capacity browser ${count}`, createdById: "account-user-admin-e2e", accountAccess: { create: { userId: "account-user-admin-e2e", role: "OWNER" } } } });
    await db.player.createMany({ data: players.map(player => ({ id: player.id, name: player.name, gender: player.gender, partnerPreference: player.partnerPreference })) });
    const session = await db.session.create({ data: {
      code: prefix, clubId: prefix, name: `Grouped Points Mixed ${count}`, status: "ACTIVE",
      type: "POINTS", mode: "MIXICANO", pairingMode: "MIXED", matchmakingStyle: "BALANCED", balanceMetric: "SESSION_POINTS",
      poolsEnabled: true, poolAssignmentsInitialized: true, poolAName: "Group A", poolBName: "Group B", autoQueueEnabled: true,
      courts: { create: [1, 2, 3].map(courtNumber => ({ courtNumber })) },
      players: { create: players.map(player => ({ gender: player.gender, partnerPreference: player.partnerPreference, pool: player.pool, playerId: player.id, isGuest: true })) },
    } });
    return { code: session.code, sessionId: session.id };
  } finally {
    await db.$disconnect();
  }
}
function legal(snapshot: Snapshot) {
  const players = new Map(snapshot.players.map(player => [player.userId, player]));
  const matches = [...snapshot.courts.flatMap(court => court.currentMatch ? [court.currentMatch] : []), ...(snapshot.queuedMatch ? [snapshot.queuedMatch] : [])];
  const selected = matches.flatMap(ids);
  expect(new Set(selected).size).toBe(selected.length); // Busy and queued seats never overlap.
  for (const match of matches) {
    const team1 = [match.team1User1, match.team1User2].map(player => players.get(player.id)!);
    const team2 = [match.team2User1, match.team2User2].map(player => players.get(player.id)!);
    expect([...team1, ...team2].every(player => !player.isPaused)).toBe(true);
    expect(team1.filter(player => player.gender === "FEMALE")).toHaveLength(1);
    expect(team2.filter(player => player.gender === "FEMALE")).toHaveLength(1);
    const groups = [...team1, ...team2].map(player => player.pool);
    if (match.courtGroupType === "CROSSOVER") {
      expect(team1.map(player => player.pool).sort()).toEqual(["A", "B"]);
      expect(team2.map(player => player.pool).sort()).toEqual(["A", "B"]);
    } else if (match.courtGroupType === "OPEN_OVERFLOW") {
      expect(team1[0].pool).toBe(team1[1].pool);
      expect(team2[0].pool).toBe(team2[1].pool);
      expect(team1[0].pool).not.toBe(team2[0].pool);
    } else {
      expect(new Set(groups).size).toBe(1);
    }
  }
}
async function visibleCourts(page: Page, snapshot: Snapshot) {
  for (const court of snapshot.courts) {
    const card = page.locator(".court-card").filter({ has: page.getByRole("heading", { name: `Court ${court.courtNumber}`, exact: true }) });
    await expect(card).toBeVisible();
    for (const player of court.currentMatch ? [court.currentMatch.team1User1, court.currentMatch.team1User2, court.currentMatch.team2User1, court.currentMatch.team2User2] : []) {
      await expect(card.getByRole("button", { name: `Player actions for ${player.name}`, exact: true })).toBeVisible();
    }
  }
}
for (const count of [22, 24]) {
  test(`${count} grouped Points/Mixed players persist three physical courts and clear the queue`, async ({ page }, testInfo) => {
    const { code } = await fixture(count);
    await signInAsAdmin(page);
    await page.goto(`/session/${code}`);
    const responsePromise = page.waitForResponse(response => response.url().endsWith(`/api/sessions/${code}/generate-match`) && response.request().method() === "POST");
    const started = Date.now();
    await page.getByRole("button", { name: /^Create matches/ }).click();
    const response = await responsePromise;
    const generation = await response.json();
    const localHttpRoundtripMs = Date.now() - started;
    expect(response.ok(), JSON.stringify(generation)).toBe(true);
    expect(generation.matches).toHaveLength(3);
    const latencyFile = testInfo.outputPath("local-http-latency.json");
    await writeFile(latencyFile, JSON.stringify({ environment: "local Next dev + synthetic SQLite; not cloud preview p95", playerCount: count, localHttpRoundtripMs, deferredQueueRecovery: generation.deferredQueueRecovery === true }, null, 2));
    await testInfo.attach("local-http-latency.json", { path: latencyFile, contentType: "application/json" });
    let before = await read(page, code);
    expect(before.courts.filter(court => court.currentMatch)).toHaveLength(3);
    expect(before.players).toHaveLength(count);
    legal(before);
    await visibleCourts(page, before);
    const assigned = before.courts.map(court => [court.id, court.currentMatch?.id]).sort();
    await page.reload();
    expect((await read(page, code)).courts.map(court => [court.id, court.currentMatch?.id]).sort()).toEqual(assigned);
    await visibleCourts(page, before);

    // This is the same authenticated recovery operation used by a deferred
    // response; no generation response or queue writer is mocked.
    if (!before.queuedMatch) {
      await ok(await page.request.get(`/api/sessions/${code}?recoverDeferredQueue=1`));
      await page.reload();
    }
    before = await read(page, code);
    expect(before.queuedMatch).not.toBeNull();
    legal(before);
    await page.getByRole("button", { name: "Next up options", exact: true }).click();
    await page.getByRole("button", { name: "Clear next match", exact: true }).click();
    const cleared = page.waitForResponse(result => result.url().endsWith(`/api/sessions/${code}/queue-match`) && result.request().method() === "DELETE");
    await page.getByRole("dialog", { name: "Clear next match?", exact: true }).getByRole("button", { name: "Clear next match", exact: true }).click();
    expect((await cleared).ok()).toBe(true);
    await expect(page.getByRole("button", { name: "Next up options", exact: true })).toHaveCount(0);
    await page.reload();
    expect((await read(page, code)).queuedMatch).toBeNull();
    expect((await read(page, code)).courts.map(court => [court.id, court.currentMatch?.id]).sort()).toEqual(assigned);

    if (count === 24) return;
    // Keep the other two physical courts busy while availability changes.
    await ok(await page.request.patch(`/api/sessions/${code}`, { data: { autoQueueEnabled: false, respectPlayerRest: true } }));
    const clearedCourt = before.courts[0];
    await ok(await page.request.post(`/api/sessions/${code}/generate-match`, { data: { courtId: clearedCourt.id, undoCurrentMatch: true } }));
    const busy = new Set(before.courts.slice(1).flatMap(court => ids(court.currentMatch!)));
    const waiting = before.players.filter(player => !before.courts.flatMap(court => ids(court.currentMatch!)).includes(player.userId));
    const pool = ["A", "B"].find(group => waiting.filter(player => player.pool === group && player.gender === "FEMALE").length >= 2 && waiting.filter(player => player.pool === group && player.gender === "MALE").length >= 2)!;
    expect(pool).toBeTruthy();
    const females = waiting.filter(player => player.pool === pool && player.gender === "FEMALE").slice(0, 2);
    const males = waiting.filter(player => player.pool === pool && player.gender === "MALE").slice(0, 2);
    const resumed = males[0];
    const skipping = males[1];
    const keep = new Set([...females, resumed, skipping].map(player => player.userId));
    for (const player of before.players.filter(player => !busy.has(player.userId) && !keep.has(player.userId))) {
      await ok(await page.request.post(`/api/sessions/${code}/pause-player`, { data: { playerId: player.userId, isPaused: true } }));
    }
    await page.goto(`/session/${code}?tab=players`);
    await page.getByRole("button", { name: `Pause ${resumed.user.name}`, exact: true }).click();
    await page.getByRole("button", { name: `Resume ${resumed.user.name}`, exact: true }).click();
    await expect(page.getByRole("button", { name: `Pause ${resumed.user.name}`, exact: true })).toBeVisible();
    await ok(await page.request.patch(`/api/sessions/${code}/players/${skipping.userId}/skip-next`, { data: { skipNextMatch: true } }));
    const guest = await (await ok(await page.request.post(`/api/sessions/${code}/guests`, { data: { name: "Capacity late arrival", gender: "MALE", pool } }))).json();
    const changed = await read(page, code);
    expect(changed.players).toHaveLength(23);
    expect(changed.players.find(player => player.userId === resumed.userId)?.isPaused).toBe(false);
    expect(changed.players.find(player => player.userId === skipping.userId)?.skipNextMatchAt).toBeTruthy();
    expect(changed.players.find(player => player.userId === guest.id)?.arrivalPriorityAt).toBeTruthy();
    await page.goto(`/session/${code}`);
    const refill = page.waitForResponse(result => result.url().endsWith(`/api/sessions/${code}/generate-match`) && result.request().method() === "POST");
    await page.getByRole("button", { name: /^Create matches/ }).click();
    const refillResponse = await refill;
    expect(refillResponse.ok(), await refillResponse.text()).toBe(true);
    const after = await read(page, code);
    const newMatch = after.courts.find(court => court.id === clearedCourt.id)!.currentMatch!;
    expect(ids(newMatch).sort()).toEqual([...females.map(player => player.userId), resumed.userId, guest.id].sort());
    expect(ids(newMatch)).not.toContain(skipping.userId);
    expect(ids(newMatch).some(id => busy.has(id))).toBe(false);
    expect(after.courts.filter(court => court.id !== clearedCourt.id).map(court => [court.id, court.currentMatch?.id]).sort()).toEqual(before.courts.slice(1).map(court => [court.id, court.currentMatch?.id]).sort());
    legal(after);
    await page.reload();
    await visibleCourts(page, after);
    expect((await read(page, code)).courts.find(court => court.id === clearedCourt.id)?.currentMatch?.id).toBe(newMatch.id);
  });
}
