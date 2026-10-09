import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  accessRestoreInvitationPost,
  adminInvitationPost,
  correctionInvitationPost,
  identityOptionsGet,
  invitationConfirmAccessRestorePost,
  invitationConfirmCorrectionPost,
  invitationContextGet,
  invitationExchangePost,
  invitationRecoveryGet,
  invitationRecoveryPost,
  invitationRedeemPost,
} from "@/lib/playerInvitationApi";

let db: PrismaClient;
let actor: { id: string } | null;
vi.mock("@/lib/prisma", () => ({ get prisma() { return db; } }));
vi.mock("@/lib/auth", () => ({ auth: async () => actor ? { user: actor } : null }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: async () => null }));

const directory = mkdtempSync(path.join(tmpdir(), "authorized-identity-api-"));
const baseline = path.join(directory, "baseline.db");
let caseIndex = 0;
const context = { params: Promise.resolve({ id: "club-a", playerId: "original-player" }) };
const correctionInput = {
  recipientAccountId: "recipient",
  sourcePlayerId: "duplicate-player",
  sourceMemberId: "duplicate-member",
  retireSourcePlayerId: "duplicate-player",
  reason: "Correct the accidental duplicate account connection.",
  authorizedAccessAction: "RESTORE_MEMBER",
  restoreArchivedRoster: false,
} as const;

function apiRequest(url: string, body?: unknown, cookie?: string) {
  return new Request(`https://app.example${url}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin: "https://app.example", "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function issueCorrection(body: unknown = correctionInput) {
  const response = await correctionInvitationPost(apiRequest("/api/clubs/club-a/players/original-player/correction-invitations", body), context);
  return { response, body: await response.json() as { invitation?: { id: string }; secret?: string; code?: string; error?: string } };
}

const invitationContext = (invitationId: string) => ({ params: Promise.resolve({ invitationId }) });
const identityContext = { params: Promise.resolve({ id: "club-a", playerId: "original-player" }) };
const claimAdminContext = { params: Promise.resolve({ id: "club-a", userId: "original-player" }) };

async function exchangeForContinuation(invitationId: string, secret: string) {
  const response = await invitationExchangePost(
    apiRequest(`/api/player-invites/${invitationId}/exchange`, { secret }),
    invitationContext(invitationId),
  );
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0];
}

async function createClaimInvitation(action: "CREATE" | "REPLACE", invitationId?: string) {
  const response = await adminInvitationPost(
    apiRequest("/api/clubs/club-a/players/original-player/invitations", { action, ...(invitationId ? { invitationId } : {}) }),
    claimAdminContext,
  );
  return { response, body: await response.json() as { invitation?: { id: string }; secret?: string; error?: string; code?: string } };
}

beforeAll(() => {
  writeFileSync(baseline, "");
  const databaseUrl = `file:${baseline.replaceAll("\\", "/")}`;
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl, USE_TURSO: "false", TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "" },
    stdio: "pipe",
  });
}, 60_000);

beforeEach(async () => {
  await db?.$disconnect();
  const file = path.join(directory, `case-${caseIndex++}.db`);
  copyFileSync(baseline, file);
  db = new PrismaClient({ datasources: { db: { url: `file:${file.replaceAll("\\", "/")}` } } });
  await db.user.createMany({ data: [
    { id: "admin", name: "Admin", email: "admin@example.invalid", passwordHash: "fixture" },
    { id: "recipient", name: "Recipient", email: "recipient@example.invalid", passwordHash: "fixture" },
    { id: "other", name: "Other", email: "other@example.invalid", passwordHash: "fixture" },
    { id: "inactive-admin", name: "Inactive Admin", email: "inactive-admin@example.invalid", passwordHash: "fixture", isActive: false },
  ] });
  await db.club.createMany({ data: [
    { id: "club-a", name: "Club A", createdById: "admin" },
    { id: "club-b", name: "Club B", createdById: "other" },
  ] });
  await db.clubAccess.createMany({ data: [
    { clubId: "club-a", userId: "admin", role: "OWNER" },
    { clubId: "club-a", userId: "recipient", role: "ADMIN", status: "REVOKED" },
    { clubId: "club-b", userId: "other", role: "OWNER" },
  ] });
  await db.player.createMany({ data: [
    { id: "original-player", name: "Original Player" },
    { id: "duplicate-player", name: "Duplicate Player", ownerUserId: "recipient" },
  ] });
  await db.clubMember.createMany({ data: [
    { id: "original-member", clubId: "club-a", playerId: "original-player", elo: 1400 },
    { id: "duplicate-member", clubId: "club-a", playerId: "duplicate-player", elo: 1000, archivedAt: new Date("2026-10-01T00:00:00.000Z") },
  ] });
  actor = { id: "admin" };
});

afterAll(async () => {
  await db?.$disconnect();
  const resolvedDirectory = path.resolve(directory);
  if (!resolvedDirectory.startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unsafe fixture cleanup path");
  rmSync(resolvedDirectory, { recursive: true, force: true });
});
afterEach(() => vi.useRealTimers());

it("replaces a correction invitation for the same source Player without leaving duplicate reservations", async () => {
  const first = await issueCorrection();
  expect(first.response.status, `${first.body.code ?? "no-code"}: ${first.body.error ?? "no error message"}`).toBe(200);
  expect(first.body.invitation?.id).toBeTruthy();

  const replacement = await issueCorrection({ ...correctionInput, replaceInvitationId: first.body.invitation!.id });
  expect(replacement.response.status, `${replacement.body.code ?? "no-code"}: ${replacement.body.error ?? "no error message"}`).toBe(200);
  expect(replacement.body.invitation?.id).toBeTruthy();
  expect(replacement.body.invitation?.id).not.toBe(first.body.invitation?.id);
  expect(await db.playerInvitation.findUnique({ where: { id: first.body.invitation!.id } })).toMatchObject({ status: "REVOKED" });
  expect(await db.playerInvitation.findUnique({ where: { id: replacement.body.invitation!.id } })).toMatchObject({ status: "ACTIVE", purpose: "CORRECTION", sourcePlayerId: "duplicate-player" });
  expect(await db.playerInvitation.count({ where: { purpose: "CORRECTION", sourcePlayerId: "duplicate-player", status: "ACTIVE" } })).toBe(1);
});

it("terminalizes an expired source reservation before issuing a replacement correction", async () => {
  const realNow = Date.now();
  vi.useFakeTimers();
  vi.setSystemTime(realNow);
  const first = await issueCorrection();
  expect(first.response.status, `${first.body.code ?? "no-code"}: ${first.body.error ?? "no error message"}`).toBe(200);
  const oldInvitationId = first.body.invitation!.id;
  vi.setSystemTime(realNow + 30 * 24 * 60 * 60 * 1000 + 1000);

  const replacement = await issueCorrection();
  expect(replacement.response.status, `${replacement.body.code ?? "no-code"}: ${replacement.body.error ?? "no error message"}`).toBe(200);
  expect(replacement.body.invitation?.id).toBeTruthy();
  expect(replacement.body.invitation?.id).not.toBe(oldInvitationId);
  expect(await db.playerInvitation.findUnique({ where: { id: oldInvitationId } })).toMatchObject({ status: "EXPIRED" });
  expect(await db.playerInvitation.count({ where: { purpose: "CORRECTION", sourcePlayerId: "duplicate-player", status: "ACTIVE" } })).toBe(1);
});

it("replays the immutable execution receipt after later access revocation without restoring access or adding events", async () => {
  const issued = await issueCorrection();
  expect(issued.response.status, `${issued.body.code ?? "no-code"}: ${issued.body.error ?? "no error message"}`).toBe(200);
  const invitationId = issued.body.invitation!.id;
  expect(issued.body.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);

  const continuationCookie = await exchangeForContinuation(invitationId, issued.body.secret!);

  actor = { id: "recipient" };
  const confirmation = await invitationConfirmCorrectionPost(
    apiRequest(`/api/player-invites/${invitationId}/confirm-correction`, { confirm: true }, continuationCookie),
    invitationContext(invitationId),
  );
  expect(confirmation.status).toBe(200);
  const firstResult = await confirmation.json() as { receipt: Record<string, unknown> };
  expect(firstResult.receipt).toMatchObject({
    purpose: "CORRECTION",
    actorAccountId: "recipient",
    authorizedByAccountId: "admin",
    targetPlayerId: "original-player",
    sourcePlayerId: "duplicate-player",
    sourceRetired: true,
    accessOutcome: "RESTORED_MEMBER",
    accessBefore: { status: "REVOKED", role: "ADMIN" },
    accessAfter: { status: "ACTIVE", role: "MEMBER" },
  });
  const wrongPurposeReplay = await invitationConfirmAccessRestorePost(
    apiRequest(`/api/player-invites/${invitationId}/confirm-access-restore`, { confirm: true }, continuationCookie),
    invitationContext(invitationId),
  );
  expect(wrongPurposeReplay.status).toBe(410);
  expect(await wrongPurposeReplay.json()).toMatchObject({ code: "PURPOSE_MISMATCH" });
  const ordinaryReplay = await invitationRedeemPost(
    apiRequest(`/api/player-invites/${invitationId}/redeem`, { confirm: true }, continuationCookie),
    invitationContext(invitationId),
  );
  expect(ordinaryReplay.status).toBe(410);
  expect(await ordinaryReplay.json()).toMatchObject({ code: "INVITATION_UNAVAILABLE" });
  const recoveryReplay = await invitationRecoveryPost(
    apiRequest(`/api/player-invites/${invitationId}/recovery-request`, { idempotencyKey: "completed-wrong-purpose" }, continuationCookie),
    invitationContext(invitationId),
  );
  expect(recoveryReplay.status).toBe(403);
  expect(await recoveryReplay.json()).toMatchObject({ code: "PURPOSE_MISMATCH" });
  const initialInvitationEvents = await db.playerInvitationEvent.count({ where: { invitationId } });
  const initialAdmissionEvents = await db.clubAdmissionEvent.count({ where: { admissionRequest: { originInvitationId: invitationId } } });
  const restoredAccess = await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-a", userId: "recipient" } } });
  expect(restoredAccess).toMatchObject({ status: "ACTIVE", role: "MEMBER" });

  await db.clubAccess.update({ where: { id: restoredAccess.id }, data: { status: "REVOKED", role: "ADMIN" } });
  const laterAccess = await db.clubAccess.findUniqueOrThrow({ where: { id: restoredAccess.id } });
  expect(laterAccess).toMatchObject({ status: "REVOKED", role: "ADMIN" });

  const contextResponse = await invitationContextGet(
    apiRequest(`/api/player-invites/${invitationId}`, undefined, continuationCookie),
    invitationContext(invitationId),
  );
  expect(contextResponse.status).toBe(200);
  const contextBody = await contextResponse.json() as { completedReceipt?: Record<string, unknown> };
  expect(contextBody.completedReceipt).toEqual(firstResult.receipt);

  const replay = await invitationConfirmCorrectionPost(
    apiRequest(`/api/player-invites/${invitationId}/confirm-correction`, { confirm: true }, continuationCookie),
    invitationContext(invitationId),
  );
  expect(replay.status).toBe(200);
  const replayBody = await replay.json() as { receipt: Record<string, unknown> };
  expect(replayBody.receipt).toEqual(firstResult.receipt);
  expect(await db.clubAccess.findUniqueOrThrow({ where: { id: restoredAccess.id } })).toEqual(laterAccess);
  expect(await db.playerInvitationEvent.count({ where: { invitationId } })).toBe(initialInvitationEvents);
  expect(await db.clubAdmissionEvent.count({ where: { admissionRequest: { originInvitationId: invitationId } } })).toBe(initialAdmissionEvents);
  expect(await db.clubAdmissionRequest.findFirstOrThrow({ where: { originInvitationId: invitationId } })).toMatchObject({ status: "APPROVED", requesterUserId: "recipient", requestedPlayerId: "original-player", approvedPlayerId: "original-player" });
});

it("requires a local club administrator and rejects self-approval, missing reasons, and caller-selected identities", async () => {
  const routeContext = (id = "club-a") => ({ params: Promise.resolve({ id, playerId: "original-player" }) });
  actor = null;
  const unauthenticated = await identityOptionsGet(apiRequest("/api/clubs/club-a/players/original-player/identity-options?purpose=CORRECTION"), routeContext());
  expect(unauthenticated.status).toBe(401);

  actor = { id: "other" };
  const globalOnly = await identityOptionsGet(apiRequest("/api/clubs/club-a/players/original-player/identity-options?purpose=CORRECTION"), routeContext());
  expect(globalOnly.status).toBe(403);
  expect(await globalOnly.json()).toMatchObject({ code: "ADMIN_REQUIRED" });

  actor = { id: "admin" };
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "admin" } }, data: { role: "STAFF" } });
  const staff = await correctionInvitationPost(apiRequest("/api/clubs/club-a/players/original-player/correction-invitations", correctionInput), routeContext());
  expect(staff.status).toBe(403);
  expect(await staff.json()).toMatchObject({ code: "ADMIN_REQUIRED" });
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "admin" } }, data: { role: "OWNER" } });

  actor = { id: "inactive-admin" };
  await db.clubAccess.create({ data: { clubId: "club-a", userId: "inactive-admin", role: "OWNER" } });
  const inactiveIssuer = await identityOptionsGet(apiRequest("/api/clubs/club-a/players/original-player/identity-options?purpose=CORRECTION"), routeContext());
  expect(inactiveIssuer.status).toBe(403);
  expect(await inactiveIssuer.json()).toMatchObject({ code: "ACCOUNT_REQUIRED" });

  actor = { id: "admin" };
  for (const body of [
    { ...correctionInput, reason: undefined },
    { ...correctionInput, issuerAccountId: "other" },
    { ...correctionInput, targetPlayerId: "duplicate-player" },
    { ...correctionInput, retireSourcePlayerId: "original-player" },
  ]) {
    const result = await correctionInvitationPost(apiRequest("/api/clubs/club-a/players/original-player/correction-invitations", body), routeContext());
    expect(result.status).toBe(400);
  }
  const self = await correctionInvitationPost(apiRequest("/api/clubs/club-a/players/original-player/correction-invitations", { ...correctionInput, recipientAccountId: "admin" }), routeContext());
  expect(self.status).toBe(403);
  expect(await self.json()).toMatchObject({ code: "SELF_APPROVAL" });
  expect(await db.playerInvitation.count()).toBe(0);
});

it("keeps unauthenticated and wrong-account invitation context generic and rejects wrong-purpose APIs", async () => {
  const issued = await issueCorrection();
  expect(issued.response.status).toBe(200);
  const invitationId = issued.body.invitation!.id;
  const continuationCookie = await exchangeForContinuation(invitationId, issued.body.secret!);

  actor = null;
  const unauthContext = await invitationContextGet(apiRequest(`/api/player-invites/${invitationId}`), invitationContext(invitationId));
  expect(unauthContext.status).toBe(200);
  expect(await unauthContext.json()).toMatchObject({ status: "ACCOUNT_REQUIRED" });
  const unauthConfirm = await invitationConfirmCorrectionPost(apiRequest(`/api/player-invites/${invitationId}/confirm-correction`, { confirm: true }, continuationCookie), invitationContext(invitationId));
  expect(unauthConfirm.status).toBe(401);
  expect(await unauthConfirm.json()).toMatchObject({ code: "ACCOUNT_REQUIRED" });

  actor = { id: "other" };
  const wrongContext = await invitationContextGet(apiRequest(`/api/player-invites/${invitationId}`, undefined, continuationCookie), invitationContext(invitationId));
  expect(wrongContext.status).toBe(200);
  const wrongContextBody = await wrongContext.json() as Record<string, unknown>;
  expect(wrongContextBody).toMatchObject({ status: "WRONG_ACCOUNT" });
  expect(wrongContextBody).not.toHaveProperty("target");
  expect(wrongContextBody).not.toHaveProperty("source");
  const wrongConfirm = await invitationConfirmCorrectionPost(apiRequest(`/api/player-invites/${invitationId}/confirm-correction`, { confirm: true }, continuationCookie), invitationContext(invitationId));
  expect(wrongConfirm.status).toBe(403);
  expect(await wrongConfirm.json()).toMatchObject({ code: "WRONG_ACCOUNT" });

  actor = { id: "recipient" };
  const wrongRoute = await invitationConfirmAccessRestorePost(apiRequest(`/api/player-invites/${invitationId}/confirm-access-restore`, { confirm: true }, continuationCookie), invitationContext(invitationId));
  expect(wrongRoute.status).toBe(410);
  expect(await wrongRoute.json()).toMatchObject({ code: "PURPOSE_MISMATCH" });
  const ordinaryRedeem = await invitationRedeemPost(apiRequest(`/api/player-invites/${invitationId}/redeem`, { confirm: true }, continuationCookie), invitationContext(invitationId));
  expect(ordinaryRedeem.status).toBe(410);
  expect(await ordinaryRedeem.json()).toMatchObject({ code: "INVITATION_UNAVAILABLE" });
  const recoveryGet = await invitationRecoveryGet(apiRequest(`/api/player-invites/${invitationId}/recovery-request`, undefined, continuationCookie), invitationContext(invitationId));
  expect(recoveryGet.status).toBe(403);
  expect(await recoveryGet.json()).toMatchObject({ code: "PURPOSE_MISMATCH" });
  const recoveryPost = await invitationRecoveryPost(apiRequest(`/api/player-invites/${invitationId}/recovery-request`, { idempotencyKey: "wrong-purpose" }, continuationCookie), invitationContext(invitationId));
  const recoveryPostBody = await recoveryPost.json() as { code?: string; error?: string };
  expect(recoveryPost.status, (recoveryPostBody.code ?? "no-code") + ": " + (recoveryPostBody.error ?? "no error message")).toBe(403);
  expect(recoveryPostBody).toMatchObject({ code: "PURPOSE_MISMATCH" });
  expect(await db.playerInvitation.findUnique({ where: { id: invitationId } })).toMatchObject({ status: "ACTIVE", purpose: "CORRECTION" });
  expect(await db.clubAdmissionRequest.count()).toBe(0);
  expect(await db.clubMember.findUnique({ where: { id: "duplicate-member" } })).toMatchObject({ retiredByAdmissionEventId: null });
});

it("rejects confirmation when the issuing admin access revision changed after authorization", async () => {
  const issuerCase = await issueCorrection();
  expect(issuerCase.response.status).toBe(200);
  const issuerCookie = await exchangeForContinuation(issuerCase.body.invitation!.id, issuerCase.body.secret!);
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "admin" } }, data: { role: "ADMIN" } });
  actor = { id: "recipient" };
  const issuerChanged = await invitationConfirmCorrectionPost(apiRequest(`/api/player-invites/${issuerCase.body.invitation!.id}/confirm-correction`, { confirm: true }, issuerCookie), invitationContext(issuerCase.body.invitation!.id));
  expect(issuerChanged.status).toBe(409);
  expect(await issuerChanged.json()).toMatchObject({ code: "AUTHORIZER_CHANGED" });
  expect(await db.playerInvitation.findUnique({ where: { id: issuerCase.body.invitation!.id } })).toMatchObject({ status: "ACTIVE" });
});

it("rejects confirmation when the recipient access snapshot changed after authorization", async () => {
  const recipientCase = await issueCorrection();
  expect(recipientCase.response.status).toBe(200);
  const recipientCookie = await exchangeForContinuation(recipientCase.body.invitation!.id, recipientCase.body.secret!);
  await db.clubAccess.update({ where: { clubId_userId: { clubId: "club-a", userId: "recipient" } }, data: { role: "STAFF" } });
  actor = { id: "recipient" };
  const recipientChanged = await invitationConfirmCorrectionPost(apiRequest(`/api/player-invites/${recipientCase.body.invitation!.id}/confirm-correction`, { confirm: true }, recipientCookie), invitationContext(recipientCase.body.invitation!.id));
  const recipientChangedBody = await recipientChanged.json() as { code?: string; error?: string };
  expect(recipientChanged.status, (recipientChangedBody.code ?? "no-code") + ": " + (recipientChangedBody.error ?? "no error message")).toBe(409);
  expect(recipientChangedBody).toMatchObject({ code: "RECIPIENT_ACCESS_CHANGED" });
  expect(await db.playerInvitation.findUnique({ where: { id: recipientCase.body.invitation!.id } })).toMatchObject({ status: "ACTIVE" });
  expect(await db.clubMember.findUnique({ where: { id: "duplicate-member" } })).toMatchObject({ retiredByAdmissionEventId: null });
});

it("restores only the exact owned archived roster row and preserves active access role on access-only confirmation", async () => {
  await db.player.update({ where: { id: "original-player" }, data: { ownerUserId: "other" } });
  await db.clubMember.update({ where: { id: "original-member" }, data: { archivedAt: new Date("2026-10-02T00:00:00.000Z") } });
  await db.clubAccess.create({ data: { clubId: "club-a", userId: "other", status: "ACTIVE", role: "ADMIN" } });
  const issue = await accessRestoreInvitationPost(apiRequest("/api/clubs/club-a/players/original-player/access-restore-invitations", {
    recipientAccountId: "other", reason: "Restore this existing account's exact archived club access.",
    authorizedAccessAction: "PRESERVE_ACTIVE", restoreArchivedRoster: true,
  }), identityContext);
  expect(issue.status).toBe(200);
  const issued = await issue.json() as { invitation: { id: string }; secret: string };
  const cookie = await exchangeForContinuation(issued.invitation.id, issued.secret);
  const ownershipBefore = await db.player.findMany({ where: { id: { in: ["original-player", "duplicate-player"] } }, select: { id: true, ownerUserId: true, isActive: true }, orderBy: { id: "asc" } });
  actor = { id: "other" };
  const confirmation = await invitationConfirmAccessRestorePost(apiRequest(`/api/player-invites/${issued.invitation.id}/confirm-access-restore`, { confirm: true }, cookie), invitationContext(issued.invitation.id));
  expect(confirmation.status).toBe(200);
  const body = await confirmation.json() as { receipt: Record<string, unknown> };
  expect(body.receipt).toMatchObject({ purpose: "ACCESS_RESTORE", sourceRetired: false, accessOutcome: "PRESERVED_ACTIVE", rosterOutcome: "UNARCHIVED_EXISTING" });
  expect(await db.player.findMany({ where: { id: { in: ["original-player", "duplicate-player"] } }, select: { id: true, ownerUserId: true, isActive: true }, orderBy: { id: "asc" } })).toEqual(ownershipBefore);
  expect(await db.player.findMany({ where: { ownerUserId: "other" }, select: { id: true }, orderBy: { id: "asc" } })).toEqual([{ id: "original-player" }]);
  expect(await db.clubMember.findUnique({ where: { id: "original-member" } })).toMatchObject({ archivedAt: null, retiredByAdmissionEventId: null });
  expect(await db.clubMember.findUnique({ where: { id: "duplicate-member" } })).toMatchObject({ retiredByAdmissionEventId: null });
  expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "other" } } })).toMatchObject({ status: "ACTIVE", role: "ADMIN" });
});

async function prepareRestorationOwner() {
  await db.player.update({ where: { id: "original-player" }, data: { ownerUserId: "other" } });
  await db.clubMember.update({ where: { id: "original-member" }, data: { ownerUserId: "other" } });
  await db.clubAccess.create({ data: { clubId: "club-a", userId: "other", status: "REVOKED", role: "ADMIN" } });
}

async function addDistinctOwnedPlayerInAnotherClub() {
  await db.player.create({ data: { id: "other-club-owned-player", name: "Other Club Player", ownerUserId: "other" } });
  await db.clubMember.create({ data: { id: "other-club-owned-member", clubId: "club-b", playerId: "other-club-owned-player", ownerUserId: "other" } });
}

const restoreOtherAccount = {
  recipientAccountId: "other",
  reason: "Restore the existing Player owner after reviewing their other club identity.",
  authorizedAccessAction: "RESTORE_MEMBER",
  restoreArchivedRoster: false,
} as const;

it("rejects access-restoration issuance when the recipient owns a distinct nonretired Player in another club", async () => {
  await prepareRestorationOwner();
  await addDistinctOwnedPlayerInAnotherClub();

  const issue = await accessRestoreInvitationPost(
    apiRequest("/api/clubs/club-a/players/original-player/access-restore-invitations", restoreOtherAccount),
    identityContext,
  );
  const body = await issue.json() as { code?: string; error?: string };
  expect(issue.status, `${body.code ?? "no-code"}: ${body.error ?? "no error message"}`).toBe(409);
  expect(body).toMatchObject({ code: "IDENTITY_CONFLICT" });
  expect(await db.playerInvitation.count({ where: { purpose: "ACCESS_RESTORE" } })).toBe(0);
  expect(await db.player.findMany({ where: { ownerUserId: "other" }, select: { id: true }, orderBy: { id: "asc" } })).toEqual([
    { id: "original-player" },
    { id: "other-club-owned-player" },
  ]);
});

it("revalidates cross-club Player conflicts at exact-account access-restoration confirmation", async () => {
  await prepareRestorationOwner();
  const issue = await accessRestoreInvitationPost(
    apiRequest("/api/clubs/club-a/players/original-player/access-restore-invitations", restoreOtherAccount),
    identityContext,
  );
  expect(issue.status).toBe(200);
  const issued = await issue.json() as { invitation: { id: string }; secret: string };
  const cookie = await exchangeForContinuation(issued.invitation.id, issued.secret);
  await addDistinctOwnedPlayerInAnotherClub();

  actor = { id: "other" };
  const confirmation = await invitationConfirmAccessRestorePost(
    apiRequest(`/api/player-invites/${issued.invitation.id}/confirm-access-restore`, { confirm: true }, cookie),
    invitationContext(issued.invitation.id),
  );
  const body = await confirmation.json() as { code?: string; error?: string };
  expect(confirmation.status, `${body.code ?? "no-code"}: ${body.error ?? "no error message"}`).toBe(409);
  expect(body).toMatchObject({ code: "IDENTITY_CONFLICT" });
  expect(await db.playerInvitation.findUnique({ where: { id: issued.invitation.id } })).toMatchObject({ status: "ACTIVE", purpose: "ACCESS_RESTORE", redeemedByUserId: null });
  expect(await db.clubAdmissionRequest.count()).toBe(0);
  expect(await db.clubAdmissionEvent.count({ where: { action: "EXECUTE_AUTHORIZED_ACCESS_RESTORE" } })).toBe(0);
  expect(await db.player.findUnique({ where: { id: "original-player" } })).toMatchObject({ ownerUserId: "other", isActive: true });
  expect(await db.clubMember.findUnique({ where: { id: "original-member" } })).toMatchObject({ ownerUserId: "other", archivedAt: null, retiredByAdmissionEventId: null });
  expect(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: "club-a", userId: "other" } } })).toMatchObject({ status: "REVOKED", role: "ADMIN" });
});

it("requires explicit matched-preview consent to cancel only the same-target unavailable CLAIM recovery", async () => {
  const originalClaim = await createClaimInvitation("CREATE");
  expect(originalClaim.response.status).toBe(200);
  const oldInviteId = originalClaim.body.invitation!.id;
  const oldHandle = await exchangeForContinuation(oldInviteId, originalClaim.body.secret!);
  actor = { id: "recipient" };
  const oldRequest = await invitationRecoveryPost(apiRequest(`/api/player-invites/${oldInviteId}/recovery-request`, { idempotencyKey: "old-recovery" }, oldHandle), invitationContext(oldInviteId));
  expect(oldRequest.status).toBe(200);
  const oldRequestBody = await oldRequest.json() as { request: { id: string; revision: number } };

  actor = { id: "admin" };
  const replacementClaim = await createClaimInvitation("REPLACE", oldInviteId);
  expect(replacementClaim.response.status).toBe(200);
  const replacementClaimId = replacementClaim.body.invitation!.id;
  actor = { id: "recipient" };
  const unavailableOldContext = await invitationContextGet(apiRequest(`/api/player-invites/${oldInviteId}`), invitationContext(oldInviteId));
  expect(unavailableOldContext.status).toBe(200);
  const unavailableOldBody = await unavailableOldContext.json() as Record<string, unknown>;
  expect(unavailableOldBody).toMatchObject({ purpose: "CLAIM", status: "UNAVAILABLE", invitationAvailability: "REPLACED" });
  expect(unavailableOldBody).not.toHaveProperty("player");
  expect(unavailableOldBody).not.toHaveProperty("target");
  expect(unavailableOldBody).not.toHaveProperty("club");
  const ownRecoveryStatus = await invitationRecoveryGet(apiRequest(`/api/player-invites/${oldInviteId}/recovery-request`), invitationContext(oldInviteId));
  expect(ownRecoveryStatus.status).toBe(200);
  expect(await ownRecoveryStatus.json()).toMatchObject({ request: { id: oldRequestBody.request.id, status: "PENDING" } });

  actor = { id: "admin" };
  const correction = await issueCorrection({ ...correctionInput, replaceInvitationId: replacementClaimId });
  expect(correction.response.status, `${correction.body.code ?? "no-code"}: ${correction.body.error ?? "no error message"}`).toBe(200);
  const correctionId = correction.body.invitation!.id;
  const correctionCookie = await exchangeForContinuation(correctionId, correction.body.secret!);

  actor = { id: "recipient" };
  const matched = await invitationContextGet(apiRequest(`/api/player-invites/${correctionId}`, undefined, correctionCookie), invitationContext(correctionId));
  expect(matched.status).toBe(200);
  const matchedBody = await matched.json() as { status: string; supersedableRecoveryRequest: { requestId: string; revision: number; originInvitationId: string; invitationAvailability: string } | null };
  expect(matchedBody).toMatchObject({
    status: "MATCHED",
    supersedableRecoveryRequest: { requestId: oldRequestBody.request.id, revision: oldRequestBody.request.revision, originInvitationId: oldInviteId, invitationAvailability: "REPLACED" },
  });

  const missingConsent = await invitationConfirmCorrectionPost(apiRequest(`/api/player-invites/${correctionId}/confirm-correction`, { confirm: true }, correctionCookie), invitationContext(correctionId));
  expect(missingConsent.status).toBe(409);
  expect(await missingConsent.json()).toMatchObject({ code: "PENDING_REQUEST_SUPERSEDE_REQUIRED" });
  const staleConsent = await invitationConfirmCorrectionPost(apiRequest(`/api/player-invites/${correctionId}/confirm-correction`, {
    confirm: true, supersedeRecoveryRequest: { requestId: oldRequestBody.request.id, revision: oldRequestBody.request.revision + 1 },
  }, correctionCookie), invitationContext(correctionId));
  expect(staleConsent.status).toBe(409);
  expect(await staleConsent.json()).toMatchObject({ code: "PENDING_REQUEST_CHANGED" });
  expect(await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: oldRequestBody.request.id } })).toMatchObject({ status: "PENDING", revision: oldRequestBody.request.revision });

  const confirmed = await invitationConfirmCorrectionPost(apiRequest(`/api/player-invites/${correctionId}/confirm-correction`, {
    confirm: true, supersedeRecoveryRequest: { requestId: matchedBody.supersedableRecoveryRequest!.requestId, revision: matchedBody.supersedableRecoveryRequest!.revision },
  }, correctionCookie), invitationContext(correctionId));
  const confirmedResult = await confirmed.clone().json() as { code?: string; error?: string };
  expect(confirmed.status, (confirmedResult.code ?? "no-code") + ": " + (confirmedResult.error ?? "no error message")).toBe(200);
  const confirmationBody = await confirmed.json() as { receipt: { supersededRecoveryRequest: Record<string, unknown> } };
  expect(confirmationBody.receipt.supersededRecoveryRequest).toMatchObject({
    requestId: oldRequestBody.request.id,
    previousRevision: oldRequestBody.request.revision,
    cancelledRevision: oldRequestBody.request.revision + 1,
    originInvitationId: oldInviteId,
  });
  const cancelled = await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: oldRequestBody.request.id }, include: { events: true } });
  expect(cancelled).toMatchObject({ status: "CANCELLED", revision: oldRequestBody.request.revision + 1 });
  expect(cancelled.events).toContainEqual(expect.objectContaining({ action: "CANCEL", actorUserId: "recipient", revision: oldRequestBody.request.revision + 1 }));
  expect(await db.clubAdmissionRequest.findFirstOrThrow({ where: { originInvitationId: correctionId } })).toMatchObject({ status: "APPROVED", requesterUserId: "recipient" });
});

it("does not supersede an unrelated pending admission even when a purpose-specific invite is confirmed", async () => {
  const correction = await issueCorrection();
  expect(correction.response.status).toBe(200);
  const correctionId = correction.body.invitation!.id;
  const cookie = await exchangeForContinuation(correctionId, correction.body.secret!);
  const pending = await db.clubAdmissionRequest.create({ data: {
    clubId: "club-a", requesterUserId: "recipient", kind: "NEW_PLAYER", status: "PENDING", proposedPlayerName: "Different request",
  } });
  actor = { id: "recipient" };
  const contextResponse = await invitationContextGet(apiRequest(`/api/player-invites/${correctionId}`, undefined, cookie), invitationContext(correctionId));
  const contextBody = await contextResponse.json() as { supersedableRecoveryRequest: unknown };
  expect(contextBody.supersedableRecoveryRequest).toBeNull();
  const confirm = await invitationConfirmCorrectionPost(apiRequest(`/api/player-invites/${correctionId}/confirm-correction`, { confirm: true }, cookie), invitationContext(correctionId));
  expect(confirm.status).toBe(409);
  expect(await confirm.json()).toMatchObject({ code: "PENDING_REQUEST_CONFLICT" });
  expect(await db.clubAdmissionRequest.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ status: "PENDING", revision: 0 });
  expect(await db.playerInvitation.findUnique({ where: { id: correctionId } })).toMatchObject({ status: "ACTIVE" });
  expect(await db.clubMember.findUnique({ where: { id: "duplicate-member" } })).toMatchObject({ retiredByAdmissionEventId: null });
});
