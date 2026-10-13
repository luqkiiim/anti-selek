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
import { syncAccountProfile } from "./accountProfileSync";

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
    // A legal historical retirement predates the closed recovery writers. Keep
    // all migration guards enabled so fanout tests see a real immutable record.
    if (migration === "20261008140000_authorized_identity_transitions") sqlite.exec(`
      INSERT INTO Account(id,name,email,passwordHash,avatarKey,createdAt,updatedAt) VALUES ('retired-admin','Retired Admin','retired-admin@test.invalid','hash',NULL,1700000000000,1700000000000),('retired-owner','Retired Owner','retired-owner@test.invalid','hash',NULL,1700000000000,1700000000000);
      INSERT INTO Community(id,name,createdById,createdAt,updatedAt) VALUES ('retired-club','Retired Club','retired-admin',1700000000000,1700000000000);
      INSERT INTO User(id,ownerUserId,name,avatarKey,isActive,createdAt,updatedAt) VALUES ('retired-source','retired-owner','Old duplicate','retired-photo',0,1600000000000,1700000000000),('retained-target',NULL,'Retained target',NULL,1,1600000000000,1700000000000);
      INSERT INTO CommunityMember(id,communityId,userId,ownerUserId,createdAt,archivedAt) VALUES ('retired-source-member','retired-club','retired-source','retired-owner',1700000000001,1700000100001),('retained-target-member','retired-club','retained-target',NULL,1600000000000,NULL);
      INSERT INTO ClubAccess(id,clubId,userId,role,status,createdAt,updatedAt) VALUES ('retired-admin-access','retired-club','retired-admin','OWNER','ACTIVE',1700000000000,1700000000000),('retired-owner-access','retired-club','retired-owner','MEMBER','ACTIVE',1700000000000,1700000000000);
      INSERT INTO PlayerInvitation(id,clubId,playerId,clubMemberId,createdByUserId,tokenHash,status,expiresAt,createdAt,updatedAt) VALUES ('retirement-invite','retired-club','retained-target','retained-target-member','retired-admin','retirement-hash','ACTIVE','2035-01-01T00:00:00.000Z',1700000400000,1700000400000);
      INSERT INTO ClubJoinRequest(id,clubId,userId,kind,status,requestedPlayerId,revision,originInvitationId,createdAt,updatedAt) VALUES ('retirement-request','retired-club','retired-owner','EXISTING_PLAYER','PENDING','retained-target',0,'retirement-invite',1700000500000,1700000500000);
      INSERT INTO ClubAdmissionEvent(id,admissionRequestId,actorUserId,action,revision,detailsJson,createdAt) VALUES ('retirement-submit','retirement-request','retired-owner','SUBMIT',0,'{"kind":"EXISTING_PLAYER","requestedPlayerId":"retained-target"}',1700000500000);
      UPDATE ClubJoinRequest SET revision=1 WHERE id='retirement-request';
      INSERT INTO ClubAdmissionEvent(id,admissionRequestId,actorUserId,action,revision,detailsJson,createdAt) VALUES ('retirement-approval','retirement-request','retired-admin','APPROVE_RECOVERY',1,'{"originInvitationId":"retirement-invite","targetPlayerId":"retained-target","sourcePlayerId":"retired-source","sourceMemberId":"retired-source-member","confirmRestoreAccess":false,"restoredAccess":false,"reason":"Verified empty duplicate"}',1700000600000);
      UPDATE CommunityMember SET retiredByAdmissionEventId='retirement-approval' WHERE id='retired-source-member';
      UPDATE PlayerInvitation SET status='REDEEMED',redeemedByUserId='retired-owner',redeemedAt=1700000600001 WHERE id='retirement-invite';
      UPDATE User SET ownerUserId='retired-owner' WHERE id='retained-target';
      UPDATE ClubJoinRequest SET status='APPROVED',approvedPlayerId='retained-target',decision='RECOVER_INVITED_PLAYER',reviewedById='retired-admin',reviewedAt=1700000600002 WHERE id='retirement-request';
    `);
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

it("claims distinct A/B local profiles, audits current name and adopted avatar, and freezes global provenance", async () => {
  const before = await db.player.findUniqueOrThrow({ where: { id: "p-a" } });
  await claim(); await claim("club-b", "p-b");
  expect(await db.clubMember.findMany({ where: { ownerUserId: "account-a" }, orderBy: { clubId: "asc" } })).toMatchObject([{ clubId: "club-a", playerId: "p-a", ownershipRevision: 1, elo: 1411 }, { clubId: "club-b", playerId: "p-b", ownershipRevision: 1, elo: 999 }]);
  const player = await db.player.findUniqueOrThrow({ where: { id: "p-a" } });
  expect(player).toEqual({ ...before, name: "Current account-a", avatarKey: "old-avatar" });
  const receipt = await db.clubPlayerOwnershipEvent.findFirstOrThrow({ where: { clubMemberId: "m-a" } });
  expect(JSON.parse(receipt.metadataBeforeJson)).toEqual({ name: before.name, avatarKey: "old-avatar" });
  expect(JSON.parse(receipt.metadataAfterJson)).toEqual({ name: "Current account-a", avatarKey: "old-avatar" });
  expect(JSON.parse(receipt.detailsJson)).toMatchObject({ photoSource: "PLACEHOLDER", accountAvatarBefore: null, accountAvatarAfter: "old-avatar" });
  await expect(db.$executeRaw`UPDATE "User" SET "ownerUserId"='account-a' WHERE "id"='p-c'`).rejects.toThrow(/PROVENANCE/);
  await expect(claim("club-a", "p-extra")).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
});

const missingAvatars = [null, "", " \t\n"];
it.each([
  ...["account-photo", "  account-photo  "].flatMap(accountAvatar => [...missingAvatars, "placeholder-photo"].map(placeholderAvatar => ({ accountAvatar, placeholderAvatar, source: "ACCOUNT", finalAvatar: accountAvatar }))),
  ...missingAvatars.flatMap(accountAvatar => ["placeholder-photo", "  placeholder-photo  "].map(placeholderAvatar => ({ accountAvatar, placeholderAvatar, source: "PLACEHOLDER", finalAvatar: placeholderAvatar }))),
  ...missingAvatars.flatMap(accountAvatar => missingAvatars.map(placeholderAvatar => ({ accountAvatar, placeholderAvatar, source: "NONE", finalAvatar: accountAvatar }))),
])("resolves $source from fresh account '$accountAvatar' and placeholder '$placeholderAvatar'", async ({ accountAvatar, placeholderAvatar, source, finalAvatar }) => {
  await db.user.update({ where: { id: "account-a" }, data: { avatarKey: accountAvatar, selfNameChangedAt: new Date(100), selfGenderChangedAt: new Date(200), mixedSideOverride: "LOWER" } });
  await db.player.update({ where: { id: "p-a" }, data: { avatarKey: placeholderAvatar } });
  const accountBefore = await db.user.findUniqueOrThrow({ where: { id: "account-a" } });
  const playerBefore = await db.player.findUniqueOrThrow({ where: { id: "p-a" } });
  await claim();
  const accountAfter = await db.user.findUniqueOrThrow({ where: { id: "account-a" } });
  expect(accountAfter).toEqual(source === "PLACEHOLDER" ? { ...accountBefore, avatarKey: finalAvatar, updatedAt: accountAfter.updatedAt } : accountBefore);
  expect(await db.player.findUniqueOrThrow({ where: { id: "p-a" } })).toEqual({ ...playerBefore, name: accountBefore.name, avatarKey: finalAvatar });
  const event = await db.clubPlayerOwnershipEvent.findFirstOrThrow({ where: { clubMemberId: "m-a" } });
  expect(JSON.parse(event.metadataBeforeJson)).toEqual({ name: playerBefore.name, avatarKey: placeholderAvatar });
  expect(JSON.parse(event.metadataAfterJson)).toEqual({ name: accountBefore.name, avatarKey: finalAvatar });
  expect(JSON.parse(event.detailsJson)).toMatchObject({ photoSource: source, accountAvatarBefore: accountAvatar, accountAvatarAfter: finalAvatar });
});

it.each(["account-upload", "placeholder-update", "account-removal"])("uses completion-time photos after delayed approval: %s", async change => {
  if (change === "account-removal") await db.user.update({ where: { id: "account-a" }, data: { avatarKey: "submitted-photo" } });
  const request = await admissionTransaction(db, t => submitClubAdmission(t, { clubId: "club-a", requesterUserId: "account-a", kind: "EXISTING_PLAYER", requestedPlayerId: "p-a" }));
  expect(await db.user.findUniqueOrThrow({ where: { id: "account-a" } })).toMatchObject({ avatarKey: change === "account-removal" ? "submitted-photo" : null });
  if (change === "account-upload") await tx(t => syncAccountProfile(t, { userId: "account-a", changes: { avatarKey: "fresh-account-photo" }, expectedAvatarKey: null }));
  if (change === "account-removal") await tx(t => syncAccountProfile(t, { userId: "account-a", changes: { avatarKey: null }, expectedAvatarKey: "submitted-photo" }));
  await db.player.update({ where: { id: "p-a" }, data: { avatarKey: "fresh-placeholder-photo" } });
  await admissionTransaction(db, t => reviewClubAdmission(t, { clubId: "club-a", requestId: request.id!, reviewerUserId: "admin", action: "APPROVE" }));
  const finalAvatar = change === "account-upload" ? "fresh-account-photo" : "fresh-placeholder-photo";
  expect(await db.user.findUniqueOrThrow({ where: { id: "account-a" } })).toMatchObject({ avatarKey: finalAvatar });
  expect(await db.player.findUniqueOrThrow({ where: { id: "p-a" } })).toMatchObject({ avatarKey: finalAvatar });
  const event = await db.clubPlayerOwnershipEvent.findFirstOrThrow({ where: { admissionRequestId: request.id } });
  expect(JSON.parse(event.metadataBeforeJson).avatarKey).toBe("fresh-placeholder-photo");
});

it("personal invitation adoption reads the latest placeholder and redeemed retries preserve replacement and removal", async () => {
  const invitation = await invite();
  await db.player.update({ where: { id: "p-a" }, data: { avatarKey: "latest-invited-photo" } });
  await tx(t => redeemPlayerInvitation(t, invitation.id, invitation.handle, "account-a"));
  expect(await db.user.findUniqueOrThrow({ where: { id: "account-a" } })).toMatchObject({ avatarKey: "latest-invited-photo" });
  for (const avatarKey of ["replacement-photo", null]) {
    await tx(t => syncAccountProfile(t, { userId: "account-a", changes: { avatarKey } }));
    const before = { account: await db.user.findUniqueOrThrow({ where: { id: "account-a" } }), player: await db.player.findUniqueOrThrow({ where: { id: "p-a" } }), events: await db.clubPlayerOwnershipEvent.findMany() };
    await tx(t => redeemPlayerInvitation(t, invitation.id, undefined, "account-a"));
    await claim();
    expect({ account: await db.user.findUniqueOrThrow({ where: { id: "account-a" } }), player: await db.player.findUniqueOrThrow({ where: { id: "p-a" } }), events: await db.clubPlayerOwnershipEvent.findMany() }).toEqual(before);
  }
});

it("approved admission retries preserve later photo replacement and removal", async () => {
  const request = await admissionTransaction(db, t => submitClubAdmission(t, { clubId: "club-a", requesterUserId: "account-a", kind: "EXISTING_PLAYER", requestedPlayerId: "p-a" }));
  const approve = () => admissionTransaction(db, t => reviewClubAdmission(t, { clubId: "club-a", requestId: request.id!, reviewerUserId: "admin", action: "APPROVE" }));
  await approve();
  for (const avatarKey of ["replacement-photo", null]) {
    await tx(t => syncAccountProfile(t, { userId: "account-a", changes: { avatarKey } }));
    const before = { account: await db.user.findUniqueOrThrow({ where: { id: "account-a" } }), players: await db.player.findMany(), events: await db.clubPlayerOwnershipEvent.findMany() };
    await approve();
    expect({ account: await db.user.findUniqueOrThrow({ where: { id: "account-a" } }), players: await db.player.findMany(), events: await db.clubPlayerOwnershipEvent.findMany() }).toEqual(before);
  }
});

it("the first successful claim in two clubs supplies the one canonical photo", async () => {
  await db.player.update({ where: { id: "p-b" }, data: { avatarKey: "second-placeholder-photo" } });
  const second = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  try {
    const results = await Promise.all([
      clubOwnershipTransaction(db, t => claimClubPlayer(t, { clubId: "club-a", playerId: "p-a", userId: "account-a", actorUserId: "admin" })),
      clubOwnershipTransaction(second, t => claimClubPlayer(t, { clubId: "club-b", playerId: "p-b", userId: "account-a", actorUserId: "admin" })),
    ]);
    expect(results).toHaveLength(2);
    const events = await db.clubPlayerOwnershipEvent.findMany({ where: { newOwnerUserId: "account-a" } });
    const adopted = events.find(event => JSON.parse(event.detailsJson).photoSource === "PLACEHOLDER")!;
    const retained = events.find(event => JSON.parse(event.detailsJson).photoSource === "ACCOUNT")!;
    const avatarKey = JSON.parse(adopted.metadataAfterJson).avatarKey;
    expect(JSON.parse(retained.metadataAfterJson).avatarKey).toBe(avatarKey);
    expect(await db.user.findUniqueOrThrow({ where: { id: "account-a" } })).toMatchObject({ avatarKey });
    for (const id of ["p-a", "p-b"]) expect(await db.player.findUniqueOrThrow({ where: { id } })).toMatchObject({ avatarKey });
  } finally { await second.$disconnect(); }
});

it("serializes adoption with an upload and rejects a stale avatar guard", async () => {
  const second = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  try {
    const [claimResult, uploadResult] = await Promise.allSettled([
      claim(),
      clubOwnershipTransaction(second, t => syncAccountProfile(t, { userId: "account-a", changes: { avatarKey: "uploaded-photo" }, expectedAvatarKey: null })),
    ]);
    expect(claimResult.status).toBe("fulfilled");
    const avatarKey = uploadResult.status === "fulfilled" ? "uploaded-photo" : "old-avatar";
    if (uploadResult.status === "rejected") expect(uploadResult.reason).toMatchObject({ statusCode: 409 });
    expect(await db.user.findUniqueOrThrow({ where: { id: "account-a" } })).toMatchObject({ avatarKey });
    expect(await db.player.findUniqueOrThrow({ where: { id: "p-a" } })).toMatchObject({ avatarKey });
    const before = { account: await db.user.findUniqueOrThrow({ where: { id: "account-a" } }), players: await db.player.findMany() };
    await expect(tx(t => syncAccountProfile(t, { userId: "account-a", changes: { avatarKey: "stale-upload" }, expectedAvatarKey: null }))).rejects.toMatchObject({ statusCode: 409 });
    expect({ account: await db.user.findUniqueOrThrow({ where: { id: "account-a" } }), players: await db.player.findMany() }).toEqual(before);
  } finally { await second.$disconnect(); }
});

async function photoClaimSnapshot() {
  return { accounts: await db.user.findMany({ orderBy: { id: "asc" } }), players: await db.player.findMany({ orderBy: { id: "asc" } }), members: await db.clubMember.findMany({ orderBy: { id: "asc" } }), access: await db.clubAccess.findMany({ orderBy: { id: "asc" } }), events: await db.clubPlayerOwnershipEvent.findMany(), admissions: await db.clubAdmissionRequest.findMany(), admissionEvents: await db.clubAdmissionEvent.findMany(), invitations: await db.playerInvitation.findMany(), invitationEvents: await db.playerInvitationEvent.findMany(), continuations: await db.playerInvitationContinuation.findMany() };
}

it("rolls back adoption and owned-profile fanout when claim authorization fails", async () => {
  await claim("club-b", "p-b");
  await tx(t => syncAccountProfile(t, { userId: "account-a", changes: { avatarKey: null } }));
  const before = await photoClaimSnapshot();
  // This active actor lacks local admin authority; the database guard rejects
  // after the adoption sync, proving both canonical and fanout writes roll back.
  await expect(tx(t => claimClubPlayer(t, { clubId: "club-a", playerId: "p-a", userId: "account-a", actorUserId: "account-b" }))).rejects.toMatchObject({ statusCode: 409 });
  expect(await photoClaimSnapshot()).toEqual(before);
});

it("rolls back canonical account adoption when an owned-player photo fanout fails", async () => {
  await claim("club-b", "p-b");
  await tx(t => syncAccountProfile(t, { userId: "account-a", changes: { avatarKey: null } }));
  await db.$executeRawUnsafe(`CREATE TRIGGER fixture_reject_photo_fanout BEFORE UPDATE OF "avatarKey" ON "User" WHEN NEW."id"='p-b' BEGIN SELECT RAISE(ABORT,'fixture photo fanout failure'); END`);
  const before = await photoClaimSnapshot();
  await expect(claim()).rejects.toThrow();
  expect(await photoClaimSnapshot()).toEqual(before);
});

it.each(["invitation", "admission"])("rolls back %s receipts, account adoption and fanout when the ownership event fails", async flow => {
  await claim("club-b", "p-b");
  await tx(t => syncAccountProfile(t, { userId: "account-a", changes: { avatarKey: null } }));
  const invitation = flow === "invitation" ? await invite() : null;
  const request = flow === "admission" ? await admissionTransaction(db, t => submitClubAdmission(t, { clubId: "club-a", requesterUserId: "account-a", kind: "EXISTING_PLAYER", requestedPlayerId: "p-a" })) : null;
  await db.$executeRawUnsafe(`CREATE TRIGGER fixture_reject_adoption_event BEFORE INSERT ON "ClubPlayerOwnershipEvent" WHEN NEW."playerId"='p-a' BEGIN SELECT RAISE(ABORT,'LOCAL_CLAIM_INVALID'); END`);
  const before = await photoClaimSnapshot();
  await expect(flow === "invitation" ? tx(t => redeemPlayerInvitation(t, invitation!.id, invitation!.handle, "account-a")) : admissionTransaction(db, t => reviewClubAdmission(t, { clubId: "club-a", requestId: request!.id!, reviewerUserId: "admin", action: "APPROVE" }))).rejects.toMatchObject({ statusCode: 409 });
  expect(await photoClaimSnapshot()).toEqual(before);
});

it("rolls back a completed claim and adoption when the later admission audit fails", async () => {
  const request = await admissionTransaction(db, t => submitClubAdmission(t, { clubId: "club-a", requesterUserId: "account-a", kind: "EXISTING_PLAYER", requestedPlayerId: "p-a" }));
  await db.$executeRawUnsafe(`CREATE TRIGGER fixture_reject_approval_event BEFORE INSERT ON "ClubAdmissionEvent" WHEN NEW."action"='APPROVE' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END`);
  const before = await photoClaimSnapshot();
  await expect(admissionTransaction(db, t => reviewClubAdmission(t, { clubId: "club-a", requestId: request.id!, reviewerUserId: "admin", action: "APPROVE" }))).rejects.toThrow();
  expect(await photoClaimSnapshot()).toEqual(before);
});

it("fans adopted photos out to separate and legacy shared owned profiles, retaining archived links and excluding disconnected ones", async () => {
  await claim("club-b", "p-b", "legacy-owner");
  await claim("club-c", "p-c", "legacy-owner");
  await remove("club-c", "p-c");
  await tx(t => syncAccountProfile(t, { userId: "legacy-owner", changes: { avatarKey: null } }));
  await db.player.update({ where: { id: "p-a" }, data: { avatarKey: "adopted-new-photo" } });
  const accountBefore = await db.user.findUniqueOrThrow({ where: { id: "legacy-owner" } });
  const sharedBefore = await db.player.findUniqueOrThrow({ where: { id: "legacy-shared" } });
  const separateBefore = await db.player.findUniqueOrThrow({ where: { id: "p-b" } });
  const detachedBefore = await db.player.findUniqueOrThrow({ where: { id: "p-c" } });
  const membersBefore = await db.clubMember.findMany({ where: { id: { in: ["legacy-member-a", "legacy-member-b", "m-b", "m-c"] } }, orderBy: { id: "asc" } });
  await claim("club-a", "p-a", "legacy-owner");
  const accountAfter = await db.user.findUniqueOrThrow({ where: { id: "legacy-owner" } });
  expect(accountAfter).toEqual({ ...accountBefore, avatarKey: "adopted-new-photo", updatedAt: accountAfter.updatedAt });
  for (const before of [sharedBefore, separateBefore]) {
    const after = await db.player.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toEqual({ ...before, avatarKey: "adopted-new-photo", updatedAt: after.updatedAt });
  }
  expect(await db.player.findUniqueOrThrow({ where: { id: "p-c" } })).toEqual(detachedBefore);
  expect(await db.clubMember.findMany({ where: { id: { in: membersBefore.map(member => member.id) } }, orderBy: { id: "asc" } })).toEqual(membersBefore);
});

it("adopts from a legacy shared target already owned in another club without changing its timestamp or before snapshot", async () => {
  await db.clubMember.create({ data: { id: "legacy-new-local", clubId: "club-a", playerId: "legacy-shared", elo: 1201 } });
  const playerBefore = await db.player.findUniqueOrThrow({ where: { id: "legacy-shared" } });
  const legacyMembersBefore = await db.clubMember.findMany({ where: { id: { in: ["legacy-member-a", "legacy-member-b"] } }, orderBy: { id: "asc" } });
  await claim("club-a", "legacy-shared", "legacy-owner");
  expect(await db.player.findUniqueOrThrow({ where: { id: "legacy-shared" } })).toEqual({ ...playerBefore, name: "Legacy Owner" });
  expect(await db.clubMember.findMany({ where: { id: { in: legacyMembersBefore.map(member => member.id) } }, orderBy: { id: "asc" } })).toEqual(legacyMembersBefore);
  const event = await db.clubPlayerOwnershipEvent.findFirstOrThrow({ where: { clubMemberId: "legacy-new-local" } });
  expect(event.metadataBeforeJson).toBe(JSON.stringify({ name: playerBefore.name, avatarKey: playerBefore.avatarKey }));
  expect(JSON.parse(event.detailsJson)).toMatchObject({ photoSource: "PLACEHOLDER", accountAvatarBefore: null, accountAvatarAfter: "legacy-avatar" });
});

it("adoption excludes permanently retired profiles while synchronizing the retained nonretired identity", async () => {
  const retiredBefore = await db.player.findUniqueOrThrow({ where: { id: "retired-source" } });
  const retiredMemberBefore = await db.clubMember.findUniqueOrThrow({ where: { id: "retired-source-member" } });
  await claim("club-a", "p-a", "retired-owner");
  expect(await db.player.findUniqueOrThrow({ where: { id: "retired-source" } })).toEqual(retiredBefore);
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "retired-source-member" } })).toEqual(retiredMemberBefore);
  expect(await db.player.findUniqueOrThrow({ where: { id: "retained-target" } })).toMatchObject({ avatarKey: "old-avatar", name: "Retained target" });
  expect(await db.user.findUniqueOrThrow({ where: { id: "retired-owner" } })).toMatchObject({ avatarKey: "old-avatar" });
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
  expect(await db.player.findUnique({ where: { id: approved.approvedPlayerId! } })).toMatchObject({ name: "Current account-a", avatarKey: "old-avatar", ownerUserId: null });
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
  const metadata = JSON.stringify({ name: "Current account-a", avatarKey: "old-avatar" });
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

it.each(["two-claims", "upload"])("serializes photo adoption across independent file-libSQL writers: %s", async race => {
  await db.player.update({ where: { id: "p-b" }, data: { avatarKey: "second-placeholder-photo" } });
  await db.$disconnect(); adapterFiles.add(file);
  const clients = [createClient({ url: `file:${file}` }), createClient({ url: `file:${file}` })];
  const writers = clients.map(client => new PrismaClient({ adapter: new PrismaLibSQL(client as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]) } as unknown as ConstructorParameters<typeof PrismaClient>[0]));
  try {
    for (const client of clients) await client.execute("PRAGMA foreign_keys=ON");
    const [first, second] = await Promise.allSettled([
      clubOwnershipTransaction(writers[0], t => claimClubPlayer(t, { clubId: "club-a", playerId: "p-a", userId: "account-a", actorUserId: "admin" })),
      race === "two-claims"
        ? clubOwnershipTransaction(writers[1], t => claimClubPlayer(t, { clubId: "club-b", playerId: "p-b", userId: "account-a", actorUserId: "admin" }))
        : clubOwnershipTransaction(writers[1], t => syncAccountProfile(t, { userId: "account-a", changes: { avatarKey: "uploaded-photo" }, expectedAvatarKey: null })),
    ]);
    expect(first.status).toBe("fulfilled");
    const account = await writers[0].user.findUniqueOrThrow({ where: { id: "account-a" } });
    const events = await writers[0].clubPlayerOwnershipEvent.findMany({ where: { newOwnerUserId: "account-a" } });
    if (race === "two-claims") {
      expect(second.status).toBe("fulfilled");
      expect(events).toHaveLength(2);
      expect(events.map(event => JSON.parse(event.detailsJson).photoSource).sort()).toEqual(["ACCOUNT", "PLACEHOLDER"]);
      for (const event of events) expect(JSON.parse(event.metadataAfterJson).avatarKey).toBe(account.avatarKey);
      expect(await writers[0].player.findUniqueOrThrow({ where: { id: "p-b" } })).toMatchObject({ avatarKey: account.avatarKey });
    } else {
      expect(events).toHaveLength(1);
      if (second.status === "rejected") expect(second.reason).toMatchObject({ statusCode: 409 });
      expect(account.avatarKey).toBe(second.status === "fulfilled" ? "uploaded-photo" : "old-avatar");
      expect(JSON.parse(events[0].detailsJson).photoSource).toBe(second.status === "fulfilled" ? "ACCOUNT" : "PLACEHOLDER");
      const before = { account, player: await writers[0].player.findUniqueOrThrow({ where: { id: "p-a" } }) };
      await expect(clubOwnershipTransaction(writers[1], t => syncAccountProfile(t, { userId: "account-a", changes: { avatarKey: "stale-upload" }, expectedAvatarKey: null }))).rejects.toMatchObject({ statusCode: 409 });
      expect({ account: await writers[0].user.findUniqueOrThrow({ where: { id: "account-a" } }), player: await writers[0].player.findUniqueOrThrow({ where: { id: "p-a" } }) }).toEqual(before);
    }
    expect(await writers[0].player.findUniqueOrThrow({ where: { id: "p-a" } })).toMatchObject({ avatarKey: account.avatarKey });
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
