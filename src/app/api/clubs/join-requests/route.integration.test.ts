import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { mkdtempSync, copyFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { admissionTransaction, reviewClubAdmission, submitClubAdmission } from "@/lib/clubAdmissions";
import { getOwnedClubPlayer, resolveOwnedSessionPlayer } from "@/lib/playerIdentity";
let db: PrismaClient;
let actor: { id: string; isAdmin?: boolean; isQuickAccess?: boolean; guestPlayerId?: string } | null;
vi.mock("@/lib/prisma", () => ({ get prisma() { return db; } }));
vi.mock("@/lib/auth", () => ({ auth: async () => actor ? { user: actor } : null }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: async () => null }));
import { POST, GET as discovery } from "./route";
import { GET, PATCH as settings } from "../[id]/join-requests/route";
import { PATCH as review } from "../[id]/join-requests/[requestId]/route";
const dir = mkdtempSync(path.join(tmpdir(), "account-player-admissions-"));
const baseline = path.join(dir, "baseline.db");
let count = 0;
const context = { params: Promise.resolve({ id: "club-a" }) };
const request = (body: unknown) => new Request("http://localhost/api/clubs/join-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const newInput = { clubId: "club-a", kind: "NEW_PLAYER" as const, proposedPlayerName: "New Player", proposedGender: "FEMALE" };
const submit = (input: Parameters<typeof submitClubAdmission>[1] = { clubId: "club-a", requesterUserId: "account-member", kind: "EXISTING_PLAYER" as const, requestedPlayerId: "historical-player" }) => admissionTransaction(db, tx => submitClubAdmission(tx, input));
const approve = (requestId: string, overrides: Partial<Parameters<typeof reviewClubAdmission>[1]> = {}) => admissionTransaction(db, tx => reviewClubAdmission(tx, { clubId: "club-a", requestId, reviewerUserId: "account-owner", action: "APPROVE", ...overrides }));
beforeAll(async () => {
  const url = "file:" + baseline.replaceAll("\\", "/");
  // Prisma's Windows SQLite engine cannot initialize a database that does not exist yet.
  writeFileSync(baseline, "");
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}, 60000);
beforeEach(async () => {
  await db?.$disconnect();
  const file = path.join(dir, `case-${count++}.db`); copyFileSync(baseline, file);
  db = new PrismaClient({ datasources: { db: { url: "file:" + file.replaceAll("\\", "/") } } });
  await db.user.createMany({ data: [
    { id: "account-owner", name: "Owner", email: "owner@example.com", passwordHash: "test", gender: "MALE" },
    { id: "account-member", name: "Member", email: "member@example.com", passwordHash: "test", gender: "FEMALE" },
    { id: "account-other", name: "Other", email: "other@example.com", passwordHash: "test", gender: "MALE" },
  ] });
  await db.club.createMany({ data: [{ id: "club-a", name: "Club A", createdById: "account-owner", allowJoinRequests: true }, { id: "club-b", name: "Club B", createdById: "account-owner", allowJoinRequests: true }] });
  await db.clubAccess.createMany({ data: [{ clubId: "club-a", userId: "account-owner", role: "OWNER" }, { clubId: "club-b", userId: "account-owner", role: "OWNER" }] });
  await db.player.create({ data: { id: "historical-player", name: "Known Name", gender: "FEMALE", avatarKey: "historic-avatar" } });
  await db.clubMember.create({ data: { id: "historic-membership", clubId: "club-a", playerId: "historical-player", elo: 1455, preferredPool: "B", achievementPreferencesJson: '{"showcase":["win"]}' } });
  actor = { id: "account-owner" };
});
afterAll(async () => {
  await db?.$disconnect();
  if (!path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unsafe fixture cleanup path");
  rmSync(dir, { recursive: true, force: true });
});
it("requires an account and blocks quick guest writes", async () => {
  actor = null; expect((await POST(request(newInput))).status).toBe(401);
  actor = { id: "guest:historical-player", guestPlayerId: "historical-player", isQuickAccess: true };
  expect((await POST(request(newInput))).status).toBe(403);
  expect(await db.player.count()).toBe(1);
});
it("creates an account admission without creating sporting identity until approval", async () => {
  actor = { id: "account-member" };
  const first = await (await POST(request(newInput))).json();
  await POST(request(newInput));
  expect(await db.clubAdmissionRequest.count()).toBe(1);
  expect(await db.player.count()).toBe(1);
  expect(await db.clubMember.count()).toBe(1);
  actor = { id: "account-owner" };
  const ctx = { params: Promise.resolve({ id: "club-a", requestId: first.id }) };
  const approved = await (await review(request({ action: "APPROVE" }), ctx)).json();
  expect(approved.approvedPlayerId).not.toBe("account-member");
  expect(await db.player.findUnique({ where: { id: approved.approvedPlayerId } })).toMatchObject({ ownerUserId: "account-member" });
  expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "account-member" } } })).toMatchObject({ role: "MEMBER" });
  expect((await review(request({ action: "APPROVE" }), ctx)).status).toBe(200);
  expect(await db.player.count()).toBe(2);
});
it("lets an admin retarget a request to another Player without altering the requested Player", async () => {
  await db.player.create({ data: { id: "retarget-player", name: "Retarget Player" } });
  await db.clubMember.create({ data: { id: "retarget-membership", clubId: "club-a", playerId: "retarget-player", elo: 1325 } });
  const entry = await submit();
  actor = { id: "account-owner" };
  const ctx = { params: Promise.resolve({ id: "club-a", requestId: entry.id! }) };
  const result = await (await review(request({ action: "APPROVE", playerId: "retarget-player" }), ctx)).json();
  expect(result).toMatchObject({ requestedPlayerId: "historical-player", approvedPlayerId: "retarget-player", decision: "CONNECT_EXISTING" });
  expect(await db.player.findUnique({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: null, name: "Known Name" });
  expect(await db.clubMember.findUnique({ where: { id: "historic-membership" } })).toMatchObject({ playerId: "historical-player", elo: 1455 });
  expect(await db.player.findUnique({ where: { id: "retarget-player" } })).toMatchObject({ ownerUserId: "account-member", name: "Retarget Player" });
});
it("re-admits an archived owned Player by restoring the same roster row", async () => {
  const archivedAt = new Date("2025-01-02T03:04:05.000Z");
  await db.player.update({ where: { id: "historical-player" }, data: { ownerUserId: "account-member" } });
  await db.clubMember.update({ where: { id: "historic-membership" }, data: { archivedAt } });
  await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-member", role: "ADMIN", status: "REVOKED" } });
  const entry = await submit({ clubId: "club-a", requesterUserId: "account-member", kind: "OWNED_PLAYER", requestedPlayerId: "historical-player" });
  const result = await approve(entry.id!);
  expect(result).toMatchObject({ approvedPlayerId: "historical-player", decision: "REUSE_OWNED" });
  expect(await db.clubMember.count({ where: { clubId: "club-a", playerId: "historical-player" } })).toBe(1);
  expect(await db.clubMember.findUnique({ where: { id: "historic-membership" } })).toMatchObject({ id: "historic-membership", playerId: "historical-player", archivedAt: null, elo: 1455, preferredPool: "B", achievementPreferencesJson: '{"showcase":["win"]}' });
  expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "account-member" } } })).toMatchObject({ role: "MEMBER", status: "ACTIVE" });
});
it("allows an admin to approve an existing Player request as a new Player", async () => {
  const entry = await submit();
  actor = { id: "account-owner" };
  const ctx = { params: Promise.resolve({ id: "club-a", requestId: entry.id! }) };
  const result = await (await review(request({ action: "APPROVE", asNew: true }), ctx)).json();
  expect(result).toMatchObject({ requestedPlayerId: "historical-player", decision: "CREATE_NEW" });
  expect(result.approvedPlayerId).not.toBe("historical-player");
  expect(await db.player.findUnique({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: null, name: "Known Name" });
  expect(await db.player.findUnique({ where: { id: result.approvedPlayerId } })).toMatchObject({ ownerUserId: "account-member", name: "Member", gender: "FEMALE" });
  expect(await db.clubMember.findUnique({ where: { clubId_playerId: { clubId: "club-a", playerId: "historical-player" } } })).toMatchObject({ elo: 1455 });
});
it("requires approval to restore an archived roster even when account access remains active", async () => {
  await db.player.update({ where: { id: "historical-player" }, data: { ownerUserId: "account-member" } });
  const archivedAt = new Date("2025-01-02T03:04:05.000Z");
  await db.clubMember.update({ where: { id: "historic-membership" }, data: { archivedAt } });
  await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-member", role: "MEMBER" } });
  actor = { id: "account-member" };
  const data = await (await discovery(new Request("http://localhost/api/clubs/join-requests?clubId=club-a"))).json();
  expect(data.membership).toBeNull();
  expect(data.ownedPlayers).toContainEqual({ id: "historical-player", name: "Known Name" });
  const entry = await submit({ clubId: "club-a", requesterUserId: "account-member", kind: "OWNED_PLAYER", requestedPlayerId: "historical-player" });
  expect(entry.status).toBe("PENDING");
  expect(await db.clubMember.findUnique({ where: { id: "historic-membership" } })).toMatchObject({ archivedAt });
  await approve(entry.id!);
  expect(await db.clubMember.findUnique({ where: { id: "historic-membership" } })).toMatchObject({ archivedAt: null, playerId: "historical-player", elo: 1455 });
  expect(await db.player.count()).toBe(1);
});
it("links a historical player without changing any match, session or rating history or importing legacy roles", async () => {
  await db.player.createMany({ data: ["p2", "p3", "p4"].map(id => ({ id, name: id })) });
  const originalPlayerUpdatedAt = (await db.player.findUniqueOrThrow({ where: { id: "historical-player" }, select: { updatedAt: true } })).updatedAt;
  const session = await db.session.create({ data: { code: "HISTORY", clubId: "club-a", name: "Recorded session", status: "COMPLETED", achievementEligibilityJson: '{"historical-player":true}' } });
  const court = await db.court.create({ data: { sessionId: session.id, courtNumber: 1 } });
  const participation = await db.sessionPlayer.create({ data: { sessionId: session.id, playerId: "historical-player", matchesPlayed: 19, sessionPoints: 41, lastPartnerPlayerId: "p2" } });
  const match = await db.match.create({ data: { sessionId: session.id, courtId: court.id, team1Player1Id: "historical-player", team1Player2Id: "p2", team2Player1Id: "p3", team2Player2Id: "p4", status: "COMPLETED", winnerTeam: 1, team1Score: 21, team2Score: 18 } });
  await db.$executeRaw`UPDATE CommunityMember SET role='ADMIN' WHERE id='historic-membership'`;
  const entry = await submit(); const result = await approve(entry.id!);
  expect(result).toMatchObject({ approvedPlayerId: "historical-player", status: "APPROVED" });
  expect(await db.match.findUnique({ where: { id: match.id } })).toEqual(match);
  expect(await db.sessionPlayer.findUnique({ where: { id: participation.id } })).toEqual(participation);
  expect(await db.session.findUnique({ where: { id: session.id } })).toEqual(session);
  expect(await db.clubMember.findUnique({ where: { id: "historic-membership" } })).toMatchObject({ playerId: "historical-player", ownerUserId: "account-member", elo: 1455, achievementPreferencesJson: '{"showcase":["win"]}' });
  expect(await db.player.findUnique({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: "account-member", name: "Known Name", avatarKey: "historic-avatar", updatedAt: originalPlayerUpdatedAt });
  expect(await db.user.findUnique({ where: { id: "account-member" } })).toMatchObject({ name: "Member", avatarKey: null });
  expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "account-member" } } })).toMatchObject({ role: "MEMBER" });
  expect(await db.clubAdmissionEvent.count({ where: { admissionRequestId: entry.id } })).toBe(2);
});
it("does not change existing account role on claim", async () => {
  await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-member", role: "STAFF" } });
  const entry = await submit(); await approve(entry.id!);
  expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "account-member" } } })).toMatchObject({ role: "STAFF" });
});
it("reactivates a revoked admin only as a regular member after approval", async () => {
  await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-member", role: "ADMIN", status: "REVOKED" } });
  const entry = await submit();
  await approve(entry.id!);
  expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "account-member" } } })).toMatchObject({ role: "MEMBER", status: "ACTIVE" });
});
it("retains rejected attempts and creates a new attempt instead of reopening a reviewed row", async () => {
  const entry = await submit();
  await approve(entry.id!, { action: "REJECT", reason: "Cannot verify identity" });
  const next = await submit(); expect(next.id).not.toBe(entry.id);
  expect(await db.clubAdmissionRequest.findUnique({ where: { id: entry.id } })).toMatchObject({ status: "REJECTED", revision: 1 });
  expect(await db.clubAdmissionEvent.count()).toBe(3);
});
it("supports cancellation and idempotent retries after approval using a request key", async () => {
  const input = { ...newInput, requesterUserId: "account-member", idempotencyKey: "stable-request" };
  const entry = await admissionTransaction(db, tx => submitClubAdmission(tx, input));
  await approve(entry.id!, { action: "CANCEL", reviewerUserId: "account-member" });
  const retry = await admissionTransaction(db, tx => submitClubAdmission(tx, input));
  expect(retry).toMatchObject({ id: entry.id, status: "CANCELLED" });
  expect(await db.player.count()).toBe(1);
});
it("rejects reuse of an idempotency key with a different new-player payload", async () => {
  const first = { ...newInput, requesterUserId: "account-member", idempotencyKey: "new-player-key", proposedPlayerName: "First Name" };
  const entry = await admissionTransaction(db, tx => submitClubAdmission(tx, first));
  await expect(admissionTransaction(db, tx => submitClubAdmission(tx, { ...first, proposedPlayerName: "Changed Name", proposedGender: "MALE", note: "changed" }))).rejects.toMatchObject({ statusCode: 409 });
  expect(await db.clubAdmissionRequest.findUnique({ where: { id: entry.id } })).toMatchObject({ proposedPlayerName: "First Name", proposedGender: "FEMALE" });
  expect(await db.clubAdmissionRequest.count()).toBe(1);
});
it("rejects changing a pending new-player payload when the retry has no idempotency key", async () => {
  const first = { ...newInput, requesterUserId: "account-member", proposedPlayerName: "Pending Name" };
  const entry = await admissionTransaction(db, tx => submitClubAdmission(tx, first));
  await expect(admissionTransaction(db, tx => submitClubAdmission(tx, { ...first, proposedPlayerName: "Changed Name" }))).rejects.toMatchObject({ statusCode: 409 });
  expect(await db.clubAdmissionRequest.findUnique({ where: { id: entry.id } })).toMatchObject({ proposedPlayerName: "Pending Name", status: "PENDING" });
  expect(await db.clubAdmissionRequest.count()).toBe(1);
});
it("blocks claiming a different identity already owned in the same club and does not move history", async () => {
  await db.player.create({ data: { id: "member-player", ownerUserId: "account-member", name: "Member Player" } });
  await db.clubMember.create({ data: { clubId: "club-a", playerId: "member-player" } });
  const entry = await submit();
  await expect(approve(entry.id!)).rejects.toMatchObject({ statusCode: 409 });
  expect(await db.player.findUnique({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: null });
  expect(await db.clubAdmissionRequest.findUnique({ where: { id: entry.id } })).toMatchObject({ status: "PENDING", revision: 0 });
});
it("checks ownership clashes in every club of the target", async () => {
  await db.clubMember.create({ data: { clubId: "club-b", playerId: "historical-player" } });
  await db.player.create({ data: { id: "owned-b", ownerUserId: "account-member", name: "Owned B" } });
  await db.clubMember.create({ data: { clubId: "club-b", playerId: "owned-b" } });
  const entry = await submit(); await expect(approve(entry.id!)).rejects.toMatchObject({ statusCode: 409 });
  expect(await db.player.findUnique({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: null });
});
it("allows separate legacy profiles in disjoint clubs without consolidating them", async () => {
  await db.player.create({ data: { id: "legacy-b", ownerUserId: "account-member", name: "Legacy B" } });
  await db.clubMember.create({ data: { clubId: "club-b", playerId: "legacy-b" } });
  const entry = await submit(); await approve(entry.id!);
  expect(await db.player.count({ where: { ownerUserId: "account-member" } })).toBe(2);
  expect(await getOwnedClubPlayer(db, { clubId: "club-a", userId: "account-member" })).toMatchObject({ playerId: "historical-player" });
  await expect(resolveOwnedSessionPlayer(db, { userId: "account-member", clubIds: ["club-a", "club-b"] })).rejects.toThrow("Choose which owned player");
});
it("reuses an owned global player for a new club instead of creating another identity", async () => {
  await db.player.update({ where: { id: "historical-player" }, data: { ownerUserId: "account-member" } });
  const entry = await admissionTransaction(db, tx => submitClubAdmission(tx, { clubId: "club-b", requesterUserId: "account-member", kind: "OWNED_PLAYER", requestedPlayerId: "historical-player" }));
  await approve(entry.id!, { clubId: "club-b" });
  expect(await db.player.count()).toBe(1);
  expect(await db.clubMember.count()).toBe(2);
});
it("enforces admin authorization, self approval restrictions, invite switch, and request club", async () => {
  actor = { id: "account-other" }; expect((await GET(request({}), context)).status).toBe(403);
  expect((await settings(request({ allowJoinRequests: false }), context)).status).toBe(403);
  actor = { id: "account-owner" }; expect((await settings(request({ allowJoinRequests: false }), context)).status).toBe(200);
  actor = { id: "account-member" }; expect((await POST(request(newInput))).status).toBe(403);
  await db.club.update({ where: { id: "club-a" }, data: { allowJoinRequests: true } });
  const entry = await submit();
  await expect(approve(entry.id!, { clubId: "club-b" })).rejects.toMatchObject({ statusCode: 404 });
  await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-member", role: "ADMIN" } });
  await expect(approve(entry.id!, { reviewerUserId: "account-member" })).rejects.toMatchObject({ statusCode: 403 });
});
it("allows only one winner when two accounts concurrently claim the same player", async () => {
  const one = await submit(); const two = await submit({ clubId: "club-a", requesterUserId: "account-other", kind: "EXISTING_PLAYER", requestedPlayerId: "historical-player" });
  const results = await Promise.allSettled([approve(one.id!), approve(two.id!)]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const failure = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  expect(failure.reason.statusCode).toBe(409);
  const target = await db.player.findUnique({ where: { id: "historical-player" } });
  expect(["account-member", "account-other"]).toContain(target!.ownerUserId);
  expect(await db.clubAdmissionRequest.count({ where: { status: "APPROVED" } })).toBe(1);
}, 60000);
it("candidate discovery omits emails and makes account roles separate from target profile identity", async () => {
  actor = { id: "account-member" };
  const data = await (await discovery(new Request("http://localhost/api/clubs/join-requests?clubId=club-a"))).json();
  expect(data.players[0]).toMatchObject({ id: "historical-player", elo: 1455, matchesPlayed: 0 });
  expect(data.players[0]).not.toHaveProperty("email");
  expect(data.membership).toBeNull(); expect(data.access).toBeNull();
});
it("hides archived roster Players from public discovery and the admin candidate list", async () => {
  await db.clubMember.update({ where: { id: "historic-membership" }, data: { archivedAt: new Date("2025-01-02T03:04:05.000Z") } });
  actor = { id: "account-member" };
  const discoveryData = await (await discovery(new Request("http://localhost/api/clubs/join-requests?clubId=club-a"))).json();
  expect(discoveryData.players).not.toContainEqual(expect.objectContaining({ id: "historical-player" }));
  actor = { id: "account-owner" };
  const adminData = await (await GET(new Request("http://localhost/api/clubs/club-a/join-requests"), { params: Promise.resolve({ id: "club-a" }) })).json();
  expect(adminData.candidates).not.toContainEqual(expect.objectContaining({ id: "historical-player" }));
});

it("requires an active admin grant even when the actor created the club", async () => {
  const entry = await submit();
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "account-owner" } }, data: { role: "MEMBER" } });
  await expect(approve(entry.id!)).rejects.toMatchObject({ statusCode: 403 });
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "account-owner" } }, data: { role: "OWNER", status: "REVOKED" } });
  await expect(approve(entry.id!)).rejects.toMatchObject({ statusCode: 403 });
  expect(await db.player.findUnique({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: null });
});

it("writes only ownership while preserving a legacy text timestamp representation", async () => {
  await db.$executeRaw`UPDATE "User" SET "updatedAt" = '2026-01-02T03:04:05.678Z' WHERE "id" = 'historical-player'`;
  const rawTimestamp = () => db.$queryRaw<Array<{ rawValue: string; storageType: string }>>`SELECT CAST("updatedAt" AS TEXT) AS "rawValue", typeof("updatedAt") AS "storageType" FROM "User" WHERE "id" = 'historical-player'`;
  const before = await rawTimestamp();
  const entry = await submit(); await approve(entry.id!);
  expect(await rawTimestamp()).toEqual(before);
  expect(before[0].storageType).toBe("text");
  expect(await db.player.findUnique({ where: { id: "historical-player" }, select: { ownerUserId: true } })).toEqual({ ownerUserId: "account-member" });
});
