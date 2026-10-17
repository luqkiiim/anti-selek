import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MatchStatus } from "@/types/enums";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/serverAudit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: vi.fn(async () => null), checkInvalidTargetRateLimit: vi.fn(async () => null), invalidTargetResponse: vi.fn(async () => Response.json({ error: "Unauthorized" }, { status: 403 })) }));

type PrismaInstance = typeof import("@/lib/prisma")["prisma"];
let prisma: PrismaInstance;
let POST: typeof import("./route")["POST"];
let finalize: typeof import("@/lib/matchCompletion")["finalizeMatchResult"];
const databaseFile = path.resolve(process.cwd(), "prisma", `rollback-series-${randomUUID()}.db`);
const mutableEnv = process.env as Record<string, string | undefined>;
const previousEnv = { DATABASE_URL: mutableEnv.DATABASE_URL, TURSO_DATABASE_URL: mutableEnv.TURSO_DATABASE_URL, TURSO_AUTH_TOKEN: mutableEnv.TURSO_AUTH_TOKEN, NODE_ENV: mutableEnv.NODE_ENV };
const games = [{ team1Score: 21, team2Score: 19 }, { team1Score: 1, team2Score: 21 }, { team1Score: 21, team2Score: 19 }];
const adminId = "rollback-admin";
async function removeDatabase() { await Promise.all(["", "-journal", "-shm", "-wal"].map(suffix => fs.rm(`${databaseFile}${suffix}`, { force: true }))); }

beforeAll(async () => {
  mutableEnv.DATABASE_URL = `file:${databaseFile}`;
  mutableEnv.TURSO_DATABASE_URL = "";
  mutableEnv.TURSO_AUTH_TOKEN = "";
  mutableEnv.NODE_ENV = "test";
  await removeDatabase();
  await fs.writeFile(databaseFile, "");
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { cwd: process.cwd(), env: process.env, stdio: "pipe" });
  vi.resetModules();
  (globalThis as { prisma?: PrismaInstance }).prisma = undefined;
  prisma = (await import("@/lib/prisma")).prisma;
  POST = (await import("./route")).POST;
  finalize = (await import("@/lib/matchCompletion")).finalizeMatchResult;
  await prisma.user.create({ data: { id: adminId, name: adminId, email: `${adminId}@example.test`, passwordHash: "test" } });
  mocks.auth.mockResolvedValue({ user: { id: adminId, isAdmin: false } });
});
afterAll(async () => {
  await prisma?.$disconnect();
  (globalThis as { prisma?: PrismaInstance }).prisma = undefined;
  for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete mutableEnv[key]; else mutableEnv[key] = value; }
  await removeDatabase();
});

async function createClubs(prefix: string) {
  const clubIds = [`${prefix}-a`, `${prefix}-b`];
  const playerIds = [`${prefix}-a1`, `${prefix}-a2`, `${prefix}-b1`, `${prefix}-b2`];
  await prisma.club.createMany({ data: clubIds.map(id => ({ id, name: id, createdById: adminId })) });
  await prisma.clubAccess.createMany({ data: clubIds.map(clubId => ({ clubId, userId: adminId, role: "ADMIN", status: "ACTIVE" })) });
  await prisma.player.createMany({ data: playerIds.map(id => ({ id, name: id, elo: 1000 })) });
  await prisma.clubMember.createMany({ data: playerIds.map((playerId, index) => ({ playerId, clubId: clubIds[index < 2 ? 0 : 1], elo: 1000 })) });
  return { clubIds, playerIds };
}
async function completeSession(id: string, context: Awaited<ReturnType<typeof createClubs>>, ratingMode: string, hostIndex = 0, scoringFormat = "BEST_OF_THREE", at = new Date("2026-10-01T10:00:00Z")) {
  const { clubIds, playerIds } = context;
  await prisma.session.create({ data: { id, code: id, name: id, clubId: clubIds[hostIndex], status: "ACTIVE", collaborationVersion: 2, ratingPolicyVersion: 2, ratingMode, scoringFormat, collabFormat: "INTERCLUB", type: "POINTS", sessionClubs: { create: clubIds.map((clubId, index) => ({ clubId, role: index === hostIndex ? "HOST" : "PARTNER", status: "ACCEPTED" })) }, courts: { create: { id: `${id}-court`, courtNumber: 1 } } } });
  await prisma.sessionPlayer.createMany({ data: playerIds.map((playerId, index) => ({ sessionId: id, playerId, profileClubId: clubIds[index < 2 ? 0 : 1], representingClubId: clubIds[index < 2 ? 0 : 1] })) });
  const match = await prisma.match.create({ data: { id: `${id}-match`, sessionId: id, courtId: `${id}-court`, status: "IN_PROGRESS", scoringFormat, team1Player1Id: playerIds[0], team1Player2Id: playerIds[1], team2Player1Id: playerIds[2], team2Player2Id: playerIds[3], team1ClubId: clubIds[0], team2ClubId: clubIds[1] }, include: { session: true, team1Player1: true, team1Player2: true, team2Player1: true, team2Player2: true } });
  await finalize({ match, expectedStatus: MatchStatus.IN_PROGRESS, finalTeam1Score: scoringFormat === "BEST_OF_THREE" ? 43 : 21, finalTeam2Score: scoringFormat === "BEST_OF_THREE" ? 59 : 19, finalGameScores: scoringFormat === "BEST_OF_THREE" ? games : undefined, completedAt: at });
  await prisma.session.update({ where: { id }, data: { status: "COMPLETED", endedAt: new Date(at.getTime() + 3_600_000) } });
  return id;
}
function rollback(code: string) { return POST(new Request(`http://localhost/api/sessions/${code}/rollback`, { method: "POST" }), { params: Promise.resolve({ code }) }); }
async function ratings(context: Awaited<ReturnType<typeof createClubs>>) { return prisma.clubMember.findMany({ where: { clubId: { in: context.clubIds } }, orderBy: [{ clubId: "asc" }, { playerId: "asc" }], select: { clubId: true, playerId: true, elo: true } }); }

describe("collaboration rollback rating preservation", () => {
  it("removes an unrated selected-profile series without a ledger and preserves later rated results", async () => {
    const context = await createClubs("unrated-target");
    const target = await completeSession("unrated-target-session", context, "UNRATED");
    const later = await completeSession("unrated-target-later", context, "RATED", 1, "BEST_OF_THREE", new Date("2026-10-01T10:30:00Z"));
    const before = await ratings(context);
    const laterMatch = await prisma.match.findUniqueOrThrow({ where: { id: `${later}-match` } });
    expect(await prisma.matchEloAdjustment.count({ where: { matchId: `${target}-match` } })).toBe(0);
    const response = await rollback(target);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, reversedPlayers: 0 });
    expect(await prisma.session.count({ where: { id: target } })).toBe(0);
    expect(await prisma.sessionPlayer.count({ where: { sessionId: target } })).toBe(0);
    expect(await ratings(context)).toEqual(before);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: `${later}-match` } })).toEqual(laterMatch);
    expect(await prisma.matchEloAdjustment.count({ where: { matchId: `${later}-match` } })).toBe(4);
  });
  it.each(["SINGLE_GAME", "BEST_OF_THREE"])("blocks rated rollback when a later visiting-host %s result used the affected ratings", async scoringFormat => {
    const context = await createClubs(`rated-target-${scoringFormat}`);
    const target = await completeSession(`rated-target-${scoringFormat}-session`, context, "RATED");
    // This later result is before target endedAt: the comparison must use actual result time.
    const later = await completeSession(`rated-target-${scoringFormat}-later`, context, "RATED", 1, scoringFormat, new Date("2026-10-01T10:30:00Z"));
    const targetMatch = await prisma.match.findUniqueOrThrow({ where: { id: `${target}-match` } });
    expect(targetMatch).toMatchObject({ winnerTeam: 1, team1Score: 43, team2Score: 59, team1EloChange: 16, team2EloChange: -16 });
    const before = await ratings(context);
    const response = await rollback(target);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "Later rated results use these club ratings. Roll back those tournaments first." });
    expect(await ratings(context)).toEqual(before);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: `${target}-match` } })).toEqual(targetMatch);
    expect(await prisma.session.count({ where: { id: { in: [target, later] } } })).toBe(2);
    expect(await prisma.matchEloAdjustment.count({ where: { matchId: { in: [`${target}-match`, `${later}-match`] } } })).toBe(8);
  });
  it("reverses stored neutral-margin BO3 deltas once while preserving a later unrated series", async () => {
    const context = await createClubs("rated-before-unrated");
    const target = await completeSession("rated-before-unrated-session", context, "RATED");
    const later = await completeSession("rated-before-unrated-later", context, "UNRATED", 1, "BEST_OF_THREE", new Date("2026-10-01T10:30:00Z"));
    const laterMatch = await prisma.match.findUniqueOrThrow({ where: { id: `${later}-match` } });
    const response = await rollback(target);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reversedPlayers: 4 });
    expect((await ratings(context)).every(member => member.elo === 1000)).toBe(true);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: `${later}-match` } })).toEqual(laterMatch);
    expect(laterMatch).toMatchObject({ team1EloChange: null, team2EloChange: null, winnerTeam: 1 });
  });
  it("still blocks a rated selected-profile rollback with missing ledger rows", async () => {
    const context = await createClubs("rated-missing-ledger");
    const target = await completeSession("rated-missing-ledger-session", context, "RATED");
    const before = await ratings(context);
    await prisma.matchEloAdjustment.deleteMany({ where: { matchId: `${target}-match`, playerId: context.playerIds[0] } });
    const response = await rollback(target);
    expect(response.status).toBe(409);
    expect(await ratings(context)).toEqual(before);
    expect(await prisma.session.count({ where: { id: target } })).toBe(1);
  });
});
