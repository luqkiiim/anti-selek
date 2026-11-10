import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { clubOwnershipTransaction } from "./clubPlayerOwnership";
import { propagateClubPairingPreferencesToSessionsInTransaction } from "./clubPairingPreferences";
import { MixedSide } from "@/types/enums";

const dir = mkdtempSync(path.join(tmpdir(), "club-pairing-sync-"));
const baseline = path.join(dir, "baseline.db");
let db: PrismaClient;
let index = 0;
const preference = { clubId: "club-a", playerId: "player", mixedSideOverride: MixedSide.UPPER };

beforeAll(() => {
  const sqlite = new DatabaseSync(baseline, { enableDoubleQuotedStringLiterals: true });
  try {
    for (const migration of readdirSync("prisma/migrations").sort()) {
      if (migration !== "migration_lock.toml") sqlite.exec(readFileSync(path.join("prisma/migrations", migration, "migration.sql"), "utf8"));
    }
  } finally { sqlite.close(); }
});

beforeEach(async () => {
  await db?.$disconnect();
  const file = path.join(dir, `${index++}.db`);
  copyFileSync(baseline, file);
  db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  await db.user.create({ data: { id: "admin", name: "Admin", email: "admin@fixture.invalid", passwordHash: "unused" } });
  for (const id of ["club-a", "club-b"]) await db.club.create({ data: { id, name: id, createdById: "admin" } });
  for (const id of ["player", "two", "three", "four"]) await db.player.create({ data: { id, name: id, gender: "FEMALE" } });
  for (const clubId of ["club-a", "club-b"]) await db.clubMember.create({ data: { clubId, playerId: "player" } });
  for (const [id, status, profileClubId] of [
    ["active", "ACTIVE", "club-a"], ["waiting", "WAITING", "club-a"],
    ["manual", "ACTIVE", "club-a"], ["completed", "COMPLETED", "club-a"],
    ["other-profile", "ACTIVE", "club-b"],
  ]) {
    await db.session.create({ data: { id, code: id, name: id, clubId: "club-a", status } });
    if (profileClubId === "club-b") await db.sessionClub.create({ data: { sessionId: id, clubId: "club-b", status: "ACCEPTED" } });
    await db.sessionPlayer.create({ data: { id: `${id}-seat`, sessionId: id, playerId: "player", profileClubId, gender: "FEMALE", partnerPreference: "FEMALE_FLEX", sessionPoints: 31, matchesPlayed: 3 } });
  }
  for (const sessionId of ["active", "manual", "completed", "other-profile"]) await db.queuedMatch.create({ data: {
    sessionId, isAutomatic: sessionId !== "manual",
    team1Player1Id: "player", team1Player2Id: "two", team2Player1Id: "three", team2Player2Id: "four",
  } });
  const court = await db.court.create({ data: { sessionId: "active", courtNumber: 1 } });
  const match = await db.match.create({ data: {
    sessionId: "active", courtId: court.id, status: "IN_PROGRESS",
    team1Player1Id: "player", team1Player2Id: "two", team2Player1Id: "three", team2Player2Id: "four",
  } });
  await db.court.update({ where: { id: court.id }, data: { currentMatchId: match.id } });
});

afterAll(async () => { await db?.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

it("updates unfinished selected profiles during a match while preserving history, other clubs and manual queues", async () => {
  const before = await db.sessionPlayer.findMany({ orderBy: { id: "asc" } });
  const matches = await db.match.findMany();
  const courts = await db.court.findMany();
  const manual = await db.queuedMatch.findUniqueOrThrow({ where: { sessionId: "manual" } });
  const result = await clubOwnershipTransaction(db, async tx => {
    await tx.clubMember.update({ where: { clubId_playerId: { clubId: "club-a", playerId: "player" } }, data: { mixedSideOverride: "UPPER" } });
    return propagateClubPairingPreferencesToSessionsInTransaction(tx, preference);
  });
  expect(result.automaticQueueSessionIds.sort()).toEqual(["active", "waiting"]);
  const after = await db.sessionPlayer.findMany({ orderBy: { id: "asc" } });
  for (const seat of before) {
    expect(after.find(row => row.id === seat.id)).toEqual(
      ["active", "waiting", "manual"].includes(seat.sessionId)
        ? { ...seat, mixedSideOverride: "UPPER", partnerPreference: "OPEN" }
        : seat
    );
  }
  expect(await db.match.findMany()).toEqual(matches);
  expect(await db.court.findMany()).toEqual(courts);
  expect(await db.queuedMatch.findUnique({ where: { sessionId: "active" } })).toBeNull();
  expect(await db.queuedMatch.findUnique({ where: { sessionId: "manual" } })).toEqual(manual);
  expect(await db.queuedMatch.count()).toBe(3);
});

it("clears both override and legacy preference when returning to Standard", async () => {
  await clubOwnershipTransaction(db, tx => propagateClubPairingPreferencesToSessionsInTransaction(tx, preference));
  await clubOwnershipTransaction(db, tx => propagateClubPairingPreferencesToSessionsInTransaction(tx, { ...preference, mixedSideOverride: null }));
  expect(await db.sessionPlayer.findUniqueOrThrow({ where: { id: "active-seat" } })).toMatchObject({ mixedSideOverride: null, partnerPreference: "FEMALE_FLEX" });
});

it("rolls back saved preferences, live seats and queue invalidation together", async () => {
  const seats = await db.sessionPlayer.findMany({ orderBy: { id: "asc" } });
  const queues = await db.queuedMatch.findMany({ orderBy: { id: "asc" } });
  await expect(clubOwnershipTransaction(db, async tx => {
    await tx.clubMember.update({ where: { clubId_playerId: { clubId: "club-a", playerId: "player" } }, data: { mixedSideOverride: "UPPER" } });
    await propagateClubPairingPreferencesToSessionsInTransaction(tx, preference);
    throw new Error("response unavailable");
  })).rejects.toThrow("response unavailable");
  expect(await db.clubMember.findUniqueOrThrow({ where: { clubId_playerId: { clubId: "club-a", playerId: "player" } } })).toMatchObject({ mixedSideOverride: null });
  expect(await db.sessionPlayer.findMany({ orderBy: { id: "asc" } })).toEqual(seats);
  expect(await db.queuedMatch.findMany({ orderBy: { id: "asc" } })).toEqual(queues);
});
