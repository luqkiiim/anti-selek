import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { admissionTransaction, reviewClubAdmission, submitClubAdmission } from "./clubAdmissions";
import { activePlayerInvitation, exchangeInvitationSecret, hashInvitationSecret, invitationContext, INVITATION_TTL_MS, managePlayerInvitation, redeemPlayerInvitation, validInvitation } from "./playerInvitations";
import { adminInvitationGet, adminInvitationPost, invitationContextGet, invitationExchangePost, invitationRedeemPost } from "./playerInvitationApi";
import { getInvitationRecoveryStatus, submitInvitationRecovery } from "./playerInvitationRecovery";
import { getOwnedClubPlayer } from "./playerIdentity";
import { disconnectRemovedPlayer } from "./playerOwnershipRelease";
import { confirmAuthorizedInvitation, createAuthorizedInvitation, identityOptions, invitationExecutionReceipt } from "./playerInvitationAuthorization";

import { claimClubPlayer, removeClubPlayerOwnership } from "./clubPlayerOwnership";
import { migrateFixture, seedHistoricalAccessReceipt, localOwnershipMigration } from "./clubOwnership.integration.fixture";
let db: PrismaClient;
let actor: { id: string; isQuickAccess?: boolean; guestPlayerId?: string; isAdmin?: boolean } | null;
vi.mock("@/lib/prisma", () => ({ get prisma() { return db; } }));
vi.mock("@/lib/auth", () => ({ auth: async () => actor ? { user: actor } : null }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: async () => null }));
const dir = mkdtempSync(path.join(tmpdir(), "player-invitations-"));
const baseline = path.join(dir, "baseline.db");
let file: string;
let index = 0;
let adapterClient: ReturnType<typeof createClient> | undefined;
const adapterFiles = new Set<string>();
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
const localClaim = (clubId = "club-a", playerId = "p2", userId = "account-a") => transaction(tx => claimClubPlayer(tx, { clubId, playerId, userId, actorUserId: "admin" }));
const localRemove = (playerId = "historical-player") => transaction(tx => removeClubPlayerOwnership(tx, { clubId: "club-a", playerId, actorUserId: "admin" }));
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
  vi.useRealTimers();
  await db?.$disconnect();
  adapterClient?.close(); adapterClient = undefined;
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
afterAll(async () => {
  vi.useRealTimers(); await db?.$disconnect(); adapterClient?.close();
  // Pinned libSQL file transactions keep native handles until the worker exits.
  // Windows cannot unlink file-backed libSQL fixtures while the worker is alive.
  if (process.platform === "win32" && adapterFiles.size) {
    for (const name of readdirSync(dir)) {
      if (![...adapterFiles].some(file => name === path.basename(file) || name.startsWith(path.basename(file) + "-"))) unlinkSync(path.join(dir, name));
    }
  } else { rmSync(dir, { recursive: true, force: true }); }
});

function sportingSnapshot() {
  const sqlite = new DatabaseSync(file);
  try {
    return Object.fromEntries(["User", "CommunityMember", "Session", "Court", "SessionPlayer", "Match", "MatchEloAdjustment", "ClubRatingAdjustment"].map(table => [table, sqlite.prepare(`SELECT * FROM "${table}" ORDER BY "id"`).all().map(row => { const { ownerUserId: _ownership, ownershipRevision: _revision, ...original } = row; void _ownership; void _revision; if (table === "User" && row.id === "historical-player") { delete original.name; delete original.avatarKey; } return original; })]));
  } finally { sqlite.close(); }
}
it("claims the same sporting identity and preserves every original sporting field/row/timestamp", async () => {
  const before = sportingSnapshot();
  const invitation = await ready(3);
  const creationEvent = await db.playerInvitationEvent.findFirstOrThrow({ where: { invitationId: invitation.id } });
  const result = await redeem(invitation.id, invitation.handle);
  expect(result).toMatchObject({ playerId: "historical-player", clubId: "club-a" });
  expect(sportingSnapshot()).toEqual(before);
  expect(await db.player.findUnique({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: null, name: "account-a", avatarKey: null });
  const ownership = await db.clubPlayerOwnershipEvent.findFirstOrThrow({ where: { invitationId: invitation.id } });
  expect(JSON.parse(ownership.metadataBeforeJson)).toMatchObject({ name: "Luqman", avatarKey: null });
  expect(JSON.parse(ownership.metadataAfterJson)).toMatchObject({ name: "account-a", avatarKey: null });
  await expect(db.$executeRaw`UPDATE "ClubPlayerOwnershipEvent" SET "reason"='changed' WHERE "id"=${ownership.id}`).rejects.toThrow();
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
    await localRemove();
  } else if (action === "deactivate") {
    await db.player.update({ where: { id: "historical-player" }, data: { isActive: false } });
    await db.player.update({ where: { id: "historical-player" }, data: { isActive: true } });
  } else await localClaim("club-a", "historical-player", "account-b");
  await expect(redeem(invite.id, invite.handle)).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
  expect(await db.playerInvitation.findUnique({ where: { id: invite.id } })).toMatchObject({ status: "REVOKED" });
  await expectTerminalCleanup(invite.id, "REVOKED");
});
it.each(["club-a", "club-b"])("claim uniqueness follows the selected club when another profile is owned in %s", async clubId => {
  if (clubId === "club-b") await db.clubMember.create({ data: { clubId, playerId: "historical-player" } });
  await db.clubMember.create({ data: { clubId, playerId: "p2" } });
  await localClaim(clubId);
  const invite = await ready();
  if (clubId === "club-a") {
    await expect(redeem(invite.id, invite.handle)).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
    expect(await db.playerInvitation.findUnique({ where: { id: invite.id } })).toMatchObject({ status: "ACTIVE" });
  } else {
    await redeem(invite.id, invite.handle);
    expect(await db.clubMember.findUniqueOrThrow({ where: { id: "original-member" } })).toMatchObject({ ownerUserId: "account-a" });
  }
});
it("an account claims distinct Players in two clubs through ordinary invitations", async () => {
  await db.clubMember.create({ data: { clubId: "club-b", playerId: "p2", elo: 1275 } });
  await localClaim("club-b");
  const before = await db.clubMember.findUniqueOrThrow({ where: { clubId_playerId: { clubId: "club-b", playerId: "p2" } } });
  const invite = await ready(); await redeem(invite.id, invite.handle);
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
  expect(await getOwnedClubPlayer(db, { clubId: "club-a", userId: "account-a" })).toMatchObject({ playerId: "historical-player" });
  expect(await getOwnedClubPlayer(db, { clubId: "club-b", userId: "account-a" })).toMatchObject({ playerId: "p2" });
  expect(await db.player.findUniqueOrThrow({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: null });
});
it("creator cannot redeem; disabled accounts and STAFF cannot issue invitations", async () => {
  const invite = await ready();
  await expect(redeem(invite.id, invite.handle, "admin")).rejects.toMatchObject({ code: "SELF_APPROVAL" });
  await db.user.update({ where: { id: "account-a" }, data: { isActive: false } });
  await expect(redeem(invite.id, invite.handle)).rejects.toMatchObject({ code: "ACCOUNT_REQUIRED" });
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "admin" } }, data: { role: "STAFF" } });
  await expect(create()).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
});
it.each([
  ["STAFF", async () => db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "admin" } }, data: { role: "STAFF" } })],
  ["MEMBER", async () => db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "admin" } }, data: { role: "MEMBER" } })],
  ["inactive account", async () => db.user.update({ where: { id: "admin" }, data: { isActive: false } })],
  ["revoked club access", async () => db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "admin" } }, data: { status: "REVOKED" } })],
])("does not expose or consume an active claim after issuer authority is lost (%s)", async (_scenario, loseAuthority) => {
  const created = await create();
  const id = created.invitation!.id;
  const secret = "secret" in created ? created.secret! : "";
  const exchange = await invitationExchangePost(request(`/api/player-invites/${id}/exchange`, { secret }), inviteContext(id));
  expect(exchange.status).toBe(200);
  const cookiePair = exchange.headers.get("set-cookie")!.split(";")[0];
  const handle = cookiePair.slice(cookiePair.indexOf("=") + 1);
  expect(handle).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const invite = await db.playerInvitation.findUniqueOrThrow({ where: { id } });
  await loseAuthority();

  const before = sportingSnapshot();
  const claimantAccessBefore = await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } });
  await expect(validInvitation(db, id, new Date())).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE", statusCode: 410 });
  await expect(exchangeInvitationSecret(db, id, secret)).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE", statusCode: 410 });

  actor = { id: "account-a" };
  const context = await invitationContextGet(request(`/api/player-invites/${id}`, undefined, { id, handle }), inviteContext(id));
  expect(context.status).toBe(200);
  const contextBody = await context.json();
  expect(contextBody).toMatchObject({ purpose: "CLAIM", status: "UNAVAILABLE" });
  expect(contextBody).not.toHaveProperty("player");
  const redemption = await invitationRedeemPost(request(`/api/player-invites/${id}/redeem`, { confirm: true }, { id, handle }), inviteContext(id));
  expect(redemption.status).toBe(410);
  expect(await redemption.json()).toMatchObject({ code: "INVITATION_UNAVAILABLE" });

  expect(sportingSnapshot()).toEqual(before);
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id } })).toEqual(invite);
  expect(await db.player.findUniqueOrThrow({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: null });
  expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } })).toEqual(claimantAccessBefore);
  expect(await db.playerInvitationContinuation.count({ where: { invitationId: id } })).toBe(1);
  expect(await db.playerInvitationEvent.count({ where: { invitationId: id } })).toBe(1);
  expect(await db.clubAdmissionRequest.count()).toBe(0);
});
it("idempotent retry returns the receipt without restoring subsequently revoked access", async () => {
  const invite = await ready();
  actor = { id: "account-a" };
  const firstRedemption = await invitationRedeemPost(request(`/api/player-invites/${invite.id}/redeem`, { confirm: true }, { id: invite.id, handle: invite.handle }), inviteContext(invite.id));
  expect(firstRedemption.status).toBe(200);
  const result = await firstRedemption.json();
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } }, data: { status: "REVOKED" } });
  expect(await redeem(invite.id, invite.handle)).toEqual(result);
  expect(await transaction(tx => redeemPlayerInvitation(tx, invite.id, undefined, "account-a", new Date(Date.now() + INVITATION_TTL_MS * 2)))).toEqual(result);
  await expect(redeem(invite.id, invite.handle, "account-b")).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
  await db.user.update({ where: { id: "admin" }, data: { isActive: false } });
  const replay = await invitationRedeemPost(request(`/api/player-invites/${invite.id}/redeem`, { confirm: true }), inviteContext(invite.id));
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(result);
  expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } })).toMatchObject({ status: "REVOKED" });
});
it("database protects bindings, terminal states, audit, and the active-invite uniqueness", async () => {
  const invite = await ready();
  await db.clubMember.create({ data: { id: "other-member", clubId: "club-a", playerId: "p2" } });
  await expect(db.playerInvitation.update({ where: { id: invite.id }, data: { clubMemberId: "other-member" } })).rejects.toThrow();
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
  expect((await db.clubMember.findUniqueOrThrow({ where: { id: "original-member" } })).ownerUserId).toBe(record.redeemedByUserId);
  expect(await db.playerInvitationEvent.count({ where: { action: "REDEEMED" } })).toBe(1);
  await expectTerminalCleanup(invite.id, "REDEEMED");
}, 30000);
it("revoke versus redeem commits exactly one terminal outcome", async () => {
  const invite = await ready(3);
  const outcomes = await Promise.allSettled([create("REVOKE", invite.id), redeem(invite.id, invite.handle)]);
  expect(outcomes.filter(value => value.status === "fulfilled")).toHaveLength(1);
  const record = await db.playerInvitation.findUniqueOrThrow({ where: { id: invite.id } });
  expect((await db.clubMember.findUniqueOrThrow({ where: { id: "original-member" } })).ownerUserId).toBe(record.status === "REDEEMED" ? "account-a" : null);
  await expectTerminalCleanup(invite.id, record.status);
}, 30000);
it("the same transaction and invalidation triggers work through the libSQL adapter", async () => {
  await db.$disconnect();
  const client = createClient({ url: `file:${file}` });
  adapterFiles.add(file);
  adapterClient = client;
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


async function useLibSqlAdapter() {
  await db.$disconnect(); const client = createClient({ url: `file:${file}` }); adapterClient = client; adapterFiles.add(file);
  const adapter = new PrismaLibSQL(client as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]);
  db = new PrismaClient({ adapter } as unknown as ConstructorParameters<typeof PrismaClient>[0]);
}
it("applies the forward recovery migration through libSQL with valid foreign keys and partial ownership index", async () => {
  const migrationFile = path.join(dir, "libsql-migration.db");
  adapterFiles.add(migrationFile);
  // Match Prisma's compatibility setting for the repository's older migrations.
  const sqlite = new DatabaseSync(migrationFile, { enableDoubleQuotedStringLiterals: true });
  const migrationRoot = path.resolve("prisma/migrations");
  try {
    for (const entry of readdirSync(migrationRoot, { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name < "20261008120000_placeholder_claim_recovery").sort((a, b) => a.name.localeCompare(b.name))) sqlite.exec(readFileSync(path.join(migrationRoot, entry.name, "migration.sql"), "utf8"));
  } finally { sqlite.close(); }
  const client = createClient({ url: `file:${migrationFile}` });
  try {
    await client.executeMultiple(readFileSync(path.join(migrationRoot, "20261008120000_placeholder_claim_recovery/migration.sql"), "utf8"));
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    expect((await client.execute('SELECT * FROM "PlayerRetirementBlocker"')).rows).toEqual([]);
    const indexes = await client.execute(`SELECT sql FROM sqlite_master WHERE name='CommunityMember_nonretired_owner_key'`);
    expect(indexes.rows[0].sql).toContain('WHERE "retiredByAdmissionEventId" IS NULL');
  } finally { client.close(); }
});
const migrationPreservationTables = [
  { table: "Account", columns: ["id", "email", "passwordHash", "name", "gender", "isActive", "sessionVersion", "createdAt", "updatedAt"] },
  { table: "Community", columns: ["id", "name", "createdById", "isTutorial", "createdAt", "updatedAt"] },
  { table: "User", columns: ["id", "ownerUserId", "email", "passwordHash", "name", "gender", "elo", "isActive", "createdAt", "updatedAt"] },
  { table: "CommunityMember", columns: ["id", "communityId", "userId", "ownerUserId", "role", "status", "preferredPool", "needsMoreRest", "elo", "createdAt", "archivedAt", "achievementPreferencesJson", "retiredByAdmissionEventId"] },
  { table: "ClubAccess", columns: ["id", "clubId", "userId", "role", "status", "createdAt", "updatedAt"] },
  { table: "Session", columns: ["id", "code", "communityId", "name", "status", "isTest", "createdAt", "endedAt"] },
  { table: "Court", columns: ["id", "sessionId", "courtNumber"] },
  { table: "SessionPlayer", columns: ["id", "sessionId", "userId", "matchesPlayed", "sessionPoints", "lastPartnerId"] },
  { table: "Match", columns: ["id", "sessionId", "courtId", "status", "team1User1Id", "team1User2Id", "team2User1Id", "team2User2Id", "team1Score", "team2Score", "matchmakingReasonJson", "completedAt"] },
  { table: "MatchEloAdjustment", columns: ["id", "matchId", "communityId", "userId", "delta", "beforeElo", "afterElo", "createdAt"] },
  { table: "ClubRatingAdjustment", columns: ["id", "memberId", "actorId", "actorName", "beforeElo", "afterElo", "reason", "createdAt"] },
  { table: "ClubJoinRequest", columns: ["id", "clubId", "userId", "kind", "status", "requestedPlayerId", "approvedPlayerId", "note", "decision", "revision", "legacyClaimRequestId", "idempotencyKey", "originInvitationId", "createdAt", "updatedAt", "reviewedAt", "reviewedById"] },
  { table: "ClubAdmissionEvent", columns: ["id", "admissionRequestId", "actorUserId", "action", "revision", "detailsJson", "createdAt"] },
  { table: "PlayerInvitation", columns: ["id", "clubId", "playerId", "clubMemberId", "createdByUserId", "tokenHash", "status", "expiresAt", "redeemedByUserId", "redeemedAt", "revokedByUserId", "revokedAt", "revocationReason", "createdAt", "updatedAt"] },
  { table: "PlayerInvitationEvent", columns: ["id", "invitationId", "actorUserId", "action", "reason", "createdAt"] },
] as const;
function nativeMigrationSnapshot(sqlite: DatabaseSync) {
  return migrationPreservationTables.map(({ table, columns }) => ({
    table,
    rows: sqlite.prepare(`SELECT ${columns.map(column => `"${column}"`).join(",")} FROM "${table}" ORDER BY rowid`).all()
      .map(row => columns.map(column => (row as Record<string, unknown>)[column] ?? null)),
  }));
}
async function libSqlMigrationSnapshot(client: ReturnType<typeof createClient>) {
  const result = [];
  for (const { table, columns } of migrationPreservationTables) {
    const rows = await client.execute(`SELECT ${columns.map(column => `"${column}"`).join(",")} FROM "${table}" ORDER BY rowid`);
    result.push({ table, rows: rows.rows.map(row => columns.map(column => (row as Record<string, unknown>)[column] ?? null)) });
  }
  return result;
}
const populatedPredecessorSeed = `
INSERT INTO "Account" ("id","email","passwordHash","name","gender","isActive","sessionVersion","createdAt","updatedAt") VALUES
 ('migration-admin','migration-admin@example.invalid','hash','Migration Admin','UNSPECIFIED',1,0,1700000000000,1700000000000),
 ('migration-member','migration-member@example.invalid','hash','Migration Member','UNSPECIFIED',1,0,1700000000000,1700000000000),
 ('migration-retired-recipient','migration-retired@example.invalid','hash','Retired Recipient','UNSPECIFIED',1,0,1700000000000,1700000000000);
INSERT INTO "Community" ("id","name","createdById","isTutorial","createdAt","updatedAt") VALUES ('migration-club','Migration Club','migration-admin',0,1700000000000,1700000000000);
INSERT INTO "User" ("id","ownerUserId","email","passwordHash","name","gender","elo","isActive","createdAt","updatedAt") VALUES
 ('migration-player',NULL,'migration-player@example.invalid','legacy-hash','Preserved Player','MALE',1384,1,1600000000000,1700000000000),
 ('migration-p2',NULL,NULL,NULL,'Player Two','FEMALE',1000,1,1600000000000,1700000000000),
 ('migration-p3',NULL,NULL,NULL,'Player Three','MALE',1000,1,1600000000000,1700000000000),
 ('migration-p4',NULL,NULL,NULL,'Player Four','FEMALE',1000,1,1600000000000,1700000000000);
INSERT INTO "User" ("id","ownerUserId","name","gender","elo","isActive","createdAt","updatedAt") VALUES
 ('migration-retired-source','migration-retired-recipient','Old empty duplicate','MALE',1000,0,1600000000000,1700000000000),
 ('migration-retired-target',NULL,'Original retained profile','FEMALE',1000,1,1600000000000,1700000000000);
INSERT INTO "CommunityMember" ("id","communityId","userId","ownerUserId","role","status","preferredPool","needsMoreRest","elo","createdAt","archivedAt","achievementPreferencesJson") VALUES
 ('migration-member','migration-club','migration-player',NULL,'ADMIN','CORE','A',0,1384,1600000000000,NULL,'{}'),
 ('migration-retired-source-member','migration-club','migration-retired-source','migration-retired-recipient','MEMBER','CORE','B',0,1000,1700000000001,1700000100001,'{}'),
 ('migration-retired-target-member','migration-club','migration-retired-target',NULL,'MEMBER','CORE','B',0,1000,1600000000000,NULL,'{}');
INSERT INTO "ClubAccess" ("id","clubId","userId","role","status","createdAt","updatedAt") VALUES
 ('migration-owner-access','migration-club','migration-admin','OWNER','ACTIVE',1700000000000,1700000000000),
 ('migration-member-access','migration-club','migration-member','MEMBER','ACTIVE',1700000000000,1700000000000),
 ('migration-retired-access','migration-club','migration-retired-recipient','MEMBER','ACTIVE',1700000000000,1700000000000);
INSERT INTO "Session" ("id","code","communityId","name","status","isTest","createdAt") VALUES ('migration-session','MIGRATION','migration-club','Preserved Session','COMPLETED',0,1700000000000);
INSERT INTO "Court" ("id","sessionId","courtNumber") VALUES ('migration-court','migration-session',1);
INSERT INTO "SessionPlayer" ("id","sessionId","userId","matchesPlayed","sessionPoints","lastPartnerId") VALUES ('migration-seat','migration-session','migration-player',12,24,'migration-p2');
INSERT INTO "Match" ("id","sessionId","courtId","status","team1User1Id","team1User2Id","team2User1Id","team2User2Id","team1Score","team2Score","matchmakingReasonJson","completedAt") VALUES
 ('migration-match','migration-session','migration-court','COMPLETED','migration-player','migration-p2','migration-p3','migration-p4',21,18,'{"mode":"balanced"}',1700000100000);
INSERT INTO "MatchEloAdjustment" ("id","matchId","communityId","userId","delta","beforeElo","afterElo","createdAt") VALUES ('migration-elo','migration-match','migration-club','migration-player',15,1369,1384,1700000100000);
INSERT INTO "ClubRatingAdjustment" ("id","memberId","actorId","actorName","beforeElo","afterElo","reason","createdAt") VALUES ('migration-rating','migration-member','migration-admin','Migration Admin',1369,1384,'Existing rating history',1700000100000);
INSERT INTO "PlayerInvitation" ("id","clubId","playerId","clubMemberId","createdByUserId","tokenHash","status","expiresAt","createdAt","updatedAt") VALUES
 ('migration-invitation','migration-club','migration-player','migration-member','migration-admin','migration-token-hash','ACTIVE','2035-01-01T00:00:00.000Z',1700000300000,1700000300000),
 ('migration-retirement-invitation','migration-club','migration-retired-target','migration-retired-target-member','migration-admin','migration-retirement-token-hash','ACTIVE','2035-01-01T00:00:00.000Z',1700000400000,1700000400000);
INSERT INTO "ClubJoinRequest" ("id","clubId","userId","kind","status","requestedPlayerId","revision","originInvitationId","createdAt","updatedAt") VALUES
 ('migration-request','migration-club','migration-member','EXISTING_PLAYER','PENDING','migration-player',0,'migration-invitation',1700000200000,1700000200000);
INSERT INTO "ClubAdmissionEvent" ("id","admissionRequestId","actorUserId","action","revision","detailsJson","createdAt") VALUES
 ('migration-request-event','migration-request','migration-member','SUBMIT',0,'{"kind":"EXISTING_PLAYER"}',1700000200000);
INSERT INTO "PlayerInvitationEvent" ("id","invitationId","actorUserId","action","reason","createdAt") VALUES
 ('migration-invitation-created','migration-invitation','migration-admin','CREATED',NULL,1700000300000),
 ('migration-retirement-invitation-created','migration-retirement-invitation','migration-admin','CREATED',NULL,1700000400000);
INSERT INTO "ClubJoinRequest" ("id","clubId","userId","kind","status","requestedPlayerId","revision","originInvitationId","createdAt","updatedAt") VALUES
 ('migration-retirement-request','migration-club','migration-retired-recipient','EXISTING_PLAYER','PENDING','migration-retired-target',0,'migration-retirement-invitation',1700000500000,1700000500000);
INSERT INTO "ClubAdmissionEvent" ("id","admissionRequestId","actorUserId","action","revision","detailsJson","createdAt") VALUES
 ('migration-retirement-submit','migration-retirement-request','migration-retired-recipient','SUBMIT',0,'{"kind":"EXISTING_PLAYER","requestedPlayerId":"migration-retired-target"}',1700000500000);
UPDATE "ClubJoinRequest" SET "revision"=1 WHERE "id"='migration-retirement-request';
INSERT INTO "ClubAdmissionEvent" ("id","admissionRequestId","actorUserId","action","revision","detailsJson","createdAt") VALUES
 ('migration-retirement-approval','migration-retirement-request','migration-admin','APPROVE_RECOVERY',1,'{"originInvitationId":"migration-retirement-invitation","targetPlayerId":"migration-retired-target","sourcePlayerId":"migration-retired-source","sourceMemberId":"migration-retired-source-member","confirmRestoreAccess":false,"restoredAccess":false,"reason":"Verified empty duplicate"}',1700000600000);
UPDATE "CommunityMember" SET "retiredByAdmissionEventId"='migration-retirement-approval' WHERE "id"='migration-retired-source-member';
UPDATE "PlayerInvitation" SET "status"='REDEEMED',"redeemedByUserId"='migration-retired-recipient',"redeemedAt"=1700000600001 WHERE "id"='migration-retirement-invitation';
UPDATE "User" SET "ownerUserId"='migration-retired-recipient' WHERE "id"='migration-retired-target';
UPDATE "ClubJoinRequest" SET "status"='APPROVED',"approvedPlayerId"='migration-retired-target',"decision"='RECOVER_INVITED_PLAYER',"reviewedById"='migration-admin',"reviewedAt"=1700000600002 WHERE "id"='migration-retirement-request';
`;
it.each(["SQLite", "libSQL"] as const)("preserves populated predecessor rows while applying the authorized-identity migration on %s", async engine => {
  const predecessor = path.join(dir, `populated-predecessor-${engine}.db`);
  const migrationRoot = path.resolve("prisma/migrations");
  const migrationName = "20261008140000_authorized_identity_transitions";
  const predecessorMigrations = readdirSync(migrationRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name < migrationName).sort((a, b) => a.name.localeCompare(b.name));
  const setup = new DatabaseSync(predecessor, { enableDoubleQuotedStringLiterals: true });
  try {
    for (const entry of predecessorMigrations) setup.exec(readFileSync(path.join(migrationRoot, entry.name, "migration.sql"), "utf8"));
    setup.exec("PRAGMA foreign_keys=ON;");
    setup.exec(populatedPredecessorSeed);
    const inventory = setup.prepare(`SELECT
      (SELECT count(*) FROM "PlayerInvitation" WHERE "status"='ACTIVE') AS activeInvitations,
      (SELECT count(*) FROM "ClubJoinRequest" WHERE "originInvitationId" IS NOT NULL AND "status"='PENDING') AS pendingLegacyRecoveries,
      (SELECT count(*) FROM "ClubAccess") AS accessRows,
      (SELECT count(*) FROM "Session" WHERE "status"='COMPLETED') AS completedSessions,
      (SELECT count(*) FROM "Match") AS matches,
      (SELECT count(*) FROM "SessionPlayer") AS sessionPlayers,
      (SELECT count(*) FROM "MatchEloAdjustment") AS matchRatingAdjustments,
      (SELECT count(*) FROM "ClubRatingAdjustment") AS clubRatingAdjustments,
      (SELECT count(*) FROM "RetiredPlayer") AS preexistingRetiredPlayers`).get();
    expect(inventory).toEqual({
      activeInvitations: 1, pendingLegacyRecoveries: 1, accessRows: 3,
      completedSessions: 1, matches: 1, sessionPlayers: 1,
      matchRatingAdjustments: 1, clubRatingAdjustments: 1, preexistingRetiredPlayers: 1,
    });
    expect(setup.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally { setup.close(); }
  const beforeSource = new DatabaseSync(predecessor, { enableDoubleQuotedStringLiterals: true });
  const before = nativeMigrationSnapshot(beforeSource);
  beforeSource.close();
  const target = path.join(dir, `populated-migrated-${engine}.db`);
  copyFileSync(predecessor, target);
  const migrationSql = readFileSync(path.join(migrationRoot, migrationName, "migration.sql"), "utf8");
  if (engine === "SQLite") {
    const sqlite = new DatabaseSync(target, { enableDoubleQuotedStringLiterals: true });
    try {
      sqlite.exec("PRAGMA foreign_keys=ON;");
      sqlite.exec(migrationSql);
      expect(nativeMigrationSnapshot(sqlite)).toEqual(before);
      expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      const objects = sqlite.prepare("SELECT name,type FROM sqlite_master WHERE name IN ('PlayerInvitation_active_correction_source','Authorized_execution_event_guard','PlayerInvitation_state_guard','PlayerInvitation_authorization_issue_event','PlayerRetirementBlocker','ClubMember_retirement_guard','Correction_source_deactivation_guard','PlayerInvitation_access_restore_identity_guard','Authorized_access_restore_identity_guard','ClubJoinRequest_access_restore_identity_guard') ORDER BY name").all();
      expect(objects).toEqual([
        { name: "Authorized_access_restore_identity_guard", type: "trigger" },
        { name: "Authorized_execution_event_guard", type: "trigger" },
        { name: "ClubJoinRequest_access_restore_identity_guard", type: "trigger" },
        { name: "ClubMember_retirement_guard", type: "trigger" },
        { name: "Correction_source_deactivation_guard", type: "trigger" },
        { name: "PlayerInvitation_access_restore_identity_guard", type: "trigger" },
        { name: "PlayerInvitation_active_correction_source", type: "index" },
        { name: "PlayerInvitation_authorization_issue_event", type: "trigger" },
        { name: "PlayerInvitation_state_guard", type: "trigger" },
        { name: "PlayerRetirementBlocker", type: "view" },
      ]);
    } finally { sqlite.close(); }
  } else {
    adapterFiles.add(target);
    const client = createClient({ url: `file:${target}` });
    try {
      await client.execute("PRAGMA foreign_keys=ON");
      await client.executeMultiple(migrationSql);
      expect(await libSqlMigrationSnapshot(client)).toEqual(before);
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
      const objects = await client.execute("SELECT name,type FROM sqlite_master WHERE name IN ('PlayerInvitation_active_correction_source','Authorized_execution_event_guard','PlayerInvitation_state_guard','PlayerInvitation_authorization_issue_event','PlayerRetirementBlocker','ClubMember_retirement_guard','Correction_source_deactivation_guard','PlayerInvitation_access_restore_identity_guard','Authorized_access_restore_identity_guard','ClubJoinRequest_access_restore_identity_guard') ORDER BY name");
      expect(objects.rows.map(row => ({ name: row.name, type: row.type }))).toEqual([
        { name: "Authorized_access_restore_identity_guard", type: "trigger" },
        { name: "Authorized_execution_event_guard", type: "trigger" },
        { name: "ClubJoinRequest_access_restore_identity_guard", type: "trigger" },
        { name: "ClubMember_retirement_guard", type: "trigger" },
        { name: "Correction_source_deactivation_guard", type: "trigger" },
        { name: "PlayerInvitation_access_restore_identity_guard", type: "trigger" },
        { name: "PlayerInvitation_active_correction_source", type: "index" },
        { name: "PlayerInvitation_authorization_issue_event", type: "trigger" },
        { name: "PlayerInvitation_state_guard", type: "trigger" },
        { name: "PlayerRetirementBlocker", type: "view" },
      ]);
    } finally { client.close(); }
  }
}, 60000);

// Release61 intentionally closes correction/recovery execution. The former active
// lifecycle, retirement and race permutations are replaced by differentiated
// service/SQL denial, preserved historical receipts and local removal contracts.
it.each(["SQLite", "libSQL"] as const)("closed legacy services cannot mutate profiles or expose account choices on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  const before = sportingSnapshot();
  for (const purpose of ["CORRECTION", "ACCESS_RESTORE"] as const) {
    await expect(transaction(tx => createAuthorizedInvitation(tx, purpose, { clubId: "club-a", targetPlayerId: "historical-player", issuerAccountId: "admin", recipientAccountId: "account-a", reason: "Historical policy", restoreArchivedRoster: false }))).rejects.toMatchObject({ code: "LEGACY_IDENTITY_FLOW_DISABLED", statusCode: 410 });
    await expect(identityOptions(db, { clubId: "club-a", targetPlayerId: "historical-player", issuerAccountId: "admin", purpose })).rejects.toMatchObject({ statusCode: 410 });
    await expect(transaction(tx => confirmAuthorizedInvitation(tx, purpose, { invitationId: "missing", userId: "account-a" }))).rejects.toMatchObject({ statusCode: 410 });
  }
  await expect(transaction(tx => submitInvitationRecovery(tx, { invitationId: "missing", userId: "account-a", idempotencyKey: "closed-legacy" }))).rejects.toMatchObject({ code: "LEGACY_IDENTITY_FLOW_DISABLED", statusCode: 410 });
  expect(sportingSnapshot()).toEqual(before);
  expect(await db.clubPlayerOwnershipEvent.count()).toBe(0);
  expect(await db.clubAdmissionRequest.count()).toBe(0);
});
it.each(["SQLite", "libSQL"] as const)("SQL rejects new legacy invitation and execution receipts on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  for (const purpose of ["CORRECTION", "ACCESS_RESTORE"]) {
    await expect(db.$executeRawUnsafe('INSERT INTO PlayerInvitation (id,clubId,playerId,clubMemberId,createdByUserId,tokenHash,expiresAt,updatedAt,purpose) VALUES (?,?,?,?,?,?,?,?,?)', purpose, "club-a", "historical-player", "original-member", "admin", purpose, Date.now()+60000, Date.now(), purpose)).rejects.toThrow();
  }
  expect(await db.playerInvitation.count()).toBe(0);
  expect(await db.clubAdmissionEvent.count()).toBe(0);
  const request = await transaction(tx => submitClubAdmission(tx, { clubId: "club-a", requesterUserId: "account-a", kind: "EXISTING_PLAYER", requestedPlayerId: "historical-player" }));
  for (const action of ["APPROVE_RECOVERY", "EXECUTE_AUTHORIZED_CORRECTION", "EXECUTE_AUTHORIZED_ACCESS_RESTORE"]) {
    await expect(db.$executeRawUnsafe('INSERT INTO ClubAdmissionEvent (id,admissionRequestId,actorUserId,action,revision,detailsJson) VALUES (?,?,?,?,?,?)', action, request.id!, "admin", action, 1, "{}")).rejects.toThrow("LEGACY_IDENTITY_WRITER_CLOSED");
  }
  expect(await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: request.id! } })).toMatchObject({ status: "PENDING", revision: 0 });
  expect(await db.clubAdmissionEvent.count()).toBe(1);
});
it.each(["SQLite", "libSQL"] as const)("automatic removal is local, preserves sports and makes invitation replay receipt-only on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await db.clubMember.create({ data: { clubId: "club-b", playerId: "p2", elo: 1275 } }); await localClaim("club-b");
  const invite = await ready(); await redeem(invite.id, invite.handle);
  const b = await db.clubMember.findUniqueOrThrow({ where: { clubId_playerId: { clubId: "club-b", playerId: "p2" } } });
  const before = sportingSnapshot(); await localRemove();
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "original-member" } })).toMatchObject({ ownerUserId: null, archivedAt: expect.any(Date), elo: 1384 });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: b.id } })).toEqual(b);
  expect(sportingSnapshot().Match).toEqual(before.Match);
  expect(await redeem(invite.id, invite.handle)).toMatchObject({ playerId: "historical-player", clubId: "club-a" });
  const access = await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } });
  expect(access).toMatchObject({ status: "REVOKED" });
  await db.clubAccess.update({ where: { id: access.id }, data: { status: "ACTIVE" } });
  const restored = await db.clubAccess.findUniqueOrThrow({ where: { id: access.id } }); await localRemove();
  expect(await db.clubAccess.findUniqueOrThrow({ where: { id: access.id } })).toEqual(restored);
});
it.each(["SQLite", "libSQL"] as const)("fresh local invitation restores MEMBER at the released access revision, without legacy receipts on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  const first = await ready(); await redeem(first.id, first.handle);
  await db.clubAccess.updateMany({ where: { clubId: "club-a", userId: "account-a" }, data: { role: "ADMIN" } });
  await localRemove();
  await db.clubMember.create({ data: { clubId: "club-a", playerId: "p2", elo: 1275 } });
  const issued = await transaction(tx => managePlayerInvitation(tx, { clubId: "club-a", playerId: "p2", userId: "admin", action: "CREATE" }));
  const id = issued.invitation!.id;
  const continuation = await transaction(tx => exchangeInvitationSecret(tx, id, "secret" in issued ? issued.secret! : ""));
  await redeem(id, continuation.handle);
  const event = await db.clubPlayerOwnershipEvent.findFirstOrThrow({ where: { invitationId: id } });
  expect(event).toMatchObject({ action: "CLAIM", releaseEventId: expect.any(String), previousAccessStatus: "REVOKED", newAccessStatus: "ACTIVE", newAccessRole: "MEMBER" });
  const grant = await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } });
  expect(grant).toMatchObject({ role: "MEMBER", status: "ACTIVE", revision: event.newAccessRevision });
  expect(await db.playerOwnershipReleaseClaim.count()).toBe(0);
  await db.clubAccess.update({ where: { id: grant.id }, data: { status: "REVOKED" } });
  const revoked = await db.clubAccess.findUniqueOrThrow({ where: { id: grant.id } });
  await redeem(id, continuation.handle);
  expect(await db.clubAccess.findUniqueOrThrow({ where: { id: grant.id } })).toEqual(revoked);
});
it.each(["SQLite", "libSQL"] as const)("migration61 preserves genuine terminal release60 receipt and all original columns on %s", async engine => {
  const legacyFile = path.join(dir, `terminal-${engine}.db`);
  const legacy = new DatabaseSync(legacyFile, { enableDoubleQuotedStringLiterals: true });
  migrateFixture(legacy, "20261011120000_audited_player_ownership_release"); seedHistoricalAccessReceipt(legacy);
  const tables = legacy.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => String(row.name));
  const columns = new Map(tables.map(table => [table, legacy.prepare(`PRAGMA table_info("${table}")`).all().map(row => String(row.name))]));
  const snapshot = (target: DatabaseSync) => Object.fromEntries(tables.map(table => [table, target.prepare(`SELECT ${columns.get(table)!.map(col => '"'+col+'"').join(',')} FROM "${table}" ORDER BY rowid`).all()]));
  const before = snapshot(legacy); legacy.close();
  const sql = readFileSync(path.resolve("prisma/migrations", localOwnershipMigration, "migration.sql"), "utf8");
  if (engine === "SQLite") { const target=new DatabaseSync(legacyFile); target.exec(sql); target.close(); }
  else { adapterFiles.add(legacyFile); const target=createClient({ url: `file:${legacyFile}` }); await target.executeMultiple(sql); target.close(); }
  const target=new DatabaseSync(legacyFile); expect(snapshot(target)).toEqual(before); expect(target.prepare("PRAGMA foreign_key_check").all()).toEqual([]); target.close();
  const reader=new PrismaClient({ datasources: { db: { url: `file:${legacyFile}` } } });
  try {
    const invite=await reader.playerInvitation.findUniqueOrThrow({ where: { id: "legacy-invite" } });
    const receipt=await invitationExecutionReceipt(reader,invite);
    expect(receipt).toMatchObject({ purpose: "ACCESS_RESTORE", actorAccountId: "legacy-recipient", accessOutcome: "PRESERVED_ACTIVE", targetPlayerId: "legacy-player" });
    expect(await getInvitationRecoveryStatus(reader, invite.id, "legacy-recipient")).toMatchObject({ request: { status: "APPROVED" }, recovery: { canApprove: false, duplicate: null } });
    const retained = await reader.clubMember.findUniqueOrThrow({ where: { id: "legacy-member-b" } });
    expect(retained).toMatchObject({ ownerUserId: "legacy-recipient", archivedAt: expect.any(Date), elo: 1432 });
    const activeMember = await reader.clubMember.findUniqueOrThrow({ where: { id: "legacy-member" } });
    const activeAccess = await reader.clubAccess.findUniqueOrThrow({ where: { id: "legacy-access" } });
    await admissionTransaction(reader, tx => disconnectRemovedPlayer(tx, { clubId: "legacy-club-b", playerId: "legacy-player", actorUserId: "legacy-admin" }));
    expect(await reader.clubMember.findUniqueOrThrow({ where: { id: "legacy-member-b" } })).toMatchObject({ ownerUserId: null, archivedAt: retained.archivedAt, elo: 1432 });
    expect(await reader.clubMember.findUniqueOrThrow({ where: { id: "legacy-member" } })).toEqual(activeMember);
    expect(await reader.clubAccess.findUniqueOrThrow({ where: { id: "legacy-access" } })).toEqual(activeAccess);
    expect(await reader.player.findUniqueOrThrow({ where: { id: "legacy-player" } })).toMatchObject({ ownerUserId: "legacy-recipient" });
    await reader.clubAccess.update({ where: { id: "legacy-access" }, data: { status: "REVOKED" } });
    expect(await invitationExecutionReceipt(reader,invite)).toEqual(receipt);
    await expect(transaction(tx=>confirmAuthorizedInvitation(tx,"ACCESS_RESTORE",{invitationId:invite.id,userId:"legacy-recipient"}))).rejects.toMatchObject({ statusCode: 410 });
  } finally { await reader.$disconnect(); }
});
