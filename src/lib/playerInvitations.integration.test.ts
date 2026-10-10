import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { inspect } from "node:util";
import { admissionTransaction, reviewClubAdmission, submitClubAdmission } from "./clubAdmissions";
import { activePlayerInvitation, exchangeInvitationSecret, expirePlayerInvitationReservations, hashInvitationSecret, invitationContext, INVITATION_TTL_MS, managePlayerInvitation, redeemPlayerInvitation, validInvitation } from "./playerInvitations";
import { adminInvitationGet, adminInvitationPost, invitationConfirmCorrectionPost, invitationContextGet, invitationExchangePost, invitationRedeemPost } from "./playerInvitationApi";
import { invitationRecoveryGet, invitationRecoveryPost } from "./playerInvitationApi";
import { getInvitationRecoveryStatus, recoveryEligibility, submitInvitationRecovery } from "./playerInvitationRecovery";
import { getOwnedClubPlayer, getOwnedPlayer, resolveOwnedSessionPlayer } from "./playerIdentity";
import { playerRetirementBlockers } from "./playerRetirement";
import { captureAchievementEligibility } from "./clubAchievementService";
import { adminAdmissionListApi, reviewAdmissionApi, submitAdmissionApi } from "./clubAdmissionApi";
import { authorizedInvitationContext, confirmAuthorizedInvitation, createAuthorizedInvitation, identityOptions, invitationExecutionReceipt } from "./playerInvitationAuthorization";

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
it("returns a typed conflict before consuming a claim when the recipient owns an identity in a disjoint club", async () => {
  await db.player.update({ where: { id: "p2" }, data: { ownerUserId: "account-a" } });
  await db.clubMember.create({ data: { id: "account-a-club-a-member", clubId: "club-a", playerId: "p2", archivedAt: new Date() } });
  await db.clubMember.create({ data: { id: "claim-target-club-b-member", clubId: "club-b", playerId: "p3" } });
  const created = await transaction(tx => managePlayerInvitation(tx, { clubId: "club-b", playerId: "p3", userId: "admin", action: "CREATE" }));
  const id = created.invitation!.id;
  const secret = "secret" in created ? created.secret! : "";
  const exchange = await invitationExchangePost(request(`/api/player-invites/${id}/exchange`, { secret }), inviteContext(id));
  expect(exchange.status).toBe(200);
  const cookiePair = exchange.headers.get("set-cookie")!.split(";")[0];
  const handle = cookiePair.slice(cookiePair.indexOf("=") + 1);
  expect(handle).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const inviteBefore = await db.playerInvitation.findUniqueOrThrow({ where: { id } });
  const before = sportingSnapshot();
  const claimantAccessBefore = await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-b", userId: "account-a" } } });

  actor = { id: "account-a" };
  const response = await invitationRedeemPost(request(`/api/player-invites/${id}/redeem`, { confirm: true }, { id, handle }), inviteContext(id));
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "IDENTITY_CONFLICT" });
  expect(sportingSnapshot()).toEqual(before);
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id } })).toEqual(inviteBefore);
  expect(await db.player.findUniqueOrThrow({ where: { id: "p3" } })).toMatchObject({ ownerUserId: null });
  expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-b", userId: "account-a" } } })).toEqual(claimantAccessBefore);
  expect(await db.playerInvitationEvent.count({ where: { invitationId: id } })).toBe(1);
  expect(await db.clubAdmissionRequest.count()).toBe(0);
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

async function removedDuplicate() {
  await db.player.create({ data: { id: "duplicate", name: "Accidental Player", gender: "FEMALE", ownerUserId: "account-a" } });
  await db.clubMember.create({ data: { id: "duplicate-member", clubId: "club-a", playerId: "duplicate", archivedAt: new Date() } });
  await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-a", role: "ADMIN", status: "REVOKED" } });
}
async function activeOwnedDuplicate(options: { archived?: boolean; access?: { role: string; status?: string } } = {}) {
  await db.player.create({ data: { id: "duplicate", name: "Accidental Player", gender: "FEMALE", ownerUserId: "account-a" } });
  await db.clubMember.create({ data: { id: "duplicate-member", clubId: "club-a", playerId: "duplicate", ...(options.archived ? { archivedAt: new Date() } : {}) } });
  if (options.access) await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-a", role: options.access.role, status: options.access.status ?? "ACTIVE" } });
}
function createCorrection(options: { targetPlayerId?: string; targetAccountId?: string; sourcePlayerId?: string; sourceMemberId?: string; action?: string; restoreArchivedRoster?: boolean; replaceInvitationId?: string; now?: Date; reason?: string } = {}) {
  return transaction(tx => createAuthorizedInvitation(tx, "CORRECTION", {
    clubId: "club-a", targetPlayerId: options.targetPlayerId ?? "historical-player", issuerAccountId: "admin",
    recipientAccountId: options.targetAccountId ?? "account-a", sourcePlayerId: options.sourcePlayerId ?? "duplicate",
    sourceMemberId: options.sourceMemberId ?? "duplicate-member", retireSourcePlayerId: options.sourcePlayerId ?? "duplicate",
    reason: options.reason ?? "The account holder confirmed this duplicate profile is empty.",
    authorizedAccessAction: options.action as "PRESERVE_ACTIVE" | "GRANT_MEMBER" | "RESTORE_MEMBER" | undefined,
    restoreArchivedRoster: (options.restoreArchivedRoster ?? false) as false,
    ...(options.replaceInvitationId ? { replaceInvitationId: options.replaceInvitationId } : {}),
  }, options.now));
}
function createAccessRestore(options: { playerId?: string; recipientAccountId?: string; restoreArchivedRoster: boolean; action?: string; reason?: string; now?: Date }) {
  return transaction(tx => createAuthorizedInvitation(tx, "ACCESS_RESTORE", {
    clubId: "club-a", targetPlayerId: options.playerId ?? "historical-player", issuerAccountId: "admin",
    recipientAccountId: options.recipientAccountId ?? "account-a", restoreArchivedRoster: options.restoreArchivedRoster,
    authorizedAccessAction: options.action as "PRESERVE_ACTIVE" | "GRANT_MEMBER" | "RESTORE_MEMBER" | undefined,
    reason: options.reason ?? "Restore this account's exact existing club access.",
  }, options.now));
}
async function requestRecovery(withDuplicate = true) {
  if (withDuplicate) await removedDuplicate();
  else await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-a", role: "ADMIN", status: "REVOKED" } });
  const invite = await ready();
  const submitted = await transaction(tx => submitInvitationRecovery(tx, { invitationId: invite.id, handle: invite.handle, userId: "account-a", idempotencyKey: "recovery-key" }));
  return { invite, submitted, requestId: submitted.request!.id };
}
function approveRecovery(requestId: string, overrides: Partial<Parameters<typeof reviewClubAdmission>[1]> = {}) {
  return transaction(tx => reviewClubAdmission(tx, { clubId: "club-a", requestId, reviewerUserId: "admin", action: "APPROVE", revision: 0,
    confirmRestoreAccess: true, retireEmptyPlayerId: "duplicate", reason: "Accidental empty profile from ordinary joining", ...overrides }));
}
function preservedTargetSnapshot() {
  const snapshot = sportingSnapshot();
  for (const table of ["User", "CommunityMember"]) snapshot[table] = snapshot[table].filter(row => row.id !== "duplicate" && row.id !== "duplicate-member");
  return snapshot;
}
async function useLibSqlAdapter() {
  await db.$disconnect();
  adapterFiles.add(file);
  adapterClient = createClient({ url: `file:${file}` });
  await adapterClient.execute("PRAGMA foreign_keys=ON");
  db = new PrismaClient({ adapter: new PrismaLibSQL(adapterClient as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]) } as unknown as ConstructorParameters<typeof PrismaClient>[0]);
}
async function openSiblingClient(engine: "SQLite" | "libSQL") {
  if (engine === "libSQL") {
    adapterFiles.add(file);
    const client = createClient({ url: `file:${file}` });
    const sibling = new PrismaClient({ adapter: new PrismaLibSQL(client as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]) } as unknown as ConstructorParameters<typeof PrismaClient>[0]);
    return { db: sibling, close: async () => { await sibling.$disconnect(); client.close(); } };
  }
  const sibling = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  return { db: sibling, close: () => sibling.$disconnect() };
}
async function recoveryStateSnapshot(invitationId: string, requestId: string) {
  return {
    source: await db.player.findUniqueOrThrow({ where: { id: "duplicate" } }),
    sourceMember: await db.clubMember.findUniqueOrThrow({ where: { id: "duplicate-member" } }),
    target: await db.player.findUniqueOrThrow({ where: { id: "historical-player" } }),
    invitation: await db.playerInvitation.findUniqueOrThrow({ where: { id: invitationId } }),
    request: await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: requestId } }),
    access: await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } }),
    admissionEvents: await db.clubAdmissionEvent.findMany({ where: { admissionRequestId: requestId }, orderBy: { revision: "asc" } }),
    invitationEvents: await db.playerInvitationEvent.findMany({ where: { invitationId }, orderBy: { createdAt: "asc" } }),
  };
}

function fullDatabaseSnapshot() {
  return applicationDatabaseSnapshot(file);
}

async function expectPrismaConstraintAbort(operation: Promise<unknown>, modelName: string) {
  let caught: unknown;
  try { await operation; } catch (error) { caught = error; }
  if (caught === undefined) throw new Error(`Expected Prisma to report the ${modelName} guard failure.`);
  const structured = caught as { code?: unknown; meta?: unknown };
  expect(structured, `Prisma error details: ${inspect(caught, { depth: 8, colors: false })}`).toMatchObject({
    code: "P2003", meta: { modelName, field_name: "foreign key" },
  });
}

function applicationDatabaseSnapshot(databaseFile: string) {
  const sqlite = new DatabaseSync(databaseFile);
  try {
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='_prisma_migrations' ORDER BY name").all() as Array<{ name: string }>;
    return tables.map(({ name }) => {
      const identifier = `"${name.replaceAll('"', '""')}"`;
      return { name, rows: sqlite.prepare(`SELECT * FROM ${identifier} ORDER BY rowid`).all() };
    });
  } finally { sqlite.close(); }
}

it.each(["ordinary admission", "CLAIM", "CORRECTION active", "CORRECTION archived", "ACCESS_RESTORE", "CORRECTION rollback"])(
  "replays the actual %s SQL flow at hosted expression depth 100", async flow => {
    if (flow.startsWith("CORRECTION")) await activeOwnedDuplicate({ archived: flow === "CORRECTION archived", access: { role: "ADMIN" } });
    if (flow === "ACCESS_RESTORE") {
      await db.player.update({ where: { id: "historical-player" }, data: { ownerUserId: "account-a" } });
      await db.clubMember.update({ where: { id: "original-member" }, data: { archivedAt: new Date() } });
      await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-a", role: "ADMIN" } });
    }
    await db.$disconnect();
    const replayFile = path.join(dir, `depth-100-${index}.db`);
    copyFileSync(file, replayFile);
    const queries: Array<{ query: string; params: string }> = [];
    const recordingDb = new PrismaClient({ datasources: { db: { url: `file:${file}` } }, log: [{ emit: "event", level: "query" }] });
    recordingDb.$on("query", event => queries.push({ query: event.query, params: event.params }));
    db = recordingDb;
    const before = applicationDatabaseSnapshot(file);
    if (flow === "ordinary admission") {
      const admission = await transaction(tx => submitClubAdmission(tx, { clubId: "club-a", requesterUserId: "account-a", kind: "NEW_PLAYER", proposedPlayerName: "Normal join", proposedGender: "MALE" }));
      await transaction(tx => reviewClubAdmission(tx, { clubId: "club-a", requestId: admission.id!, reviewerUserId: "admin", action: "APPROVE", revision: 0 }));
      expect(await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: admission.id! } })).toMatchObject({ status: "APPROVED" });
    } else if (flow === "CLAIM") {
      const invite = await ready();
      await redeem(invite.id, invite.handle);
      expect(await db.player.findUniqueOrThrow({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: "account-a" });
    } else {
      const purpose = flow === "ACCESS_RESTORE" ? "ACCESS_RESTORE" : "CORRECTION";
      if (flow === "CORRECTION rollback") {
        await db.$executeRawUnsafe(`CREATE TRIGGER depth100_fault BEFORE UPDATE OF "retiredByAdmissionEventId" ON "CommunityMember" WHEN NEW."retiredByAdmissionEventId" IS NOT NULL BEGIN SELECT RAISE(ABORT,'DEPTH100_ROLLBACK'); END`);
      }
      const created = purpose === "CORRECTION" ? await createCorrection({ action: "PRESERVE_ACTIVE" }) : await createAccessRestore({ restoreArchivedRoster: true, action: "PRESERVE_ACTIVE" });
      const invitationId = created.invitation!.id;
      const { handle } = await transaction(tx => exchangeInvitationSecret(tx, invitationId, created.secret!));
      const beforeExecution = applicationDatabaseSnapshot(file);
      const confirm = () => transaction(tx => confirmAuthorizedInvitation(tx, purpose, { invitationId, handle, userId: "account-a" }));
      if (flow === "CORRECTION rollback") {
        await expect(confirm()).rejects.toThrow();
        expect(applicationDatabaseSnapshot(file)).toEqual(beforeExecution);
      } else {
        const result = await confirm();
        expect(result.receipt).toMatchObject({ purpose, sourceRetired: purpose === "CORRECTION" });
      }
    }
    await db.$disconnect();
    expect(queries.some(({ query }) => query.includes("INSERT INTO"))).toBe(true);
    const expected = applicationDatabaseSnapshot(file);
    expect(expected).not.toEqual(before);
    const payloadFile = path.join(dir, `depth-100-${index}.json`);
    writeFileSync(payloadFile, JSON.stringify({ database: replayFile, queries, expected, expectedErrors: flow === "CORRECTION rollback" ? 1 : 0, errorMessages: flow === "CORRECTION rollback" ? ["DEPTH100_ROLLBACK"] : [] }));
    const result = execFileSync(process.env.PYTHON ?? "python", ["scripts/test-identity-expression-depth.py", "--replay", payloadFile], { encoding: "utf8", stdio: "pipe" });
    expect(JSON.parse(result)).toMatchObject({ depth: 100, snapshotMatched: true });
  }, 60000,
);

async function prepareAuthorizedFaultCase(kind: string) {
  let purpose: "CORRECTION" | "ACCESS_RESTORE" = "CORRECTION";
  let inviteId: string;
  let secret: string;
  let supersedeRecoveryRequest: { requestId: string; revision: number } | undefined;
  if (kind === "supersession-cancelled-before-request-create") {
    const old = await requestRecovery();
    const replacement = await createCorrection({ action: "RESTORE_MEMBER", replaceInvitationId: old.invite.id });
    inviteId = replacement.invitation!.id;
    secret = replacement.secret!;
    supersedeRecoveryRequest = { requestId: old.requestId, revision: 0 };
  } else if (kind === "restore-archived-roster") {
    purpose = "ACCESS_RESTORE";
    await db.player.update({ where: { id: "historical-player" }, data: { ownerUserId: "account-a" } });
    await db.clubMember.update({ where: { id: "original-member" }, data: { archivedAt: new Date("2026-01-02T03:04:05.000Z") } });
    await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-a", role: "ADMIN", status: "REVOKED" } });
    const created = await createAccessRestore({ restoreArchivedRoster: true, action: "RESTORE_MEMBER" });
    inviteId = created.invitation!.id;
    secret = created.secret!;
  } else {
    await activeOwnedDuplicate({ access: kind === "restore-access" || kind === "posttrigger-mismatch" ? { role: "ADMIN", status: "REVOKED" } : undefined });
    const action = kind === "restore-access" || kind === "posttrigger-mismatch" ? "RESTORE_MEMBER" : "GRANT_MEMBER";
    const created = await createCorrection({ action });
    inviteId = created.invitation!.id;
    secret = created.secret!;
  }
  const continuation = await transaction(tx => exchangeInvitationSecret(tx, inviteId, secret));
  return { purpose, inviteId, handle: continuation.handle, userId: "account-a", ...(supersedeRecoveryRequest ? { supersedeRecoveryRequest } : {}) };
}

it("recovers the reported removal/claim conflict with permanent ownership and original sporting records intact", async () => {
  const { invite, requestId, submitted } = await requestRecovery();
  const account = await db.user.findUnique({ where: { id: "account-a" } });
  const before = preservedTargetSnapshot();
  expect(submitted.recovery).toMatchObject({ canApprove: true, needsAccessRestore: true, duplicate: { id: "duplicate", eligible: true } });
  await expect(redeem(invite.id, invite.handle)).rejects.toMatchObject({ code: "ACCESS_REVIEW_REQUIRED" });
  await db.club.update({ where: { id: "club-a" }, data: { allowJoinRequests: false } });
  await approveRecovery(requestId);
  expect(await db.user.findUnique({ where: { id: "account-a" } })).toEqual(account);
  expect(await db.player.findUnique({ where: { id: "duplicate" } })).toMatchObject({ ownerUserId: "account-a", isActive: false });
  expect(await db.clubMember.findUnique({ where: { id: "duplicate-member" } })).toMatchObject({ ownerUserId: "account-a", retiredByAdmissionEventId: expect.any(String), archivedAt: expect.any(Date) });
  expect(await db.player.findUnique({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: "account-a", isActive: true });
  expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } })).toMatchObject({ role: "MEMBER", status: "ACTIVE" });
  expect(preservedTargetSnapshot()).toEqual(before);
  expect((await getOwnedClubPlayer(db, { userId: "account-a", clubId: "club-a" }))?.playerId).toBe("historical-player");
  expect(await getOwnedPlayer(db, { userId: "account-a", playerId: "duplicate" })).toBeNull();
  expect((await resolveOwnedSessionPlayer(db, { userId: "account-a", clubIds: ["club-a"] }))?.id).toBe("historical-player");
  await expect(db.player.update({ where: { id: "duplicate" }, data: { ownerUserId: null } })).rejects.toThrow();
  await expectTerminalCleanup(invite.id, "REDEEMED");
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } }, data: { status: "REVOKED" } });
  await approveRecovery(requestId); // receipt must not re-grant access
  expect((await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } })).status).toBe("REVOKED");
  expect(await db.clubAdmissionEvent.count({ where: { action: "APPROVE_RECOVERY" } })).toBe(1);
});
it("returns a typed account-wide conflict and rolls back invitation-backed recovery approval", async () => {
  const { invite, requestId } = await requestRecovery();
  await db.player.create({ data: {
    id: "legacy-disjoint-player", name: "Legacy disjoint identity", gender: "MALE",
    ownerUserId: "account-a", isActive: false,
  } });
  await db.clubMember.create({ data: {
    id: "legacy-disjoint-member", clubId: "club-b", playerId: "legacy-disjoint-player",
    archivedAt: new Date("2026-10-01T00:00:00.000Z"),
  } });
  const before = fullDatabaseSnapshot();
  const originalHistory = sportingSnapshot();

  actor = { id: "admin" };
  const response = await reviewAdmissionApi(
    request(`/api/clubs/club-a/join-requests/${requestId}`, {
      action: "APPROVE", revision: 0, confirmRestoreAccess: true,
      retireEmptyPlayerId: "duplicate", reason: "Verified recovery duplicate.",
    }),
    { params: Promise.resolve({ id: "club-a", requestId }) },
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "IDENTITY_CONFLICT" });
  expect(fullDatabaseSnapshot()).toEqual(before);
  expect(sportingSnapshot()).toEqual(originalHistory);
  expect(await db.player.findUniqueOrThrow({ where: { id: "duplicate" } })).toMatchObject({ ownerUserId: "account-a", isActive: true });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "duplicate-member" } })).toMatchObject({ retiredByAdmissionEventId: null, archivedAt: expect.any(Date) });
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id: invite.id } })).toMatchObject({ status: "ACTIVE", redeemedByUserId: null });
  expect(await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: requestId } })).toMatchObject({ status: "PENDING", revision: 0, approvedPlayerId: null });
  expect(await db.clubAdmissionEvent.count({ where: { admissionRequestId: requestId, action: "APPROVE_RECOVERY" } })).toBe(0);
  expect(await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } })).toMatchObject({ status: "REVOKED" });
});
it("restores revoked access without a duplicate only after explicit confirmation", async () => {
  const { requestId } = await requestRecovery(false);
  await expect(approveRecovery(requestId, { retireEmptyPlayerId: undefined, confirmRestoreAccess: false })).rejects.toMatchObject({ code: "RESTORE_CONFIRMATION_REQUIRED" });
  await approveRecovery(requestId, { retireEmptyPlayerId: undefined });
  expect(await db.clubMember.count({ where: { retiredByAdmissionEventId: { not: null } } })).toBe(0);
});
it.each(["SQLite", "libSQL"] as const)("allows revoked CLAIM consumption only with the exact live-admin recovery event on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  const { invite, requestId } = await requestRecovery(false);
  await expect(db.$executeRaw`UPDATE "PlayerInvitation" SET "status"='REDEEMED',"redeemedByUserId"='account-a',"redeemedAt"=${new Date()} WHERE "id"=${invite.id}`).rejects.toThrow();
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id: invite.id } })).toMatchObject({ status: "ACTIVE" });

  await db.clubAdmissionRequest.updateMany({ where: { id: requestId, status: "PENDING", revision: 0 }, data: { revision: 1 } });
  const invalidDetails = JSON.stringify({ originInvitationId: invite.id, targetPlayerId: "historical-player", restoredAccess: true, confirmRestoreAccess: false });
  await expect(db.$executeRaw`INSERT INTO "ClubAdmissionEvent" ("id","admissionRequestId","actorUserId","action","revision","detailsJson") VALUES ('invalid-recovery-probe',${requestId},'admin','APPROVE_RECOVERY',1,${invalidDetails})`).rejects.toThrow();

  const validDetails = JSON.stringify({ originInvitationId: invite.id, targetPlayerId: "historical-player", restoredAccess: true, confirmRestoreAccess: true, sourcePlayerId: null, reason: "Explicit direct-SQL guard probe" });
  await expect(db.$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO "ClubAdmissionEvent" ("id","admissionRequestId","actorUserId","action","revision","detailsJson") VALUES ('valid-recovery-probe',${requestId},'admin','APPROVE_RECOVERY',1,${validDetails})`;
    await tx.$executeRaw`UPDATE "PlayerInvitation" SET "status"='REDEEMED',"redeemedByUserId"='account-a',"redeemedAt"=${new Date()} WHERE "id"=${invite.id}`;
    expect(await tx.playerInvitation.findUniqueOrThrow({ where: { id: invite.id } })).toMatchObject({ status: "REDEEMED", redeemedByUserId: "account-a" });
    throw new Error("ROLLBACK_STATE_GUARD_PROBE");
  })).rejects.toThrow("ROLLBACK_STATE_GUARD_PROBE");
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id: invite.id } })).toMatchObject({ status: "ACTIVE", redeemedByUserId: null });
  expect(await db.clubAdmissionEvent.count({ where: { admissionRequestId: requestId, action: "APPROVE_RECOVERY" } })).toBe(0);
}, 30000);
it.each(["MEMBER", "STAFF", "ADMIN", "OWNER"])("recovery preserves existing ACTIVE %s access exactly", async role => {
  const { requestId } = await requestRecovery();
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } }, data: { status: "ACTIVE", role } });
  const access = await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } });
  await approveRecovery(requestId, { confirmRestoreAccess: undefined });
  expect(await db.clubAccess.findUnique({ where: { id: access.id } })).toEqual(access);
});
it.each(["STAFF", "MEMBER", "REVOKED", "INACTIVE", "GLOBAL", "SELF"])("rejects unauthorized %s recovery approval", async authority => {
  const { requestId } = await requestRecovery();
  const reviewer = authority === "SELF" ? "account-a" : "admin";
  if (authority === "INACTIVE") await db.user.update({ where: { id: reviewer }, data: { isActive: false } });
  else if (authority === "REVOKED") await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: reviewer } }, data: { status: "REVOKED" } });
  else await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: reviewer } }, data: { status: "ACTIVE", role: authority === "SELF" ? "ADMIN" : authority === "GLOBAL" ? "MEMBER" : authority } });
  await expect(approveRecovery(requestId, { reviewerUserId: reviewer, isGlobalAdmin: true })).rejects.toMatchObject({ statusCode: 403 });
  expect((await db.player.findUniqueOrThrow({ where: { id: "duplicate" } })).isActive).toBe(true);
});
it.each([
  { revision: undefined }, { revision: 8 }, { retireEmptyPlayerId: "p2" }, { reason: "" }, { asNew: true }, { playerId: "p2" },
])("requires exact review confirmations and immutable target: %j", async overrides => {
  const { requestId } = await requestRecovery();
  await expect(approveRecovery(requestId, overrides)).rejects.toMatchObject({ statusCode: 409 });
  expect((await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: requestId } })).revision).toBe(0);
});

const historyCases: Array<[string, () => Promise<unknown>]> = [
  ["session participation", () => db.sessionPlayer.create({ data: { sessionId: "history-session", playerId: "duplicate" } })],
  ["raw partner reference", () => db.sessionPlayer.update({ where: { id: "history-seat" }, data: { lastPartnerPlayerId: "duplicate" } })],
  ["uncompleted match", () => db.match.update({ where: { id: "history-match" }, data: { status: "PENDING", team1Player1Id: "duplicate" } })],
  ["score submitter", () => db.match.update({ where: { id: "history-match" }, data: { scoreSubmittedByPlayerId: "duplicate" } })],
  ["queued match", () => db.queuedMatch.create({ data: { sessionId: "history-session", team1Player1Id: "duplicate", team1Player2Id: "p2", team2Player1Id: "p3", team2Player2Id: "p4" } })],
  ["Player rating", () => db.player.update({ where: { id: "duplicate" }, data: { elo: 1100 } })],
  ["club rating", () => db.clubMember.update({ where: { id: "duplicate-member" }, data: { elo: 1100 } })],
  ["manual rating", () => db.clubRatingAdjustment.create({ data: { memberId: "duplicate-member", actorId: "admin", actorName: "Admin", beforeElo: 1000, afterElo: 1000, reason: "Audit" } })],
  ["match rating", () => db.matchEloAdjustment.create({ data: { matchId: "history-match", clubId: "club-a", playerId: "duplicate", delta: 0, beforeElo: 1000, afterElo: 1000 } })],
  ["achievement preferences", () => db.clubMember.update({ where: { id: "duplicate-member" }, data: { achievementPreferencesJson: '{"seen":[]}' } })],
  ["achievement snapshot", () => db.session.update({ where: { id: "history-session" }, data: { achievementEligibilityJson: '{"club-a":["duplicate"]}' } })],
  ["embedded match reference", () => db.match.update({ where: { id: "history-match" }, data: { matchmakingReasonJson: '{"nested":{"duplicate":1}}' } })],
  ["double-encoded match reference", () => db.match.update({ where: { id: "history-match" }, data: { matchmakingReasonJson: JSON.stringify(JSON.stringify({ ids: ["duplicate"] })) } })],
  ["nested opaque match reference", () => db.match.update({ where: { id: "history-match" }, data: { matchmakingReasonJson: JSON.stringify({ reason: JSON.stringify({ selected: ["duplicate"] }) }) } })],
  ["embedded queue reference", () => db.queuedMatch.create({ data: { sessionId: "history-session", team1Player1Id: "historical-player", team1Player2Id: "p2", team2Player1Id: "p3", team2Player2Id: "p4", matchmakingReasonJson: '{"selected":["duplicate"]}' } })],
  ["double-encoded queue reference", () => db.queuedMatch.create({ data: { sessionId: "history-session", team1Player1Id: "historical-player", team1Player2Id: "p2", team2Player1Id: "p3", team2Player2Id: "p4", matchmakingReasonJson: JSON.stringify(JSON.stringify({ ids: ["duplicate"] })) } })],
  ["double-encoded achievement reference", () => db.session.update({ where: { id: "history-session" }, data: { achievementEligibilityJson: JSON.stringify(JSON.stringify({ "club-a": ["duplicate"] })) } })],
  ["ambiguous sporting JSON", () => db.match.update({ where: { id: "history-match" }, data: { matchmakingReasonJson: 'invalid JSON' } })],
  ["ambiguous queued-match JSON", () => db.queuedMatch.create({ data: { sessionId: "history-session", team1Player1Id: "historical-player", team1Player2Id: "p2", team2Player1Id: "p3", team2Player2Id: "p4", matchmakingReasonJson: 'invalid JSON' } })],
  ["ambiguous achievement snapshot JSON", () => db.session.update({ where: { id: "history-session" }, data: { achievementEligibilityJson: 'invalid JSON' } })],
  ["unsnapshotted legacy eligibility", () => db.$executeRaw`UPDATE "CommunityMember" SET "createdAt"=0 WHERE "id"='duplicate-member'`],
  ["invalid member eligibility date", () => db.$executeRaw`UPDATE "CommunityMember" SET "createdAt"='not-a-date' WHERE "id"='duplicate-member'`],
  ["host credit", () => db.sessionClub.create({ data: { sessionId: "history-session", clubId: "club-a", creditedHostPlayerId: "duplicate" } })],
  ["notification", () => db.clubNotification.create({ data: { clubId: "club-a", sessionId: "history-session", recipientPlayerId: "duplicate", actorUserId: "admin", type: "LIKE", newsItemId: "news", newsType: "MATCH", title: "Saved", detail: "Saved", value: "1" } })],
  ["offline link", () => db.offlineIdentityLinkRequest.create({ data: { sourceClubId: "club-a", sourcePlayerId: "duplicate", targetClubId: "club-b", targetPlayerId: "p2" } })],
  ["offline identity membership", () => db.offlineIdentity.create({ data: { members: { create: { clubId: "club-a", playerId: "duplicate" } } } })],
  ["pending legacy claim", () => db.claimRequest.create({ data: { clubId: "club-a", requesterUserId: "account-b", targetPlayerId: "duplicate" } })],
  ["pending admission", () => db.clubAdmissionRequest.create({ data: { clubId: "club-b", requesterUserId: "account-b", kind: "EXISTING_PLAYER", requestedPlayerId: "duplicate" } })],
  ["archived other club", () => db.clubMember.create({ data: { clubId: "club-b", playerId: "duplicate", archivedAt: new Date() } })],
  ["active source roster", () => db.clubMember.update({ where: { id: "duplicate-member" }, data: { archivedAt: null } })],
];
it.each(historyCases)("does not retire or change history-bearing duplicate: %s", async (_name, addReference) => {
  const { requestId } = await requestRecovery();
  await addReference();
  const before = sportingSnapshot();
  const request = await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: requestId } });
  expect((await recoveryEligibility(db, request)).canApprove).toBe(false);
  await expect(approveRecovery(requestId)).rejects.toMatchObject({ code: "RECOVERY_BLOCKED" });
  expect(sportingSnapshot()).toEqual(before);
  expect((await db.player.findUniqueOrThrow({ where: { id: "duplicate" } })).isActive).toBe(true);
});

it("keeps ordinary descriptive metadata strings readable for retirement eligibility", async () => {
  const { requestId } = await requestRecovery();
  await db.match.update({ where: { id: "history-match" }, data: { matchmakingReasonJson: JSON.stringify("legacy-reason-present") } });
  const request = await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: requestId } });
  expect((await recoveryEligibility(db, request)).canApprove).toBe(true);
});
it("fails closed on malformed membership timestamps in the retirement inventory", async () => {
  const { requestId } = await requestRecovery();
  await db.$executeRaw`UPDATE "CommunityMember" SET "createdAt"='not-a-date' WHERE "id"='duplicate-member'`;
  expect(await playerRetirementBlockers(db, "duplicate")).toContain("Historical achievement eligibility has not been captured and cannot be ruled out safely.");
  expect(await db.$queryRaw<Array<{ reason: string }>>`SELECT "reason" FROM "PlayerRetirementBlocker" WHERE "playerId"='duplicate' AND "reason"='UNSNAPSHOTTED_ACHIEVEMENTS'`).toHaveLength(1);
  const before = sportingSnapshot();
  const request = await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: requestId } });
  expect((await recoveryEligibility(db, request)).canApprove).toBe(false);
  await expect(approveRecovery(requestId)).rejects.toMatchObject({ code: "RECOVERY_BLOCKED" });
  expect(sportingSnapshot()).toEqual(before);
});

it("keeps expired/replaced/revoked request status readable and replaces stale pending requests atomically", async () => {
  const { invite, requestId } = await requestRecovery();
  const expired = await getInvitationRecoveryStatus(db, invite.id, "account-a", new Date(Date.now() + INVITATION_TTL_MS + 1000));
  expect(expired).toMatchObject({ request: { id: requestId, status: "PENDING" }, recovery: { invitationAvailability: "EXPIRED", canApprove: false } });
  expect((await getInvitationRecoveryStatus(db, invite.id, "account-b")).request).toBeNull();
  const replacement = await create("REPLACE", invite.id);
  expect((await getInvitationRecoveryStatus(db, invite.id, "account-a")).recovery?.invitationAvailability).toBe("REPLACED");
  await expect(approveRecovery(requestId)).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
  const newId = replacement.invitation!.id;
  const handle = await transaction(tx => exchangeInvitationSecret(tx, newId, "secret" in replacement ? replacement.secret! : ""));
  const fresh = await transaction(tx => submitInvitationRecovery(tx, { invitationId: newId, handle: handle.handle, userId: "account-a", idempotencyKey: "fresh-key" }));
  expect((await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("CANCELLED");
  expect(await db.clubAdmissionRequest.count({ where: { clubId: "club-a", requesterUserId: "account-a", status: "PENDING" } })).toBe(1);
  expect(fresh.request!.id).not.toBe(requestId);
  await create("REVOKE", newId);
  expect((await getInvitationRecoveryStatus(db, newId, "account-a")).recovery?.invitationAvailability).toBe("REVOKED");
  await transaction(tx => reviewClubAdmission(tx, { clubId: "club-a", requestId: fresh.request!.id, reviewerUserId: "account-a", action: "CANCEL", revision: 0 }));
  await transaction(tx => reviewClubAdmission(tx, { clubId: "club-a", requestId: fresh.request!.id, reviewerUserId: "account-a", action: "CANCEL", revision: 0 }));
});
it("revalidates expiry and active requester inside approval", async () => {
  const { requestId } = await requestRecovery();
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + INVITATION_TTL_MS + 1000);
  await expect(approveRecovery(requestId)).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
  vi.useRealTimers();
  await db.user.update({ where: { id: "account-a" }, data: { isActive: false } });
  await expect(approveRecovery(requestId)).rejects.toMatchObject({ code: "RECOVERY_BLOCKED" });
});
it("idempotent submission cannot change binding, override another pending request, or enter via ordinary endpoints", async () => {
  const { invite, requestId } = await requestRecovery();
  const input = { invitationId: invite.id, handle: invite.handle, userId: "account-a", idempotencyKey: "recovery-key" };
  expect((await transaction(tx => submitInvitationRecovery(tx, input))).request!.id).toBe(requestId);
  expect((await transaction(tx => submitInvitationRecovery(tx, { ...input, idempotencyKey: "another-key" }))).request!.id).toBe(requestId);
  await expect(transaction(tx => submitInvitationRecovery(tx, { ...input, note: "Changed" }))).rejects.toMatchObject({ statusCode: 409 });
  for (const data of [{ requesterUserId: "account-b" }, { clubId: "club-b" }, { requestedPlayerId: "p2" }, { originInvitationId: null }, { idempotencyKey: "forged" }]) await expect(db.clubAdmissionRequest.update({ where: { id: requestId }, data })).rejects.toThrow();
  actor = { id: "account-a" };
  expect((await submitAdmissionApi(request("/api/join-requests", { clubId: "club-a", kind: "EXISTING_PLAYER", requestedPlayerId: "historical-player", originInvitationId: invite.id }))).status).toBe(400);
});

it("cannot INSERT OR REPLACE a bound admission through its primary key or unique keys", async () => {
  const invite = await ready();
  const now = new Date();
  const bound = await db.clubAdmissionRequest.create({ data: { id: "bound-request", clubId: "club-a", requesterUserId: "account-a", kind: "EXISTING_PLAYER", requestedPlayerId: "historical-player", originInvitationId: invite.id, idempotencyKey: "bound-key" } });
  const replace = (id: string, key: string | null) => db.$executeRaw`INSERT OR REPLACE INTO "ClubJoinRequest" ("id","clubId","userId","kind","status","requestedPlayerId","approvedPlayerId","revision","legacyClaimRequestId","idempotencyKey","originInvitationId","createdAt","updatedAt") VALUES (${id},'club-a','account-a','EXISTING_PLAYER','PENDING','historical-player',NULL,0,NULL,${key},NULL,${now},${now})`;
  await expect(replace(bound.id, "different-key")).rejects.toThrow();
  await expect(replace("bound-request-key-collision", "bound-key")).rejects.toThrow();
  await expect(replace("bound-request-pending-collision", null)).rejects.toThrow();
  expect(await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: bound.id } })).toMatchObject({ originInvitationId: invite.id, idempotencyKey: "bound-key" });
});

it.each([
  `CREATE TRIGGER recovery_fault BEFORE INSERT ON "ClubAdmissionEvent" WHEN NEW."action"='APPROVE_RECOVERY' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
  `CREATE TRIGGER recovery_fault BEFORE UPDATE OF "retiredByAdmissionEventId" ON "CommunityMember" BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
  `CREATE TRIGGER recovery_fault BEFORE UPDATE OF "status" ON "PlayerInvitation" BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
  `CREATE TRIGGER recovery_fault BEFORE UPDATE OF "ownerUserId" ON "User" BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
  `CREATE TRIGGER recovery_fault BEFORE UPDATE ON "ClubAccess" BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
  `CREATE TRIGGER recovery_fault BEFORE UPDATE OF "status" ON "ClubJoinRequest" WHEN NEW."status"='APPROVED' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
])("rolls back every recovery write after injected failure: %s", async sql => {
  const { invite, requestId } = await requestRecovery(); const before = sportingSnapshot();
  await db.$executeRawUnsafe(sql);
  await expect(approveRecovery(requestId)).rejects.toThrow();
  expect(sportingSnapshot()).toEqual(before);
  expect(await db.clubAdmissionRequest.findUnique({ where: { id: requestId } })).toMatchObject({ status: "PENDING", revision: 0 });
  expect(await db.clubAdmissionEvent.count({ where: { action: "APPROVE_RECOVERY" } })).toBe(0);
  expect(await db.playerInvitation.findUnique({ where: { id: invite.id } })).toMatchObject({ status: "ACTIVE" });
  expect(await db.playerInvitationContinuation.count({ where: { invitationId: invite.id } })).toBe(1);
});
it("database guards reject forged retirement, reactivation, marker/audit changes and every future sporting reference", async () => {
  const { requestId } = await requestRecovery();
  await db.$executeRaw`UPDATE "User" SET "email"='retired-legacy@example.invalid' WHERE "id"='duplicate'`;
  await expect(db.clubMember.update({ where: { id: "duplicate-member" }, data: { retiredByAdmissionEventId: "forged-event" } })).rejects.toThrow();
  await approveRecovery(requestId);
  await expect(db.player.update({ where: { id: "duplicate" }, data: { isActive: true } })).rejects.toThrow();
  await expect(db.playerInvitation.create({ data: { clubId: "club-a", playerId: "duplicate", clubMemberId: "duplicate-member", createdByUserId: "admin", tokenHash: "retired-active-invite", expiresAt: new Date(Date.now() + INVITATION_TTL_MS) } })).rejects.toThrow();
  await expect(db.player.delete({ where: { id: "duplicate" } })).rejects.toThrow();
  await expect(db.clubMember.update({ where: { id: "duplicate-member" }, data: { archivedAt: null } })).rejects.toThrow();
  await expect(db.clubMember.update({ where: { id: "duplicate-member" }, data: { retiredByAdmissionEventId: null } })).rejects.toThrow();
  await expect(db.clubMember.delete({ where: { id: "duplicate-member" } })).rejects.toThrow();
  for (const [, addReference] of historyCases.filter(([name]) => !["unsnapshotted legacy eligibility", "invalid member eligibility date"].includes(name))) await expect(addReference()).rejects.toThrow();
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "CommunityMember" ("id","communityId","userId","ownerUserId","archivedAt","createdAt","achievementPreferencesJson","retiredByAdmissionEventId") VALUES ('duplicate-member','club-a','p2',NULL,NULL,1800000000000,'{}',NULL)`).rejects.toThrow();
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "CommunityMember" ("id","communityId","userId","ownerUserId","archivedAt","createdAt","achievementPreferencesJson","retiredByAdmissionEventId") VALUES ('duplicate-member-replacement','club-a','duplicate','account-a',NULL,1800000000000,'{}',NULL)`).rejects.toThrow();
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "User" ("id","ownerUserId","name","avatarKey","gender","elo","isActive","createdAt","updatedAt") VALUES ('duplicate','account-a','Replaced Player','changed-avatar','FEMALE',1500,1,1800000000000,1800000000000)`).rejects.toThrow();
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "User" ("id","email","ownerUserId","name","gender","elo","isActive","createdAt","updatedAt") VALUES ('replacement-via-email','retired-legacy@example.invalid',NULL,'Replaced by email','FEMALE',1500,1,1800000000000,1800000000000)`).rejects.toThrow();
  await db.player.create({ data: { id: "owned-without-roster", ownerUserId: "account-a", name: "Owned without roster", gender: "MALE" } });
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "User" ("id","ownerUserId","name","gender","elo","isActive","createdAt","updatedAt") VALUES ('owned-without-roster','account-b','Reassigned Player','MALE',1000,1,1800000000000,1800000000000)`).rejects.toThrow();
  await db.$executeRaw`INSERT INTO "User" ("id","email","ownerUserId","name","gender","elo","isActive","createdAt","updatedAt") VALUES ('owned-with-email','owned-legacy@example.invalid','account-a','Owned legacy player','MALE',1000,1,1700000000000,1700000000000)`;
  await db.$executeRaw`INSERT OR REPLACE INTO "User" ("id","email","ownerUserId","name","gender","elo","isActive","createdAt","updatedAt") VALUES ('owned-with-email','owned-legacy@example.invalid','account-a','Same identity edit','MALE',1000,1,1800000000000,1800000000000)`;
  expect(await db.$queryRaw<Array<{ id: string; ownerUserId: string; name: string }>>`SELECT "id","ownerUserId","name" FROM "User" WHERE "id"='owned-with-email'`).toEqual([{ id: "owned-with-email", ownerUserId: "account-a", name: "Same identity edit" }]);
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "User" ("id","email","ownerUserId","name","gender","elo","isActive","createdAt","updatedAt") VALUES ('owned-email-same-owner-replacement','owned-legacy@example.invalid','account-a','Same owner, new identity','MALE',1000,1,1800000000000,1800000000000)`).rejects.toThrow();
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "User" ("id","email","ownerUserId","name","gender","elo","isActive","createdAt","updatedAt") VALUES ('owned-email-replacement','owned-legacy@example.invalid','account-b','Reassigned through email','MALE',1000,1,1800000000000,1800000000000)`).rejects.toThrow();
  expect(await db.$queryRaw<Array<{ id: string; ownerUserId: string }>>`SELECT "id","ownerUserId" FROM "User" WHERE "id"='owned-with-email'`).toEqual([{ id: "owned-with-email", ownerUserId: "account-a" }]);
  const event = await db.clubAdmissionEvent.findFirstOrThrow({ where: { action: "APPROVE_RECOVERY" } });
  await expect(db.clubAdmissionEvent.update({ where: { id: event.id }, data: { detailsJson: "{}" } })).rejects.toThrow();
  await expect(db.clubAdmissionEvent.delete({ where: { id: event.id } })).rejects.toThrow();
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "ClubAdmissionEvent" ("id","admissionRequestId","actorUserId","action","revision","detailsJson","createdAt") VALUES (${event.id},${event.admissionRequestId},${event.actorUserId},'MIGRATED',${event.revision},'{}',${event.createdAt})`).rejects.toThrow();
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "ClubAdmissionEvent" ("id","admissionRequestId","actorUserId","action","revision","detailsJson","createdAt") VALUES ('replacement-event-id',${event.admissionRequestId},${event.actorUserId},'MIGRATED',${event.revision},'{}',${event.createdAt})`).rejects.toThrow();
  const invitationEvent = await db.playerInvitationEvent.findFirstOrThrow({ where: { invitationId: (await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: requestId } })).originInvitationId! } });
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "PlayerInvitationEvent" ("id","invitationId","actorUserId","action","reason","createdAt") VALUES (${invitationEvent.id},${invitationEvent.invitationId},${invitationEvent.actorUserId},'FORGED','replacement',${invitationEvent.createdAt})`).rejects.toThrow();
  const future = await db.session.create({ data: { code: "FUTURE", name: "Future", clubId: "club-a" } });
  await captureAchievementEligibility(db, future.id, ["club-a"]);
  expect((await db.session.findUniqueOrThrow({ where: { id: future.id } })).achievementEligibilityJson).not.toContain("duplicate");
  await expect(db.match.update({ where: { id: "history-match" }, data: { matchmakingReasonJson: JSON.stringify("duplicate") } })).rejects.toThrow();
  await expect(db.session.update({ where: { id: future.id }, data: { achievementEligibilityJson: JSON.stringify("duplicate") } })).rejects.toThrow();
  await expect(db.match.update({ where: { id: "history-match" }, data: { matchmakingReasonJson: JSON.stringify(JSON.stringify({ ids: ["duplicate"] })) } })).rejects.toThrow();
  await expect(db.session.update({ where: { id: future.id }, data: { achievementEligibilityJson: JSON.stringify({ opaque: JSON.stringify({ eligible: ["duplicate"] }) }) } })).rejects.toThrow();
  await db.match.update({ where: { id: "history-match" }, data: { matchmakingReasonJson: JSON.stringify("legacy-reason-present") } });
});
it("concurrent approval, replacement and direct redemption leave one consistent winner", async () => {
  const { requestId, invite } = await requestRecovery();
  const results = await Promise.allSettled([approveRecovery(requestId), redeem(invite.id, invite.handle, "account-b")]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const invitation = await db.playerInvitation.findUniqueOrThrow({ where: { id: invite.id } });
  const original = await db.player.findUniqueOrThrow({ where: { id: "historical-player" } });
  const duplicate = await db.player.findUniqueOrThrow({ where: { id: "duplicate" } });
  expect(original.ownerUserId).toBe(invitation.redeemedByUserId);
  expect(duplicate.isActive).toBe(original.ownerUserId !== "account-a");
  expect(await db.playerInvitationEvent.count({ where: { invitationId: invite.id, action: "REDEEMED" } })).toBe(1);
}, 30000);
it("concurrent repeated approvals are receipts, with one immutable event", async () => {
  const { requestId } = await requestRecovery();
  const results = await Promise.allSettled([approveRecovery(requestId), approveRecovery(requestId)]);
  expect(results.some(r => r.status === "fulfilled")).toBe(true);
  expect(await db.clubAdmissionEvent.count({ where: { action: "APPROVE_RECOVERY" } })).toBe(1);
}, 30000);
it.each(["REPLACE", "CANCEL"] as const)("concurrent %s versus approval commits one outcome", async action => {
  const { invite, requestId } = await requestRecovery();
  const competing = action === "REPLACE" ? create("REPLACE", invite.id) : transaction(tx => reviewClubAdmission(tx, { clubId: "club-a", requestId, reviewerUserId: "account-a", action: "CANCEL", revision: 0 }));
  const results = await Promise.allSettled([approveRecovery(requestId), competing]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const request = await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: requestId } });
  const duplicate = await db.player.findUniqueOrThrow({ where: { id: "duplicate" } });
  expect(duplicate.isActive).toBe(request.status !== "APPROVED");
  expect(await db.clubAdmissionEvent.count({ where: { action: "APPROVE_RECOVERY" } })).toBe(request.status === "APPROVED" ? 1 : 0);
}, 30000);
it("the database rechecks references added after the service's eligibility read", async () => {
  const { requestId } = await requestRecovery(); const before = sportingSnapshot();
  await db.$executeRawUnsafe(`CREATE TRIGGER recovery_reference_race AFTER UPDATE OF "isActive" ON "User" WHEN NEW."id"='duplicate' BEGIN INSERT INTO "SessionPlayer" ("id","sessionId","userId") VALUES ('raced-seat','history-session','duplicate'); END`);
  await expect(approveRecovery(requestId)).rejects.toThrow();
  expect(sportingSnapshot()).toEqual(before);
  expect(await db.clubAdmissionEvent.count({ where: { action: "APPROVE_RECOVERY" } })).toBe(0);
});
it("does not replace an unrelated ordinary pending admission", async () => {
  await removedDuplicate(); const invite = await ready();
  const pending = await transaction(tx => submitClubAdmission(tx, { clubId: "club-a", requesterUserId: "account-a", kind: "OWNED_PLAYER", requestedPlayerId: "duplicate" }));
  await expect(transaction(tx => submitInvitationRecovery(tx, { invitationId: invite.id, handle: invite.handle, userId: "account-a", idempotencyKey: "fresh-key" }))).rejects.toMatchObject({ code: "PENDING_REQUEST_CONFLICT" });
  expect(await db.clubAdmissionRequest.findUnique({ where: { id: pending.id! } })).toMatchObject({ status: "PENDING", originInvitationId: null });
});
it("concurrent recovery submissions reuse one bound request", async () => {
  await removedDuplicate(); const invite = await ready();
  const submit = (key: string) => transaction(tx => submitInvitationRecovery(tx, { invitationId: invite.id, handle: invite.handle, userId: "account-a", idempotencyKey: key }));
  const results = await Promise.all([submit("one"), submit("two")]);
  expect(results[0].request?.id).toBe(results[1].request?.id);
  expect(await db.clubAdmissionEvent.count({ where: { action: "SUBMIT_RECOVERY" } })).toBe(1);
}, 30000);
it.each(["MEMBER", "ADMIN", "OWNER"])("authorized correction retires an active empty source and preserves active %s access as an immutable receipt", async role => {
  await activeOwnedDuplicate({ access: { role } });
  const before = preservedTargetSnapshot();
  const created = await createCorrection({ action: "PRESERVE_ACTIVE" });
  expect(created.invitation).toMatchObject({ purpose: "CORRECTION", status: "ACTIVE" });
  const inviteId = created.invitation!.id;
  const issuance = await db.playerInvitationEvent.findFirstOrThrow({ where: { invitationId: inviteId, action: "CORRECTION_RETIRE_AUTHORIZED" } });
  expect(JSON.parse(issuance.detailsJson)).toMatchObject({ purpose: "CORRECTION", targetPlayerId: "historical-player", targetAccountId: "account-a", sourcePlayerId: "duplicate", retireSourcePlayerId: "duplicate", authorizedAccessAction: "PRESERVE_ACTIVE" });
  const continuation = await transaction(tx => exchangeInvitationSecret(tx, inviteId, created.secret!));
  const context = await authorizedInvitationContext(db, inviteId, continuation.handle, "account-a");
  expect(context).toMatchObject({ status: "MATCHED", purpose: "CORRECTION", source: { playerId: "duplicate", clubAccess: { status: "ACTIVE", role } } });
  const wrong = await authorizedInvitationContext(db, inviteId, continuation.handle, "account-b");
  expect(wrong).toMatchObject({ status: "WRONG_ACCOUNT" });
  expect(wrong).not.toHaveProperty("source");
  expect(wrong).not.toHaveProperty("target");
  const result = await transaction(tx => confirmAuthorizedInvitation(tx, "CORRECTION", { invitationId: inviteId, handle: continuation.handle, userId: "account-a" }));
  expect(result.receipt).toMatchObject({ purpose: "CORRECTION", actorAccountId: "account-a", authorizedByAccountId: "admin", accessOutcome: "PRESERVED_ACTIVE", rosterOutcome: "UNCHANGED", sourceRetired: true, accessBefore: { status: "ACTIVE", role }, accessAfter: { status: "ACTIVE", role } });
  expect(await db.player.findUniqueOrThrow({ where: { id: "duplicate" } })).toMatchObject({ ownerUserId: "account-a", isActive: false });
  const retiredMember = await db.clubMember.findUniqueOrThrow({ where: { id: "duplicate-member" } });
  expect(retiredMember).toMatchObject({ ownerUserId: "account-a", archivedAt: expect.any(Date), retiredByAdmissionEventId: expect.any(String) });
  expect(await db.player.findUniqueOrThrow({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: "account-a", isActive: true });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "original-member" } })).toMatchObject({ id: "original-member", elo: 1384, archivedAt: null });
  expect(preservedTargetSnapshot()).toEqual(before);
  expect(await db.clubAdmissionRequest.findFirstOrThrow({ where: { originInvitationId: inviteId } })).toMatchObject({ status: "APPROVED", requesterUserId: "account-a", reviewedByUserId: "admin", decision: "EXECUTE_AUTHORIZED_CORRECTION", approvedPlayerId: "historical-player" });
  const execution = await db.clubAdmissionEvent.findFirstOrThrow({ where: { action: "EXECUTE_AUTHORIZED_CORRECTION" } });
  expect(execution).toMatchObject({ actorUserId: "account-a", authorizedByUserId: "admin" });
  const receiptBefore = await invitationExecutionReceipt(db, await db.playerInvitation.findUniqueOrThrow({ where: { id: inviteId } }));
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } }, data: { status: "REVOKED" } });
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } }, data: { role: "OWNER" } });
  const completedRequest = await db.clubAdmissionRequest.findFirstOrThrow({ where: { originInvitationId: inviteId } });
  const replayStateBefore = {
    request: completedRequest,
    invitation: await db.playerInvitation.findUniqueOrThrow({ where: { id: inviteId } }),
    events: await db.clubAdmissionEvent.findMany({ where: { admissionRequestId: completedRequest.id }, orderBy: { revision: "asc" } }),
    access: await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } }),
  };
  const repeated = await transaction(tx => confirmAuthorizedInvitation(tx, "CORRECTION", { invitationId: inviteId, userId: "account-a" }));
  const replayContext = await authorizedInvitationContext(db, inviteId, undefined, "account-a");
  expect(repeated.receipt).toEqual(receiptBefore);
  expect(replayContext).toMatchObject({ status: "MATCHED", completedReceipt: receiptBefore });
  actor = { id: "account-a" };
  const contextResponse = await invitationContextGet(request(`/api/player-invites/${inviteId}`), inviteContext(inviteId));
  expect(contextResponse.headers.get("cache-control")).toContain("no-store");
  expect(await contextResponse.json()).toMatchObject({ status: "MATCHED", completedReceipt: receiptBefore });
  const replayResponse = await invitationConfirmCorrectionPost(request(`/api/player-invites/${inviteId}/confirm-correction`, { confirm: true }), inviteContext(inviteId));
  expect(replayResponse.status).toBe(200);
  expect(await replayResponse.json()).toEqual({ receipt: receiptBefore });
  expect(await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } })).toMatchObject({ status: "REVOKED", role: "OWNER" });
  expect({
    request: await db.clubAdmissionRequest.findFirstOrThrow({ where: { originInvitationId: inviteId } }),
    invitation: await db.playerInvitation.findUniqueOrThrow({ where: { id: inviteId } }),
    events: await db.clubAdmissionEvent.findMany({ where: { admissionRequestId: replayStateBefore.request.id }, orderBy: { revision: "asc" } }),
    access: await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } }),
  }).toEqual(replayStateBefore);
  expect(await db.clubAdmissionEvent.count({ where: { action: "EXECUTE_AUTHORIZED_CORRECTION" } })).toBe(1);
  actor = { id: "admin" };
}, 30000);
it.each(["SQLite", "libSQL"] as const)("retires an inactive owned source with an archived roster without reactivating it on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await activeOwnedDuplicate({ archived: true, access: { role: "ADMIN", status: "REVOKED" } });
  await db.player.update({ where: { id: "duplicate" }, data: { isActive: false } });
  const archivedBefore = await db.clubMember.findUniqueOrThrow({ where: { id: "duplicate-member" } });
  const preservedBefore = sportingSnapshot();
  preservedBefore.User = preservedBefore.User.filter(row => row.id !== "duplicate");
  preservedBefore.CommunityMember = preservedBefore.CommunityMember.filter(row => row.id !== "duplicate-member");
  const created = await createCorrection({ action: "RESTORE_MEMBER" });
  const { handle } = await transaction(tx => exchangeInvitationSecret(tx, created.invitation!.id, created.secret!));
  const context = await authorizedInvitationContext(db, created.invitation!.id, handle, "account-a");
  expect(context).toMatchObject({ status: "MATCHED", purpose: "CORRECTION", source: { playerId: "duplicate", isActive: false, member: { memberId: "duplicate-member", archivedAt: archivedBefore.archivedAt!.toISOString() } } });
  const result = await transaction(tx => confirmAuthorizedInvitation(tx, "CORRECTION", { invitationId: created.invitation!.id, handle, userId: "account-a" }));
  expect(result.receipt).toMatchObject({ sourceRetired: true, accessOutcome: "RESTORED_MEMBER", accessBefore: { status: "REVOKED", role: "ADMIN" }, accessAfter: { status: "ACTIVE", role: "MEMBER" } });
  expect(await db.player.findUniqueOrThrow({ where: { id: "duplicate" } })).toMatchObject({ ownerUserId: "account-a", isActive: false });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "duplicate-member" } })).toMatchObject({ ownerUserId: "account-a", archivedAt: archivedBefore.archivedAt, retiredByAdmissionEventId: expect.any(String) });
  expect(await db.player.findUniqueOrThrow({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: "account-a", isActive: true });
  const after = sportingSnapshot();
  after.User = after.User.filter(row => row.id !== "duplicate");
  after.CommunityMember = after.CommunityMember.filter(row => row.id !== "duplicate-member");
  expect(after).toEqual(preservedBefore);
  expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
}, 30000);
const authorizedTransitionFaults = [
  {
    kind: "supersession-cancelled-before-request-create",
    stage: "after superseded recovery cancellation, before execution request creation",
    trigger: (id: string) => `CREATE TRIGGER authorized_fault BEFORE INSERT ON "ClubJoinRequest" WHEN NEW."originInvitationId"='${id}' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
  },
  {
    kind: "request-cas",
    stage: "execution request revision CAS",
    trigger: (id: string) => `CREATE TRIGGER authorized_fault BEFORE UPDATE OF "revision" ON "ClubJoinRequest" WHEN NEW."originInvitationId"='${id}' AND NEW."revision"=1 BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
  },
  {
    kind: "event-insert",
    stage: "authorized execution event insertion",
    trigger: (id: string) => `CREATE TRIGGER authorized_fault BEFORE INSERT ON "ClubAdmissionEvent" WHEN NEW."action" IN ('EXECUTE_AUTHORIZED_CORRECTION','EXECUTE_AUTHORIZED_ACCESS_RESTORE') AND json_extract(NEW."detailsJson",'$.originInvitationId')='${id}' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
  },
  {
    kind: "invitation-consume",
    stage: "invitation consumption",
    trigger: (id: string) => `CREATE TRIGGER authorized_fault BEFORE UPDATE OF "status" ON "PlayerInvitation" WHEN NEW."id"='${id}' AND NEW."status"='REDEEMED' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
  },
  {
    kind: "source-archive",
    stage: "source roster archival after invitation consumption",
    trigger: () => `CREATE TRIGGER authorized_fault BEFORE UPDATE OF "archivedAt" ON "CommunityMember" WHEN NEW."id"='duplicate-member' AND NEW."archivedAt" IS NOT NULL BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
  },
  {
    kind: "source-deactivate",
    stage: "source player deactivation after invitation consumption",
    trigger: () => `CREATE TRIGGER authorized_fault BEFORE UPDATE OF "isActive" ON "User" WHEN NEW."id"='duplicate' AND NEW."isActive"=0 BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
  },
  {
    kind: "source-marker",
    stage: "source retirement marker after invitation consumption",
    trigger: () => `CREATE TRIGGER authorized_fault BEFORE UPDATE OF "retiredByAdmissionEventId" ON "CommunityMember" WHEN NEW."id"='duplicate-member' AND NEW."retiredByAdmissionEventId" IS NOT NULL BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
  },
  {
    kind: "target-link",
    stage: "original Player ownership link after source retirement",
    trigger: () => `CREATE TRIGGER authorized_fault BEFORE UPDATE OF "ownerUserId" ON "User" WHEN NEW."id"='historical-player' AND NEW."ownerUserId"='account-a' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
  },
  {
    kind: "grant-access",
    stage: "new MEMBER access grant",
    trigger: () => `CREATE TRIGGER authorized_fault BEFORE INSERT ON "ClubAccess" WHEN NEW."clubId"='club-a' AND NEW."userId"='account-a' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
  },
  {
    kind: "restore-archived-roster",
    stage: "explicit exact-row roster restoration",
    trigger: () => `CREATE TRIGGER authorized_fault BEFORE UPDATE OF "archivedAt" ON "CommunityMember" WHEN NEW."id"='original-member' AND NEW."archivedAt" IS NULL BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
  },
  {
    kind: "restore-access",
    stage: "revoked access restoration as MEMBER",
    trigger: () => `CREATE TRIGGER authorized_fault BEFORE UPDATE OF "status" ON "ClubAccess" WHEN NEW."clubId"='club-a' AND NEW."userId"='account-a' AND NEW."status"='ACTIVE' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
  },
  {
    kind: "request-approval",
    stage: "final execution request approval",
    trigger: (id: string) => `CREATE TRIGGER authorized_fault BEFORE UPDATE OF "status" ON "ClubJoinRequest" WHEN NEW."originInvitationId"='${id}' AND NEW."status"='APPROVED' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END`,
  },
  {
    kind: "posttrigger-mismatch",
    stage: "post-update access snapshot verification",
    trigger: () => `CREATE TRIGGER authorized_fault AFTER UPDATE OF "status" ON "ClubAccess" WHEN NEW."clubId"='club-a' AND NEW."userId"='account-a' AND NEW."status"='ACTIVE' BEGIN UPDATE "ClubAccess" SET "role"='OWNER' WHERE "id"=NEW."id"; END`,
  },
] as const;
it.each(authorizedTransitionFaults.flatMap(stage => (["SQLite", "libSQL"] as const).map(engine => ({ ...stage, engine }))))(
  "rolls back every authorized-transition row after fault at $stage on $engine",
  async ({ kind, engine, trigger }) => {
    if (engine === "libSQL") await useLibSqlAdapter();
    const prepared = await prepareAuthorizedFaultCase(kind);
    const before = fullDatabaseSnapshot();
    await db.$executeRawUnsafe(trigger(prepared.inviteId));
    await expect(transaction(tx => confirmAuthorizedInvitation(tx, prepared.purpose, {
      invitationId: prepared.inviteId, handle: prepared.handle, userId: prepared.userId,
      ...(prepared.supersedeRecoveryRequest ? { supersedeRecoveryRequest: prepared.supersedeRecoveryRequest } : {}),
    }))).rejects.toThrow();
    await db.$executeRawUnsafe("DROP TRIGGER authorized_fault");
    expect(fullDatabaseSnapshot()).toEqual(before);
    expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
  }, 30000,
);
it.each(["SQLite", "libSQL"] as const)("serializes correction confirmation against exact invitation replacement on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await activeOwnedDuplicate({ access: { role: "MEMBER" } });
  const created = await createCorrection({ action: "PRESERVE_ACTIVE" });
  const inviteId = created.invitation!.id;
  const continuation = await transaction(tx => exchangeInvitationSecret(tx, inviteId, created.secret!));
  const sibling = await openSiblingClient(engine);
  try {
    const outcomes = await Promise.allSettled([
      transaction(tx => confirmAuthorizedInvitation(tx, "CORRECTION", { invitationId: inviteId, handle: continuation.handle, userId: "account-a" })),
      admissionTransaction(sibling.db, tx => createAuthorizedInvitation(tx, "CORRECTION", {
        clubId: "club-a", targetPlayerId: "historical-player", issuerAccountId: "admin", recipientAccountId: "account-a",
        sourcePlayerId: "duplicate", sourceMemberId: "duplicate-member", retireSourcePlayerId: "duplicate",
        reason: "Rotate the exact authorized correction invitation.", authorizedAccessAction: "PRESERVE_ACTIVE",
        restoreArchivedRoster: false, replaceInvitationId: inviteId,
      })),
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const invitation = await db.playerInvitation.findUniqueOrThrow({ where: { id: inviteId } });
    const source = await db.clubMember.findUniqueOrThrow({ where: { id: "duplicate-member" } });
    const target = await db.player.findUniqueOrThrow({ where: { id: "historical-player" } });
    if (invitation.status === "REDEEMED") {
      expect(outcomes[0].status).toBe("fulfilled");
      expect(source.retiredByAdmissionEventId).toBeTruthy();
      expect(target.ownerUserId).toBe("account-a");
      expect(await db.playerInvitation.count({ where: { sourcePlayerId: "duplicate", purpose: "CORRECTION", status: "ACTIVE" } })).toBe(0);
    } else {
      expect(invitation.status).toBe("REVOKED");
      expect(outcomes[1].status).toBe("fulfilled");
      expect(source.retiredByAdmissionEventId).toBeNull();
      expect(target.ownerUserId).toBeNull();
      expect(await db.playerInvitation.count({ where: { sourcePlayerId: "duplicate", purpose: "CORRECTION", status: "ACTIVE" } })).toBe(1);
    }
    expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
  } finally { await sibling.close(); }
}, 30000);
it.each(["SQLite", "libSQL"] as const)("serializes disjoint-club claims so one account acquires only one new Player on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await db.clubMember.create({ data: { id: "p2-club-b-member", clubId: "club-b", playerId: "p2" } });
  const first = await transaction(tx => managePlayerInvitation(tx, { clubId: "club-a", playerId: "historical-player", userId: "admin", action: "CREATE" }));
  const second = await transaction(tx => managePlayerInvitation(tx, { clubId: "club-b", playerId: "p2", userId: "admin", action: "CREATE" }));
  const firstHandle = await transaction(tx => exchangeInvitationSecret(tx, first.invitation!.id, first.secret!));
  const secondHandle = await transaction(tx => exchangeInvitationSecret(tx, second.invitation!.id, second.secret!));
  const sibling = await openSiblingClient(engine);
  try {
    const outcomes = await Promise.allSettled([
      transaction(tx => redeemPlayerInvitation(tx, first.invitation!.id, firstHandle.handle, "account-a")),
      admissionTransaction(sibling.db, tx => redeemPlayerInvitation(tx, second.invitation!.id, secondHandle.handle, "account-a")),
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const owned = await db.player.findMany({ where: { ownerUserId: "account-a" }, select: { id: true } });
    expect(owned).toHaveLength(1);
    expect(["historical-player", "p2"]).toContain(owned[0].id);
    expect(await db.playerInvitation.count({ where: { status: "REDEEMED", redeemedByUserId: "account-a" } })).toBe(1);
    expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
  } finally { await sibling.close(); }
}, 30000);
it.each(["SQLite", "libSQL"] as const)("serializes a sporting-reference insert against correction retirement on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await activeOwnedDuplicate();
  const created = await createCorrection({ action: "GRANT_MEMBER" });
  const continuation = await transaction(tx => exchangeInvitationSecret(tx, created.invitation!.id, created.secret!));
  const sibling = await openSiblingClient(engine);
  try {
    const outcomes = await Promise.allSettled([
      transaction(tx => confirmAuthorizedInvitation(tx, "CORRECTION", { invitationId: created.invitation!.id, handle: continuation.handle, userId: "account-a" })),
      admissionTransaction(sibling.db, tx => tx.match.update({ where: { id: "history-match" }, data: { matchmakingReasonJson: JSON.stringify("duplicate") } })),
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const source = await db.clubMember.findUniqueOrThrow({ where: { id: "duplicate-member" } });
    const target = await db.player.findUniqueOrThrow({ where: { id: "historical-player" } });
    const match = await db.match.findUniqueOrThrow({ where: { id: "history-match" } });
    if (match.matchmakingReasonJson === JSON.stringify("duplicate")) {
      expect(outcomes[1].status).toBe("fulfilled");
      expect(outcomes[0].status).toBe("rejected");
      expect(source.retiredByAdmissionEventId).toBeNull();
      expect(target.ownerUserId).toBeNull();
    } else {
      expect(outcomes[0].status).toBe("fulfilled");
      expect(outcomes[1].status).toBe("rejected");
      expect(source.retiredByAdmissionEventId).toBeTruthy();
      expect(target.ownerUserId).toBe("account-a");
    }
    expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
  } finally { await sibling.close(); }
}, 30000);
it.each([
  { status: "NONE", action: "GRANT_MEMBER", initialRole: null, expectedRevision: 0 },
  { status: "REVOKED", action: "RESTORE_MEMBER", initialRole: "OWNER", expectedRevision: 1 },
])("correction applies only explicitly authorized MEMBER access for $status snapshot", async fixture => {
  await activeOwnedDuplicate();
  if (fixture.initialRole) await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-a", role: fixture.initialRole, status: fixture.status } });
  const created = await createCorrection({ action: fixture.action });
  const inviteId = created.invitation!.id;
  const { handle } = await transaction(tx => exchangeInvitationSecret(tx, inviteId, created.secret!));
  const result = await transaction(tx => confirmAuthorizedInvitation(tx, "CORRECTION", { invitationId: inviteId, handle, userId: "account-a" }));
  expect(result.receipt).toMatchObject({ accessOutcome: fixture.status === "NONE" ? "GRANTED_MEMBER" : "RESTORED_MEMBER", accessAfter: { status: "ACTIVE", role: "MEMBER", revision: fixture.expectedRevision } });
  expect(await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } })).toMatchObject({ role: "MEMBER", status: "ACTIVE", revision: fixture.expectedRevision });
}, 30000);
it("ACCESS_RESTORE unarchives only the exact existing roster row and preserves an active access role", async () => {
  await db.player.update({ where: { id: "historical-player" }, data: { ownerUserId: "account-a" } });
  const archivedAt = new Date("2026-01-02T03:04:05.000Z");
  const archived = await db.clubMember.update({ where: { id: "original-member" }, data: { archivedAt } });
  const access = await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-a", role: "ADMIN", status: "ACTIVE" } });
  const created = await createAccessRestore({ restoreArchivedRoster: true, action: "PRESERVE_ACTIVE" });
  const inviteId = created.invitation!.id;
  const { handle } = await transaction(tx => exchangeInvitationSecret(tx, inviteId, created.secret!));
  const receipt = await transaction(tx => confirmAuthorizedInvitation(tx, "ACCESS_RESTORE", { invitationId: inviteId, handle, userId: "account-a" }));
  expect(receipt.receipt).toMatchObject({ purpose: "ACCESS_RESTORE", sourceRetired: false, rosterOutcome: "UNARCHIVED_EXISTING", accessOutcome: "PRESERVED_ACTIVE" });
  expect(await db.player.count()).toBe(4);
  expect(await db.clubMember.count()).toBe(1);
  expect(await db.player.findUniqueOrThrow({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: "account-a", isActive: true });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: archived.id } })).toMatchObject({ id: archived.id, archivedAt: null, elo: archived.elo, retiredByAdmissionEventId: null });
  expect(await db.clubAccess.findUniqueOrThrow({ where: { id: access.id } })).toEqual(access);
  expect(await db.clubMember.count({ where: { retiredByAdmissionEventId: { not: null } } })).toBe(0);
}, 30000);
it.each(["SQLite", "libSQL"] as const)("blocks ACCESS_RESTORE for a second inactive archived Player identity on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await db.player.update({ where: { id: "historical-player" }, data: { ownerUserId: "account-a" } });
  const secondOwned = await attachInactiveOwnedIdentity({ archived: true });

  const options = await transaction(tx => identityOptions(tx, { clubId: "club-a", targetPlayerId: "historical-player", issuerAccountId: "admin", purpose: "ACCESS_RESTORE" }));
  expect(options.target.accessRestoreBlockers).toEqual(["This account owns another nonretired Player; manual identity review is required."]);
  expect(JSON.stringify(options.target.accessRestoreBlockers)).not.toContain(secondOwned);
  expect(JSON.stringify(options.target.accessRestoreBlockers)).not.toContain("club-b");
  await expect(createAccessRestore({ restoreArchivedRoster: false, action: "GRANT_MEMBER" })).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
  expect(await db.playerInvitation.count({ where: { purpose: "ACCESS_RESTORE" } })).toBe(0);

  const issuerAccess = await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "admin" } } });
  const now = new Date();
  await expect(db.$executeRaw`INSERT INTO "PlayerInvitation" (
    "id","clubId","playerId","clubMemberId","createdByUserId","tokenHash","status","expiresAt","createdAt","updatedAt",
    "purpose","targetAccountUserId","sourcePlayerId","sourceMemberId","retireSourcePlayerId","authorizedAccessAction",
    "restoreArchivedRoster","authorizationReason","authorizerAccessId","authorizerAccessRevision",
    "recipientAccessId","recipientAccessStatus","recipientAccessRole","recipientAccessRevision")
    VALUES ('forged-access-restore','club-a','historical-player','original-member','admin',${hashInvitationSecret("forged-access-restore")},
      'ACTIVE',${new Date(now.getTime() + INVITATION_TTL_MS)},${now},${now},'ACCESS_RESTORE','account-a',NULL,NULL,NULL,
      'GRANT_MEMBER',0,'Restore the exact existing access.',${issuerAccess.id},${issuerAccess.revision},NULL,'NONE',NULL,NULL)`)
    .rejects.toThrow("IDENTITY_CONFLICT");
}, 30000);
it.each(["SQLite", "libSQL"] as const)("rechecks ACCESS_RESTORE identity conflicts at confirmation and execution-event insert on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await db.player.update({ where: { id: "historical-player" }, data: { ownerUserId: "account-a" } });
  const created = await createAccessRestore({ restoreArchivedRoster: false, action: "GRANT_MEMBER" });
  const inviteId = created.invitation!.id;
  const { handle } = await transaction(tx => exchangeInvitationSecret(tx, inviteId, created.secret!));
  await attachInactiveOwnedIdentity({ archived: true });

  await expect(transaction(tx => confirmAuthorizedInvitation(tx, "ACCESS_RESTORE", { invitationId: inviteId, handle, userId: "account-a" })))
    .rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id: inviteId } })).toMatchObject({ status: "ACTIVE", redeemedByUserId: null });
  expect(await db.clubAdmissionRequest.count({ where: { originInvitationId: inviteId } })).toBe(0);

  const request = await db.clubAdmissionRequest.create({ data: {
    clubId: "club-a", requesterUserId: "account-a", kind: "EXISTING_PLAYER", status: "PENDING",
    requestedPlayerId: "historical-player", originInvitationId: inviteId, revision: 1, note: "Guard probe",
  } });
  const invite = await db.playerInvitation.findUniqueOrThrow({ where: { id: inviteId } });
  const details = {
    originInvitationId: invite.id, targetPlayerId: invite.playerId, sourcePlayerId: null, sourceMemberId: null,
    retireSourcePlayerId: null, reason: invite.authorizationReason, authorizedAccessAction: invite.authorizedAccessAction,
    restoreArchivedRoster: invite.restoreArchivedRoster, supersededRecoveryRequest: null, accessOutcome: "GRANTED_MEMBER",
    accessBefore: { accessId: null, status: "NONE", role: null, revision: null },
    accessAfter: { accessId: "probe-access", status: "ACTIVE", role: "MEMBER", revision: 0 },
    accessAfterId: "probe-access", accessAfterRole: "MEMBER", accessAfterStatus: "ACTIVE", accessAfterRevision: 0,
    rosterOutcome: "UNCHANGED", sourceRetired: false,
  };
  await expect(db.$executeRaw`INSERT INTO "ClubAdmissionEvent" (
    "id","admissionRequestId","actorUserId","authorizedByUserId","action","revision","detailsJson","createdAt")
    VALUES ('forged-access-restore-execution',${request.id},'account-a','admin','EXECUTE_AUTHORIZED_ACCESS_RESTORE',1,${JSON.stringify(details)},${new Date()})`)
    .rejects.toThrow("IDENTITY_CONFLICT");
  expect(await db.clubAdmissionEvent.count({ where: { admissionRequestId: request.id } })).toBe(0);
}, 30000);
it.each(["SQLite", "libSQL"] as const)("rejects an ACCESS_RESTORE if another owned Player appears after the execution event on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await db.player.update({ where: { id: "historical-player" }, data: { ownerUserId: "account-a" } });
  const created = await createAccessRestore({ restoreArchivedRoster: false, action: "GRANT_MEMBER" });
  const inviteId = created.invitation!.id;
  const { handle } = await transaction(tx => exchangeInvitationSecret(tx, inviteId, created.secret!));
  const before = fullDatabaseSnapshot();
  await db.$executeRawUnsafe(`CREATE TRIGGER inject_access_restore_identity_conflict AFTER INSERT ON "ClubAdmissionEvent"
    WHEN NEW."action"='EXECUTE_AUTHORIZED_ACCESS_RESTORE'
    BEGIN INSERT INTO "User" ("id","ownerUserId","name","gender","elo","isActive","createdAt","updatedAt")
      VALUES ('late-access-restore-identity','account-a','Late identity','MALE',1000,0,1700000000000,1700000000000); END`);
  await expect(transaction(tx => confirmAuthorizedInvitation(tx, "ACCESS_RESTORE", { invitationId: inviteId, handle, userId: "account-a" })))
    .rejects.toThrow();
  await db.$executeRawUnsafe("DROP TRIGGER inject_access_restore_identity_conflict");
  expect(fullDatabaseSnapshot()).toEqual(before);
  expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
}, 30000);
it.each(["SQLite", "libSQL"] as const)("allows ACCESS_RESTORE for same-Player cross-club memberships and ignores a retired duplicate on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  const { requestId } = await requestRecovery();
  await approveRecovery(requestId);
  await db.clubMember.create({ data: { id: "same-player-club-b-member", clubId: "club-b", playerId: "historical-player" } });
  await db.clubMember.update({ where: { id: "original-member" }, data: { archivedAt: new Date("2026-10-01T00:00:00.000Z") } });

  const options = await transaction(tx => identityOptions(tx, { clubId: "club-a", targetPlayerId: "historical-player", issuerAccountId: "admin", purpose: "ACCESS_RESTORE" }));
  expect(options.target.accessRestoreBlockers).toEqual([]);
  const created = await createAccessRestore({ restoreArchivedRoster: true, action: "PRESERVE_ACTIVE" });
  const inviteId = created.invitation!.id;
  const { handle } = await transaction(tx => exchangeInvitationSecret(tx, inviteId, created.secret!));
  const completed = await transaction(tx => confirmAuthorizedInvitation(tx, "ACCESS_RESTORE", { invitationId: inviteId, handle, userId: "account-a" }));
  expect(completed.receipt).toMatchObject({ purpose: "ACCESS_RESTORE", rosterOutcome: "UNARCHIVED_EXISTING", sourceRetired: false });
  expect(await db.player.findUniqueOrThrow({ where: { id: "duplicate" } })).toMatchObject({ ownerUserId: "account-a", isActive: false });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "duplicate-member" } })).toMatchObject({ retiredByAdmissionEventId: expect.any(String) });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "same-player-club-b-member" } })).toMatchObject({ playerId: "historical-player", clubId: "club-b" });
}, 30000);
it("replaces the exact correction invitation, invalidates its continuation, and frees its source reservation", async () => {
  await activeOwnedDuplicate({ access: { role: "MEMBER" } });
  const first = await createCorrection({ action: "PRESERVE_ACTIVE" });
  const firstId = first.invitation!.id;
  const firstHandle = await transaction(tx => exchangeInvitationSecret(tx, firstId, first.secret!));
  const replacement = await createCorrection({ action: "PRESERVE_ACTIVE", replaceInvitationId: firstId });
  const secondId = replacement.invitation!.id;
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id: firstId } })).toMatchObject({ status: "REVOKED", revocationReason: "REPLACED" });
  await expect(transaction(tx => confirmAuthorizedInvitation(tx, "CORRECTION", { invitationId: firstId, handle: firstHandle.handle, userId: "account-a" }))).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
  expect(await db.clubAdmissionRequest.count()).toBe(0);
  const duplicateSource = await db.clubMember.findUniqueOrThrow({ where: { id: "duplicate-member" } });
  expect(duplicateSource.retiredByAdmissionEventId).toBeNull();
  expect(await db.playerInvitation.count({ where: { sourcePlayerId: "duplicate", status: "ACTIVE", purpose: "CORRECTION" } })).toBe(1);
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id: secondId } })).toMatchObject({ status: "ACTIVE" });
}, 30000);
it.each(["SQLite", "libSQL"] as const)("terminalizes only proven-expired source reservations before issuing a new correction on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await activeOwnedDuplicate({ access: { role: "MEMBER" } });
  const now = new Date();
  const old = await createCorrection({ action: "PRESERVE_ACTIVE", now: new Date(now.getTime() - INVITATION_TTL_MS - 60_000) });
  const oldId = old.invitation!.id;
  const replacement = await createCorrection({ action: "PRESERVE_ACTIVE", now: new Date() });
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id: oldId } })).toMatchObject({ status: "EXPIRED", revocationReason: "EXPIRED" });
  expect(replacement.invitation).toMatchObject({ purpose: "CORRECTION", status: "ACTIVE" });
  expect(await db.playerInvitation.count({ where: { sourcePlayerId: "duplicate", status: "ACTIVE", purpose: "CORRECTION" } })).toBe(1);
}, 30000);
it.each(["SQLite", "libSQL"] as const)("accepts the exact target invitation after expiry cleanup terminalizes it on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await activeOwnedDuplicate({ access: { role: "MEMBER" } });
  const now = new Date();
  const old = await createCorrection({ action: "PRESERVE_ACTIVE", now: new Date(now.getTime() - INVITATION_TTL_MS - 60_000) });
  const replacement = await createCorrection({ action: "PRESERVE_ACTIVE", replaceInvitationId: old.invitation!.id, now });
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id: old.invitation!.id } })).toMatchObject({ status: "EXPIRED", revocationReason: "EXPIRED" });
  expect(replacement.invitation).toMatchObject({ purpose: "CORRECTION", status: "ACTIVE" });
  expect(await db.playerInvitation.count({ where: { playerId: "historical-player", status: "ACTIVE" } })).toBe(1);
}, 30000);
it.each(["SQLite", "libSQL"] as const)("the active correction source unique index rejects direct duplicate reservations on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await activeOwnedDuplicate({ access: { role: "MEMBER" } });
  await db.clubMember.create({ data: { id: "third-target-member", clubId: "club-a", playerId: "p3" } });
  const created = await createCorrection({ action: "PRESERVE_ACTIVE" });
  const invitation = await db.playerInvitation.findUniqueOrThrow({ where: { id: created.invitation!.id } });
  await expect(db.$executeRaw`INSERT INTO "PlayerInvitation" ("id","clubId","playerId","clubMemberId","createdByUserId","purpose","targetAccountUserId","sourcePlayerId","sourceMemberId","retireSourcePlayerId","authorizedAccessAction","restoreArchivedRoster","authorizationReason","authorizerAccessId","authorizerAccessRevision","recipientAccessId","recipientAccessStatus","recipientAccessRole","recipientAccessRevision","tokenHash","status","expiresAt") VALUES ('duplicate-source-reservation','club-a','p3','third-target-member','admin','CORRECTION','account-a','duplicate','duplicate-member','duplicate','PRESERVE_ACTIVE',0,'Second independent reservation',${invitation.authorizerAccessId},${invitation.authorizerAccessRevision},${invitation.recipientAccessId},'ACTIVE','MEMBER',${invitation.recipientAccessRevision},'direct-source-reservation-token','ACTIVE',${invitation.expiresAt})`).rejects.toThrow();
  expect(await db.playerInvitation.count({ where: { sourcePlayerId: "duplicate", status: "ACTIVE", purpose: "CORRECTION" } })).toBe(1);
}, 30000);
it.each(["SQLite", "libSQL"] as const)("terminalizes the source's ordinary CLAIM before an archived duplicate is authorized for correction on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await db.player.create({ data: { id: "legacy-source", name: "Legacy source", gender: "FEMALE" } });
  await db.clubMember.create({ data: { id: "legacy-source-member", clubId: "club-a", playerId: "legacy-source" } });
  const active = await transaction(tx => managePlayerInvitation(tx, { clubId: "club-a", playerId: "legacy-source", userId: "admin", action: "CREATE" }));
  await db.player.update({ where: { id: "legacy-source" }, data: { ownerUserId: "account-a" } });
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id: active.invitation!.id } })).toMatchObject({ status: "REVOKED", revocationReason: "PLAYER_UNAVAILABLE" });
  await db.clubMember.update({ where: { id: "legacy-source-member" }, data: { archivedAt: new Date() } });
  const surfaced = await activePlayerInvitation(db, "club-a", "legacy-source", "admin");
  expect(surfaced.invitation).toBeNull();
  const targetBefore = sportingSnapshot();
  targetBefore.User = targetBefore.User.filter(row => row.id !== "legacy-source");
  targetBefore.CommunityMember = targetBefore.CommunityMember.filter(row => row.id !== "legacy-source-member");
  const authorized = await createCorrection({ sourcePlayerId: "legacy-source", sourceMemberId: "legacy-source-member", action: "GRANT_MEMBER" });
  const continuation = await transaction(tx => exchangeInvitationSecret(tx, authorized.invitation!.id, authorized.secret!));
  const result = await transaction(tx => confirmAuthorizedInvitation(tx, "CORRECTION", { invitationId: authorized.invitation!.id, handle: continuation.handle, userId: "account-a" }));
  expect(result.receipt).toMatchObject({ sourcePlayerId: "legacy-source", sourceRetired: true, accessOutcome: "GRANTED_MEMBER" });
  expect(await db.player.findUniqueOrThrow({ where: { id: "legacy-source" } })).toMatchObject({ ownerUserId: "account-a", isActive: false });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "legacy-source-member" } })).toMatchObject({ archivedAt: expect.any(Date), retiredByAdmissionEventId: expect.any(String) });
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id: active.invitation!.id } })).toMatchObject({ status: "REVOKED" });
  const after = sportingSnapshot();
  after.User = after.User.filter(row => row.id !== "legacy-source");
  after.CommunityMember = after.CommunityMember.filter(row => row.id !== "legacy-source-member");
  expect(after).toEqual(targetBefore);
}, 30000);
it("exact expired CLAIM revoke completes after audited expiry cleanup without rechecking target eligibility", async () => {
  const oldNow = new Date(Date.now() - INVITATION_TTL_MS - 60_000);
  const expired = await transaction(tx => managePlayerInvitation(tx, { clubId: "club-a", playerId: "historical-player", userId: "admin", action: "CREATE", now: oldNow }));
  await expect(transaction(tx => managePlayerInvitation(tx, { clubId: "club-a", playerId: "historical-player", userId: "admin", action: "REVOKE", invitationId: expired.invitation!.id }))).resolves.toEqual({ invitation: null });
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id: expired.invitation!.id } })).toMatchObject({ status: "EXPIRED", revocationReason: "EXPIRED" });
}, 30000);
it.each(["SQLite", "libSQL"] as const)("rejects forged authorized execution events and invalid retirement receipts in direct SQL on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await activeOwnedDuplicate({ access: { role: "MEMBER" } });
  const staleNow = new Date(Date.now() - INVITATION_TTL_MS - 60_000);
  const created = await createCorrection({ action: "PRESERVE_ACTIVE", now: staleNow });
  const invite = await db.playerInvitation.findUniqueOrThrow({ where: { id: created.invitation!.id } });
  const issuance = await db.playerInvitationEvent.findFirstOrThrow({ where: { invitationId: invite.id, action: "CORRECTION_RETIRE_AUTHORIZED" } });
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "PlayerInvitationEvent" ("id","invitationId","actorUserId","action","reason","detailsJson","createdAt") VALUES ('forged-issuance',${invite.id},'admin','CORRECTION_RETIRE_AUTHORIZED','forged','{}',${issuance.createdAt})`).rejects.toThrow();
  await expect(db.$executeRaw`UPDATE "PlayerInvitation" SET "targetAccountUserId"='account-b' WHERE "id"=${invite.id}`).rejects.toThrow();
  await transaction(tx => expirePlayerInvitationReservations(tx, "duplicate", new Date()));
  await db.clubMember.update({ where: { id: "duplicate-member" }, data: { archivedAt: new Date() } });
  const unrelatedRequest = await db.clubAdmissionRequest.create({ data: { clubId: "club-b", requesterUserId: "account-b", kind: "NEW_PLAYER", proposedPlayerName: "Unrelated receipt", proposedGender: "FEMALE" } });
  const unrelatedEvent = await db.clubAdmissionEvent.create({ data: { admissionRequestId: unrelatedRequest.id, actorUserId: "account-b", action: "SUBMIT", revision: 0, detailsJson: "{}" } });
  await expect(db.$executeRaw`UPDATE "CommunityMember" SET "retiredByAdmissionEventId"='not-an-event' WHERE "id"='duplicate-member'`).rejects.toThrow();
  await expect(db.$executeRaw`UPDATE "CommunityMember" SET "retiredByAdmissionEventId"=${unrelatedEvent.id} WHERE "id"='duplicate-member'`).rejects.toThrow();
  expect(await db.playerInvitationEvent.findUniqueOrThrow({ where: { id: issuance.id } })).toEqual(issuance);
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "duplicate-member" } })).toMatchObject({ retiredByAdmissionEventId: null, archivedAt: expect.any(Date) });
}, 30000);
it.each(["SQLite", "libSQL"] as const)("retirement transition SQL preserves source and roster fields on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await activeOwnedDuplicate();
  const created = await createCorrection({ action: "GRANT_MEMBER" });
  const invitation = await db.playerInvitation.findUniqueOrThrow({ where: { id: created.invitation!.id } });
  const details = JSON.stringify({
    originInvitationId: invitation.id, targetPlayerId: invitation.playerId,
    sourcePlayerId: invitation.sourcePlayerId, sourceMemberId: invitation.sourceMemberId,
    retireSourcePlayerId: invitation.retireSourcePlayerId, reason: invitation.authorizationReason,
    authorizedAccessAction: invitation.authorizedAccessAction, restoreArchivedRoster: invitation.restoreArchivedRoster,
    supersededRecoveryRequest: null, accessOutcome: "GRANTED_MEMBER",
    accessBefore: { accessId: null, status: "NONE", role: null, revision: null },
  });
  let eventId = "";
  await transaction(async tx => {
    const request = await tx.clubAdmissionRequest.create({ data: {
      clubId: invitation.clubId, requesterUserId: "account-a", kind: "EXISTING_PLAYER",
      status: "PENDING", requestedPlayerId: invitation.playerId, originInvitationId: invitation.id,
      note: invitation.authorizationReason,
    } });
    await tx.clubAdmissionRequest.update({ where: { id: request.id }, data: { revision: 1 } });
    const event = await tx.clubAdmissionEvent.create({ data: {
      admissionRequestId: request.id, actorUserId: "account-a", authorizedByUserId: "admin",
      action: "EXECUTE_AUTHORIZED_CORRECTION", revision: 1, detailsJson: details,
    } });
    eventId = event.id;
    await tx.playerInvitation.update({ where: { id: invitation.id }, data: { status: "REDEEMED", redeemedByUserId: "account-a", redeemedAt: new Date() } });
    await tx.clubMember.update({ where: { id: "duplicate-member" }, data: { archivedAt: new Date() } });
  });
  await expect(db.$executeRaw`UPDATE "User" SET "isActive"=0,"name"='Bundled identity edit',"elo"=1444 WHERE "id"='duplicate'`).rejects.toThrow();
  expect(await db.player.findUniqueOrThrow({ where: { id: "duplicate" } })).toMatchObject({ isActive: true, name: "Accidental Player", elo: 1000 });
  await db.$executeRaw`UPDATE "User" SET "isActive"=0 WHERE "id"='duplicate'`;
  await expect(db.$executeRaw`UPDATE "CommunityMember" SET "elo"=1444,"retiredByAdmissionEventId"=${eventId} WHERE "id"='duplicate-member'`).rejects.toThrow();
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "duplicate-member" } })).toMatchObject({ elo: 1000, retiredByAdmissionEventId: null });
  await db.$executeRaw`UPDATE "CommunityMember" SET "retiredByAdmissionEventId"=${eventId} WHERE "id"='duplicate-member'`;
  expect(await db.clubAdmissionEvent.findUniqueOrThrow({ where: { id: eventId } })).toMatchObject({ action: "EXECUTE_AUTHORIZED_CORRECTION" });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "duplicate-member" } })).toMatchObject({ elo: 1000, retiredByAdmissionEventId: eventId });
  expect(await db.player.findUniqueOrThrow({ where: { id: "duplicate" } })).toMatchObject({ isActive: false, name: "Accidental Player" });
}, 30000);
it("libSQL executes the authorized correction lifecycle and source collision guard", async () => {
  await useLibSqlAdapter();
  await activeOwnedDuplicate({ access: { role: "OWNER" } });
  const created = await createCorrection({ action: "PRESERVE_ACTIVE" });
  const invite = await db.playerInvitation.findUniqueOrThrow({ where: { id: created.invitation!.id } });
  const handle = await transaction(tx => exchangeInvitationSecret(tx, invite.id, created.secret!));
  const receipt = await transaction(tx => confirmAuthorizedInvitation(tx, "CORRECTION", { invitationId: invite.id, handle: handle.handle, userId: "account-a" }));
  expect(receipt.receipt).toMatchObject({ purpose: "CORRECTION", sourceRetired: true, accessOutcome: "PRESERVED_ACTIVE" });
  expect(await db.player.findUniqueOrThrow({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: "account-a" });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "duplicate-member" } })).toMatchObject({ retiredByAdmissionEventId: expect.any(String) });
  expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
  expect(await db.playerInvitation.count({ where: { sourcePlayerId: "duplicate", status: "ACTIVE", purpose: "CORRECTION" } })).toBe(0);
}, 30000);
it("the full recovery transaction and SQL guards work through the libSQL adapter", async () => {
  await db.$disconnect(); adapterFiles.add(file); adapterClient = createClient({ url: `file:${file}` });
  db = new PrismaClient({ adapter: new PrismaLibSQL(adapterClient as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]) } as unknown as ConstructorParameters<typeof PrismaClient>[0]);
  const { requestId } = await requestRecovery(); const before = preservedTargetSnapshot();
  await db.$executeRaw`UPDATE "User" SET "email"='libsql-retired@example.invalid' WHERE "id"='duplicate'`;
  await approveRecovery(requestId);
  expect(preservedTargetSnapshot()).toEqual(before);
  await expect(db.player.update({ where: { id: "duplicate" }, data: { isActive: true } })).rejects.toThrow();
  await expect(db.playerInvitation.create({ data: { clubId: "club-a", playerId: "duplicate", clubMemberId: "duplicate-member", createdByUserId: "admin", tokenHash: "libsql-retired-active-invite", expiresAt: new Date(Date.now() + INVITATION_TTL_MS) } })).rejects.toThrow();
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "CommunityMember" ("id","communityId","userId","ownerUserId","archivedAt","createdAt","achievementPreferencesJson","retiredByAdmissionEventId") VALUES ('duplicate-member','club-a','p2',NULL,NULL,1800000000000,'{}',NULL)`).rejects.toThrow();
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "CommunityMember" ("id","communityId","userId","ownerUserId","archivedAt","createdAt","achievementPreferencesJson","retiredByAdmissionEventId") VALUES ('duplicate-member-replacement','club-a','duplicate','account-a',NULL,1800000000000,'{}',NULL)`).rejects.toThrow();
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "User" ("id","ownerUserId","name","avatarKey","gender","elo","isActive","createdAt","updatedAt") VALUES ('duplicate','account-a','Replaced Player','changed-avatar','FEMALE',1500,1,1800000000000,1800000000000)`).rejects.toThrow();
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "User" ("id","email","ownerUserId","name","gender","elo","isActive","createdAt","updatedAt") VALUES ('replacement-via-email','libsql-retired@example.invalid',NULL,'Replaced by email','FEMALE',1500,1,1800000000000,1800000000000)`).rejects.toThrow();
  await db.player.create({ data: { id: "libsql-owned-without-roster", ownerUserId: "account-a", name: "Owned without roster", gender: "MALE" } });
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "User" ("id","ownerUserId","name","gender","elo","isActive","createdAt","updatedAt") VALUES ('libsql-owned-without-roster','account-b','Reassigned Player','MALE',1000,1,1800000000000,1800000000000)`).rejects.toThrow();
  await db.$executeRaw`INSERT INTO "User" ("id","email","ownerUserId","name","gender","elo","isActive","createdAt","updatedAt") VALUES ('libsql-owned-with-email','libsql-owned-legacy@example.invalid','account-a','Owned legacy player','MALE',1000,1,1700000000000,1700000000000)`;
  await db.$executeRaw`INSERT OR REPLACE INTO "User" ("id","email","ownerUserId","name","gender","elo","isActive","createdAt","updatedAt") VALUES ('libsql-owned-with-email','libsql-owned-legacy@example.invalid','account-a','Same identity edit','MALE',1000,1,1800000000000,1800000000000)`;
  expect(await db.$queryRaw<Array<{ id: string; ownerUserId: string; name: string }>>`SELECT "id","ownerUserId","name" FROM "User" WHERE "id"='libsql-owned-with-email'`).toEqual([{ id: "libsql-owned-with-email", ownerUserId: "account-a", name: "Same identity edit" }]);
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "User" ("id","email","ownerUserId","name","gender","elo","isActive","createdAt","updatedAt") VALUES ('libsql-owned-email-same-owner-replacement','libsql-owned-legacy@example.invalid','account-a','Same owner, new identity','MALE',1000,1,1800000000000,1800000000000)`).rejects.toThrow();
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "User" ("id","email","ownerUserId","name","gender","elo","isActive","createdAt","updatedAt") VALUES ('libsql-owned-email-replacement','libsql-owned-legacy@example.invalid','account-b','Reassigned through email','MALE',1000,1,1800000000000,1800000000000)`).rejects.toThrow();
  const event = await db.clubAdmissionEvent.findFirstOrThrow({ where: { action: "APPROVE_RECOVERY" } });
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "ClubAdmissionEvent" ("id","admissionRequestId","actorUserId","action","revision","detailsJson","createdAt") VALUES (${event.id},${event.admissionRequestId},${event.actorUserId},'MIGRATED',${event.revision},'{}',${event.createdAt})`).rejects.toThrow();
  const invite = await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: requestId } });
  const invitationEvent = await db.playerInvitationEvent.findFirstOrThrow({ where: { invitationId: invite.originInvitationId! } });
  await expect(db.$executeRaw`INSERT OR REPLACE INTO "PlayerInvitationEvent" ("id","invitationId","actorUserId","action","reason","createdAt") VALUES (${invitationEvent.id},${invitationEvent.invitationId},${invitationEvent.actorUserId},'FORGED','replacement',${invitationEvent.createdAt})`).rejects.toThrow();
  await expect(db.match.update({ where: { id: "history-match" }, data: { matchmakingReasonJson: JSON.stringify("duplicate") } })).rejects.toThrow();
  await expect(db.match.update({ where: { id: "history-match" }, data: { matchmakingReasonJson: JSON.stringify({ opaque: JSON.stringify(JSON.stringify({ ids: ["duplicate"] })) }) } })).rejects.toThrow();
  await expect(db.session.update({ where: { id: "history-session" }, data: { achievementEligibilityJson: JSON.stringify({ opaque: JSON.stringify({ ids: ["duplicate"] }) }) } })).rejects.toThrow();
  await db.match.update({ where: { id: "history-match" }, data: { matchmakingReasonJson: JSON.stringify("ordinary historical explanation") } });
});
it("libSQL preserves invitation-backed admission bindings against primary and unique-key replacement", async () => {
  await db.$disconnect(); adapterFiles.add(file); adapterClient = createClient({ url: `file:${file}` });
  db = new PrismaClient({ adapter: new PrismaLibSQL(adapterClient as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]) } as unknown as ConstructorParameters<typeof PrismaClient>[0]);
  const invite = await ready(); const now = new Date();
  const bound = await db.clubAdmissionRequest.create({ data: { id: "libsql-bound-request", clubId: "club-a", requesterUserId: "account-a", kind: "EXISTING_PLAYER", requestedPlayerId: "historical-player", originInvitationId: invite.id, idempotencyKey: "libsql-bound-key" } });
  const replace = (id: string, key: string | null) => db.$executeRaw`INSERT OR REPLACE INTO "ClubJoinRequest" ("id","clubId","userId","kind","status","requestedPlayerId","approvedPlayerId","revision","legacyClaimRequestId","idempotencyKey","originInvitationId","createdAt","updatedAt") VALUES (${id},'club-a','account-a','EXISTING_PLAYER','PENDING','historical-player',NULL,0,NULL,${key},NULL,${now},${now})`;
  await expect(replace(bound.id, "different-key")).rejects.toThrow();
  await expect(replace("libsql-bound-key-collision", "libsql-bound-key")).rejects.toThrow();
  await expect(replace("libsql-bound-pending-collision", null)).rejects.toThrow();
  expect(await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: bound.id } })).toMatchObject({ originInvitationId: invite.id, idempotencyKey: "libsql-bound-key" });
});
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
it("competing libSQL recovery approvals across separate clients produce one audited retirement", async () => {
  await db.$disconnect(); adapterFiles.add(file); adapterClient = createClient({ url: `file:${file}` });
  db = new PrismaClient({ adapter: new PrismaLibSQL(adapterClient as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]) } as unknown as ConstructorParameters<typeof PrismaClient>[0]);
  const otherClient = createClient({ url: `file:${file}` });
  const other = new PrismaClient({ adapter: new PrismaLibSQL(otherClient as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]) } as unknown as ConstructorParameters<typeof PrismaClient>[0]);
  try {
    const { requestId } = await requestRecovery();
    const results = await Promise.allSettled([approveRecovery(requestId), admissionTransaction(other, tx => reviewClubAdmission(tx, { clubId: "club-a", requestId, reviewerUserId: "admin", action: "APPROVE", revision: 0, confirmRestoreAccess: true, retireEmptyPlayerId: "duplicate", reason: "Verified empty" }))]);
    expect(results.some(r => r.status === "fulfilled"), results.map(r => r.status === "rejected" ? (r.reason as Error).message : "committed").join("\n")).toBe(true);
    expect(await db.clubAdmissionEvent.count({ where: { action: "APPROVE_RECOVERY" } })).toBe(1);
    expect(await db.clubMember.count({ where: { retiredByAdmissionEventId: { not: null } } })).toBe(1);
    expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
  } finally { await other.$disconnect(); otherClient.close(); }
}, 30000);
it.each([
  { stage: "the source roster has been marked, before invitation consumption", sql: `CREATE TRIGGER recovery_fault BEFORE UPDATE OF "status" ON "PlayerInvitation" WHEN NEW."status"='REDEEMED' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END` },
  { stage: "the invitation has been consumed, before target ownership", sql: `CREATE TRIGGER recovery_fault BEFORE UPDATE OF "ownerUserId" ON "User" WHEN NEW."id"='historical-player' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END` },
  { stage: "target ownership has changed, before access restoration", sql: `CREATE TRIGGER recovery_fault BEFORE UPDATE ON "ClubAccess" WHEN NEW."userId"='account-a' AND NEW."status"='ACTIVE' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END` },
  { stage: "access has been restored, before final approval", sql: `CREATE TRIGGER recovery_fault BEFORE UPDATE OF "status" ON "ClubJoinRequest" WHEN NEW."status"='APPROVED' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END` },
])("libSQL rolls back recovery writes when failure occurs after $stage", async ({ sql }) => {
  await useLibSqlAdapter();
  const { invite, requestId } = await requestRecovery();
  const before = await recoveryStateSnapshot(invite.id, requestId);
  await db.$executeRawUnsafe(sql);
  await expect(approveRecovery(requestId)).rejects.toThrow();
  expect(await recoveryStateSnapshot(invite.id, requestId)).toEqual(before);
}, 30000);
it.each(["REDEEM", "REPLACE", "CANCEL"] as const)("libSQL serializes approval against concurrent %s through separate clients", async action => {
  await useLibSqlAdapter();
  const otherClient = createClient({ url: `file:${file}` });
  const other = new PrismaClient({ adapter: new PrismaLibSQL(otherClient as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]) } as unknown as ConstructorParameters<typeof PrismaClient>[0]);
  try {
    const { invite, requestId } = await requestRecovery();
    const approval = admissionTransaction(db, tx => reviewClubAdmission(tx, { clubId: "club-a", requestId, reviewerUserId: "admin", action: "APPROVE", revision: 0, confirmRestoreAccess: true, retireEmptyPlayerId: "duplicate", reason: "Verified empty" }));
    const competing = action === "REDEEM"
      ? admissionTransaction(other, tx => redeemPlayerInvitation(tx, invite.id, invite.handle, "account-b"))
      : action === "REPLACE"
        ? admissionTransaction(other, tx => managePlayerInvitation(tx, { clubId: "club-a", playerId: "historical-player", userId: "admin", action: "REPLACE", invitationId: invite.id }))
        : admissionTransaction(other, tx => reviewClubAdmission(tx, { clubId: "club-a", requestId, reviewerUserId: "account-a", action: "CANCEL", revision: 0 }));
    const outcomes = await Promise.allSettled([approval, competing]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const request = await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: requestId } });
    const invitation = await db.playerInvitation.findUniqueOrThrow({ where: { id: invite.id } });
    const target = await db.player.findUniqueOrThrow({ where: { id: "historical-player" } });
    const source = await db.player.findUniqueOrThrow({ where: { id: "duplicate" } });
    const sourceMember = await db.clubMember.findUniqueOrThrow({ where: { id: "duplicate-member" } });
    if (request.status === "APPROVED") {
      expect(invitation).toMatchObject({ status: "REDEEMED", redeemedByUserId: "account-a" });
      expect(target.ownerUserId).toBe("account-a");
      expect(source).toMatchObject({ isActive: false, ownerUserId: "account-a" });
      expect(sourceMember.retiredByAdmissionEventId).toBeTruthy();
    } else {
      expect(source).toMatchObject({ isActive: true, ownerUserId: "account-a" });
      expect(sourceMember.retiredByAdmissionEventId).toBeNull();
      if (invitation.status === "REDEEMED") expect(target.ownerUserId).toBe(invitation.redeemedByUserId);
      else expect(target.ownerUserId).toBeNull();
    }
    expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
  } finally { await other.$disconnect(); otherClient.close(); }
}, 30000);
it("recovery HTTP endpoints retain capability/auth/origin/privacy protection, and admin requests expose the review DTO", async () => {
  const { invite, requestId } = await requestRecovery(); actor = { id: "account-a" };
  const path = `/api/player-invites/${invite.id}/recovery-request`;
  const ctx = inviteContext(invite.id);
  const body = { idempotencyKey: "recovery-key" };
  expect((await invitationRecoveryPost(request(path, body), ctx)).status).toBe(401);
  expect((await invitationRecoveryPost(request(path, { ...body, clubId: "club-b" }, invite), ctx)).status).toBe(400);
  const crossOrigin = request(path, body, invite); crossOrigin.headers.set("origin", "https://evil.example");
  expect((await invitationRecoveryPost(crossOrigin, ctx)).status).toBe(403);
  const response = await invitationRecoveryGet(request(path), ctx);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(JSON.stringify(await response.json())).not.toMatch(/tokenHash|handleHash|passwordHash|email/);
  actor = { id: "account-b" };
  expect(await (await invitationRecoveryGet(request(path), ctx)).json()).toEqual({ request: null, recovery: null });
  actor = { id: "admin" };
  const list = await adminAdmissionListApi(request("/api/clubs/club-a/join-requests"), { params: Promise.resolve({ id: "club-a" }) });
  expect(await list.json()).toMatchObject({ requests: [{ id: requestId, recoveryReviewAuthorized: true, recovery: { duplicate: { id: "duplicate", eligible: true } } }] });
  actor = { id: "account-b", isAdmin: true };
  const globalList = await adminAdmissionListApi(request("/api/clubs/club-a/join-requests"), { params: Promise.resolve({ id: "club-a" }) });
  expect(await globalList.json()).toMatchObject({ requests: [{ id: requestId, recoveryReviewAuthorized: false }] });
  actor = { id: "admin" };
  const reviewPath = `/api/clubs/club-a/join-requests/${requestId}`;
  const context = { params: Promise.resolve({ id: "club-a", requestId }) };
  const review = request(reviewPath, { action: "APPROVE", revision: 0, confirmRestoreAccess: true, retireEmptyPlayerId: "duplicate", reason: "Verified empty" });
  review.headers.set("origin", "https://evil.example");
  expect((await reviewAdmissionApi(review, context)).status).toBe(403);
  actor = { id: "guest:historical-player", isQuickAccess: true, guestPlayerId: "historical-player" };
  expect((await invitationRecoveryGet(request(path), ctx)).status).toBe(403);
});

async function attachInactiveOwnedIdentity(options: { archived?: boolean } = {}) {
  // Represent an identity already present before 0816. That migration blocks
  // new owner assignments but intentionally leaves legacy rows untouched.
  await db.player.create({ data: { id: "legacy-inactive-owned-player", name: "Legacy inactive identity", gender: "MALE", ownerUserId: "account-a", isActive: false } });
  if (options.archived) {
    await db.clubMember.create({ data: {
      id: "legacy-inactive-owned-member", clubId: "club-b", playerId: "legacy-inactive-owned-player",
      archivedAt: new Date("2026-10-01T00:00:00.000Z"),
    } });
  }
  return "legacy-inactive-owned-player";
}

function authorizedCorrectionDetails(invitation: {
  id: string; playerId: string; sourcePlayerId: string | null; sourceMemberId: string | null;
  retireSourcePlayerId: string | null; authorizationReason: string | null;
  authorizedAccessAction: string | null; restoreArchivedRoster: boolean;
  recipientAccessId: string | null; recipientAccessStatus: string | null;
  recipientAccessRole: string | null; recipientAccessRevision: number | null;
}) {
  const access = {
    accessId: invitation.recipientAccessId,
    status: invitation.recipientAccessStatus,
    role: invitation.recipientAccessRole,
    revision: invitation.recipientAccessRevision,
  };
  return JSON.stringify({
    originInvitationId: invitation.id, targetPlayerId: invitation.playerId,
    sourcePlayerId: invitation.sourcePlayerId, sourceMemberId: invitation.sourceMemberId,
    retireSourcePlayerId: invitation.retireSourcePlayerId, reason: invitation.authorizationReason,
    authorizedAccessAction: invitation.authorizedAccessAction,
    restoreArchivedRoster: invitation.restoreArchivedRoster, supersededRecoveryRequest: null,
    accessOutcome: "PRESERVED_ACTIVE", accessBefore: access, accessAfter: access,
    accessAfterId: access.accessId, accessAfterRole: access.role, accessAfterStatus: access.status,
    accessAfterRevision: access.revision, rosterOutcome: "UNCHANGED", sourceRetired: true,
  });
}

async function prepareDirectCorrectionStage(finalApproval: boolean) {
  await activeOwnedDuplicate({ access: { role: "MEMBER" } });
  const created = await createCorrection({ action: "PRESERVE_ACTIVE" });
  const invitation = await db.playerInvitation.findUniqueOrThrow({ where: { id: created.invitation!.id } });
  const request = await db.clubAdmissionRequest.create({ data: {
    clubId: "club-a", requesterUserId: "account-a", kind: "EXISTING_PLAYER", status: "PENDING",
    requestedPlayerId: invitation.playerId, originInvitationId: invitation.id, note: invitation.authorizationReason,
  } });
  await db.clubAdmissionRequest.update({ where: { id: request.id }, data: { revision: 1 } });
  const event = await db.clubAdmissionEvent.create({ data: {
    admissionRequestId: request.id, actorUserId: "account-a", authorizedByUserId: "admin",
    action: "EXECUTE_AUTHORIZED_CORRECTION", revision: 1, detailsJson: authorizedCorrectionDetails(invitation),
  } });
  await db.playerInvitation.update({ where: { id: invitation.id }, data: {
    status: "REDEEMED", redeemedByUserId: "account-a", redeemedAt: new Date(),
  } });
  await db.clubMember.update({ where: { id: "duplicate-member" }, data: { archivedAt: new Date() } });
  await db.$executeRaw`UPDATE "User" SET "isActive"=0 WHERE "id"='duplicate' AND "ownerUserId"='account-a'`;
  if (finalApproval) {
    await db.clubMember.update({ where: { id: "duplicate-member" }, data: { retiredByAdmissionEventId: event.id } });
    await db.$executeRaw`UPDATE "User" SET "ownerUserId"='account-a' WHERE "id"='historical-player'`;
  }
  return { event, invitation, request };
}

async function executeDirectSql(engine: "SQLite" | "libSQL", sql: string, args: Array<string | number | null>) {
  if (engine === "SQLite") {
    const sqlite = new DatabaseSync(file);
    try { sqlite.exec("PRAGMA foreign_keys=ON"); return sqlite.prepare(sql).run(...args); }
    finally { sqlite.close(); }
  }
  const client = createClient({ url: `file:${file.replaceAll("\\", "/")}` });
  try {
    await client.execute("PRAGMA foreign_keys=ON");
    return await client.execute({ sql, args });
  } finally { client.close(); }
}

async function expectRawIdentityConflict(operation: Promise<unknown>) {
  let caught: unknown;
  try { await operation; } catch (error) { caught = error; }
  if (caught === undefined) throw new Error("Expected the direct SQL identity guard to reject the write.");
  expect(inspect(caught, { depth: 8, colors: false })).toContain("IDENTITY_CONFLICT");
}

it.each(["SQLite", "libSQL"] as const)("rejects direct CORRECTION invitation issuance when an inactive archived or unrostered identity already exists on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await activeOwnedDuplicate({ access: { role: "MEMBER" } });
  await db.clubMember.create({ data: { id: "third-target-member", clubId: "club-a", playerId: "p3" } });
  const expiredAt = new Date(Date.now() - INVITATION_TTL_MS - 60_000);
  const seed = await createCorrection({ targetPlayerId: "p3", action: "PRESERVE_ACTIVE", now: expiredAt });
  await transaction(tx => expirePlayerInvitationReservations(tx, "duplicate", new Date()));
  await attachInactiveOwnedIdentity({ archived: true });
  const before = fullDatabaseSnapshot();
  const now = new Date();
  await expect(db.$executeRaw`
    INSERT INTO "PlayerInvitation" (
      "id","clubId","playerId","clubMemberId","createdByUserId","purpose","targetAccountUserId",
      "sourcePlayerId","sourceMemberId","retireSourcePlayerId","authorizedAccessAction","restoreArchivedRoster",
      "authorizationReason","authorizerAccessId","authorizerAccessRevision","recipientAccessId","recipientAccessStatus",
      "recipientAccessRole","recipientAccessRevision","tokenHash","status","expiresAt","createdAt","updatedAt")
    SELECT 'direct-correction-identity-conflict',"clubId","playerId","clubMemberId","createdByUserId","purpose","targetAccountUserId",
      "sourcePlayerId","sourceMemberId","retireSourcePlayerId","authorizedAccessAction","restoreArchivedRoster",
      "authorizationReason","authorizerAccessId","authorizerAccessRevision","recipientAccessId","recipientAccessStatus",
      "recipientAccessRole","recipientAccessRevision",${hashInvitationSecret("direct-correction-identity-conflict")},'ACTIVE',
      ${new Date(Date.now() + INVITATION_TTL_MS)},${now},${now}
    FROM "PlayerInvitation" WHERE "id"=${seed.invitation!.id}`
  ).rejects.toThrow("IDENTITY_CONFLICT");
  expect(fullDatabaseSnapshot()).toEqual(before);
  expect(await db.playerInvitation.count({ where: { id: "direct-correction-identity-conflict" } })).toBe(0);
}, 30000);

it.each(["SQLite", "libSQL"] as const)("rejects a forged correction execution event if an inactive unrostered identity exists on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await activeOwnedDuplicate({ access: { role: "MEMBER" } });
  const created = await createCorrection({ action: "PRESERVE_ACTIVE" });
  const invitation = await db.playerInvitation.findUniqueOrThrow({ where: { id: created.invitation!.id } });
  await attachInactiveOwnedIdentity();
  const request = await db.clubAdmissionRequest.create({ data: {
    clubId: "club-a", requesterUserId: "account-a", kind: "EXISTING_PLAYER", status: "PENDING",
    requestedPlayerId: invitation.playerId, originInvitationId: invitation.id, note: invitation.authorizationReason,
  } });
  await db.clubAdmissionRequest.update({ where: { id: request.id }, data: { revision: 1 } });
  const before = fullDatabaseSnapshot();
  await expect(db.$executeRaw`
    INSERT INTO "ClubAdmissionEvent" ("id","admissionRequestId","actorUserId","authorizedByUserId","action","revision","detailsJson","createdAt")
    VALUES ('forged-correction-execution',${request.id},'account-a','admin','EXECUTE_AUTHORIZED_CORRECTION',1,
      ${authorizedCorrectionDetails(invitation)},${new Date()})`
  ).rejects.toThrow("IDENTITY_CONFLICT");
  expect(fullDatabaseSnapshot()).toEqual(before);
  expect(await db.clubAdmissionEvent.count({ where: { admissionRequestId: request.id } })).toBe(0);
}, 30000);

it.each(["SQLite", "libSQL"] as const)("rolls back correction execution when an inactive unrostered identity appears before source retirement on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await activeOwnedDuplicate({ access: { role: "MEMBER" } });
  const created = await createCorrection({ action: "PRESERVE_ACTIVE" });
  const invitationId = created.invitation!.id;
  const { handle } = await transaction(tx => exchangeInvitationSecret(tx, invitationId, created.secret!));
  await db.$executeRawUnsafe(`CREATE TRIGGER inject_correction_identity_before_retirement
    AFTER INSERT ON "ClubAdmissionEvent"
    WHEN NEW."action"='EXECUTE_AUTHORIZED_CORRECTION'
    BEGIN
      INSERT INTO "User" ("id","ownerUserId","name","gender","elo","isActive","createdAt","updatedAt")
        VALUES ('late-correction-retirement-identity','account-a','Late identity','MALE',1000,0,1700000000000,1700000000000);
    END`);
  const before = fullDatabaseSnapshot();
  await expectPrismaConstraintAbort(transaction(tx => confirmAuthorizedInvitation(tx, "CORRECTION", {
    invitationId, handle, userId: "account-a",
  })), "ClubMember");
  await db.$executeRawUnsafe("DROP TRIGGER inject_correction_identity_before_retirement");
  expect(fullDatabaseSnapshot()).toEqual(before);
  expect(await db.player.findUniqueOrThrow({ where: { id: "duplicate" } })).toMatchObject({ isActive: true, ownerUserId: "account-a" });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "duplicate-member" } })).toMatchObject({ archivedAt: null, retiredByAdmissionEventId: null });
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id: invitationId } })).toMatchObject({ status: "ACTIVE", redeemedByUserId: null });
  expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
}, 30000);

it.each(["SQLite", "libSQL"] as const)("rolls back correction final approval if an inactive unrostered identity appears after target linking on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await activeOwnedDuplicate({ access: { role: "MEMBER" } });
  const created = await createCorrection({ action: "PRESERVE_ACTIVE" });
  const invitationId = created.invitation!.id;
  const { handle } = await transaction(tx => exchangeInvitationSecret(tx, invitationId, created.secret!));
  await db.$executeRawUnsafe(`CREATE TRIGGER inject_correction_identity_after_target_link
    AFTER UPDATE OF "ownerUserId" ON "User"
    WHEN NEW."id"='historical-player' AND NEW."ownerUserId"='account-a'
    BEGIN
      INSERT INTO "User" ("id","ownerUserId","name","gender","elo","isActive","createdAt","updatedAt")
        VALUES ('late-correction-approval-identity','account-a','Late identity','MALE',1000,0,1700000000000,1700000000000);
    END`);
  const before = fullDatabaseSnapshot();
  await expectPrismaConstraintAbort(transaction(tx => confirmAuthorizedInvitation(tx, "CORRECTION", {
    invitationId, handle, userId: "account-a",
  })), "ClubAdmissionRequest");
  await db.$executeRawUnsafe("DROP TRIGGER inject_correction_identity_after_target_link");
  expect(fullDatabaseSnapshot()).toEqual(before);
  expect(await db.player.findUniqueOrThrow({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: null, isActive: true });
  expect(await db.player.findUniqueOrThrow({ where: { id: "duplicate" } })).toMatchObject({ isActive: true, ownerUserId: "account-a" });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "duplicate-member" } })).toMatchObject({ retiredByAdmissionEventId: null });
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id: invitationId } })).toMatchObject({ status: "ACTIVE", redeemedByUserId: null });
  expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
}, 30000);

it.each(["SQLite", "libSQL"] as const)("direct SQL retirement guard reports IDENTITY_CONFLICT for a second inactive identity on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  const { event } = await prepareDirectCorrectionStage(false);
  await attachInactiveOwnedIdentity();
  const before = fullDatabaseSnapshot();
  await expectRawIdentityConflict(executeDirectSql(engine,
    'UPDATE "CommunityMember" SET "retiredByAdmissionEventId"=? WHERE "id"=?',
    [event.id, "duplicate-member"]));
  expect(fullDatabaseSnapshot()).toEqual(before);
  expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
}, 30000);

it.each(["SQLite", "libSQL"] as const)("direct SQL final approval guard reports IDENTITY_CONFLICT after target linking on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  const { request } = await prepareDirectCorrectionStage(true);
  await attachInactiveOwnedIdentity();
  const now = Date.now();
  const before = fullDatabaseSnapshot();
  await expectRawIdentityConflict(executeDirectSql(engine,
    'UPDATE "ClubJoinRequest" SET "status"=?,"approvedPlayerId"=?,"decision"=?,"reviewedById"=?,"reviewedAt"=? WHERE "id"=? AND "status"=?',
    ["APPROVED", "historical-player", "EXECUTE_AUTHORIZED_CORRECTION", "admin", now, request.id, "PENDING"]));
  expect(fullDatabaseSnapshot()).toEqual(before);
  expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
}, 30000);

it.each(["SQLite", "libSQL"] as const)("excludes a previously retired duplicate from the correction conflict guard on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await activeOwnedDuplicate({ archived: true });
  await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-a", role: "ADMIN", status: "REVOKED" } });
  await db.player.create({ data: { id: "fresh-source", name: "Empty claimed source", gender: "MALE" } });
  await db.clubMember.create({ data: { id: "fresh-source-member", clubId: "club-a", playerId: "fresh-source" } });
  const claim = await transaction(tx => managePlayerInvitation(tx, {
    clubId: "club-a", playerId: "fresh-source", userId: "admin", action: "CREATE",
  }));
  const claimId = claim.invitation!.id;
  const claimSecret = "secret" in claim ? claim.secret! : "";
  const { handle: claimHandle } = await transaction(tx => exchangeInvitationSecret(tx, claimId, claimSecret));
  const recovery = await transaction(tx => submitInvitationRecovery(tx, {
    invitationId: claimId, handle: claimHandle, userId: "account-a", idempotencyKey: `retired-exclusion-${engine}`,
  }));
  await approveRecovery(recovery.request!.id);
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "duplicate-member" } })).toMatchObject({ retiredByAdmissionEventId: expect.any(String) });
  expect(await db.player.findUniqueOrThrow({ where: { id: "duplicate" } })).toMatchObject({ isActive: false, ownerUserId: "account-a" });

  const created = await createCorrection({ targetPlayerId: "historical-player", sourcePlayerId: "fresh-source", sourceMemberId: "fresh-source-member", action: "PRESERVE_ACTIVE" });
  const invitationId = created.invitation!.id;
  const { handle } = await transaction(tx => exchangeInvitationSecret(tx, invitationId, created.secret!));
  const completed = await transaction(tx => confirmAuthorizedInvitation(tx, "CORRECTION", {
    invitationId, handle, userId: "account-a",
  }));
  expect(completed.receipt).toMatchObject({ purpose: "CORRECTION", sourceRetired: true, targetPlayerId: "historical-player" });
  expect(await db.player.count()).toBe(6);
  expect(await db.player.findUniqueOrThrow({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: "account-a", isActive: true });
  expect(await db.player.findUniqueOrThrow({ where: { id: "fresh-source" } })).toMatchObject({ ownerUserId: "account-a", isActive: false });
  expect(await db.clubMember.count({ where: { retiredByAdmissionEventId: { not: null } } })).toBe(2);
  expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
}, 30000);

it.each(["SQLite", "libSQL"] as const)("allows correction when the same target Player has a membership in another club on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await activeOwnedDuplicate({ access: { role: "MEMBER" } });
  await db.clubMember.create({ data: { id: "historical-player-club-b-member", clubId: "club-b", playerId: "historical-player" } });
  const created = await createCorrection({ action: "PRESERVE_ACTIVE" });
  const invitationId = created.invitation!.id;
  const { handle } = await transaction(tx => exchangeInvitationSecret(tx, invitationId, created.secret!));
  const completed = await transaction(tx => confirmAuthorizedInvitation(tx, "CORRECTION", {
    invitationId, handle, userId: "account-a",
  }));
  expect(completed.receipt).toMatchObject({ purpose: "CORRECTION", sourceRetired: true, targetPlayerId: "historical-player" });
  expect(await db.clubMember.findUniqueOrThrow({ where: { id: "historical-player-club-b-member" } })).toMatchObject({ clubId: "club-b", playerId: "historical-player" });
  expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
}, 30000);

it.each(["SQLite", "libSQL"] as const)("installs the correction identity guards without rewriting an approved receipt or legacy multi-owned Player rows on %s", async engine => {
  const pre0815File = path.join(dir, `populated-before-0815-${engine}.db`);
  adapterFiles.add(pre0815File);
  copyFileSync(baseline, pre0815File);
  const pre0815Sqlite = new DatabaseSync(pre0815File);
  try {
    for (const name of [
      "Correction_invitation_global_identity_guard",
      "Correction_execution_global_identity_guard",
      "Correction_retirement_global_identity_guard",
      "Correction_approval_global_identity_guard",
    ]) pre0815Sqlite.exec(`DROP TRIGGER IF EXISTS "${name}"`);
    pre0815Sqlite.prepare('DELETE FROM "_prisma_migrations" WHERE "migration_name"=?').run("20261008150000_correction_global_identity_guards");
  } finally { pre0815Sqlite.close(); }

  const localUrl = `file:${pre0815File.replaceAll("\\", "/")}`;
  const seedClient = engine === "libSQL" ? createClient({ url: localUrl }) : undefined;
  if (seedClient) await seedClient.execute("PRAGMA foreign_keys=ON");
  const pre0815Db = seedClient
    ? new PrismaClient({ adapter: new PrismaLibSQL(seedClient as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]) } as unknown as ConstructorParameters<typeof PrismaClient>[0])
    : new PrismaClient({ datasources: { db: { url: localUrl } } });
  let requestId = "";
  try {
    await pre0815Db.user.createMany({ data: ["admin", "account-a"].map(id => ({ id, name: id, email: `${id}@migration.invalid`, passwordHash: "fixture" })) });
    await pre0815Db.club.create({ data: { id: "compat-club", name: "Compatibility Club", createdById: "admin" } });
    await pre0815Db.clubAccess.createMany({ data: [
      { clubId: "compat-club", userId: "admin", role: "OWNER" },
      { clubId: "compat-club", userId: "account-a", role: "MEMBER" },
    ] });
    await pre0815Db.player.createMany({ data: [
      { id: "compat-target", name: "Original", gender: "MALE" },
      { id: "compat-source", name: "Duplicate", gender: "FEMALE", ownerUserId: "account-a" },
    ] });
    await pre0815Db.clubMember.createMany({ data: [
      { id: "compat-target-member", clubId: "compat-club", playerId: "compat-target" },
      { id: "compat-source-member", clubId: "compat-club", playerId: "compat-source" },
    ] });
    const created = await admissionTransaction(pre0815Db, tx => createAuthorizedInvitation(tx, "CORRECTION", {
      clubId: "compat-club", targetPlayerId: "compat-target", issuerAccountId: "admin", recipientAccountId: "account-a",
      sourcePlayerId: "compat-source", sourceMemberId: "compat-source-member", retireSourcePlayerId: "compat-source",
      reason: "Preserve the approved correction receipt across the guard migration.", authorizedAccessAction: "PRESERVE_ACTIVE",
      restoreArchivedRoster: false,
    }));
    const { handle } = await admissionTransaction(pre0815Db, tx => exchangeInvitationSecret(tx, created.invitation!.id, created.secret!));
    const completed = await admissionTransaction(pre0815Db, tx => confirmAuthorizedInvitation(tx, "CORRECTION", {
      invitationId: created.invitation!.id, handle, userId: "account-a",
    }));
    expect(completed.receipt).toMatchObject({ purpose: "CORRECTION", targetPlayerId: "compat-target", sourceRetired: true });
    const request = await pre0815Db.clubAdmissionRequest.findFirstOrThrow({ where: { originInvitationId: created.invitation!.id } });
    requestId = request.id;
    expect(request.status).toBe("APPROVED");
    // This is pre-existing legacy multi-owned data, retained without automatic reassignment.
    await pre0815Db.player.create({ data: { id: "compat-legacy-extra", name: "Legacy second identity", gender: "UNSPECIFIED", ownerUserId: "account-a", isActive: false } });
  } finally {
    await pre0815Db.$disconnect();
    seedClient?.close();
  }

  const beforeMigration = applicationDatabaseSnapshot(pre0815File);
  if (engine === "SQLite") {
    const minimalEnv: NodeJS.ProcessEnv = { NODE_ENV: "test" };
    for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA"]) {
      if (process.env[key]) minimalEnv[key] = process.env[key];
    }
    minimalEnv.DATABASE_URL = localUrl;
    minimalEnv.USE_TURSO = "false";
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/schema.prisma"], {
      cwd: process.cwd(), env: minimalEnv, stdio: "pipe",
    });
  } else {
    const migrationClient = createClient({ url: localUrl });
    try {
      await migrationClient.execute("PRAGMA foreign_keys=ON");
      const migrationSql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261008150000_correction_global_identity_guards/migration.sql"), "utf8");
      await migrationClient.executeMultiple(migrationSql);
    } finally { migrationClient.close(); }
  }

  expect(applicationDatabaseSnapshot(pre0815File)).toEqual(beforeMigration);
  const migratedSqlite = new DatabaseSync(pre0815File);
  try {
    if (engine === "SQLite") {
      const migration = migratedSqlite.prepare('SELECT "finished_at" FROM "_prisma_migrations" WHERE "migration_name"=?').get("20261008150000_correction_global_identity_guards") as { finished_at: string | null } | undefined;
      expect(migration?.finished_at).not.toBeNull();
    }
    expect(migratedSqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    const installed = migratedSqlite.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='trigger' AND name LIKE 'Correction_%_global_identity_guard'").get() as { count: number };
    expect(installed.count).toBe(4);
  } finally { migratedSqlite.close(); }

  const postClient = engine === "libSQL" ? createClient({ url: localUrl }) : undefined;
  if (postClient) await postClient.execute("PRAGMA foreign_keys=ON");
  const migratedDb = postClient
    ? new PrismaClient({ adapter: new PrismaLibSQL(postClient as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]) } as unknown as ConstructorParameters<typeof PrismaClient>[0])
    : new PrismaClient({ datasources: { db: { url: localUrl } } });
  try {
    const requestBeforeNoop = await migratedDb.clubAdmissionRequest.findUniqueOrThrow({ where: { id: requestId } });
    const eventsBeforeNoop = await migratedDb.clubAdmissionEvent.findMany({ where: { admissionRequestId: requestId }, orderBy: { revision: "asc" } });
    const beforeNoop = applicationDatabaseSnapshot(pre0815File);
    await expect(migratedDb.$executeRaw`UPDATE "ClubJoinRequest" SET "status"='APPROVED' WHERE "id"=${requestId}`)
      .rejects.toThrow("ADMISSION_TERMINAL_IMMUTABLE");
    expect(await migratedDb.clubAdmissionRequest.findUniqueOrThrow({ where: { id: requestId } })).toEqual(requestBeforeNoop);
    expect(await migratedDb.clubAdmissionEvent.findMany({ where: { admissionRequestId: requestId }, orderBy: { revision: "asc" } })).toEqual(eventsBeforeNoop);
    expect(await migratedDb.player.findUniqueOrThrow({ where: { id: "compat-legacy-extra" } })).toMatchObject({ ownerUserId: "account-a", isActive: false });
    expect(applicationDatabaseSnapshot(pre0815File)).toEqual(beforeNoop);
  } finally { await migratedDb.$disconnect(); postClient?.close(); }
}, 90000);

const ordinaryClaimIdentityCases = (["SQLite", "libSQL"] as const).flatMap(engine => [
  { engine, label: "active rostered", inactive: false, membership: "active" as const },
  { engine, label: "inactive archived", inactive: true, membership: "archived" as const },
  { engine, label: "inactive unrostered", inactive: true, membership: "none" as const },
]);

it.each(ordinaryClaimIdentityCases)("rejects a raw CLAIM when account A owns a distinct $label identity on $engine", async ({ engine, inactive, membership }) => {
  if (engine === "libSQL") await useLibSqlAdapter();
  await db.player.update({ where: { id: "p2" }, data: { ownerUserId: "account-a", isActive: !inactive } });
  if (membership !== "none") {
    await db.clubMember.create({ data: {
      id: "cross-club-owned-member", clubId: "club-b", playerId: "p2",
      ...(membership === "archived" ? { archivedAt: new Date("2026-10-01T00:00:00.000Z") } : {}),
    } });
  }
  const invite = await ready();
  const before = fullDatabaseSnapshot();
  await expectRawIdentityConflict(executeDirectSql(engine,
    'UPDATE "PlayerInvitation" SET "status"=?,"redeemedByUserId"=?,"redeemedAt"=? WHERE "id"=? AND "status"=?',
    ["REDEEMED", "account-a", Date.now(), invite.id, "ACTIVE"]));
  expect(fullDatabaseSnapshot()).toEqual(before);
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id: invite.id } })).toMatchObject({ status: "ACTIVE", redeemedByUserId: null, redeemedAt: null });
  expect(await db.player.findUniqueOrThrow({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: null, isActive: true });
  expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
}, 30000);

it.each(["SQLite", "libSQL"] as const)("rejects the target owner transition after a valid CLAIM consume when another inactive archived identity is already owned on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  const invite = await ready();
  await executeDirectSql(engine,
    'UPDATE "PlayerInvitation" SET "status"=?,"redeemedByUserId"=?,"redeemedAt"=? WHERE "id"=? AND "status"=?',
    ["REDEEMED", "account-a", Date.now(), invite.id, "ACTIVE"]);
  await db.player.update({ where: { id: "p2" }, data: { ownerUserId: "account-a", isActive: false } });
  await db.clubMember.create({ data: { id: "cross-club-owned-member", clubId: "club-b", playerId: "p2", archivedAt: new Date("2026-10-01T00:00:00.000Z") } });
  const before = fullDatabaseSnapshot();
  await expectRawIdentityConflict(executeDirectSql(engine,
    'UPDATE "User" SET "ownerUserId"=? WHERE "id"=? AND "ownerUserId" IS NULL',
    ["account-a", "historical-player"]));
  expect(fullDatabaseSnapshot()).toEqual(before);
  expect(await db.player.findUniqueOrThrow({ where: { id: "p2" } })).toMatchObject({ ownerUserId: "account-a", isActive: false });
  expect(await db.player.findUniqueOrThrow({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: null, isActive: true });
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id: invite.id } })).toMatchObject({ status: "REDEEMED", redeemedByUserId: "account-a" });
  expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
}, 30000);

it.each(["SQLite", "libSQL"] as const)("retains raw CLAIM issuer authority checks and permits a fresh authorized claimant on %s", async engine => {
  if (engine === "libSQL") await useLibSqlAdapter();
  const cases = [
    { label: "STAFF role", change: () => db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "admin" } }, data: { role: "STAFF" } }), restore: () => db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "admin" } }, data: { role: "OWNER" } }) },
    { label: "MEMBER role", change: () => db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "admin" } }, data: { role: "MEMBER" } }), restore: () => db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "admin" } }, data: { role: "OWNER" } }) },
    { label: "inactive issuer", change: () => db.user.update({ where: { id: "admin" }, data: { isActive: false } }), restore: () => db.user.update({ where: { id: "admin" }, data: { isActive: true } }) },
    { label: "revoked issuer access", change: () => db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "admin" } }, data: { status: "REVOKED" } }), restore: () => db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "admin" } }, data: { status: "ACTIVE", role: "OWNER" } }) },
  ];
  for (const scenario of cases) {
    const invite = await ready();
    await scenario.change();
    const before = fullDatabaseSnapshot();
    let caught: unknown;
    try {
      await executeDirectSql(engine,
        'UPDATE "PlayerInvitation" SET "status"=?,"redeemedByUserId"=?,"redeemedAt"=? WHERE "id"=? AND "status"=?',
        ["REDEEMED", "account-a", Date.now(), invite.id, "ACTIVE"]);
    } catch (error) { caught = error; }
    if (caught === undefined) throw new Error(`The raw CLAIM issuer guard accepted ${scenario.label}.`);
    expect(inspect(caught, { depth: 8, colors: false })).toContain("INVITATION_STATE_INVALID");
    expect(fullDatabaseSnapshot()).toEqual(before);
    expect(await db.playerInvitation.findUniqueOrThrow({ where: { id: invite.id } })).toMatchObject({ status: "ACTIVE", redeemedByUserId: null });
    await scenario.restore();
    await create("REVOKE", invite.id);
  }

  const invite = await ready();
  await executeDirectSql(engine,
    'UPDATE "PlayerInvitation" SET "status"=?,"redeemedByUserId"=?,"redeemedAt"=? WHERE "id"=? AND "status"=?',
    ["REDEEMED", "account-a", Date.now(), invite.id, "ACTIVE"]);
  await executeDirectSql(engine, 'UPDATE "User" SET "ownerUserId"=? WHERE "id"=? AND "ownerUserId" IS NULL', ["account-a", "historical-player"]);
  await db.clubAccess.create({ data: { clubId: "club-a", userId: "account-a", role: "MEMBER", status: "ACTIVE" } });
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id: invite.id } })).toMatchObject({ status: "REDEEMED", redeemedByUserId: "account-a" });
  expect(await db.player.findUniqueOrThrow({ where: { id: "historical-player" } })).toMatchObject({ ownerUserId: "account-a" });
  expect(await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "account-a" } } })).toMatchObject({ status: "ACTIVE", role: "MEMBER" });
  expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
}, 60000);

it.each(["SQLite", "libSQL"] as const)("upgrades without rewriting legacy multi-owned Players; non-identity edits remain allowed on %s", async engine => {
  const migrationFile = path.join(dir, `ordinary-claim-pre-0816-${engine}.db`);
  const expectedLegacyPlayers = [
    { id: "p2", ownerUserId: "account-a" },
    { id: "p3", ownerUserId: "account-a" },
    { id: "p4", ownerUserId: null },
  ];
  adapterFiles.add(migrationFile);
  copyFileSync(baseline, migrationFile);
  const setup = new DatabaseSync(migrationFile);
  try {
    setup.exec("PRAGMA foreign_keys=ON;");
    setup.exec('DROP TRIGGER "PlayerInvitation_claim_identity_guard"; DROP TRIGGER "Player_owner_claim_identity_guard";');
    setup.prepare('DELETE FROM "_prisma_migrations" WHERE "migration_name"=?').run("20261008160000_ordinary_claim_identity_authority");
    setup.prepare('INSERT INTO "Account" ("id","email","passwordHash","name","gender","isActive","sessionVersion","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?)')
      .run("account-a", "legacy-account@example.invalid", "fixture-hash", "account-a", "UNSPECIFIED", 1, 0, 1700000000000, 1700000000000);
    const insertPlayer = setup.prepare('INSERT INTO "User" ("id","name","gender","elo","isActive","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?)');
    for (const id of ["p2", "p3", "p4"]) {
      insertPlayer.run(id, id, "MALE", 1000, 1, 1700000000000, 1700000000000);
    }
    expect(setup.prepare('SELECT "id","ownerUserId" FROM "User" WHERE "id" IN (\'p2\',\'p3\',\'p4\') ORDER BY "id"').all()).toEqual([
      { id: "p2", ownerUserId: null },
      { id: "p3", ownerUserId: null },
      { id: "p4", ownerUserId: null },
    ]);
    const assignLegacyOwner = setup.prepare('UPDATE "User" SET "ownerUserId"=? WHERE "id"=? AND "ownerUserId" IS NULL');
    expect(assignLegacyOwner.run("account-a", "p2").changes).toBe(1);
    expect(assignLegacyOwner.run("account-a", "p3").changes).toBe(1);
    expect(setup.prepare('SELECT "id" FROM "Account" WHERE "id"=?').get("account-a")).toEqual({ id: "account-a" });
    const legacyPlayersBefore = setup.prepare('SELECT "id","ownerUserId" FROM "User" WHERE "id" IN (\'p2\',\'p3\',\'p4\') ORDER BY "id"').all();
    expect(legacyPlayersBefore).toEqual(expectedLegacyPlayers);
    expect(setup.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally { setup.close(); }
  const before = applicationDatabaseSnapshot(migrationFile);
  const localUrl = `file:${migrationFile.replaceAll("\\", "/")}`;
  const migrationSql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261008160000_ordinary_claim_identity_authority/migration.sql"), "utf8");
  if (engine === "SQLite") {
    const sqlite = new DatabaseSync(migrationFile);
    try {
      sqlite.exec(migrationSql);
      expect(applicationDatabaseSnapshot(migrationFile)).toEqual(before);
      expect(sqlite.prepare('SELECT "id" FROM "Account" WHERE "id"=?').get("account-a")).toEqual({ id: "account-a" });
      expect(sqlite.prepare('SELECT "id","ownerUserId" FROM "User" WHERE "id" IN (\'p2\',\'p3\',\'p4\') ORDER BY "id"').all()).toEqual(expectedLegacyPlayers);
      expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      sqlite.prepare('UPDATE "User" SET "name"=? WHERE "id"=?').run("Legacy edited safely", "p2");
      expect(() => sqlite.prepare('UPDATE "User" SET "ownerUserId"=? WHERE "id"=?').run("account-a", "p4")).toThrow("IDENTITY_CONFLICT");
      expect(sqlite.prepare('SELECT "ownerUserId","name" FROM "User" WHERE "id" IN (\'p2\',\'p3\',\'p4\') ORDER BY "id"').all()).toEqual([
        { ownerUserId: "account-a", name: "Legacy edited safely" },
        { ownerUserId: "account-a", name: "p3" },
        { ownerUserId: null, name: "p4" },
      ]);
      expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally { sqlite.close(); }
  } else {
    const client = createClient({ url: localUrl });
    try {
      await client.execute("PRAGMA foreign_keys=ON");
      await client.executeMultiple(migrationSql);
      expect(applicationDatabaseSnapshot(migrationFile)).toEqual(before);
      expect((await client.execute({ sql: 'SELECT "id" FROM "Account" WHERE "id"=?', args: ["account-a"] })).rows).toEqual([{ id: "account-a" }]);
      expect((await client.execute('SELECT "id","ownerUserId" FROM "User" WHERE "id" IN (\'p2\',\'p3\',\'p4\') ORDER BY "id"')).rows).toEqual(expectedLegacyPlayers);
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
      await client.execute({ sql: 'UPDATE "User" SET "name"=? WHERE "id"=?', args: ["Legacy edited safely", "p2"] });
      await expectRawIdentityConflict(client.execute({ sql: 'UPDATE "User" SET "ownerUserId"=? WHERE "id"=?', args: ["account-a", "p4"] }));
      expect((await client.execute('SELECT "ownerUserId","name" FROM "User" WHERE "id" IN (\'p2\',\'p3\',\'p4\') ORDER BY "id"')).rows).toEqual([
        { ownerUserId: "account-a", name: "Legacy edited safely" },
        { ownerUserId: "account-a", name: "p3" },
        { ownerUserId: null, name: "p4" },
      ]);
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    } finally { client.close(); }
  }
}, 60000);
