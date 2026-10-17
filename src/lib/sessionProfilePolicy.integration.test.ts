import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { claimClubPlayer, clubOwnershipTransaction, removeClubPlayerOwnership } from "./clubPlayerOwnership";
import { admissionTransaction } from "./clubAdmissions";
import { finalizeMatchResultInTransaction, undoCompletedMatchResultInTransaction, correctCompletedMatchScoreInTransaction } from "./matchCompletion";
import { assertSessionMutationActor, assertSessionProfileContextsUnambiguous } from "./sessionProfileIdentity";
import { POST as reset } from "@/app/api/sessions/[code]/reset/route";
import { POST as copy } from "@/app/api/sessions/[code]/create-real/route";
import { POST as pause } from "@/app/api/sessions/[code]/pause-player/route";
import { PATCH as skip } from "@/app/api/sessions/[code]/players/[userId]/skip-next/route";
import { POST as create } from "@/app/api/sessions/route";
import { POST as generate } from "@/app/api/sessions/[code]/generate-match/route";
import { withSessionProfileRatings } from "./sessionProfileIdentity";

const state = vi.hoisted(() => ({ db: null as unknown as PrismaClient, auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ get prisma() { return state.db; } }));
vi.mock("@/lib/auth", () => ({ auth: state.auth }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: vi.fn(async () => null), checkInvalidTargetRateLimit: vi.fn(async () => null), invalidTargetResponse: vi.fn(async () => Response.json({ error: "Unauthorized" }, { status: 403 })) }));
vi.mock("@/app/api/sessions/[code]/queue-match/shared", () => ({ tryRebuildQueuedMatchForSessionId: vi.fn(async () => null) }));

const dir = mkdtempSync(path.join(tmpdir(), "session-local-profile-"));
const baseline = path.join(dir, "baseline.db");
let db: PrismaClient;
let index = 0;
const tx = <T>(op: Parameters<typeof admissionTransaction<T>>[1]) => admissionTransaction(db, op);
const request = (action: string, body = {}) => new Request(`http://localhost/api/sessions/S/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ code: "S" }) };
const matchInclude = { session: true, team1Player1: true, team1Player2: true, team2Player1: true, team2Player2: true };

beforeAll(() => {
  const sqlite = new DatabaseSync(baseline, { enableDoubleQuotedStringLiterals: true });
  for (const migration of readdirSync("prisma/migrations").sort()) if (migration !== "migration_lock.toml") sqlite.exec(readFileSync(path.join("prisma/migrations", migration, "migration.sql"), "utf8"));
  sqlite.close();
});
beforeEach(async () => {
  await db?.$disconnect();
  const file = path.join(dir, `${index++}.db`);
  copyFileSync(baseline, file);
  state.db = db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  state.auth.mockResolvedValue({ user: { id: "admin", isAdmin: false } });
  await db.user.createMany({ data: ["admin", "owner", "next-owner"].map(id => ({ id, name: id, email: `${id}@test.invalid`, passwordHash: "test" })) });
  await db.club.createMany({ data: ["a", "b"].map(id => ({ id, name: id, createdById: "admin" })) });
  await db.clubAccess.createMany({ data: ["a", "b"].map(clubId => ({ clubId, userId: "admin", role: "ADMIN" })) });
  await db.player.createMany({ data: ["p1", "p2", "p3", "guest"].map(id => ({ id, name: id, elo: 1000, gender: "MALE" })) });
  await db.clubMember.createMany({ data: [{ clubId: "a", playerId: "p1", elo: 1600 }, { clubId: "b", playerId: "p1", elo: 800 }, { clubId: "a", playerId: "p2", elo: 1400 }, { clubId: "b", playerId: "p3", elo: 800 }] });
  for (const clubId of ["a", "b"]) await clubOwnershipTransaction(db, t => claimClubPlayer(t, { clubId, playerId: "p1", userId: "owner", actorUserId: "admin" }));
});
afterAll(async () => { await db?.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

async function session({ policy = 2, isTest = false, status = "ACTIVE" }: { policy?: number; isTest?: boolean; status?: string } = {}) {
  await db.session.create({ data: { id: "s", code: "S", name: "Session", clubId: "a", ratingPolicyVersion: policy, status, isTest, balanceMetric: "ELO", courts: { create: { id: "court", courtNumber: 1 } }, sessionClubs: { create: [{ clubId: "a", role: "HOST", status: "ACCEPTED", requestedById: "admin" }, { clubId: "b", role: "PARTNER", status: "ACCEPTED", requestedById: "admin" }] } } });
  await db.sessionPlayer.createMany({ data: [{ sessionId: "s", playerId: "p1", profileClubId: "b", participantAccountId: "owner" }, { sessionId: "s", playerId: "p2", profileClubId: "a" }, { sessionId: "s", playerId: "p3", profileClubId: "b" }, { sessionId: "s", playerId: "guest", isGuest: true }] });
}
async function match(id = "m1", completedAt = new Date("2026-10-12T01:00:00Z")) {
  await db.match.create({ data: { id, sessionId: "s", courtId: "court", status: "IN_PROGRESS", team1Player1Id: "p1", team1Player2Id: "p2", team2Player1Id: "p3", team2Player2Id: "guest", createdAt: new Date(completedAt.getTime() - 1000) } });
  await db.court.update({ where: { id: "court" }, data: { currentMatchId: id } });
  const selected = await db.match.findUniqueOrThrow({ where: { id }, include: matchInclude });
  await tx(t => finalizeMatchResultInTransaction(t, { match: selected, expectedStatus: "IN_PROGRESS" as never, finalTeam1Score: 21, finalTeam2Score: 15, completedAt }));
}
async function ratings() {
  return (await db.clubMember.findMany({ orderBy: [{ clubId: "asc" }, { playerId: "asc" }], select: { clubId: true, playerId: true, elo: true } })).map(m => [m.clubId, m.playerId, m.elo]);
}

it("uses the selected partner rating with guest math, and undo preserves every context and other club rating", async () => {
  await session(); const seats = await db.sessionPlayer.findMany({ orderBy: { playerId: "asc" } }); const before = await ratings();
  const displayed = await withSessionProfileRatings(db, { id: "s", clubId: "a", ratingPolicyVersion: 2 }, await db.sessionPlayer.findMany({ include: { player: true } }));
  expect(displayed.find(p => p.playerId === "p1")?.player).toMatchObject({ elo: 800, isClaimed: true });
  await match();
  expect(await ratings()).toEqual([["a", "p1", 1600], ["a", "p2", 1407], ["b", "p1", 807], ["b", "p3", 793]]);
  expect(await db.matchEloAdjustment.findMany({ orderBy: [{ clubId: "asc" }, { playerId: "asc" }], select: { clubId: true, playerId: true, delta: true } })).toEqual([{ clubId: "a", playerId: "p2", delta: 7 }, { clubId: "b", playerId: "p1", delta: 7 }, { clubId: "b", playerId: "p3", delta: -7 }]);
  expect((await db.player.findMany()).every(p => p.elo === 1000)).toBe(true);
  await tx(t => undoCompletedMatchResultInTransaction(t, { matchId: "m1", actorUserId: "admin" }));
  expect(await ratings()).toEqual(before);
  const after = await db.sessionPlayer.findMany({ orderBy: { playerId: "asc" } });
  expect(after.map(p => [p.playerId, p.profileClubId, p.participantAccountId])).toEqual(seats.map(p => [p.playerId, p.profileClubId, p.participantAccountId]));
  expect(await db.session.findUnique({ where: { id: "s" } })).toMatchObject({ ratingPolicyVersion: 2 });
});

it("replays corrections from selected ledgers, then reset restores those ratings without altering profile snapshots", async () => {
  await session(); const before = await ratings();
  await match(); await match("m2", new Date("2026-10-12T01:10:00Z"));
  const corrected = await tx(t => correctCompletedMatchScoreInTransaction(t, { matchId: "m1", finalTeam1Score: 15, finalTeam2Score: 21, actorUserId: "admin" }));
  expect(corrected.replayedMatchIds).toEqual(["m1", "m2"]);
  expect(await db.matchEloAdjustment.count()).toBe(6);
  expect((await ratings())[0]).toEqual(["a", "p1", 1600]);
  const response = await reset(request("reset"), params);
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
  expect(await ratings()).toEqual(before);
  expect(await db.session.findUnique({ where: { id: "s" } })).toMatchObject({ ratingPolicyVersion: 2, status: "WAITING" });
  expect(await db.sessionPlayer.findUnique({ where: { sessionId_playerId: { sessionId: "s", playerId: "p1" } } })).toMatchObject({ profileClubId: "b", participantAccountId: "owner" });
});

it("rejects missing v2 ledgers atomically instead of resetting through a global fallback", async () => {
  await session(); await match(); await db.matchEloAdjustment.deleteMany({ where: { playerId: "p1" } });
  const before = await ratings(); const response = await reset(request("reset"), params);
  expect(response.status).toBe(409); expect(await ratings()).toEqual(before); expect(await db.match.count()).toBe(1);
});

it("copies results with source policy and old account snapshot after ownership changes, but a fresh roster uses the current owner and v2", async () => {
  await session({ policy: 1, isTest: true }); await match(); await db.session.update({ where: { id: "s" }, data: { status: "COMPLETED" } });
  await clubOwnershipTransaction(db, t => removeClubPlayerOwnership(t, { clubId: "b", playerId: "p1", actorUserId: "admin" }));
  await clubOwnershipTransaction(db, t => removeClubPlayerOwnership(t, { clubId: "a", playerId: "p1", actorUserId: "admin" }));
  await clubOwnershipTransaction(db, t => claimClubPlayer(t, { clubId: "b", playerId: "p1", userId: "next-owner", actorUserId: "admin" }));
  const copied = await copy(request("create-real", { includeResults: true }), params);
  expect(copied.status, JSON.stringify(await copied.clone().json())).toBe(200);
  const result = await copied.json();
  expect(await db.session.findUnique({ where: { code: result.code } })).toMatchObject({ ratingPolicyVersion: 1 });
  expect(await db.sessionPlayer.findFirst({ where: { sessionId: result.id, playerId: "p1" } })).toMatchObject({ profileClubId: "b", participantAccountId: "owner" });
  const fresh = await copy(request("create-real", { includeResults: false }), params);
  expect(fresh.status, JSON.stringify(await fresh.clone().json())).toBe(200);
  const roster = await fresh.json();
  expect(await db.session.findUnique({ where: { code: roster.code } })).toMatchObject({ ratingPolicyVersion: 2, status: "WAITING" });
  expect(await db.sessionPlayer.findFirst({ where: { sessionId: roster.id, playerId: "p1" } })).toMatchObject({ profileClubId: "b", participantAccountId: "next-owner" });
});

it("preserves v2 result-copy snapshots when later ownership differs, and blocks a fresh copy with duplicate current accounts", async () => {
  await session({ isTest: true }); await match();
  await db.session.update({ where: { id: "s" }, data: { status: "COMPLETED" } });
  for (const clubId of ["a", "b"]) await clubOwnershipTransaction(db, t => removeClubPlayerOwnership(t, { clubId, playerId: "p1", actorUserId: "admin" }));
  await clubOwnershipTransaction(db, t => claimClubPlayer(t, { clubId: "b", playerId: "p1", userId: "next-owner", actorUserId: "admin" }));
  await clubOwnershipTransaction(db, t => claimClubPlayer(t, { clubId: "a", playerId: "p2", userId: "next-owner", actorUserId: "admin" }));
  const response = await copy(request("create-real", { includeResults: true }), params);
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
  const copied = await response.json();
  expect(copied.ratingPolicyVersion).toBe(2);
  const copiedSeats = await db.sessionPlayer.findMany({ where: { sessionId: copied.id }, orderBy: { playerId: "asc" } });
  expect(copiedSeats.filter(p => !p.isGuest).map(p => [p.playerId, p.profileClubId, p.participantAccountId])).toEqual([["p1", "b", "owner"], ["p2", "a", null], ["p3", "b", null]]);
  expect(await db.matchEloAdjustment.count({ where: { match: { sessionId: copied.id } } })).toBe(3);
  const fresh = await copy(request("create-real", { includeResults: false }), params);
  expect(fresh.status).toBe(409);
  expect(await db.session.count({ where: { sourceSessionId: "s" } })).toBe(1);
});

it("reserves the writer and rejects revoked local self and operator authority before mutation", async () => {
  await session();
  state.auth.mockResolvedValue({ user: { id: "owner", isAdmin: false } });
  const original = db.$transaction.bind(db);
  const transaction = vi.spyOn(db, "$transaction").mockImplementation(async (...args: unknown[]) => {
    await db.clubAccess.update({ where: { clubId_userId: { clubId: "b", userId: "owner" } }, data: { status: "REVOKED" } });
    return original(...args as Parameters<typeof original>);
  });
  const response = await pause(request("pause-player", { playerId: "p1", isPaused: true }), params);
  expect(response.status).toBe(409); expect((await db.sessionPlayer.findFirstOrThrow({ where: { playerId: "p1" } })).isPaused).toBe(false);
  transaction.mockRestore();
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "b", userId: "owner" } }, data: { status: "ACTIVE" } });
  const skipWriter = vi.spyOn(db, "$transaction").mockImplementation(async (...args: unknown[]) => {
    await db.clubAccess.update({ where: { clubId_userId: { clubId: "b", userId: "owner" } }, data: { status: "REVOKED" } });
    return original(...args as Parameters<typeof original>);
  });
  const skipped = await skip(new Request("http://localhost/api/sessions/S/players/p1/skip-next", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ skipNextMatch: true }) }), { params: Promise.resolve({ code: "S", userId: "p1" }) });
  expect(skipped.status).toBe(409); expect((await db.sessionPlayer.findFirstOrThrow({ where: { playerId: "p1" } })).skipNextMatchAt).toBeNull();
  skipWriter.mockRestore();
  await tx(t => expect(assertSessionMutationActor(t, { session: { id: "s", clubId: "a" }, userId: "owner", playerId: "p1" })).rejects.toThrow("access changed"));
  await db.clubAccess.updateMany({ where: { userId: "admin" }, data: { status: "REVOKED" } });
  await tx(t => expect(assertSessionMutationActor(t, { session: { id: "s", clubId: "a" }, userId: "admin" })).rejects.toThrow("access changed"));
});

it("revalidates operator access under the writer before creating a manual court assignment", async () => {
  await session();
  const original = db.$transaction.bind(db);
  const writer = vi.spyOn(db, "$transaction").mockImplementation(async (...args: unknown[]) => {
    await db.clubAccess.updateMany({ where: { userId: "admin" }, data: { status: "REVOKED" } });
    return original(...args as Parameters<typeof original>);
  });
  const response = await generate(request("generate-match", { courtId: "court", manualTeams: { team1: ["p1", "p2"], team2: ["p3", "guest"] } }), params);
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(409);
  expect(await db.match.count()).toBe(0); expect((await db.court.findUniqueOrThrow({ where: { id: "court" } })).currentMatchId).toBeNull();
  writer.mockRestore();
});

it("blocks ambiguous legacy contexts and defers visiting profiles until invitation acceptance", async () => {
  await session({ policy: 1, status: "WAITING" });
  // Legacy null contexts can remain readable, but cannot be silently assigned.
  await db.$executeRaw`DROP TRIGGER IF EXISTS SessionPlayer_profile_update_guard`;
  await db.sessionPlayer.update({ where: { sessionId_playerId: { sessionId: "s", playerId: "p1" } }, data: { profileClubId: null, participantAccountId: null } });
  await tx(t => expect(assertSessionProfileContextsUnambiguous(t, { id: "s", clubId: "a", ratingPolicyVersion: 1 })).rejects.toThrow("ambiguous"));
  const created = await create(new Request("http://localhost/api/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Pending partner", clubId: "a", partnerClubId: "b", playerIds: ["p1", "p2", "p3"], playerConfigs: [{ playerId: "p1", profileClubId: "b" }, { playerId: "p2", profileClubId: "a" }, { playerId: "p3", profileClubId: "b" }], guestNames: ["Guest"], courtCount: 1 }) }));
  expect(created.status, JSON.stringify(await created.clone().json())).toBe(403);
  expect(await created.json()).toMatchObject({ error: "Each club adds its own players after accepting the invitation" });
  const hostOnly = await create(new Request("http://localhost/api/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Pending partner", clubId: "a", partnerClubId: "b", playerIds: ["p2"], courtCount: 1 }) }));
  expect(hostOnly.status, JSON.stringify(await hostOnly.clone().json())).toBe(200);
  const body = await hostOnly.json(); expect(body.ratingPolicyVersion).toBe(2); expect(body.collaborationVersion).toBe(2); expect(body.status).toBe("WAITING");
  expect(await db.sessionPlayer.findFirst({ where: { sessionId: body.id, playerId: "p2" } })).toMatchObject({ profileClubId: "a", representingClubId: "a" });
  expect(await db.sessionPlayer.count({ where: { sessionId: body.id } })).toBe(1);
  expect(await db.sessionClub.findFirst({ where: { sessionId: body.id, clubId: "b" } })).toMatchObject({ status: "PENDING" });
});

it("allows an explicit active local pair only in genuinely clubless v1 seats, with snapshot, access and duplicate guards intact", async () => {
  await db.session.createMany({ data: [{ id: "legacy", code: "L", name: "Legacy", ratingPolicyVersion: 1 }, { id: "v2-clubless", code: "V2", name: "New", ratingPolicyVersion: 2 }, { id: "linked-v1", code: "LINK", name: "Linked", ratingPolicyVersion: 1, clubId: "a" }] });
  const selected = { playerId: "p1", profileClubId: "b", participantAccountId: "owner" };
  await expect(db.sessionPlayer.create({ data: { sessionId: "legacy", ...selected } })).resolves.toMatchObject(selected);
  await expect(db.sessionPlayer.create({ data: { sessionId: "v2-clubless", ...selected } })).rejects.toThrow();
  await expect(db.sessionPlayer.create({ data: { sessionId: "linked-v1", ...selected } })).rejects.toThrow();
  await clubOwnershipTransaction(db, t => removeClubPlayerOwnership(t, { clubId: "a", playerId: "p1", actorUserId: "admin" }));
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "a", userId: "owner" } }, data: { status: "ACTIVE" } });
  await clubOwnershipTransaction(db, t => claimClubPlayer(t, { clubId: "a", playerId: "p2", userId: "owner", actorUserId: "admin" }));
  await expect(db.sessionPlayer.create({ data: { sessionId: "legacy", playerId: "p2", profileClubId: "a", participantAccountId: "owner" } })).rejects.toThrow();
  await clubOwnershipTransaction(db, t => removeClubPlayerOwnership(t, { clubId: "a", playerId: "p2", actorUserId: "admin" }));
  await db.session.create({ data: { id: "revoke", code: "REV", name: "Revoked", ratingPolicyVersion: 1 } });
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "b", userId: "owner" } }, data: { status: "REVOKED" } });
  await expect(db.sessionPlayer.create({ data: { sessionId: "revoke", ...selected } })).rejects.toThrow();
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "b", userId: "owner" } }, data: { status: "ACTIVE" } });
  await db.sessionPlayer.create({ data: { sessionId: "legacy", playerId: "p3", profileClubId: "b" } });
  await clubOwnershipTransaction(db, t => claimClubPlayer(t, { clubId: "b", playerId: "p3", userId: "next-owner", actorUserId: "admin" }));
  expect(await db.sessionPlayer.findUnique({ where: { sessionId_playerId: { sessionId: "legacy", playerId: "p3" } } })).toMatchObject({ profileClubId: "b", participantAccountId: "next-owner" });
  expect(await db.matchEloAdjustment.count()).toBe(0);
});
