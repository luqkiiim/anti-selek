import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { admissionTransaction, reviewClubAdmission, submitClubAdmission } from "./clubAdmissions";
import { activePlayerInvitation, exchangeInvitationSecret, hashInvitationSecret, invitationContext, INVITATION_TTL_MS, managePlayerInvitation, redeemPlayerInvitation } from "./playerInvitations";
import { adminInvitationGet, adminInvitationPost, invitationContextGet, invitationExchangePost, invitationRedeemPost } from "./playerInvitationApi";

let db: PrismaClient;
let actor: { id: string; isQuickAccess?: boolean; guestPlayerId?: string; isAdmin?: boolean } | null;
vi.mock("@/lib/prisma", () => ({ get prisma() { return db; } }));
vi.mock("@/lib/auth", () => ({ auth: async () => actor ? { user: actor } : null }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: async () => null }));
const dir = mkdtempSync(path.join(tmpdir(), "player-invitations-"));
const baseline = path.join(dir, "baseline.db");
let file: string;
let index = 0;
const transaction = <T>(fn: Parameters<typeof admissionTransaction<T>>[1]) => admissionTransaction(db, fn);
const create = (action: "CREATE" | "REPLACE" | "REVOKE" = "CREATE", invitationId?: string, now?: Date) => transaction(tx => managePlayerInvitation(tx, { clubId: "club-a", playerId: "historical-player", userId: "admin", action, invitationId, now }));
async function ready(count = 1, now?: Date) {
  const created = await create("CREATE", undefined, now);
  const id = created.invitation!.id;
  const secret = "secret" in created ? created.secret! : "";
  const continuation = await transaction(tx => exchangeInvitationSecret(tx, id, secret, now));
  for (let i = 1; i < count; i++) await transaction(tx => exchangeInvitationSecret(tx, id, secret, now));
  expect(await db.playerInvitationContinuation.count({ where: { invitationId: id } })).toBe(count);
  return { id, secret, handle: continuation.handle };
}
const redeem = (id: string, handle: string, userId = "account-a", now?: Date) => transaction(tx => redeemPlayerInvitation(tx, id, handle, userId, now));
async function expectTerminalCleanup(id: string, status: string) {
  expect(await db.playerInvitationContinuation.count({ where: { invitationId: id } })).toBe(0);
  expect(await db.playerInvitation.findUnique({ where: { id } })).toMatchObject({ status });
  const events = await db.playerInvitationEvent.findMany({ where: { invitationId: id } });
  expect(events.map(event => event.action).sort()).toEqual(["CREATED", status].sort());
}
const adminContext = { params: Promise.resolve({ id: "club-a", userId: "historical-player" }) };
const inviteContext = (id: string) => ({ params: Promise.resolve({ invitationId: id }) });
function request(url: string, body?: unknown, handle?: { id: string; handle: string }) {
  return new Request(`https://app.example${url}`, { method: body === undefined ? "GET" : "POST", headers: { origin: "https://app.example", "content-type": "application/json", ...(handle ? { cookie: `player-invite-${handle.id}=${handle.handle}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
beforeAll(() => {
  writeFileSync(baseline, "");
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: `file:${baseline}` }, stdio: "pipe" });
}, 60000);
beforeEach(async () => {
  await db?.$disconnect();
  file = path.join(dir, `case-${index++}.db`);
  copyFileSync(baseline, file);
  db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  await db.user.createMany({ data: ["admin", "account-a", "account-b"].map(id => ({ id, name: id, email: `${id}@example.invalid`, passwordHash: "fixture" })) });
  await db.club.createMany({ data: [{ id: "club-a", name: "Anti-Selek", createdById: "admin", allowJoinRequests: true }, { id: "club-b", name: "Other Club", createdById: "admin" }] });
  await db.clubAccess.createMany({ data: [{ clubId: "club-a", userId: "admin", role: "OWNER" }, { clubId: "club-b", userId: "admin", role: "ADMIN" }] });
  await db.player.createMany({ data: ["historical-player", "p2", "p3", "p4"].map(id => ({ id, name: id === "historical-player" ? "Luqman" : id, gender: "MALE" })) });
  await db.clubMember.create({ data: { id: "original-member", clubId: "club-a", playerId: "historical-player", elo: 1384 } });
  await db.$executeRaw`UPDATE "CommunityMember" SET "role"='ADMIN' WHERE "id"='original-member'`;
  const session = await db.session.create({ data: { id: "history-session", code: "HISTORY", name: "Historical session", clubId: "club-a", status: "COMPLETED" } });
  await db.court.create({ data: { id: "history-court", sessionId: session.id, courtNumber: 1 } });
  await db.sessionPlayer.create({ data: { id: "history-seat", sessionId: session.id, playerId: "historical-player", matchesPlayed: 47, sessionPoints: 42 } });
  await db.match.create({ data: { id: "history-match", sessionId: session.id, courtId: "history-court", status: "COMPLETED", team1Player1Id: "historical-player", team1Player2Id: "p2", team2Player1Id: "p3", team2Player2Id: "p4", team1Score: 21, team2Score: 17, completedAt: new Date("2026-09-01") } });
  await db.matchEloAdjustment.create({ data: { matchId: "history-match", clubId: "club-a", playerId: "historical-player", delta: 15, beforeElo: 1369, afterElo: 1384 } });
  await db.clubRatingAdjustment.create({ data: { memberId: "original-member", actorId: "admin", actorName: "admin", beforeElo: 1300, afterElo: 1369, reason: "History" } });
  await db.$executeRaw`UPDATE "User" SET "createdAt"=1700000011111,"updatedAt"=1700000022222 WHERE "id"='historical-player'`;
  actor = { id: "admin" };
});
afterAll(async () => { await db?.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

function sportingSnapshot() {
  const sqlite = new DatabaseSync(file);
  try {
    return Object.fromEntries(["User", "CommunityMember", "Session", "Court", "SessionPlayer", "Match", "MatchEloAdjustment", "ClubRatingAdjustment"].map(table => [table, sqlite.prepare(`SELECT * FROM "${table}" ORDER BY "id"`).all().map(row => { const { ownerUserId: _ownership, ...original } = row; void _ownership; return original; })]));
  } finally { sqlite.close(); }
}
it("claims the same sporting identity and preserves every original sporting field/row/timestamp", async () => {
  const before = sportingSnapshot();
  const invitation = await ready(3);
  const creationEvent = await db.playerInvitationEvent.findFirstOrThrow({ where: { invitationId: invitation.id } });
  const result = await redeem(invitation.id, invitation.handle);
  expect(result).toMatchObject({ playerId: "historical-player", clubId: "club-a" });
  expect(sportingSnapshot()).toEqual(before);
  expect(await db.player.findUnique({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: "account-a" });
  expect(await db.clubMember.findUnique({ where: { id: "original-member" } })).toMatchObject({ ownerUserId: "account-a", elo: 1384 });
  expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } })).toMatchObject({ role: "MEMBER", status: "ACTIVE" });
  expect(await db.playerInvitationEvent.findMany({ where: { invitationId: invitation.id }, orderBy: { createdAt: "asc" } })).toHaveLength(2);
  await expectTerminalCleanup(invitation.id, "REDEEMED");
  expect(await db.playerInvitationEvent.findUnique({ where: { id: creationEvent.id } })).toEqual(creationEvent);
});
it.each(["MEMBER", "ADMIN", "OWNER", "STAFF"])("preserves existing active %s access exactly", async role => {
  const grant = await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-a", role } });
  const invite = await ready(); await redeem(invite.id, invite.handle);
  expect(await db.clubAccess.findUnique({ where: { id: grant.id } })).toEqual(grant);
});
it("blocks REVOKED access before consuming the invitation or changing ownership", async () => {
  const access = await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-a", status: "REVOKED", role: "ADMIN" } });
  const invite = await ready(); const before = sportingSnapshot();
  await expect(redeem(invite.id, invite.handle)).rejects.toMatchObject({ code: "ACCESS_REVIEW_REQUIRED" });
  expect(sportingSnapshot()).toEqual(before);
  expect(await db.clubAccess.findUnique({ where: { id: access.id } })).toEqual(access);
  expect(await db.playerInvitation.findUnique({ where: { id: invite.id } })).toMatchObject({ status: "ACTIVE", redeemedAt: null });
  expect(await db.player.findUnique({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: null });
});
it("stores only hashes and reveals only safe sporting context", async () => {
  const invite = await ready();
  const row = await db.playerInvitation.findUniqueOrThrow({ where: { id: invite.id } });
  expect(row.tokenHash).toBe(hashInvitationSecret(invite.secret));
  expect(JSON.stringify(await db.playerInvitationContinuation.findMany())).not.toContain(invite.handle);
  const context = await invitationContext(db, invite.id, invite.handle);
  expect(context.player).toMatchObject({ name: "Luqman", rating: 1384, matchesPlayed: 1 });
  expect(JSON.stringify(context)).not.toMatch(/email|password|ownerUserId|tokenHash|role/);
  expect(JSON.stringify(await activePlayerInvitation(db, "club-a", "historical-player", "admin"))).not.toContain(invite.secret);
});
it("refuses guessed IDs, incorrect secrets, and continuation/route mismatches", async () => {
  const invite = await ready();
  await expect(exchangeInvitationSecret(db, invite.id, "x".repeat(43))).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
  await expect(invitationContext(db, "different-invite", invite.handle)).rejects.toMatchObject({ code: "CONTINUATION_REQUIRED" });
  await expect(redeem(invite.id, "x".repeat(43))).rejects.toMatchObject({ code: "CONTINUATION_REQUIRED" });
  await expect(invitationContext(db, invite.id, undefined)).rejects.toMatchObject({ code: "CONTINUATION_REQUIRED" });
});
it("expires continuations independently and allows reopening the original link", async () => {
  const invite = await ready(3);
  const now = new Date(Date.now() + 31 * 60_000);
  await expect(invitationContext(db, invite.id, invite.handle, now)).rejects.toMatchObject({ code: "CONTINUATION_REQUIRED" });
  const reopened = await transaction(tx => exchangeInvitationSecret(tx, invite.id, invite.secret, now));
  expect(await db.playerInvitationContinuation.count({ where: { invitationId: invite.id } })).toBe(1);
  expect(await db.playerInvitationContinuation.findUnique({ where: { handleHash: hashInvitationSecret(invite.handle) } })).toBeNull();
  await expect(invitationContext(db, invite.id, invite.handle, now)).rejects.toMatchObject({ code: "CONTINUATION_REQUIRED" });
  expect((await invitationContext(db, invite.id, reopened.handle, now)).player.name).toBe("Luqman");
  expect(await db.playerInvitation.findUnique({ where: { id: invite.id } })).toMatchObject({ status: "ACTIVE" });
  expect(await db.playerInvitationEvent.count({ where: { invitationId: invite.id } })).toBe(1);
});
it("expired invitations cannot redeem and do not block replacement creation", async () => {
  const old = await ready(3, new Date(Date.now() - INVITATION_TTL_MS - 1000));
  await expect(exchangeInvitationSecret(db, old.id, old.secret)).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
  await expect(invitationContext(db, old.id, old.handle)).rejects.toMatchObject({ code: "CONTINUATION_REQUIRED" });
  const fresh = await create();
  expect(fresh.invitation?.id).not.toBe(old.id);
  await expectTerminalCleanup(old.id, "EXPIRED");
  await expect(redeem(old.id, old.handle)).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
});
it("revokes and replaces atomically; old links and continuations stop working", async () => {
  const invite = await ready(3);
  const replacement = await create("REPLACE", invite.id);
  await expectTerminalCleanup(invite.id, "REVOKED");
  await expect(redeem(invite.id, invite.handle)).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
  expect(replacement.invitation?.id).not.toBe(invite.id);
  const replacementId = replacement.invitation!.id;
  const replacementSecret = "secret" in replacement ? replacement.secret! : "";
  for (let i = 0; i < 3; i++) await transaction(tx => exchangeInvitationSecret(tx, replacementId, replacementSecret));
  expect(await db.playerInvitationContinuation.count({ where: { invitationId: replacementId } })).toBe(3);
  await create("REVOKE", replacement.invitation!.id);
  await expectTerminalCleanup(replacementId, "REVOKED");
  expect(await db.playerInvitation.count({ where: { status: "ACTIVE" } })).toBe(0);
});
it("does not create duplicates or return a stored secret on a later creation attempt", async () => {
  const first = await create(); const second = await create();
  expect(second.invitation?.id).toBe(first.invitation?.id);
  expect(second).not.toHaveProperty("secret");
  expect(await db.playerInvitation.count()).toBe(1);
});
it.each(["archive", "deactivate", "claim"])("permanently invalidates links on %s, even if availability is restored", async action => {
  const invite = await ready(3);
  if (action === "archive") {
    await db.clubMember.update({ where: { id: "original-member" }, data: { archivedAt: new Date() } });
    await db.clubMember.update({ where: { id: "original-member" }, data: { archivedAt: null } });
  } else if (action === "deactivate") {
    await db.player.update({ where: { id: "historical-player" }, data: { isActive: false } });
    await db.player.update({ where: { id: "historical-player" }, data: { isActive: true } });
  } else await db.player.update({ where: { id: "historical-player" }, data: { ownerUserId: "account-b" } });
  await expect(redeem(invite.id, invite.handle)).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
  expect(await db.playerInvitation.findUnique({ where: { id: invite.id } })).toMatchObject({ status: "REVOKED" });
  await expectTerminalCleanup(invite.id, "REVOKED");
});
it.each(["club-a", "club-b"])("blocks ownership conflicts in %s, including archived identities", async clubId => {
  if (clubId === "club-b") await db.clubMember.create({ data: { clubId, playerId: "historical-player" } });
  await db.player.update({ where: { id: "p2" }, data: { ownerUserId: "account-a" } });
  await db.clubMember.create({ data: { clubId, playerId: "p2", archivedAt: new Date() } });
  const invite = await ready();
  await expect(redeem(invite.id, invite.handle)).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
  expect(await db.playerInvitation.findUnique({ where: { id: invite.id } })).toMatchObject({ status: "ACTIVE" });
});
it("creator cannot redeem; disabled accounts and STAFF cannot issue invitations", async () => {
  const invite = await ready();
  await expect(redeem(invite.id, invite.handle, "admin")).rejects.toMatchObject({ code: "SELF_APPROVAL" });
  await db.user.update({ where: { id: "account-a" }, data: { isActive: false } });
  await expect(redeem(invite.id, invite.handle)).rejects.toMatchObject({ code: "ACCOUNT_REQUIRED" });
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "admin" } }, data: { role: "STAFF" } });
  await expect(create()).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
});
it("idempotent retry returns the receipt without restoring subsequently revoked access", async () => {
  const invite = await ready(); const result = await redeem(invite.id, invite.handle);
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } }, data: { status: "REVOKED" } });
  expect(await redeem(invite.id, invite.handle)).toEqual(result);
  expect(await transaction(tx => redeemPlayerInvitation(tx, invite.id, undefined, "account-a", new Date(Date.now() + INVITATION_TTL_MS * 2)))).toEqual(result);
  await expect(redeem(invite.id, invite.handle, "account-b")).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
  expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } })).toMatchObject({ status: "REVOKED" });
});
it("database protects bindings, terminal states, audit, and the active-invite uniqueness", async () => {
  const invite = await ready();
  await expect(db.playerInvitation.update({ where: { id: invite.id }, data: { clubMemberId: "original-member" } })).rejects.toThrow();
  await expect(db.playerInvitation.create({ data: { clubId: "club-b", playerId: "historical-player", clubMemberId: "original-member", createdByUserId: "admin", tokenHash: "1".repeat(64), expiresAt: new Date(Date.now() + 10000) } })).rejects.toThrow();
  await expect(db.playerInvitation.create({ data: { clubId: "club-a", playerId: "historical-player", clubMemberId: "original-member", createdByUserId: "admin", tokenHash: "2".repeat(64), expiresAt: new Date(Date.now() + 10000) } })).rejects.toThrow();
  await expect(db.playerInvitationEvent.deleteMany()).rejects.toThrow();
  await redeem(invite.id, invite.handle);
  await expect(db.playerInvitation.update({ where: { id: invite.id }, data: { status: "ACTIVE" } })).rejects.toThrow();
});
it("database refuses inserting or retargeting continuations onto a terminal invitation", async () => {
  const old = await ready(3);
  await create("REVOKE", old.id);
  const active = await ready();
  const continuation = await db.playerInvitationContinuation.findFirstOrThrow({ where: { invitationId: active.id } });
  await expect(db.playerInvitationContinuation.create({ data: { invitationId: old.id, handleHash: "1".repeat(64), expiresAt: new Date(Date.now() + 60_000) } })).rejects.toThrow();
  await expect(db.playerInvitationContinuation.update({ where: { id: continuation.id }, data: { invitationId: old.id } })).rejects.toThrow();
  await expectTerminalCleanup(old.id, "REVOKED");
  expect(await db.playerInvitationContinuation.findUnique({ where: { id: continuation.id } })).toEqual(continuation);
  expect((await invitationContext(db, active.id, active.handle)).player.name).toBe("Luqman");
});
it.each(["REDEEMED", "REVOKED", "EXPIRED"])("migration removes existing %s continuations without changing audit, invitations or sporting rows", async status => {
  // Reconstruct the pre-cleanup database, then apply the real upgrade SQL.
  const sqliteBefore = new DatabaseSync(file);
  try {
    sqliteBefore.exec(`
      DROP TRIGGER PlayerInvitation_terminal_continuation_cleanup;
      DROP TRIGGER PlayerInvitationContinuation_active_insert;
      DROP TRIGGER PlayerInvitationContinuation_active_update;
    `);
  } finally { sqliteBefore.close(); }
  const old = await ready(3);
  await db.playerInvitation.update({ where: { id: old.id }, data: { status, ...(status === "REDEEMED" ? { redeemedByUserId: "account-a", redeemedAt: new Date() } : {}) } });
  await db.clubMember.create({ data: { id: "other-member", clubId: "club-a", playerId: "p2" } });
  const active = await db.playerInvitation.create({ data: { clubId: "club-a", playerId: "p2", clubMemberId: "other-member", createdByUserId: "admin", tokenHash: "2".repeat(64), expiresAt: new Date(Date.now() + INVITATION_TTL_MS) } });
  const activeContinuation = await db.playerInvitationContinuation.create({ data: { invitationId: active.id, handleHash: "3".repeat(64), expiresAt: new Date(Date.now() + 60_000) } });
  const invitationsBefore = await db.playerInvitation.findMany({ orderBy: { id: "asc" } });
  const eventsBefore = await db.playerInvitationEvent.findMany({ orderBy: { id: "asc" } });
  const sportingBefore = sportingSnapshot();
  const migration = readFileSync(path.join(process.cwd(), "prisma/migrations/20261005190000_cleanup_player_invitation_continuations/migration.sql"), "utf8");
  const sqliteAfter = new DatabaseSync(file);
  try {
    sqliteAfter.exec(`BEGIN;\n${migration}\nCOMMIT;`);
    expect(sqliteAfter.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally { sqliteAfter.close(); }
  await expectTerminalCleanup(old.id, status);
  expect(await db.playerInvitationContinuation.findMany()).toEqual([activeContinuation]);
  expect(await db.playerInvitation.findMany({ orderBy: { id: "asc" } })).toEqual(invitationsBefore);
  expect(await db.playerInvitationEvent.findMany({ orderBy: { id: "asc" } })).toEqual(eventsBefore);
  expect(sportingSnapshot()).toEqual(sportingBefore);
});
it("rolls back consumption and ownership when the final access write fails", async () => {
  const invite = await ready(3);
  await db.$executeRawUnsafe(`CREATE TRIGGER test_access_failure BEFORE INSERT ON ClubAccess BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`);
  await expect(redeem(invite.id, invite.handle)).rejects.toThrow();
  expect(await db.player.findUnique({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: null });
  expect(await db.playerInvitation.findUnique({ where: { id: invite.id } })).toMatchObject({ status: "ACTIVE", redeemedByUserId: null });
  expect(await db.playerInvitationEvent.count()).toBe(1);
  expect(await db.playerInvitationContinuation.count({ where: { invitationId: invite.id } })).toBe(3);
  expect((await invitationContext(db, invite.id, invite.handle)).player.name).toBe("Luqman");
});
it("generic admission still works and invalidates the pre-existing invitation", async () => {
  const invite = await ready(3);
  const admission = await transaction(tx => submitClubAdmission(tx, { clubId: "club-a", requesterUserId: "account-a", kind: "EXISTING_PLAYER", requestedPlayerId: "historical-player" }));
  await transaction(tx => reviewClubAdmission(tx, { clubId: "club-a", requestId: admission.id!, reviewerUserId: "admin", action: "APPROVE" }));
  await expect(redeem(invite.id, invite.handle)).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
  await expectTerminalCleanup(invite.id, "REVOKED");
});
it("simultaneous creation returns one invitation and only one secret", async () => {
  const [a, b] = await Promise.all([create(), create()]);
  expect(a.invitation?.id).toBe(b.invitation?.id);
  expect([a, b].filter(value => "secret" in value)).toHaveLength(1);
  expect(await db.playerInvitation.count({ where: { status: "ACTIVE" } })).toBe(1);
}, 30000);
it("concurrent redemption has exactly one winner and consistent ownership/audit", async () => {
  const invite = await ready(3);
  const outcomes = await Promise.allSettled([redeem(invite.id, invite.handle, "account-a"), redeem(invite.id, invite.handle, "account-b")]);
  expect(outcomes.filter(value => value.status === "fulfilled")).toHaveLength(1);
  const record = await db.playerInvitation.findUniqueOrThrow({ where: { id: invite.id } });
  expect((await db.player.findUniqueOrThrow({ where: { id: "historical-player" } })).ownerUserId).toBe(record.redeemedByUserId);
  expect(await db.playerInvitationEvent.count({ where: { action: "REDEEMED" } })).toBe(1);
  await expectTerminalCleanup(invite.id, "REDEEMED");
}, 30000);
it("revoke versus redeem commits exactly one terminal outcome", async () => {
  const invite = await ready(3);
  const outcomes = await Promise.allSettled([create("REVOKE", invite.id), redeem(invite.id, invite.handle)]);
  expect(outcomes.filter(value => value.status === "fulfilled")).toHaveLength(1);
  const record = await db.playerInvitation.findUniqueOrThrow({ where: { id: invite.id } });
  expect((await db.player.findUniqueOrThrow({ where: { id: "historical-player" } })).ownerUserId).toBe(record.status === "REDEEMED" ? "account-a" : null);
  await expectTerminalCleanup(invite.id, record.status);
}, 30000);
it("the same transaction and invalidation triggers work through the libSQL adapter", async () => {
  await db.$disconnect();
  const client = createClient({ url: `file:${file}` });
  const adapter = new PrismaLibSQL(client as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]);
  db = new PrismaClient({ adapter } as unknown as ConstructorParameters<typeof PrismaClient>[0]);
  const invite = await ready(3); const before = sportingSnapshot();
  await redeem(invite.id, invite.handle);
  expect(sportingSnapshot()).toEqual(before);
  expect(await db.playerInvitation.findUnique({ where: { id: invite.id } })).toMatchObject({ status: "REDEEMED" });
  await expectTerminalCleanup(invite.id, "REDEEMED");
});
it("HTTP exchange sets a short-lived secure HttpOnly invitation-specific cookie, without returning capabilities", async () => {
  const invite = await ready();
  const response = await invitationExchangePost(request(`/api/player-invites/${invite.id}/exchange`, { secret: invite.secret }), inviteContext(invite.id));
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")!;
  expect(cookie).toContain(`player-invite-${invite.id}=`);
  expect(cookie).toMatch(/HttpOnly/); expect(cookie).toMatch(/Secure/); expect(cookie).toMatch(/SameSite=lax/);
  expect(cookie).not.toContain(invite.secret);
  expect(await response.json()).toEqual({ ready: true });
});
it("HTTP APIs require origin, exact payload, account auth and reject quick access even for global admins", async () => {
  const invite = await ready();
  const badOrigin = request("/api/clubs/club-a/members/historical-player/invitations", { action: "CREATE" }); badOrigin.headers.set("origin", "https://evil.example");
  expect((await adminInvitationPost(badOrigin, adminContext)).status).toBe(403);
  const proxyRequest = request("/api/clubs/club-a/members/historical-player/invitations", { action: "CREATE" });
  proxyRequest.headers.set("host", "external.example"); proxyRequest.headers.set("origin", "https://external.example");
  expect((await adminInvitationPost(proxyRequest, adminContext)).status).toBe(200);
  const forged = request("/api/clubs/club-a/members/historical-player/invitations", { action: "CREATE" });
  forged.headers.set("origin", "https://evil.example"); forged.headers.set("x-forwarded-host", "evil.example");
  expect((await adminInvitationPost(forged, adminContext)).status).toBe(403);
  actor = { id: "guest:historical-player", isQuickAccess: true, guestPlayerId: "historical-player", isAdmin: true };
  expect((await adminInvitationGet(request("/api/invites"), adminContext)).status).toBe(403);
  expect((await adminInvitationPost(request("/api/invites", { action: "CREATE" }), adminContext)).status).toBe(403);
  expect((await invitationRedeemPost(request(`/api/player-invites/${invite.id}/redeem`, { confirm: true }, invite), inviteContext(invite.id))).status).toBe(403);
  actor = null;
  expect((await invitationRedeemPost(request(`/api/player-invites/${invite.id}/redeem`, { confirm: true }, invite), inviteContext(invite.id))).status).toBe(401);
  actor = { id: "account-a" };
  expect((await invitationRedeemPost(request(`/api/player-invites/${invite.id}/redeem`, { confirm: true, playerId: "p2" }, invite), inviteContext(invite.id))).status).toBe(400);
  const context = await invitationContextGet(request(`/api/player-invites/${invite.id}`, undefined, invite), inviteContext(invite.id));
  expect(context.headers.get("cache-control")).toContain("no-store");
  expect(await context.json()).toMatchObject({ player: { name: "Luqman", rating: 1384 } });
});
