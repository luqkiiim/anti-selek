import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import bcrypt from "bcryptjs";
import { PrismaClient, type Prisma } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { mkdtempSync, copyFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { admissionTransaction, reviewClubAdmission, submitClubAdmission } from "@/lib/clubAdmissions";
import { getOwnedClubPlayer, resolveOwnedSessionPlayer } from "@/lib/playerIdentity";
import { clubJoinProofCookieName, issueClubJoinProof } from "@/lib/clubJoinProof";
import { clubEntryCookieName, readClubEntryProof, verifyClubEntryPassword, signClubEntryProof } from "@/lib/clubJoinEntry";
import { POST as verifyEntry } from "../join-entry/route";
import { GET as searchClubs } from "../search/route";
import { POST as legacyNameJoin } from "@/features/club-api/join/route";
import { claimClubPlayer, removeClubPlayerOwnership } from "@/lib/clubPlayerOwnership";
let db: PrismaClient;
let actor: { id: string; isAdmin?: boolean; isQuickAccess?: boolean; guestPlayerId?: string } | null;
vi.mock("@/lib/prisma", () => ({ get prisma() { return db; } }));
vi.mock("@/lib/auth", () => ({ auth: async () => actor ? { user: actor } : null }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: async () => null }));
import { POST, GET as discovery } from "./route";
import { GET, PATCH as settings } from "../[id]/join-requests/route";
import { PATCH as review } from "../[id]/join-requests/[requestId]/route";
import { POST as issueJoinProof } from "../join-proof/route";
import { POST as legacyClaim, POST as canonicalClaimAlias } from "../[id]/claim-requests/route";
import { POST as communityClaimAlias } from "../../communities/[id]/claim-requests/route";
const dir = mkdtempSync(path.join(tmpdir(), "account-player-admissions-"));
const baseline = path.join(dir, "baseline.db");
let count = 0;
const context = { params: Promise.resolve({ id: "club-a" }) };
const request = (body: unknown) => new Request("http://localhost/api/clubs/join-requests", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify(body) });
const proofRequest = (body: unknown) => new Request("http://localhost/api/clubs/join-proof", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify(body) });
const newInput = { clubId: "club-a", kind: "NEW_PLAYER" as const, proposedPlayerName: "New Player", proposedGender: "FEMALE" };
type ClaimRoute = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
const submit = (input: Parameters<typeof submitClubAdmission>[1] = { clubId: "club-a", requesterUserId: "account-member", kind: "EXISTING_PLAYER" as const, requestedPlayerId: "historical-player" }) => admissionTransaction(db, tx => submitClubAdmission(tx, input));
const approve = (requestId: string, overrides: Partial<Parameters<typeof reviewClubAdmission>[1]> = {}) => admissionTransaction(db, tx => reviewClubAdmission(tx, { clubId: "club-a", requestId, reviewerUserId: "account-owner", action: "APPROVE", ...overrides }));
const claim = (clubId = "club-a", playerId = "historical-player", userId = "account-member") => admissionTransaction(db, tx => claimClubPlayer(tx, { clubId, playerId, userId, actorUserId: "account-owner" }));
const remove = (playerId = "historical-player") => admissionTransaction(db, tx => removeClubPlayerOwnership(tx, { clubId: "club-a", playerId, actorUserId: "account-owner" }));
beforeAll(async () => {
  const url = "file:" + baseline.replaceAll("\\", "/");
  // Prisma's Windows SQLite engine cannot initialize a database that does not exist yet.
  writeFileSync(baseline, "");
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}, 60000);
beforeEach(async () => {
  process.env.AUTH_SECRET = "test-entry-secret-for-integration-only";
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
  expect(await db.player.findUnique({ where: { id: approved.approvedPlayerId } })).toMatchObject({ ownerUserId: null, name: "Member", avatarKey: null });
  expect(await db.clubMember.findUnique({ where: { clubId_playerId: { clubId: "club-a", playerId: approved.approvedPlayerId } } })).toMatchObject({ ownerUserId: "account-member" });
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
  expect(await db.player.findUnique({ where: { id: "retarget-player" } })).toMatchObject({ ownerUserId: null, name: "Member", avatarKey: null });
});
it("rejects OWNED_PLAYER reuse after local removal and preserves the original roster row", async () => {
  await claim(); await remove();
  const member = await db.clubMember.findUniqueOrThrow({ where: { id: "historic-membership" } });
  const access = await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "account-member" } } });
  await expect(submit({ clubId: "club-a", requesterUserId: "account-member", kind: "OWNED_PLAYER", requestedPlayerId: "historical-player" })).rejects.toMatchObject({ statusCode: 409 });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: member.id } })).toEqual(member);
  expect(member).toMatchObject({ ownerUserId: null, archivedAt: expect.any(Date), elo: 1455, preferredPool: "B", achievementPreferencesJson: '{"showcase":["win"]}' });
  expect(await db.clubAccess.findUniqueOrThrow({ where: { id: access.id } })).toEqual(access);
});
it("allows an admin to approve an existing Player request as a new Player", async () => {
  const entry = await submit();
  actor = { id: "account-owner" };
  const ctx = { params: Promise.resolve({ id: "club-a", requestId: entry.id! }) };
  const result = await (await review(request({ action: "APPROVE", asNew: true }), ctx)).json();
  expect(result).toMatchObject({ requestedPlayerId: "historical-player", decision: "CREATE_NEW" });
  expect(result.approvedPlayerId).not.toBe("historical-player");
  expect(await db.player.findUnique({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: null, name: "Known Name" });
  expect(await db.player.findUnique({ where: { id: result.approvedPlayerId } })).toMatchObject({ ownerUserId: null, name: "Member", gender: "FEMALE" });
  expect(await db.clubMember.findUnique({ where: { clubId_playerId: { clubId: "club-a", playerId: "historical-player" } } })).toMatchObject({ elo: 1455 });
});
it("does not offer locally removed profiles through OWNED_PLAYER even with a later active access grant", async () => {
  await claim(); await remove();
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "account-member" } }, data: { status: "ACTIVE" } });
  actor = { id: "account-member" };
  const data = await (await discovery(new Request("http://localhost/api/clubs/join-requests?clubId=club-a"))).json();
  expect(data.membership).toBeNull(); expect(data.ownedPlayers).toEqual([]);
  await expect(submit({ clubId: "club-a", requesterUserId: "account-member", kind: "OWNED_PLAYER", requestedPlayerId: "historical-player" })).rejects.toMatchObject({ statusCode: 409 });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "historic-membership" } })).toMatchObject({ archivedAt: expect.any(Date), ownerUserId: null });
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
  expect(await db.player.findUnique({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: null, name: "Member", avatarKey: null, updatedAt: originalPlayerUpdatedAt });
  expect(await db.user.findUnique({ where: { id: "account-member" } })).toMatchObject({ name: "Member", avatarKey: null });
  expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "account-member" } } })).toMatchObject({ role: "MEMBER" });
  expect(await db.clubAdmissionEvent.count({ where: { admissionRequestId: entry.id } })).toBe(2);
});
it("does not change existing account role on claim", async () => {
  await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-member", role: "STAFF" } });
  const entry = await submit(); await approve(entry.id!);
  expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "account-member" } } })).toMatchObject({ role: "STAFF" });
});
it("ordinary admission cannot bypass revoked access without an exact local release", async () => {
  await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-member", role: "ADMIN", status: "REVOKED" } });
  const entry = await submit(); const before = await db.clubAccess.findMany();
  await expect(approve(entry.id!)).rejects.toMatchObject({ statusCode: 409 });
  expect(await db.clubAccess.findMany()).toEqual(before);
  expect(await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: entry.id! } })).toMatchObject({ status: "PENDING" });
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
  await db.player.create({ data: { id: "member-player", name: "Member Player" } });
  await db.clubMember.create({ data: { clubId: "club-a", playerId: "member-player" } });
  await claim("club-a", "member-player");
  await expect(submit()).rejects.toMatchObject({ statusCode: 409 });
  expect(await db.player.findUnique({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: null });
  expect(await db.clubAdmissionRequest.count()).toBe(0);
});
it("blocks assigning a shared physical Player to a different retained local owner", async () => {
  await db.clubMember.create({ data: { clubId: "club-b", playerId: "historical-player" } });
  await claim("club-b", "historical-player", "account-other");
  await expect(submit()).rejects.toMatchObject({ statusCode: 409 });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "historic-membership" } })).toMatchObject({ ownerUserId: null });
  expect(await getOwnedClubPlayer(db, { clubId: "club-b", userId: "account-other" })).toMatchObject({ playerId: "historical-player" });
});
it("allows separate local Players in disjoint clubs while preserving the first profile", async () => {
  await db.player.create({ data: { id: "local-b", name: "Local B" } });
  await db.clubMember.create({ data: { clubId: "club-b", playerId: "local-b", elo: 1275 } });
  await claim("club-b", "local-b");
  const before = await db.clubMember.findUniqueOrThrow({ where: { clubId_playerId: { clubId: "club-b", playerId: "local-b" } } });
  const entry = await submit(); await approve(entry.id!);
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
  expect(await getOwnedClubPlayer(db, { clubId: "club-a", userId: "account-member" })).toMatchObject({ playerId: "historical-player" });
  expect(await getOwnedClubPlayer(db, { clubId: "club-b", userId: "account-member" })).toMatchObject({ playerId: "local-b" });
  await expect(resolveOwnedSessionPlayer(db, { userId: "account-member", clubIds: ["club-a", "club-b"] })).rejects.toThrow();
});
it("rejects cross-club OWNED_PLAYER reuse without consolidating the local placeholder", async () => {
  await db.player.create({ data: { id: "local-b", name: "Local B" } });
  await db.clubMember.create({ data: { clubId: "club-b", playerId: "local-b", elo: 1275 } }); await claim("club-b", "local-b");
  const before = await db.clubMember.findMany({ orderBy: { id: "asc" } });
  await expect(submit({ clubId: "club-a", requesterUserId: "account-member", kind: "OWNED_PLAYER", requestedPlayerId: "local-b" })).rejects.toMatchObject({ statusCode: 409 });
  expect(await db.clubMember.findMany({ orderBy: { id: "asc" } })).toEqual(before);
  expect(await db.clubAdmissionRequest.count()).toBe(0);
});
it("new admission in another club creates a distinct locally connected Player", async () => {
  await claim();
  const original = await db.clubMember.findUniqueOrThrow({ where: { id: "historic-membership" } });
  const entry = await admissionTransaction(db, tx => submitClubAdmission(tx, { clubId: "club-b", requesterUserId: "account-member", kind: "NEW_PLAYER", proposedPlayerName: "Member", proposedGender: "FEMALE" }));
  const result = await approve(entry.id!, { clubId: "club-b" });
  expect(result.approvedPlayerId).not.toBe("historical-player");
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
  expect(await db.player.count()).toBe(2);
  expect(await getOwnedClubPlayer(db, { clubId: "club-b", userId: "account-member" })).toMatchObject({ playerId: result.approvedPlayerId });
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
  expect((await db.player.findUniqueOrThrow({ where: { id: "historical-player" } })).ownerUserId).toBeNull();
  expect(["account-member", "account-other"]).toContain((await db.clubMember.findUniqueOrThrow({ where: { id: "historic-membership" } })).ownerUserId);
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
  await remove();
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
  expect(await db.player.findUnique({ where: { id: "historical-player" }, select: { ownerUserId: true } })).toEqual({ ownerUserId: null });
});

it("requires current account-bound password proof for protected candidate discovery and admission", async () => {
  const priorSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "local-test-secret-for-club-join-proof-0123456789";
  try {
    const password = "ClubPasswordForLocalTest";
    const passwordHash = await bcrypt.hash(password, 4);
    await db.club.update({ where: { id: "club-a" }, data: { isPasswordProtected: true, passwordHash } });
    await db.player.create({ data: { id: "member-owned-player", ownerUserId: "account-member", name: "Owned Profile" } });

    actor = { id: "account-member" };
    const lockedResponse = await discovery(new Request("http://localhost/api/clubs/join-requests?clubId=club-a&q=Known"));
    const locked = await lockedResponse.json();
    expect(lockedResponse.status).toBe(200);
    expect(lockedResponse.headers.get("cache-control")).toContain("no-store");
    expect(locked).toMatchObject({ passwordProof: { status: "PASSWORD_REQUIRED", expiresAt: null }, players: [], ownedPlayers: [] });
    expect(locked.requests).toEqual([]);
    expect(locked).not.toHaveProperty("passwordHash");

    const blockedSubmission = await POST(request(newInput));
    expect(blockedSubmission.status).toBe(403);
    expect(await blockedSubmission.json()).toMatchObject({ code: "JOIN_CODE_REQUIRED" });
    expect(await db.clubAdmissionRequest.count()).toBe(0);

    const wrongPassword = await issueJoinProof(proofRequest({ clubId: "club-a", password: "incorrect" }));
    expect(wrongPassword.status).toBe(403);
    expect(await wrongPassword.json()).toMatchObject({ code: "INVALID_JOIN_CODE" });
    expect(wrongPassword.headers.get("set-cookie")).toBeNull();

    const issued = await issueJoinProof(proofRequest({ clubId: "club-a", password }));
    const issuedBody = await issued.json();
    expect(issued.status).toBe(200);
    expect(issuedBody).toMatchObject({ ok: true, clubId: "club-a", expiresAt: expect.any(String) });
    expect(issuedBody).not.toHaveProperty("token");
    expect(JSON.stringify(issuedBody)).not.toContain(passwordHash);
    const setCookie = issued.headers.get("set-cookie");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=1800");
    expect(setCookie).not.toContain(password);
    expect(setCookie).not.toContain(passwordHash);
    const cookiePair = setCookie!.split(";", 1)[0];

    const unlockedResponse = await discovery(new Request("http://localhost/api/clubs/join-requests?clubId=club-a&q=Known", { headers: { Cookie: cookiePair } }));
    const unlocked = await unlockedResponse.json();
    expect(unlocked).toMatchObject({ passwordProof: { status: "VERIFIED", expiresAt: expect.any(String) } });
    expect(unlocked.players).toContainEqual(expect.objectContaining({ id: "historical-player", name: "Known Name", elo: 1455 }));
    expect(unlocked.ownedPlayers).toEqual([]);

    const submitted = await POST(new Request("http://localhost/api/clubs/join-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost", Cookie: cookiePair },
      body: JSON.stringify(newInput),
    }));
    const submittedBody = await submitted.json();
    expect(submitted.status).toBe(200);
    expect(submittedBody).toMatchObject({ status: "PENDING", kind: "NEW_PLAYER" });
    expect(await db.player.count({ where: { ownerUserId: "account-member" } })).toBe(1);
    expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "account-member" } } })).toBeNull();

    actor = { id: "account-other" };
    const otherAccount = await discovery(new Request("http://localhost/api/clubs/join-requests?clubId=club-a", { headers: { Cookie: cookiePair } }));
    expect(await otherAccount.json()).toMatchObject({ passwordProof: { status: "PASSWORD_REQUIRED" }, players: [], ownedPlayers: [] });
    const otherSubmission = await POST(new Request("http://localhost/api/clubs/join-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost", Cookie: cookiePair },
      body: JSON.stringify(newInput),
    }));
    expect(otherSubmission.status).toBe(403);

    actor = { id: "account-member" };
    const replacementPasswordHash = await bcrypt.hash("RotatedLocalClubPassword", 4);
    await db.club.update({ where: { id: "club-a" }, data: { passwordHash: replacementPasswordHash } });
    const staleProof = await discovery(new Request("http://localhost/api/clubs/join-requests?clubId=club-a", { headers: { Cookie: cookiePair } }));
    const staleBody = await staleProof.json();
    expect(staleBody).toMatchObject({ passwordProof: { status: "PASSWORD_REQUIRED" }, players: [], ownedPlayers: [] });
    expect(staleBody.requests).toEqual([expect.objectContaining({ status: "PENDING" })]);
    const allStatuses = await (await discovery(new Request("http://localhost/api/clubs/join-requests"))).json();
    expect(allStatuses.requests[0]).toMatchObject({ id: submittedBody.id, status: "PENDING" });
    expect(allStatuses.requests[0]).not.toHaveProperty("requestedPlayer");
    expect(allStatuses.requests[0]).not.toHaveProperty("requester");
    const staleSubmission = await POST(new Request("http://localhost/api/clubs/join-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost", Cookie: cookiePair },
      body: JSON.stringify({ ...newInput, idempotencyKey: "stale-proof-retry" }),
    }));
    expect(staleSubmission.status).toBe(200); // Same pending request is a read-only receipt.
    expect(await db.clubAdmissionRequest.count()).toBe(1);

    await db.user.update({ where: { id: "account-member" }, data: { isActive: false } });
    expect((await discovery(new Request("http://localhost/api/clubs/join-requests?clubId=club-a"))).status).toBe(403);
    expect((await issueJoinProof(proofRequest({ clubId: "club-a", password: "RotatedLocalClubPassword" }))).status).toBe(403);
    expect((await POST(request({ ...newInput, idempotencyKey: "inactive-account" }))).status).toBe(403);
    await db.user.update({ where: { id: "account-member" }, data: { isActive: true } });
    delete process.env.AUTH_SECRET;
    const missingSigner = await issueJoinProof(proofRequest({ clubId: "club-a", password: "RotatedLocalClubPassword" }));
    expect(missingSigner.status).toBe(503);
    expect(await missingSigner.json()).toMatchObject({ code: "PASSWORD_PROOF_UNAVAILABLE" });
    expect((await discovery(new Request("http://localhost/api/clubs/join-requests?clubId=club-a"))).status).toBe(503);
    actor = { id: "account-other" };
    expect((await POST(request({ ...newInput, idempotencyKey: "missing-proof-secret" }))).status).toBe(503);
  } finally {
    if (priorSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = priorSecret;
  }
});

it("adapts the legacy proof endpoint to the new grant and never accepts weaker legacy grants", async () => {
  await protectClub();
  const passwordHash = (await db.club.findUniqueOrThrow({ where: { id: "club-a" } })).passwordHash;
  const old = issueClubJoinProof({ userId: "account-member", clubId: "club-a", passwordHash });
  const weakCookie = `${clubJoinProofCookieName("club-a")}=${old.token}`;
  const postAlias = (cookie: string, handler: ClaimRoute = canonicalClaimAlias): Promise<Response> => handler(new Request("http://localhost/api/clubs/club-a/claim-requests", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost", Cookie: cookie }, body: JSON.stringify({ targetUserId: "historical-player" }) }), context);
  expect((await postAlias(weakCookie)).status).toBe(403);
  expect((await postAlias(weakCookie, communityClaimAlias)).status).toBe(403);
  const response = await issueJoinProof(proofRequest({ clubId: "club-a", password: " exact code " }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, clubId: "club-a", expiresAt: expect.any(String) });
  const cookie = response.headers.get("set-cookie")!.split(";", 1)[0];
  expect(cookie).toMatch(/^club-entry-/); expect(response.headers.get("set-cookie")).toContain("Max-Age=1800");
  expect((await postAlias(cookie)).status).toBe(200);
  // The alias returns the same existing receipt, without a second allocation.
  expect((await postAlias(cookie, communityClaimAlias)).status).toBe(200);
  expect(await db.clubAdmissionRequest.count()).toBe(1);
  expect(await db.player.count()).toBe(1); expect(await db.clubMember.count()).toBe(1);
});

it("rejects a missing target on the deprecated community alias without creating an admission", async () => {
  actor = { id: "account-member" };
  const response = await communityClaimAlias(
    new Request("http://localhost/api/communities/club-a/claim-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ note: "No Player selected" }),
    }),
    { params: Promise.resolve({ id: "club-a" }) },
  );

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: "Choose an existing Player or enter a new Player's name and gender" });
  expect(await db.clubAdmissionRequest.count({ where: { requesterUserId: "account-member" } })).toBe(0);
});

it("signals an inactive owned identity without exposing or offering that Player", async () => {
  const priorSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "local-test-secret-for-club-join-proof-0123456789";
  try {
    const password = "ReviewIdentityPassword";
    const passwordHash = await bcrypt.hash(password, 4);
    await db.club.update({ where: { id: "club-a" }, data: { isPasswordProtected: true, passwordHash } });
    await db.player.create({ data: { id: "inactive-owned-hidden", ownerUserId: "account-member", name: "Private Inactive Profile", isActive: false } });
    actor = { id: "account-member" };

    const lockedResponse = await discovery(new Request("http://localhost/api/clubs/join-requests?clubId=club-a"));
    const locked = await lockedResponse.json();
    expect(locked).toMatchObject({ identityReviewRequired: false, passwordProof: { status: "PASSWORD_REQUIRED" }, players: [], ownedPlayers: [] });
    expect(JSON.stringify(locked)).not.toContain("inactive-owned-hidden");
    expect(JSON.stringify(locked)).not.toContain("Private Inactive Profile");

    const issued = await issueJoinProof(proofRequest({ clubId: "club-a", password }));
    expect(issued.status).toBe(200);
    const cookie = issued.headers.get("set-cookie")!.split(/,\s*(?=[A-Za-z0-9_]+=)/).find(value => value.startsWith("club-entry-"))!.split(";", 1)[0];
    const unlockedResponse = await discovery(new Request("http://localhost/api/clubs/join-requests?clubId=club-a", { headers: { Cookie: cookie } }));
    const unlocked = await unlockedResponse.json();
    expect(unlocked).toMatchObject({ identityReviewRequired: false, passwordProof: { status: "VERIFIED" }, ownedPlayers: [] });
    expect(JSON.stringify(unlocked)).not.toContain("inactive-owned-hidden");
    expect(JSON.stringify(unlocked)).not.toContain("Private Inactive Profile");
  } finally {
    if (priorSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = priorSecret;
  }
});

it("allows an active club member to browse protected candidates without another join code", async () => {
  const priorSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "local-test-secret-for-club-join-proof-0123456789";
  try {
    await db.club.update({ where: { id: "club-a" }, data: { isPasswordProtected: true, passwordHash: await bcrypt.hash("MemberPasswordForTest", 4) } });
    await claim();
    await db.player.create({ data: { id: "another-unclaimed-player", name: "Other Candidate" } });
    await db.clubMember.create({ data: { clubId: "club-a", playerId: "another-unclaimed-player", elo: 1600 } });
    expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "account-member" } } })).toMatchObject({ role: "MEMBER", status: "ACTIVE" });
    actor = { id: "account-member" };

    const response = await discovery(new Request("http://localhost/api/clubs/join-requests?clubId=club-a&q=Other"));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      requiresJoinCode: false, passwordProof: { status: "VERIFIED", expiresAt: null },
      players: [expect.objectContaining({ id: "another-unclaimed-player" })],
      ownedPlayers: [{ id: "historical-player", name: "Member" }],
      membership: { playerId: "historical-player" },
      access: { role: "MEMBER", status: "ACTIVE" },
    });
  } finally {
    if (priorSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = priorSecret;
  }
});

async function protectClub() {
  await db.club.update({ where: { id: "club-a" }, data: { isPasswordProtected: true, passwordHash: await bcrypt.hash(" exact code ", 4) } });
  actor = { id: "account-member" };
}
async function entryCookie(password = " exact code ") {
  const response = await verifyEntry(request({ clubId: "club-a", password }));
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0];
}
function withCookie(body: unknown, cookie: string) {
  const value = request(body); value.headers.set("cookie", cookie); return value;
}
it("searches open clubs case-insensitively and returns only safe capped summaries", async () => {
  await db.club.createMany({ data: Array.from({ length: 25 }, (_, i) => ({ name: `SEARCH Club ${i}`, createdById: "account-owner", allowJoinRequests: true })) });
  await db.club.createMany({ data: [{ name: "Search Closed", createdById: "account-owner" }, { name: "Search Tutorial", createdById: "account-owner", isTutorial: true, allowJoinRequests: true }] });
  const response = await searchClubs(new Request("http://localhost/api/clubs/search?q=search"));
  const { clubs } = await response.json();
  expect(clubs).toHaveLength(20);
  expect(clubs.every((club: Record<string, unknown>) => Object.keys(club).sort().join(",") === "avatarUrl,id,isPasswordProtected,name")).toBe(true);
  expect(response.headers.get("cache-control")).toBe("no-store, private");
  expect((await (await searchClubs(new Request("http://localhost/api/clubs/search?q=s"))).json()).clubs).toEqual([]);
  expect((await searchClubs(new Request(`http://localhost/api/clubs/search?q=${"a".repeat(65)}`))).status).toBe(400);
});
it("locks candidate discovery and direct domain submission without a server capability", async () => {
  await protectClub();
  const data = await (await discovery(new Request("http://localhost/api/clubs/join-requests?clubId=club-a"))).json();
  expect(data).toMatchObject({ requiresJoinCode: true, players: [], club: { isPasswordProtected: true, avatarUrl: null } });
  await expect(submit()).rejects.toMatchObject({ statusCode: 403, code: "JOIN_CODE_REQUIRED" });
  await expect(admissionTransaction(db, tx => submitClubAdmission(tx, { ...newInput, requesterUserId: "account-member" }, {} as never))).rejects.toMatchObject({ statusCode: 403 });
  expect(await db.clubAdmissionRequest.count()).toBe(0);
});
it("verifies exact password bytes into an HttpOnly host-only cookie without allocating identity or access", async () => {
  await protectClub();
  expect((await verifyEntry(request({ clubId: "club-a", password: "exact code" }))).status).toBe(403);
  expect((await verifyEntry(request({ clubId: "club-a", password: "wrong" }))).status).toBe(403);
  expect((await verifyEntry(request({ clubId: "club-a" }))).status).toBe(400);
  const response = await verifyEntry(request({ clubId: "club-a", password: " exact code " }));
  expect(await response.json()).toEqual({ clubId: "club-a", verified: true });
  const header = response.headers.get("set-cookie")!;
  expect(header).toContain("HttpOnly"); expect(header).toContain("SameSite=lax"); expect(header).toContain("Max-Age=1800"); expect(header).not.toContain("Domain="); expect(header).not.toContain(" exact code ");
  expect(await db.player.count()).toBe(1); expect(await db.clubMember.count()).toBe(1); expect(await db.clubAccess.count()).toBe(2); expect(await db.clubAdmissionRequest.count()).toBe(0);
  const cookie = header.split(";")[0];
  const read = new Request("http://localhost/api/clubs/join-requests?clubId=club-a", { headers: { cookie } });
  expect((await (await discovery(read)).json()).requiresJoinCode).toBe(false);
  expect((await POST(withCookie(newInput, cookie))).status).toBe(200);
  expect(await db.player.count()).toBe(1);
});
it("rejects tampered, wrong account and wrong club grants for new submissions", async () => {
  await protectClub(); const cookie = await entryCookie();
  const [name, token] = cookie.split("=");
  const changed = token.slice(0, -12) + "AAAAAAAAAAAA";
  expect((await POST(withCookie(newInput, `${name}=${changed}`))).status).toBe(403);
  actor = { id: "account-other" }; expect((await POST(withCookie(newInput, cookie))).status).toBe(403);
  actor = { id: "account-member" };
  await db.club.update({ where: { id: "club-b" }, data: { isPasswordProtected: true, passwordHash: await bcrypt.hash(" exact code ", 4) } });
  expect((await POST(withCookie({ ...newInput, clubId: "club-b" }, `${clubEntryCookieName("club-b")}=${token}`))).status).toBe(403);
  expect(await db.clubAdmissionRequest.count()).toBe(0);
});
it("rejects expired grants and account session changes", async () => {
  await protectClub();
  const club = (await db.club.findUnique({ where: { id: "club-a" } }))!;
  const account = (await db.user.findUnique({ where: { id: "account-member" } }))!;
  const oldTime = vi.spyOn(Date, "now").mockReturnValue(Date.now() - 31 * 60 * 1000);
  const expired = await verifyClubEntryPassword(club, account, " exact code "); oldTime.mockRestore();
  const token = await signClubEntryProof(expired!);
  expect((await POST(withCookie(newInput, `${clubEntryCookieName(club.id)}=${token}`))).status).toBe(403);
  const cookie = await entryCookie();
  await db.user.update({ where: { id: account.id }, data: { sessionVersion: { increment: 1 } } });
  expect((await POST(withCookie(newInput, cookie))).status).toBe(403);
  await db.user.update({ where: { id: account.id }, data: { isActive: false } });
  expect((await verifyEntry(request({ clubId: club.id, password: " exact code " }))).status).toBe(403);
});
it("rechecks the current password inside admission transactions, including rotation between verification and submission", async () => {
  await protectClub(); const cookie = await entryCookie(); const value = withCookie(newInput, cookie);
  const proof = await readClubEntryProof(value, "club-a");
  await db.club.update({ where: { id: "club-a" }, data: { passwordHash: await bcrypt.hash("rotated", 4) } });
  await expect(admissionTransaction(db, tx => submitClubAdmission(tx, { ...newInput, requesterUserId: "account-member" }, proof))).rejects.toMatchObject({ code: "JOIN_CODE_REQUIRED" });
  expect((await POST(value)).status).toBe(403);
  expect((await (await discovery(new Request("http://localhost/api/clubs/join-requests?clubId=club-a", { headers: { cookie } }))).json()).players).toEqual([]);
  expect(await db.clubAdmissionRequest.count()).toBe(0);
});
it("preserves access bypasses while ownership and revoked access remain locked", async () => {
  await protectClub();
  await claim();
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "account-member" } }, data: { role: "ADMIN", status: "REVOKED" } });
  const read = new Request("http://localhost/api/clubs/join-requests?clubId=club-a");
  const locked = await (await discovery(read)).json();
  expect(locked).toMatchObject({ requiresJoinCode: true, players: [], membership: { playerId: "historical-player" }, access: { status: "REVOKED" } });
  expect(locked.ownedPlayers).toContainEqual({ id: "historical-player", name: "Member" });
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "account-member" } }, data: { status: "ACTIVE", role: "MEMBER" } });
  expect((await (await discovery(read)).json()).requiresJoinCode).toBe(false);
  expect((await submit()).status).toBe("MEMBER");
  actor = { id: "account-owner" }; expect((await (await discovery(read)).json()).requiresJoinCode).toBe(false);
});
it("keeps existing request status readable but blocks new admissions once closed", async () => {
  await protectClub(); const cookie = await entryCookie();
  expect((await POST(withCookie(newInput, cookie))).status).toBe(200);
  await db.club.update({ where: { id: "club-a" }, data: { allowJoinRequests: false } });
  const status = await (await discovery(new Request("http://localhost/api/clubs/join-requests?clubId=club-a"))).json();
  expect(status.requests).toHaveLength(1); expect(status.players).toEqual([]);
  expect((await POST(request(newInput))).status).toBe(200); // Existing pending receipt only.
  actor = { id: "account-other" };
  expect((await verifyEntry(request({ clubId: "club-a", password: " exact code " }))).status).toBe(403);
  await expect(submit({ ...newInput, requesterUserId: "account-other" })).rejects.toMatchObject({ statusCode: 403 });
});
it("fails closed for missing password hashes and enforces the gate on legacy aliases", async () => {
  await protectClub();
  const claim = request({ targetPlayerId: "historical-player" });
  expect((await legacyClaim(claim, context)).status).toBe(403);
  expect((await legacyNameJoin(request({ clubName: "Club A", password: "wrong" }))).status).toBe(403);
  expect((await legacyNameJoin(request({ clubName: "Club A", password: " exact code " }))).status).toBe(200);
  actor = { id: "account-other" };
  await db.club.update({ where: { id: "club-a" }, data: { passwordHash: null } });
  expect((await verifyEntry(request({ clubId: "club-a", password: " exact code " }))).status).toBe(403);
  expect((await POST(request(newInput))).status).toBe(403);
});
it("requires same-origin JSON for verification and every submission alias", async () => {
  await protectClub();
  const bad = request({ clubId: "club-a", password: " exact code " }); bad.headers.set("origin", "https://elsewhere.example");
  expect((await verifyEntry(bad)).status).toBe(403);
  const submission = request(newInput); submission.headers.delete("origin"); expect((await POST(submission)).status).toBe(403);
  const claim = request({ targetPlayerId: "historical-player" }); claim.headers.set("content-type", "text/plain"); expect((await legacyClaim(claim, context)).status).toBe(403);
  const legacy = request({ clubName: "Club A", password: " exact code " }); legacy.headers.delete("origin"); expect((await legacyNameJoin(legacy)).status).toBe(403);
  expect(await db.clubAdmissionRequest.count()).toBe(0);
});
it("revalidates entry on transaction retries after a concurrent password rotation", async () => {
  await protectClub(); const cookie = await entryCookie();
  const proof = await readClubEntryProof(withCookie(newInput, cookie), "club-a");
  let attempts = 0;
  const retryingDb = {
    $transaction: async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      attempts++;
      if (attempts > 1) return db.$transaction(operation);
      try {
        await db.$transaction(async tx => {
          await operation(tx);
          throw Object.assign(new Error("write conflict"), { code: "P2034" });
        });
      } catch (error) {
        await db.club.update({ where: { id: "club-a" }, data: { passwordHash: await bcrypt.hash("rotated during retry", 4) } });
        throw error;
      }
    },
  } as unknown as PrismaClient;
  await expect(admissionTransaction(retryingDb, tx => submitClubAdmission(tx, { ...newInput, requesterUserId: "account-member" }, proof))).rejects.toMatchObject({ code: "JOIN_CODE_REQUIRED" });
  expect(attempts).toBe(2); expect(await db.clubAdmissionRequest.count()).toBe(0); expect(await db.clubAdmissionEvent.count()).toBe(0);
});
it("marks HTTPS verification cookies secure and rejects malformed JSON before writing", async () => {
  await protectClub();
  const response = await verifyEntry(new Request("https://clubs.example/api/clubs/join-entry", { method: "POST", headers: { origin: "https://clubs.example", "content-type": "application/json" }, body: JSON.stringify({ clubId: "club-a", password: " exact code " }) }));
  expect(response.headers.get("set-cookie")).toContain("Secure");
  const broken = () => new Request("http://localhost/api/clubs/join-entry", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: "{" });
  expect((await verifyEntry(broken())).status).toBe(400); expect((await POST(broken())).status).toBe(400);
  expect(await db.clubAdmissionRequest.count()).toBe(0);
});
