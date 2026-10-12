import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { admissionTransaction, reviewClubAdmission, submitClubAdmission } from "./clubAdmissions";
import { assertLocalClaimAvailable, claimClubPlayer, clubOwnershipTransaction, removeClubPlayerOwnership } from "./clubPlayerOwnership";
import { exchangeInvitationSecret, managePlayerInvitation, redeemPlayerInvitation } from "./playerInvitations";
import { disconnectRemovedPlayer } from "./playerOwnershipRelease";
import { assertSessionAccountSeatAvailable } from "./sessionProfileIdentity";

const dir = mkdtempSync(path.join(tmpdir(), "club-local-ownership-"));
const baseline = path.join(dir, "baseline.db");
let db: PrismaClient; let file: string; let caseIndex = 0;
const adapterFiles = new Set<string>();
const localMigration = "20261012120000_club_local_player_ownership";
const tx = <T>(fn: (tx: Parameters<Parameters<typeof clubOwnershipTransaction<T>>[1]>[0]) => Promise<T>) => clubOwnershipTransaction(db, fn);
const claim = (clubId = "club-a", playerId = "p-a", userId = "account-a") => tx(t => claimClubPlayer(t, { clubId, playerId, userId, actorUserId: "admin" }));
const remove = (clubId = "club-a", playerId = "p-a") => tx(t => removeClubPlayerOwnership(t, { clubId, playerId, actorUserId: "admin" }));
function rawClaimReceipt(overrides: Partial<{
  id: string; clubId: string; memberId: string; playerId: string; accessId: string;
  previousAccessRevision: number | null; newAccessRevision: number | null;
  previousAccessStatus: string | null; newAccessStatus: string | null; previousAccessRole: string | null; newAccessRole: string | null;
}> = {}) {
  const event = { id: "raw-claim", clubId: "club-a", memberId: "m-a", playerId: "p-a", accessId: "raw-grant",
    previousAccessRevision: null, newAccessRevision: 0, previousAccessStatus: null, newAccessStatus: "ACTIVE", previousAccessRole: null, newAccessRole: "MEMBER", ...overrides };
  const before = JSON.stringify({ name: `Historical ${event.playerId}`, avatarKey: "old-avatar" });
  const after = JSON.stringify({ name: "Current account-a", avatarKey: null });
  const details = JSON.stringify({ previousArchivedAt: null, newArchivedAt: null });
  return db.$executeRaw`INSERT INTO "ClubPlayerOwnershipEvent"("id","clubId","clubMemberId","playerId","actorUserId","action","previousOwnerUserId","newOwnerUserId","previousOwnershipRevision","newOwnershipRevision","accessId","previousAccessRevision","newAccessRevision","previousAccessStatus","newAccessStatus","previousAccessRole","newAccessRole","metadataBeforeJson","metadataAfterJson","detailsJson","reason","createdAt")
   VALUES (${event.id},${event.clubId},${event.memberId},${event.playerId},'admin','CLAIM',NULL,'account-a',0,1,${event.accessId},${event.previousAccessRevision},${event.newAccessRevision},${event.previousAccessStatus},${event.newAccessStatus},${event.previousAccessRole},${event.newAccessRole},${before},${after},${details},'Direct claim',${Date.now()})`;
}
async function invite(playerId = "p-a", clubId = "club-a", now = new Date()) {
  const created = await tx(t => managePlayerInvitation(t, { clubId, playerId, userId: "admin", action: "CREATE", now }));
  const id = created.invitation!.id;
  const exchanged = await tx(t => exchangeInvitationSecret(t, id, "secret" in created ? created.secret! : "", now));
  return { id, handle: exchanged.handle };
}
beforeAll(() => {
  const sqlite = new DatabaseSync(baseline, { enableDoubleQuotedStringLiterals: true });
  for (const migration of readdirSync("prisma/migrations").sort()) {
    const source = path.join("prisma/migrations", migration, "migration.sql");
    if (migration === localMigration) sqlite.exec(`
      INSERT INTO Account(id,name,email,passwordHash,createdAt,updatedAt) VALUES ('legacy-admin','Legacy admin','legacy-admin@test.invalid','legacy-admin-hash',10,11),('legacy-owner','Legacy Owner','legacy-owner@test.invalid','legacy-owner-hash',12,13);
      INSERT INTO Community(id,name,createdById,createdAt,updatedAt) VALUES ('legacy-a','Legacy A','legacy-admin',14,15),('legacy-b','Legacy B','legacy-admin',16,17);
      INSERT INTO ClubAccess(id,clubId,userId,role,status,createdAt,updatedAt) VALUES ('legacy-admin-a','legacy-a','legacy-admin','OWNER','ACTIVE',18,19),('legacy-admin-b','legacy-b','legacy-admin','OWNER','ACTIVE',20,21),('legacy-owner-a','legacy-a','legacy-owner','STAFF','REVOKED',22,23),('legacy-owner-b','legacy-b','legacy-owner','MEMBER','ACTIVE',24,25);
      INSERT INTO User(id,ownerUserId,name,avatarKey,elo,createdAt,updatedAt) VALUES ('legacy-shared','legacy-owner','Legacy Shared','legacy-avatar',1456,26,27);
      INSERT INTO CommunityMember(id,communityId,userId,role,elo,createdAt,archivedAt) VALUES ('legacy-member-a','legacy-a','legacy-shared','STAFF',1356,28,30),('legacy-member-b','legacy-b','legacy-shared','MEMBER',1456,29,NULL);
    `);
    if (migration !== "migration_lock.toml") sqlite.exec(readFileSync(source, "utf8"));
  }
  sqlite.close();
});
beforeEach(async () => {
  await db?.$disconnect(); file = path.join(dir, `${caseIndex++}.db`); copyFileSync(baseline, file);
  db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  await db.user.createMany({ data: ["admin", "account-a", "account-b", "creator"].map(id => ({ id, name: `Current ${id}`, email: `${id}@example.invalid`, passwordHash: `hash-${id}`, avatarKey: id === "account-a" ? null : `${id}-avatar`, gender: "MALE" })) });
  await db.club.createMany({ data: ["club-a", "club-b", "club-c"].map(id => ({ id, name: id, createdById: "creator", allowJoinRequests: true })) });
  await db.clubAccess.createMany({ data: ["club-a", "club-b", "club-c"].map(clubId => ({ clubId, userId: "admin", role: "ADMIN" })) });
  await db.player.createMany({ data: ["p-a", "p-b", "p-c", "p-extra"].map(id => ({ id, name: `Historical ${id}`, avatarKey: "old-avatar", gender: "FEMALE", elo: 1223 })) });
  await db.clubMember.createMany({ data: [{ id: "m-a", clubId: "club-a", playerId: "p-a", elo: 1411 }, { id: "m-b", clubId: "club-b", playerId: "p-b", elo: 999 }, { id: "m-c", clubId: "club-c", playerId: "p-c", elo: 1088 }, { id: "m-extra", clubId: "club-a", playerId: "p-extra", elo: 1234 }] });
});
afterAll(async () => {
  await db?.$disconnect();
  // libSQL's pinned native file handles survive client.close on Windows. Keep
  // only those fixture files for automatic temporary-directory cleanup.
  if (process.platform === "win32" && adapterFiles.size) {
    for (const name of readdirSync(dir)) if (![...adapterFiles].some(file => name === path.basename(file) || name.startsWith(path.basename(file) + "-"))) unlinkSync(path.join(dir, name));
  } else rmSync(dir, { recursive: true, force: true });
});

it("claims distinct A/B local profiles, audits current name and null avatar, and freezes global provenance", async () => {
  const before = await db.player.findUniqueOrThrow({ where: { id: "p-a" } });
  await claim(); await claim("club-b", "p-b");
  expect(await db.clubMember.findMany({ where: { ownerUserId: "account-a" }, orderBy: { clubId: "asc" } })).toMatchObject([{ clubId: "club-a", playerId: "p-a", ownershipRevision: 1, elo: 1411 }, { clubId: "club-b", playerId: "p-b", ownershipRevision: 1, elo: 999 }]);
  const player = await db.player.findUniqueOrThrow({ where: { id: "p-a" } });
  expect(player).toEqual({ ...before, name: "Current account-a", avatarKey: null });
  const receipt = await db.clubPlayerOwnershipEvent.findFirstOrThrow({ where: { clubMemberId: "m-a" } });
  expect(JSON.parse(receipt.metadataBeforeJson)).toEqual({ name: before.name, avatarKey: "old-avatar" });
  expect(JSON.parse(receipt.metadataAfterJson)).toEqual({ name: "Current account-a", avatarKey: null });
  await expect(db.$executeRaw`UPDATE "User" SET "ownerUserId"='account-a' WHERE "id"='p-c'`).rejects.toThrow(/PROVENANCE/);
  await expect(claim("club-a", "p-extra")).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
});

it("automatically removes only A, preserves B and every sport field, and retries cannot revoke restored access", async () => {
  await claim(); await claim("club-b", "p-b");
  const beforeB = await db.clubMember.findUniqueOrThrow({ where: { id: "m-b" } });
  const beforePlayer = await db.player.findUniqueOrThrow({ where: { id: "p-a" } });
  const grant = await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } });
  await remove();
  expect(await db.clubMember.findUnique({ where: { id: "m-a" } })).toMatchObject({ ownerUserId: null, ownershipRevision: 2, archivedAt: expect.any(Date), elo: 1411 });
  expect(await db.clubMember.findUnique({ where: { id: "m-b" } })).toEqual(beforeB);
  expect(await db.player.findUnique({ where: { id: "p-a" } })).toEqual(beforePlayer);
  expect(await db.clubAccess.findUnique({ where: { id: grant.id } })).toMatchObject({ status: "REVOKED", revision: 1 });
  await db.clubAccess.update({ where: { id: grant.id }, data: { status: "ACTIVE", role: "ADMIN" } });
  const restored = await db.clubAccess.findUniqueOrThrow({ where: { id: grant.id } });
  expect(await remove()).toMatchObject({ alreadyRemoved: true });
  expect(await db.clubAccess.findUnique({ where: { id: grant.id } })).toEqual(restored);
  expect(await db.clubPlayerOwnershipEvent.count({ where: { clubMemberId: "m-a" } })).toBe(2);
});

it("uses a fresh exact local release receipt once to restore only MEMBER, and replay is receipt-only", async () => {
  await claim(); await db.clubAccess.updateMany({ where: { clubId: "club-a", userId: "account-a" }, data: { role: "STAFF" } });
  await remove(); const fresh = await invite("p-extra");
  await tx(t => redeemPlayerInvitation(t, fresh.id, fresh.handle, "account-a"));
  const grant = await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } });
  expect(grant).toMatchObject({ role: "MEMBER", status: "ACTIVE", revision: 3 });
  const event = await db.clubPlayerOwnershipEvent.findFirstOrThrow({ where: { invitationId: fresh.id } });
  expect(event.releaseEventId).toBeTruthy();
  await db.clubAccess.update({ where: { id: grant.id }, data: { status: "REVOKED" } });
  const revoked = await db.clubAccess.findUniqueOrThrow({ where: { id: grant.id } });
  await tx(t => redeemPlayerInvitation(t, fresh.id, undefined, "account-a"));
  expect(await db.clubAccess.findUnique({ where: { id: grant.id } })).toEqual(revoked);
  expect(await db.playerOwnershipReleaseClaim.count()).toBe(0);
});

it("denies pre-release invitations and receipts invalidated by a later access revision", async () => {
  const before = await invite("p-extra", "club-a", new Date(Date.now() - 1000));
  await claim(); await remove();
  await expect(tx(t => redeemPlayerInvitation(t, before.id, before.handle, "account-a"))).rejects.toMatchObject({ code: "ACCESS_REVIEW_REQUIRED" });
  // A CREATE retry has no secret and preserves the existing older invitation.
  const fresh = await tx(t => managePlayerInvitation(t, { clubId: "club-a", playerId: "p-extra", userId: "admin", action: "CREATE" }));
  expect(fresh.invitation?.id).toBe(before.id);
  const replaced = await tx(t => managePlayerInvitation(t, { clubId: "club-a", playerId: "p-extra", userId: "admin", action: "REPLACE", invitationId: before.id }));
  const handle = await tx(t => exchangeInvitationSecret(t, replaced.invitation!.id, "secret" in replaced ? replaced.secret! : ""));
  const grant = await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } });
  await db.clubAccess.update({ where: { id: grant.id }, data: { role: "ADMIN" } });
  await expect(tx(t => redeemPlayerInvitation(t, replaced.invitation!.id, handle.handle, "account-a"))).rejects.toMatchObject({ code: "ACCESS_REVIEW_REQUIRED" });
});

it("self-leave releases only the current local owner and protects the owner and last admin", async () => {
  await claim();
  await expect(tx(t => removeClubPlayerOwnership(t, { clubId: "club-a", playerId: "p-a", actorUserId: "account-b", mode: "LEAVE" }))).rejects.toMatchObject({ statusCode: 403 });
  await tx(t => removeClubPlayerOwnership(t, { clubId: "club-a", playerId: "p-a", actorUserId: "account-a", mode: "LEAVE" }));
  expect(await db.clubMember.findUnique({ where: { id: "m-a" } })).toMatchObject({ ownerUserId: null, archivedAt: expect.any(Date) });
  await claim("club-b", "p-b", "creator");
  await expect(remove("club-b", "p-b")).rejects.toMatchObject({ statusCode: 403 });
  await claim("club-c", "p-c");
  await db.clubAccess.updateMany({ where: { clubId: "club-c", userId: "account-a" }, data: { role: "ADMIN" } });
  await db.clubAccess.updateMany({ where: { clubId: "club-c", userId: "admin" }, data: { status: "REVOKED" } });
  await expect(tx(t => removeClubPlayerOwnership(t, { clubId: "club-c", playerId: "p-c", actorUserId: "account-a", mode: "LEAVE" }))).rejects.toThrow(/last admin/);
});

it("audits and cancels affected local pending work while retaining unrelated club requests", async () => {
  await claim();
  const local = await admissionTransaction(db, t => submitClubAdmission(t, { clubId: "club-a", requesterUserId: "account-b", kind: "EXISTING_PLAYER", requestedPlayerId: "p-extra" }));
  const other = await admissionTransaction(db, t => submitClubAdmission(t, { clubId: "club-b", requesterUserId: "account-b", kind: "NEW_PLAYER", proposedPlayerName: "B", proposedGender: "MALE" }));
  const oldClaim = await db.claimRequest.create({ data: { clubId: "club-a", requesterUserId: "account-b", targetPlayerId: "p-a" } });
  await remove();
  // The other local placeholder request remains independent; only exact target
  // and removed-account requests are cancelled.
  expect(await db.clubAdmissionRequest.findUnique({ where: { id: local.id } })).toMatchObject({ status: "PENDING" });
  expect(await db.clubAdmissionRequest.findUnique({ where: { id: other.id } })).toMatchObject({ status: "PENDING" });
  expect(await db.claimRequest.findUnique({ where: { id: oldClaim.id } })).toMatchObject({ status: "REJECTED" });
  const event = await db.clubPlayerOwnershipEvent.findFirstOrThrow({ where: { clubMemberId: "m-a", action: "REMOVE" } });
  expect(JSON.parse(event.detailsJson).cancelled.claims).toContainEqual({ id: oldClaim.id, status: "PENDING", requesterUserId: "account-b", targetPlayerId: "p-a" });
});

it("creates NEW_PLAYER locally even with owned profiles elsewhere and rejects cross-club reuse", async () => {
  await claim();
  await expect(admissionTransaction(db, t => submitClubAdmission(t, { clubId: "club-b", requesterUserId: "account-a", kind: "OWNED_PLAYER", requestedPlayerId: "p-a" }))).rejects.toThrow(/another club/);
  const request = await admissionTransaction(db, t => submitClubAdmission(t, { clubId: "club-b", requesterUserId: "account-a", kind: "NEW_PLAYER", proposedPlayerName: "Old form value", proposedGender: "MALE" }));
  const approved = await admissionTransaction(db, t => reviewClubAdmission(t, { clubId: "club-b", requestId: request.id!, reviewerUserId: "admin", action: "APPROVE" }));
  expect(approved.approvedPlayerId).not.toBe("p-a");
  expect(await db.clubMember.findUnique({ where: { clubId_playerId: { clubId: "club-b", playerId: approved.approvedPlayerId! } } })).toMatchObject({ ownerUserId: "account-a" });
  expect(await db.player.findUnique({ where: { id: approved.approvedPlayerId! } })).toMatchObject({ name: "Current account-a", ownerUserId: null });
});

it("binds an unambiguous unfinished seat, preserves completed snapshots, and rejects duplicate participation", async () => {
  await db.session.createMany({ data: [{ id: "waiting", code: "WAIT", name: "waiting", clubId: "club-a", ratingPolicyVersion: 2 }, { id: "done", code: "DONE", name: "done", clubId: "club-a", status: "COMPLETED" }] });
  await db.sessionPlayer.createMany({ data: [{ id: "seat-wait", sessionId: "waiting", playerId: "p-a", profileClubId: "club-a" }, { id: "seat-done", sessionId: "done", playerId: "p-a" }] });
  const history = await db.sessionPlayer.findUniqueOrThrow({ where: { id: "seat-done" } });
  await claim();
  expect(await db.sessionPlayer.findUnique({ where: { id: "seat-wait" } })).toMatchObject({ participantAccountId: "account-a", profileClubId: "club-a" });
  expect(await db.sessionPlayer.findUnique({ where: { id: "seat-done" } })).toEqual(history);
  await claim("club-b", "p-b");
  await expect(db.sessionPlayer.create({ data: { sessionId: "waiting", playerId: "p-b", profileClubId: "club-b", participantAccountId: "account-a" } })).rejects.toThrow();
  await expect(remove()).rejects.toMatchObject({ code: "SESSION_PARTICIPATION_CONFLICT" });
  await expect(remove("club-b", "p-b")).resolves.toMatchObject({ disconnected: true });
});

it("serializes independent writers racing to claim the same profile", async () => {
  const second = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  try {
    const outcomes = await Promise.allSettled([
      clubOwnershipTransaction(db, t => claimClubPlayer(t, { clubId: "club-a", playerId: "p-a", userId: "account-a", actorUserId: "admin" })),
      clubOwnershipTransaction(second, t => claimClubPlayer(t, { clubId: "club-a", playerId: "p-a", userId: "account-b", actorUserId: "admin" })),
    ]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((outcomes.find(r => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ statusCode: 409 });
    expect(await db.clubPlayerOwnershipEvent.count({ where: { clubMemberId: "m-a" } })).toBe(1);
  } finally { await second.$disconnect(); }
});

it("serializes claim against joining another local profile and never creates duplicate account participation", async () => {
  await claim("club-b", "p-b");
  await db.session.create({ data: { id: "joint", code: "JOINT", name: "joint", clubId: "club-a", ratingPolicyVersion: 2 } });
  await db.sessionClub.create({ data: { sessionId: "joint", clubId: "club-b", status: "ACCEPTED" } });
  await db.sessionPlayer.create({ data: { id: "unclaimed-seat", sessionId: "joint", playerId: "p-a", profileClubId: "club-a" } });
  const second = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  try {
    const outcomes = await Promise.allSettled([
      claim(),
      admissionTransaction(second, async t => {
        await assertSessionAccountSeatAvailable(t, "joint", { playerId: "p-b", ownerUserId: "account-a" });
        return t.sessionPlayer.create({ data: { sessionId: "joint", playerId: "p-b", profileClubId: "club-b", participantAccountId: "account-a" } });
      }),
    ]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((outcomes.find(r => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ statusCode: 409 });
    expect(await db.sessionPlayer.count({ where: { sessionId: "joint", participantAccountId: "account-a" } })).toBe(1);
  } finally { await second.$disconnect(); }
});

it("disconnects only legacy A while active B retains ownership; a different account cannot claim the shared physical profile until every retained link is released", async () => {
  const playerBefore = await db.player.findUniqueOrThrow({ where: { id: "legacy-shared" } });
  const bBefore = await db.clubMember.findUniqueOrThrow({ where: { id: "legacy-member-b" } });
  await tx(t => disconnectRemovedPlayer(t, { clubId: "legacy-a", playerId: "legacy-shared", actorUserId: "legacy-admin" }));
  expect(await db.clubMember.findUnique({ where: { id: "legacy-member-a" } })).toMatchObject({ ownerUserId: null, archivedAt: new Date(30), ownershipRevision: 1, elo: 1356 });
  expect(await db.clubMember.findUnique({ where: { id: "legacy-member-b" } })).toEqual(bBefore);
  expect(await db.player.findUnique({ where: { id: "legacy-shared" } })).toEqual(playerBefore);
  await expect(tx(t => claimClubPlayer(t, { clubId: "legacy-a", playerId: "legacy-shared", userId: "account-b", actorUserId: "legacy-admin" }))).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
  await tx(t => removeClubPlayerOwnership(t, { clubId: "legacy-b", playerId: "legacy-shared", actorUserId: "legacy-admin" }));
  await tx(t => claimClubPlayer(t, { clubId: "legacy-a", playerId: "legacy-shared", userId: "account-b", actorUserId: "legacy-admin" }));
  expect(await db.clubMember.findUnique({ where: { id: "legacy-member-a" } })).toMatchObject({ ownerUserId: "account-b", archivedAt: null, elo: 1356 });
  expect(await db.player.findUnique({ where: { id: "legacy-shared" } })).toEqual({ ...playerBefore, name: "Current account-b", avatarKey: "account-b-avatar" });
  expect(await db.player.findUnique({ where: { id: "legacy-shared" } })).toMatchObject({ ownerUserId: "legacy-owner" });
});

it("counts retained archived local ownership in account uniqueness and permits clearly unrelated local session participation", async () => {
  await db.player.create({ data: { id: "legacy-extra", name: "Local extra" } });
  await db.clubMember.create({ data: { clubId: "legacy-a", playerId: "legacy-extra" } });
  await expect(tx(t => claimClubPlayer(t, { clubId: "legacy-a", playerId: "legacy-extra", userId: "legacy-owner", actorUserId: "legacy-admin" }))).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
  await db.session.create({ data: { id: "legacy-session", code: "LEGACY-B", name: "B only", clubId: "legacy-b", status: "ACTIVE" } });
  await db.sessionPlayer.create({ data: { id: "legacy-seat", sessionId: "legacy-session", playerId: "legacy-shared", representingClubId: "legacy-b" } });
  await expect(tx(t => disconnectRemovedPlayer(t, { clubId: "legacy-a", playerId: "legacy-shared", actorUserId: "legacy-admin" }))).resolves.toMatchObject({ disconnected: true });
  await expect(tx(t => removeClubPlayerOwnership(t, { clubId: "legacy-b", playerId: "legacy-shared", actorUserId: "legacy-admin" }))).rejects.toMatchObject({ code: "SESSION_PARTICIPATION_CONFLICT" });
});

it("fails closed on an ambiguous unfinished legacy shared profile without changing ownership, sessions or access", async () => {
  await db.clubMember.create({ data: { clubId: "club-b", playerId: "p-a" } });
  await db.session.create({ data: { id: "ambiguous", code: "AMBIG", name: "ambiguous", clubId: "club-a", status: "ACTIVE" } });
  await db.sessionClub.create({ data: { sessionId: "ambiguous", clubId: "club-b", status: "ACCEPTED" } });
  await db.sessionPlayer.create({ data: { id: "ambiguous-seat", sessionId: "ambiguous", playerId: "p-a" } });
  const before = await db.sessionPlayer.findUniqueOrThrow({ where: { id: "ambiguous-seat" } });
  await expect(claim()).rejects.toMatchObject({ code: "SESSION_PARTICIPATION_CONFLICT" });
  expect(await db.clubMember.findUnique({ where: { id: "m-a" } })).toMatchObject({ ownerUserId: null, ownershipRevision: 0 });
  expect(await db.sessionPlayer.findUnique({ where: { id: "ambiguous-seat" } })).toEqual(before);
  expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } })).toBeNull();
  await expect(db.$executeRaw`UPDATE "SessionPlayer" SET "profileClubId"='club-b' WHERE "id"='ambiguous-seat'`).rejects.toThrow(/IMMUTABLE/);
});

it("rejects raw v2 omitted, incorrect, unrelated, duplicate and guest owner snapshots", async () => {
  await claim(); await claim("club-b", "p-b");
  await db.session.create({ data: { id: "guarded", code: "GUARDED", name: "guarded", clubId: "club-a", ratingPolicyVersion: 2 } });
  const rawSeat = (id: string, playerId: string, clubId: string | null, accountId: string | null, guest = 0) => db.$executeRaw`
    INSERT INTO "SessionPlayer"("id","sessionId","userId","profileClubId","participantAccountId","isGuest") VALUES (${id},'guarded',${playerId},${clubId},${accountId},${guest})`;
  await expect(rawSeat("missing-account", "p-a", "club-a", null)).rejects.toThrow(/PROFILE_INVALID/);
  await expect(rawSeat("missing-context", "p-a", null, null)).rejects.toThrow(/PROFILE_INVALID/);
  await expect(rawSeat("wrong-account", "p-a", "club-a", "account-b")).rejects.toThrow(/PROFILE_INVALID/);
  await expect(rawSeat("unrelated", "p-b", "club-b", "account-a")).rejects.toThrow(/PROFILE_INVALID/);
  await expect(rawSeat("guest-owner", "p-a", "club-a", "account-a", 1)).rejects.toThrow(/PROFILE_INVALID/);
  await rawSeat("correct", "p-a", "club-a", "account-a");
  await db.sessionClub.create({ data: { sessionId: "guarded", clubId: "club-b", status: "PENDING" } });
  await expect(rawSeat("duplicate", "p-b", "club-b", "account-a")).rejects.toThrow();
  await db.session.create({ data: { id: "pending", code: "PENDING", name: "initial invited context", clubId: "club-a", ratingPolicyVersion: 2 } });
  await db.sessionClub.create({ data: { sessionId: "pending", clubId: "club-b", status: "PENDING" } });
  await db.sessionPlayer.create({ data: { sessionId: "pending", playerId: "p-b", profileClubId: "club-b", participantAccountId: "account-a" } });
  expect(await db.sessionPlayer.count({ where: { sessionId: "pending" } })).toBe(1);
});

it("rejects a raw v1 second seat even when both account snapshots are omitted", async () => {
  await claim(); await claim("club-b", "p-b");
  await db.session.create({ data: { id: "raw-legacy", code: "RAW-LEGACY", name: "legacy policy", clubId: "club-a" } });
  await db.sessionClub.create({ data: { sessionId: "raw-legacy", clubId: "club-b", status: "ACCEPTED" } });
  await db.sessionPlayer.create({ data: { sessionId: "raw-legacy", playerId: "p-a", representingClubId: "club-a" } });
  await expect(db.$executeRaw`INSERT INTO "SessionPlayer"("id","sessionId","userId","representingClubId") VALUES ('raw-duplicate','raw-legacy','p-b','club-b')`).rejects.toThrow(/PARTICIPATION_CONFLICT/);
  expect(await db.sessionPlayer.count({ where: { sessionId: "raw-legacy" } })).toBe(1);
});

it("rejects raw v1 UPDATE duplicates and freezes session, representation, and guest identity", async () => {
  await claim(); await claim("club-b", "p-b");
  await db.clubMember.create({ data: { clubId: "club-b", playerId: "p-extra" } });
  await db.session.createMany({ data: [{ id: "update-joint", code: "UPDATE-JOINT", name: "Joint", clubId: "club-a" }, { id: "update-other", code: "UPDATE-OTHER", name: "Other", clubId: "club-b" }] });
  await db.sessionClub.create({ data: { sessionId: "update-joint", clubId: "club-b", status: "ACCEPTED" } });
  await db.sessionPlayer.createMany({ data: [
    { id: "update-owned", sessionId: "update-joint", playerId: "p-a", profileClubId: "club-a", participantAccountId: "account-a" },
    { id: "update-extra", sessionId: "update-joint", playerId: "p-extra", profileClubId: "club-b" },
    { id: "update-moving", sessionId: "update-other", playerId: "p-b", representingClubId: "club-b" },
  ] });
  const before = await db.sessionPlayer.findMany({ orderBy: { id: "asc" } });
  await expect(db.$executeRaw`UPDATE "SessionPlayer" SET "userId"='p-b' WHERE "id"='update-extra'`).rejects.toThrow(/PARTICIPATION_CONFLICT/);
  await expect(db.$executeRaw`UPDATE "SessionPlayer" SET "sessionId"='update-joint' WHERE "id"='update-moving'`).rejects.toThrow(/IMMUTABLE|PARTICIPATION_CONFLICT/);
  await expect(db.$executeRaw`UPDATE "SessionPlayer" SET "representingClubId"='club-a' WHERE "id"='update-moving'`).rejects.toThrow(/IMMUTABLE/);
  await expect(db.$executeRaw`UPDATE "SessionPlayer" SET "isGuest"=1 WHERE "id"='update-owned'`).rejects.toThrow(/IMMUTABLE/);
  await expect(db.$executeRaw`UPDATE "SessionPlayer" SET "isGuest"=1 WHERE "id"='update-extra'`).rejects.toThrow(/IMMUTABLE/);
  expect(await db.sessionPlayer.findMany({ orderBy: { id: "asc" } })).toEqual(before);
  // The guard leaves unrelated preference/stat changes and exact claim binding available.
  await db.sessionPlayer.update({ where: { id: "update-extra" }, data: { pool: "A", sessionPoints: 3 } });
  await claim("club-b", "p-extra", "account-b");
  expect(await db.sessionPlayer.findUnique({ where: { id: "update-extra" } })).toMatchObject({ participantAccountId: "account-b", profileClubId: "club-b", pool: "A", sessionPoints: 3 });
});

it("rejects contradictory represented profile inserts and completed legacy identity mutations", async () => {
  await db.session.create({ data: { id: "context", code: "CONTEXT", name: "Context", clubId: "club-a", ratingPolicyVersion: 2 } });
  await db.sessionClub.create({ data: { sessionId: "context", clubId: "club-b", status: "ACCEPTED" } });
  await expect(db.$executeRaw`INSERT INTO "SessionPlayer"("id","sessionId","userId","profileClubId","representingClubId") VALUES ('mismatch','context','p-a','club-a','club-b')`).rejects.toThrow(/PROFILE_INVALID/);
  await db.session.create({ data: { id: "history-context", code: "HISTORY-CONTEXT", name: "History", clubId: "legacy-b", status: "COMPLETED" } });
  await db.sessionClub.create({ data: { sessionId: "history-context", clubId: "legacy-a", status: "ACCEPTED" } });
  await db.sessionPlayer.create({ data: { id: "history-context-seat", sessionId: "history-context", playerId: "legacy-shared", representingClubId: "legacy-b" } });
  const before = await db.sessionPlayer.findUniqueOrThrow({ where: { id: "history-context-seat" } });
  await expect(db.$executeRaw`UPDATE "SessionPlayer" SET "representingClubId"='legacy-a' WHERE "id"='history-context-seat'`).rejects.toThrow(/IMMUTABLE/);
  await expect(db.$executeRaw`UPDATE "SessionPlayer" SET "isGuest"=1 WHERE "id"='history-context-seat'`).rejects.toThrow(/IMMUTABLE/);
  expect(await db.sessionPlayer.findUnique({ where: { id: before.id } })).toEqual(before);
});

it("rejects missing new grant snapshots without changing the member, player, grant, or audit", async () => {
  const beforeMember = await db.clubMember.findUniqueOrThrow({ where: { id: "m-a" } });
  const beforePlayer = await db.player.findUniqueOrThrow({ where: { id: "p-a" } });
  for (const field of ["newAccessRevision", "newAccessStatus", "newAccessRole"] as const) {
    await expect(rawClaimReceipt({ id: `missing-${field}`, [field]: null })).rejects.toThrow(/SNAPSHOT_INVALID/);
  }
  expect(await db.clubMember.findUnique({ where: { id: "m-a" } })).toEqual(beforeMember);
  expect(await db.player.findUnique({ where: { id: "p-a" } })).toEqual(beforePlayer);
  expect(await db.clubAccess.count({ where: { clubId: "club-a", userId: "account-a" } })).toBe(0);
  expect(await db.clubPlayerOwnershipEvent.count()).toBe(0);
  await expect(rawClaimReceipt()).resolves.toBe(1);
  expect(await db.clubAccess.findUnique({ where: { id: "raw-grant" } })).toMatchObject({ revision: 0, status: "ACTIVE", role: "MEMBER" });
  expect(await db.clubPlayerOwnershipEvent.findUnique({ where: { id: "raw-claim" } })).toMatchObject({ newAccessRevision: 0 });
});

it("rejects partial existing grant snapshots atomically", async () => {
  const access = await db.clubAccess.create({ data: { id: "existing-grant", clubId: "club-a", userId: "account-a", role: "STAFF" } });
  const member = await db.clubMember.findUniqueOrThrow({ where: { id: "m-a" } });
  for (const field of ["previousAccessRevision", "previousAccessStatus", "previousAccessRole", "newAccessRevision", "newAccessStatus", "newAccessRole"] as const) {
    await expect(rawClaimReceipt({ id: `existing-missing-${field}`, accessId: access.id, previousAccessRevision: 0, previousAccessStatus: "ACTIVE", previousAccessRole: "STAFF", newAccessRole: "STAFF", [field]: null })).rejects.toThrow(/SNAPSHOT_INVALID|CLAIM_INVALID/);
  }
  expect(await db.clubMember.findUnique({ where: { id: member.id } })).toEqual(member);
  expect(await db.clubAccess.findUnique({ where: { id: access.id } })).toEqual(access);
  expect(await db.clubPlayerOwnershipEvent.count()).toBe(0);
});

it("denies ordinary tutorial claims while allowing isolated tutorial member cleanup", async () => {
  await db.club.create({ data: { id: "tutorial", name: "Tutorial", createdById: "admin", tutorialOwnerId: "admin", isTutorial: true } });
  await db.clubAccess.create({ data: { clubId: "tutorial", userId: "admin", role: "OWNER" } });
  await db.clubMember.create({ data: { id: "tutorial-fake", clubId: "tutorial", playerId: "p-c" } });
  const before = await db.clubMember.findUniqueOrThrow({ where: { id: "tutorial-fake" } });
  await expect(rawClaimReceipt({ id: "tutorial-claim", clubId: "tutorial", memberId: "tutorial-fake", playerId: "p-c" })).rejects.toThrow(/CLAIM_INVALID/);
  expect(await db.clubMember.findUnique({ where: { id: before.id } })).toEqual(before);
  expect(await db.clubAccess.count({ where: { clubId: "tutorial", userId: "account-a" } })).toBe(0);
  expect(await db.clubPlayerOwnershipEvent.count()).toBe(0);
  await db.clubMember.delete({ where: { id: "tutorial-fake" } });
  await db.player.create({ data: { id: "tutorial-owner", name: "Tutorial owner" } });
  await db.clubMember.create({ data: { clubId: "tutorial", playerId: "tutorial-owner", ownerUserId: "admin" } });
  await expect(db.club.delete({ where: { id: "tutorial" } })).resolves.toMatchObject({ id: "tutorial" });
  expect(await db.clubMember.count({ where: { clubId: "tutorial" } })).toBe(0);
});

it("preserves pre-migration retained rosters against deletion, recreation, and tutorial relabeling", async () => {
  const member = await db.clubMember.findUniqueOrThrow({ where: { id: "legacy-member-b" } });
  const access = await db.clubAccess.findUniqueOrThrow({ where: { id: "legacy-owner-b" } });
  expect(await db.clubPlayerOwnershipEvent.count()).toBe(0);
  await expect(db.$executeRaw`DELETE FROM "CommunityMember" WHERE "id"='legacy-member-b'`).rejects.toThrow(/HISTORY_PRESERVED/);
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "CommunityMember"("id","communityId","userId","ownerUserId","ownershipRevision","elo") VALUES ('legacy-member-b','legacy-b','legacy-shared',NULL,0,1000)`).rejects.toThrow(/IDENTITY_IMMUTABLE/);
  await expect(db.$executeRaw`DELETE FROM "Community" WHERE "id"='legacy-b'`).rejects.toThrow(/HISTORY_PRESERVED/);
  await expect(db.$executeRaw`UPDATE "Community" SET "isTutorial"=1,"tutorialOwnerId"='legacy-admin' WHERE "id"='legacy-b'`).rejects.toThrow(/CONTEXT_IMMUTABLE/);
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "Community"("id","name","createdById","isTutorial","tutorialOwnerId") VALUES ('legacy-b','Replacement','legacy-admin',1,'legacy-admin')`).rejects.toThrow(/CONTEXT_IMMUTABLE/);
  expect(await db.clubMember.findUnique({ where: { id: member.id } })).toEqual(member);
  expect(await db.clubAccess.findUnique({ where: { id: access.id } })).toEqual(access);
  expect(await db.clubPlayerOwnershipEvent.count()).toBe(0);
});

it("denies older same-millisecond release invitations and advances genuinely fresh issuance", async () => {
  const instant = new Date();
  const older = await invite("p-extra", "club-a", instant);
  await claim();
  await tx(t => removeClubPlayerOwnership(t, { clubId: "club-a", playerId: "p-a", actorUserId: "admin", now: instant }));
  const release = await db.clubPlayerOwnershipEvent.findFirstOrThrow({ where: { action: "REMOVE" } });
  expect(await db.playerInvitation.findUnique({ where: { id: older.id } })).toMatchObject({ createdAt: instant, status: "ACTIVE" });
  expect(await db.$queryRaw`SELECT * FROM "ClaimReleaseAuthorization" WHERE "invitationId"=${older.id}`).toEqual([]);
  const access = await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } });
  await expect(tx(t => redeemPlayerInvitation(t, older.id, older.handle, "account-a", instant))).rejects.toMatchObject({ code: "ACCESS_REVIEW_REQUIRED" });
  await expect(db.$executeRaw`UPDATE "PlayerInvitation" SET "status"='REDEEMED',"redeemedByUserId"='account-a',"redeemedAt"=${instant.getTime()} WHERE "id"=${older.id}`).rejects.toThrow(/STATE_INVALID/);
  expect(await db.clubAccess.findUnique({ where: { id: access.id } })).toEqual(access);
  expect(await db.clubMember.findUnique({ where: { id: "m-extra" } })).toMatchObject({ ownerUserId: null, ownershipRevision: 0 });
  const fresh = await tx(t => managePlayerInvitation(t, { clubId: "club-a", playerId: "p-extra", userId: "admin", action: "REPLACE", invitationId: older.id, now: instant }));
  expect(fresh.invitation!.createdAt.getTime()).toBe(release.createdAt.getTime() + 1);
  const exchanged = await tx(t => exchangeInvitationSecret(t, fresh.invitation!.id, "secret" in fresh ? fresh.secret! : "", instant));
  await tx(t => redeemPlayerInvitation(t, fresh.invitation!.id, exchanged.handle, "account-a", instant));
  expect(await db.clubAccess.findUnique({ where: { id: access.id } })).toMatchObject({ role: "MEMBER", status: "ACTIVE", revision: 2 });
});

it("rejects direct redemption of an expired invitation before ownership or access can change", async () => {
  const expired = await tx(t => managePlayerInvitation(t, { clubId: "club-a", playerId: "p-a", userId: "admin", action: "CREATE", now: new Date(Date.now() - 8 * 86400000) }));
  await expect(db.$executeRaw`UPDATE "PlayerInvitation" SET "status"='REDEEMED',"redeemedByUserId"='account-a',"redeemedAt"=${Date.now()} WHERE "id"=${expired.invitation!.id}`).rejects.toThrow(/STATE_INVALID/);
  expect(await db.clubMember.findUnique({ where: { id: "m-a" } })).toMatchObject({ ownerUserId: null, ownershipRevision: 0 });
  expect(await db.clubPlayerOwnershipEvent.count()).toBe(0);
});

it("preserves copied result snapshots after access revocation while rejecting a forged source pointer", async () => {
  await claim();
  await db.session.create({ data: { id: "source-result", code: "SOURCE", name: "Source", clubId: "club-a", ratingPolicyVersion: 2 } });
  await db.sessionPlayer.create({ data: { sessionId: "source-result", playerId: "p-a", profileClubId: "club-a", participantAccountId: "account-a" } });
  await db.court.create({ data: { id: "result-court", sessionId: "source-result", courtNumber: 1 } });
  await db.match.create({ data: { sessionId: "source-result", courtId: "result-court", team1Player1Id: "p-a", team1Player2Id: "p-b", team2Player1Id: "p-c", team2Player2Id: "p-extra", status: "COMPLETED", team1Score: 21, team2Score: 17 } });
  await db.session.update({ where: { id: "source-result" }, data: { status: "COMPLETED" } });
  await remove();
  await db.session.create({ data: { id: "copy-result", code: "COPY", name: "Copy", clubId: "club-a", ratingPolicyVersion: 2, status: "COMPLETED", sourceSessionId: "source-result" } });
  await db.sessionPlayer.create({ data: { sessionId: "copy-result", playerId: "p-a", profileClubId: "club-a", participantAccountId: "account-a" } });
  await db.session.create({ data: { id: "forged-copy", code: "FORGED", name: "Forged", clubId: "club-a", ratingPolicyVersion: 2, status: "COMPLETED", sourceSessionId: "source-result" } });
  await expect(db.$executeRaw`INSERT INTO "SessionPlayer"("id","sessionId","userId","profileClubId","participantAccountId") VALUES ('forged-seat','forged-copy','p-a','club-a','account-b')`).rejects.toThrow(/PROFILE_INVALID/);
});

it("leaves guest account snapshots untouched when their physical profile later joins a local roster", async () => {
  await db.session.create({ data: { id: "guest-session", code: "GUEST", name: "Guest", clubId: "club-a", ratingPolicyVersion: 2 } });
  await db.sessionPlayer.create({ data: { sessionId: "guest-session", playerId: "p-a", isGuest: true } });
  const before = await db.sessionPlayer.findFirstOrThrow({ where: { sessionId: "guest-session" } });
  await claim();
  expect(await db.sessionPlayer.findUnique({ where: { id: before.id } })).toEqual(before);
});

it("enforces affected pending-work closure on direct ownership receipts before changing ownership or access", async () => {
  await claim();
  const pending = await db.claimRequest.create({ data: { clubId: "club-a", requesterUserId: "account-b", targetPlayerId: "p-a" } });
  const access = await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } });
  const metadata = JSON.stringify({ name: "Current account-a", avatarKey: null });
  const details = JSON.stringify({ previousArchivedAt: null, newArchivedAt: Date.now(), cancelled: {} });
  await expect(db.$executeRaw`INSERT INTO "ClubPlayerOwnershipEvent"("id","clubId","clubMemberId","playerId","actorUserId","action","previousOwnerUserId","newOwnerUserId","previousOwnershipRevision","newOwnershipRevision","accessId","previousAccessRevision","newAccessRevision","previousAccessStatus","newAccessStatus","previousAccessRole","newAccessRole","metadataBeforeJson","metadataAfterJson","detailsJson","reason","createdAt")
   VALUES ('raw-release','club-a','m-a','p-a','admin','REMOVE','account-a',NULL,1,2,${access.id},0,1,'ACTIVE','REVOKED','MEMBER','MEMBER',${metadata},${metadata},${details},'Direct removal',${Date.now()})`).rejects.toThrow(/PENDING_WORK_OPEN/);
  expect(await db.clubMember.findUnique({ where: { id: "m-a" } })).toMatchObject({ ownerUserId: "account-a", ownershipRevision: 1 });
  expect(await db.clubAccess.findUnique({ where: { id: access.id } })).toEqual(access);
  expect(await db.claimRequest.findUnique({ where: { id: pending.id } })).toMatchObject({ status: "PENDING" });
  await remove();
  expect(await db.claimRequest.findUnique({ where: { id: pending.id } })).toMatchObject({ status: "REJECTED" });
});

it("uses independent libSQL writer reservations for a concurrent claim/join race", async () => {
  await claim("club-b", "p-b");
  await db.session.create({ data: { id: "adapter-joint", code: "ADAPTER-JOINT", name: "joint", clubId: "club-a", ratingPolicyVersion: 2 } });
  await db.sessionClub.create({ data: { sessionId: "adapter-joint", clubId: "club-b", status: "ACCEPTED" } });
  await db.sessionPlayer.create({ data: { sessionId: "adapter-joint", playerId: "p-a", profileClubId: "club-a" } });
  await db.$disconnect(); adapterFiles.add(file);
  const clients = [createClient({ url: `file:${file}` }), createClient({ url: `file:${file}` })];
  const writers = clients.map(client => new PrismaClient({ adapter: new PrismaLibSQL(client as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]) } as unknown as ConstructorParameters<typeof PrismaClient>[0]));
  try {
    for (const client of clients) await client.execute("PRAGMA foreign_keys=ON");
    const outcomes = await Promise.allSettled([
      clubOwnershipTransaction(writers[0], t => claimClubPlayer(t, { clubId: "club-a", playerId: "p-a", userId: "account-a", actorUserId: "admin" })),
      admissionTransaction(writers[1], async t => {
        await assertSessionAccountSeatAvailable(t, "adapter-joint", { playerId: "p-b", ownerUserId: "account-a" });
        return t.sessionPlayer.create({ data: { sessionId: "adapter-joint", playerId: "p-b", profileClubId: "club-b", participantAccountId: "account-a" } });
      }),
    ]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((outcomes.find(r => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ statusCode: 409 });
    expect(await writers[0].sessionPlayer.count({ where: { sessionId: "adapter-joint", participantAccountId: "account-a" } })).toBe(1);
  } finally { for (const writer of writers) await writer.$disconnect(); for (const client of clients) client.close(); }
}, 30000);

it("denies direct ownership bypasses, forged revision events, audit replacement and legacy writers", async () => {
  await claim();
  await expect(db.$executeRaw`UPDATE "CommunityMember" SET "ownerUserId"=NULL WHERE "id"='m-a'`).rejects.toThrow(/EVENT_REQUIRED/);
  const receipt = await db.clubPlayerOwnershipEvent.findFirstOrThrow();
  await expect(db.$executeRaw`UPDATE "ClubPlayerOwnershipEvent" SET "reason"='rewrite' WHERE "id"=${receipt.id}`).rejects.toThrow(/IMMUTABLE/);
  await expect(db.$executeRaw`DELETE FROM "ClubPlayerOwnershipEvent" WHERE "id"=${receipt.id}`).rejects.toThrow(/IMMUTABLE/);
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "ClubPlayerOwnershipEvent" SELECT * FROM "ClubPlayerOwnershipEvent" WHERE "id"=${receipt.id}`).rejects.toThrow(/IMMUTABLE|INVALID/);
  expect(await db.clubPlayerOwnershipEvent.findUnique({ where: { id: receipt.id } })).toEqual(receipt);
  await expect(db.$executeRaw`INSERT INTO "PlayerOwnershipRelease"("id","clubId","playerId","previousOwnerUserId","actorUserId","accessId","accessRevision","membershipsJson","reason","createdAt") VALUES ('forged','club-a','p-a','account-a','admin','bad',0,'[]','forged',0)`).rejects.toThrow(/CLOSED/);
  await expect(db.$executeRaw`INSERT INTO "ClubJoinRequest"("id","clubId","userId","kind","status","createdAt","updatedAt") VALUES ('forged','club-b','account-a','OWNED_PLAYER','PENDING',0,0)`).rejects.toThrow(/CLOSED/);
  await expect(assertLocalClaimAvailable(db, { clubId: "club-a", playerId: "p-extra", userId: "account-a" })).rejects.toThrow(/another profile/);
  await expect(tx(t => disconnectRemovedPlayer(t, { clubId: "club-a", playerId: "p-a", actorUserId: "admin" }))).rejects.toThrow(/Remove this profile/);
});
