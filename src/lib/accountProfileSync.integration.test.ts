import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { claimClubPlayer, clubOwnershipTransaction, removeClubPlayerOwnership } from "./clubPlayerOwnership";
import { syncAccountProfile } from "./accountProfileSync";
import { MixedSide, PlayerGender } from "@/types/enums";
const dir = mkdtempSync(path.join(tmpdir(), "account-sync-"));
const baseline = path.join(dir, "baseline.db");
let db: PrismaClient; let index = 0;
const transaction = <T>(fn: Parameters<typeof clubOwnershipTransaction<T>>[1]) => clubOwnershipTransaction(db, fn);
beforeAll(() => {
  const sqlite = new DatabaseSync(baseline, { enableDoubleQuotedStringLiterals: true });
  for (const migration of readdirSync("prisma/migrations").sort()) {
    if (migration === "migration_lock.toml") continue;
    if (migration === "20261012120000_club_local_player_ownership") sqlite.exec(`
      INSERT INTO Account(id,name,email,passwordHash,gender,avatarKey,createdAt,updatedAt) VALUES ('admin','Admin','admin@fixture.invalid','hash','MALE',NULL,10,11),('owner','Original','owner@fixture.invalid','hash','MALE','old-avatar',12,13);
      INSERT INTO Community(id,name,createdById,createdAt,updatedAt) VALUES ('club-a','A','admin',14,15),('club-b','B','admin',16,17);
      INSERT INTO ClubAccess(id,clubId,userId,role,status,createdAt,updatedAt) VALUES ('admin-a','club-a','admin','OWNER','ACTIVE',18,19),('admin-b','club-b','admin','OWNER','ACTIVE',20,21),('owner-a','club-a','owner','MEMBER','ACTIVE',22,23),('owner-b','club-b','owner','MEMBER','ACTIVE',24,25);
      INSERT INTO User(id,ownerUserId,name,avatarKey,gender,partnerPreference,elo,createdAt,updatedAt) VALUES ('legacy-shared','owner','Legacy Name','legacy-photo','MALE','OPEN',1432,26,27);
      INSERT INTO CommunityMember(id,communityId,userId,role,elo,preferredPool,createdAt,archivedAt) VALUES ('legacy-a','club-a','legacy-shared','MEMBER',1243,'B',28,30),('legacy-b','club-b','legacy-shared','MEMBER',1432,'A',29,NULL);
    `);
    sqlite.exec(readFileSync(path.join("prisma/migrations", migration, "migration.sql"), "utf8"));
  }
  sqlite.close();
});
beforeEach(async () => {
  await db?.$disconnect(); const file = path.join(dir, `${index++}.db`); copyFileSync(baseline, file);
  db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  for (const clubId of ["club-c", "club-d"]) {
    await db.club.create({ data: { id: clubId, name: clubId, createdById: "admin" } });
    await db.clubAccess.create({ data: { clubId, userId: "admin", role: "OWNER" } });
    await db.player.create({ data: { id: `${clubId}-player`, name: clubId, gender: "MALE", elo: 1179 } });
    await db.clubMember.create({ data: { clubId, playerId: `${clubId}-player`, elo: 1289, preferredPool: "B" } });
    await transaction(tx => claimClubPlayer(tx, { clubId, playerId: `${clubId}-player`, userId: "owner", actorUserId: "admin" }));
  }
  await transaction(tx => removeClubPlayerOwnership(tx, { clubId: "club-d", playerId: "club-d-player", actorUserId: "admin" }));
  await db.session.create({ data: { id: "history", code: "SYNC-HISTORY", name: "Historical session", clubId: "club-b", ratingPolicyVersion: 1, status: "COMPLETED" } });
  await db.sessionPlayer.create({ data: { id: "history-seat", sessionId: "history", playerId: "legacy-shared", gender: "MALE", partnerPreference: "OPEN", sessionPoints: 82, matchesPlayed: 4 } });
});
afterAll(async () => { await db?.$disconnect(); rmSync(dir, { recursive: true, force: true }); });
async function history() { return { seats: await db.sessionPlayer.findMany(), sessions: await db.session.findMany(), members: await db.clubMember.findMany({ orderBy: { id: "asc" } }), events: await db.clubPlayerOwnershipEvent.findMany({ orderBy: { id: "asc" } }) }; }
it("synchronizes edited canonical metadata to distinct owned profiles including retained archive, excluding disconnected links", async () => {
  const before = await history(); const detached = await db.player.findUniqueOrThrow({ where: { id: "club-d-player" } });
  const result = await transaction(tx => syncAccountProfile(tx, { userId: "owner", changes: { name: "Canonical Name", avatarKey: "new-photo" }, expectedAvatarKey: "old-avatar" }));
  expect(result.playerIds.sort()).toEqual(["club-c-player", "legacy-shared"]);
  for (const id of result.playerIds) expect(await db.player.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: "Canonical Name", avatarKey: "new-photo", gender: "MALE", mixedSideOverride: null, partnerPreference: "OPEN" });
  expect(await db.player.findUniqueOrThrow({ where: { id: "club-d-player" } })).toEqual(detached);
  expect(await history()).toEqual(before);
  expect(await db.player.findUniqueOrThrow({ where: { id: "legacy-shared" } })).toMatchObject({ elo: 1432, ownerUserId: "owner" });
  expect(await db.player.findUniqueOrThrow({ where: { id: "club-c-player" } })).toMatchObject({ elo: 1179, ownerUserId: null });
});
it("preserves unchanged player timestamps during avatar-only sync, including an entirely identical fanout", async () => {
  const unchanged = await db.player.findUniqueOrThrow({ where: { id: "club-c-player" } });
  const shared = await db.player.findUniqueOrThrow({ where: { id: "legacy-shared" } });
  const before = await history();
  await transaction(tx => syncAccountProfile(tx, { userId: "owner", changes: { avatarKey: "old-avatar" } }));
  expect(await db.player.findUniqueOrThrow({ where: { id: unchanged.id } })).toEqual(unchanged);
  const updated = await db.player.findUniqueOrThrow({ where: { id: shared.id } });
  expect(updated).toEqual({ ...shared, avatarKey: "old-avatar", updatedAt: updated.updatedAt });
  const players = await db.player.findMany({ orderBy: { id: "asc" } });
  await transaction(tx => syncAccountProfile(tx, { userId: "owner", changes: { avatarKey: "old-avatar" } }));
  expect(await db.player.findMany({ orderBy: { id: "asc" } })).toEqual(players);
  expect(await history()).toEqual(before);
});
it("enforces canonical once-only name and gender limits transactionally and preserves sporting history", async () => {
  const before = await history();
  await transaction(tx => syncAccountProfile(tx, { userId: "owner", changes: { name: "Renamed", gender: PlayerGender.FEMALE } }));
  const after = await db.user.findUniqueOrThrow({ where: { id: "owner" } });
  expect(after.selfNameChangedAt).toBeInstanceOf(Date); expect(after.selfGenderChangedAt).toBeInstanceOf(Date);
  await expect(transaction(tx => syncAccountProfile(tx, { userId: "owner", changes: { name: "Again", avatarKey: "must-not-persist" } }))).rejects.toMatchObject({ statusCode: 409 });
  await expect(transaction(tx => syncAccountProfile(tx, { userId: "owner", changes: { gender: PlayerGender.MALE } }))).rejects.toMatchObject({ statusCode: 409 });
  expect(await db.user.findUniqueOrThrow({ where: { id: "owner" } })).toEqual(after);
  expect(await history()).toEqual(before);
  expect(await db.player.findUniqueOrThrow({ where: { id: "legacy-shared" } })).toMatchObject({ name: "Renamed", gender: "FEMALE", avatarKey: "legacy-photo", partnerPreference: "OPEN" });
});
it("saves a selected club choice with locked identity, clears to default and preserves shared profiles and history", async () => {
  await db.user.update({ where: { id: "owner" }, data: { selfNameChangedAt: new Date(), selfGenderChangedAt: new Date() } });
  const account = await db.user.findUniqueOrThrow({ where: { id: "owner" } });
  const shared = await db.player.findUniqueOrThrow({ where: { id: "legacy-shared" } });
  const before = await history();
  const result = await transaction(tx => syncAccountProfile(tx, { userId: "owner", changes: {}, clubPreferences: { clubId: "club-b", playerId: "legacy-shared", mixedSideOverride: MixedSide.LOWER } }));
  expect(result.clubPreferences).toEqual({ clubId: "club-b", playerId: "legacy-shared", mixedSideOverride: "LOWER", partnerPreference: "OPEN" });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "legacy-b" } })).toMatchObject({ mixedSideOverride: "LOWER" });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "legacy-a" } })).toMatchObject({ mixedSideOverride: null });
  expect(await db.user.findUniqueOrThrow({ where: { id: "owner" } })).toEqual(account);
  expect(await db.player.findUniqueOrThrow({ where: { id: "legacy-shared" } })).toEqual(shared);
  await transaction(tx => syncAccountProfile(tx, { userId: "owner", changes: {}, clubPreferences: { clubId: "club-b", playerId: "legacy-shared", mixedSideOverride: null } }));
  expect(await history()).toEqual(before);
  await expect(transaction(tx => syncAccountProfile(tx, { userId: "owner", changes: { avatarKey: null }, expectedAvatarKey: "stale" }))).rejects.toMatchObject({ statusCode: 409 });
});
it("keeps independent preferences across two clubs sharing a Player and normalizes each during identity gender changes", async () => {
  await db.clubMember.update({ where: { id: "legacy-a" }, data: { mixedSideOverride: "LOWER" } });
  await db.clubMember.update({ where: { id: "legacy-b" }, data: { mixedSideOverride: null } });
  await transaction(tx => syncAccountProfile(tx, { userId: "owner", changes: { gender: PlayerGender.FEMALE }, clubPreferences: { clubId: "club-b", playerId: "legacy-shared", mixedSideOverride: MixedSide.UPPER } }));
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "legacy-a" } })).toMatchObject({ mixedSideOverride: null });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "legacy-b" } })).toMatchObject({ mixedSideOverride: "UPPER" });
  expect(await db.clubMember.findFirstOrThrow({ where: { clubId: "club-c" } })).toMatchObject({ mixedSideOverride: null });
  expect(await db.user.findUniqueOrThrow({ where: { id: "owner" } })).toMatchObject({ gender: "FEMALE", mixedSideOverride: null });
  expect(await db.player.findUniqueOrThrow({ where: { id: "legacy-shared" } })).toMatchObject({ mixedSideOverride: null, partnerPreference: "OPEN" });
});
it.each(["archived", "revoked", "wrong-player"])("rejects stale %s preference context atomically before account writes", async condition => {
  if (condition === "archived") await transaction(tx => removeClubPlayerOwnership(tx, { clubId: "club-b", playerId: "legacy-shared", actorUserId: "admin" }));
  if (condition === "revoked") await db.clubAccess.update({ where: { id: "owner-b" }, data: { status: "REVOKED" } });
  const before = { account: await db.user.findUniqueOrThrow({ where: { id: "owner" } }), player: await db.player.findMany(), history: await history() };
  await expect(transaction(tx => syncAccountProfile(tx, { userId: "owner", changes: { name: "Must not persist" }, clubPreferences: { clubId: "club-b", playerId: condition === "wrong-player" ? "club-c-player" : "legacy-shared", mixedSideOverride: MixedSide.LOWER } }))).rejects.toMatchObject({ statusCode: 403 });
  expect({ account: await db.user.findUniqueOrThrow({ where: { id: "owner" } }), player: await db.player.findMany(), history: await history() }).toEqual(before);
});
it("rejects combined edits after ownership disconnect without consuming the identity allowance", async () => {
  await transaction(tx => removeClubPlayerOwnership(tx, { clubId: "club-b", playerId: "legacy-shared", actorUserId: "admin" }));
  await transaction(tx => removeClubPlayerOwnership(tx, { clubId: "club-b", playerId: "legacy-shared", actorUserId: "admin", mode: "DISCONNECT" }));
  const before = { account: await db.user.findUniqueOrThrow({ where: { id: "owner" } }), player: await db.player.findMany(), history: await history() };
  await expect(transaction(tx => syncAccountProfile(tx, { userId: "owner", changes: { name: "Cannot spread" }, clubPreferences: { clubId: "club-b", playerId: "legacy-shared", mixedSideOverride: MixedSide.LOWER } }))).rejects.toMatchObject({ statusCode: 403 });
  expect({ account: await db.user.findUniqueOrThrow({ where: { id: "owner" } }), player: await db.player.findMany(), history: await history() }).toEqual(before);
});
it("serializes concurrent once-only identity edits and rolls back the losing preference", async () => {
  const edits = await Promise.allSettled(["First", "Second"].map(name => transaction(tx => syncAccountProfile(tx, { userId: "owner", changes: { name }, clubPreferences: { clubId: "club-b", playerId: "legacy-shared", mixedSideOverride: name === "First" ? MixedSide.LOWER : null } }))));
  expect(edits.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(edits.filter(result => result.status === "rejected")).toHaveLength(1);
  const account = await db.user.findUniqueOrThrow({ where: { id: "owner" } });
  expect(account.selfNameChangedAt).toBeInstanceOf(Date);
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "legacy-b" } })).toMatchObject({ mixedSideOverride: account.name === "First" ? "LOWER" : null });
});
