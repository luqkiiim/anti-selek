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

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { migrateFixture, seedHistoricalAccessReceipt, localOwnershipMigration } from "@/lib/clubOwnership.integration.fixture";
import { invitationExecutionReceipt } from "@/lib/playerInvitationAuthorization";
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
    { id: "duplicate-player", name: "Duplicate Player" },
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


// Active correction/access-restoration execution is deliberately retired in
// release61. Replace its old success/race permutations with endpoint-specific
// denial and immutable historical-reader contracts.
async function state() {
  return { players: await db.player.findMany({ orderBy: { id: "asc" } }), members: await db.clubMember.findMany({ orderBy: { id: "asc" } }), access: await db.clubAccess.findMany({ orderBy: { id: "asc" } }), invitations: await db.playerInvitation.findMany(), requests: await db.clubAdmissionRequest.findMany(), events: await db.clubAdmissionEvent.findMany(), ownership: await db.clubPlayerOwnershipEvent.findMany() };
}
it.each(["CORRECTION", "ACCESS_RESTORE"] as const)("%s issuance is closed for authorized administrators without changing retained profiles", async purpose => {
  const before = await state();
  const response = purpose === "CORRECTION" ? await correctionInvitationPost(apiRequest("/api/clubs/club-a/players/original-player/correction-invitations", correctionInput), context) : await accessRestoreInvitationPost(apiRequest("/api/clubs/club-a/players/original-player/access-restoration-invitations", { recipientAccountId: "recipient", reason: "Historical policy", restoreArchivedRoster: false }), context);
  expect(response.status).toBe(410);
  expect(await response.json()).toMatchObject({ code: "LEGACY_IDENTITY_FLOW_DISABLED" });
  expect(await state()).toEqual(before);
});
it.each(["admin", "recipient", "other", "inactive-admin", null])("closed identity options disclose no account choices to %s", async id => {
  actor = id ? { id } : null; const before = await state();
  const response = await identityOptionsGet(apiRequest("/api/clubs/club-a/players/original-player/identity-options?purpose=CORRECTION"), identityContext);
  expect(response.status).toBe(id ? 410 : 401);
  const body = await response.json(); expect(body).not.toHaveProperty("accounts"); expect(body).not.toHaveProperty("options");
  expect(JSON.stringify(body)).not.toContain("recipient@example.invalid"); expect(await state()).toEqual(before);
});
it.each(["CORRECTION", "ACCESS_RESTORE"] as const)("%s confirmation cannot restore revoked access or supersede pending work", async purpose => {
  actor = { id: "recipient" }; const before = await state();
  const handler = purpose === "CORRECTION" ? invitationConfirmCorrectionPost : invitationConfirmAccessRestorePost;
  const response = await handler(apiRequest("/api/player-invites/missing/confirm", { confirm: true }, "player-invite-missing=unused"), invitationContext("missing"));
  expect(response.status).toBe(410); expect(await response.json()).toMatchObject({ code: "LEGACY_IDENTITY_FLOW_DISABLED" });
  expect(await state()).toEqual(before);
});
it("recovery submission is closed and its read endpoint offers no eligibility account list", async () => {
  actor = { id: "recipient" }; const before = await state();
  const response = await invitationRecoveryPost(apiRequest("/api/player-invites/missing/recovery-request", { idempotencyKey: "legacy" }), invitationContext("missing"));
  expect(response.status).toBe(410); expect(await response.json()).toMatchObject({ code: "LEGACY_IDENTITY_FLOW_DISABLED" });
  const read = await invitationRecoveryGet(apiRequest("/api/player-invites/missing/recovery-request"), invitationContext("missing"));
  expect(read.status).toBe(200); expect(await read.json()).toEqual({ request: null, recovery: null }); expect(await state()).toEqual(before);
});
it("normal claim APIs keep account, origin and payload protection after legacy closure", async () => {
  const issued = await createClaimInvitation("CREATE"); expect(issued.response.status).toBe(200);
  const id = issued.body.invitation!.id; const cookie = await exchangeForContinuation(id, issued.body.secret!);
  actor = null;
  expect((await invitationRedeemPost(apiRequest(`/api/player-invites/${id}/redeem`, { confirm: true }, cookie), invitationContext(id))).status).toBe(401);
  actor = { id: "recipient" };
  const cross = apiRequest(`/api/player-invites/${id}/redeem`, { confirm: true }, cookie); cross.headers.set("origin", "https://other.invalid");
  expect((await invitationRedeemPost(cross, invitationContext(id))).status).toBe(403);
  expect((await invitationRedeemPost(apiRequest(`/api/player-invites/${id}/redeem`, { confirm: false }, cookie), invitationContext(id))).status).toBe(400);
  expect(await db.playerInvitation.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "ACTIVE" });
});
it("genuine pre61 completed authorization remains readable after access revocation while replay writers stay closed", async () => {
  await db.$disconnect();
  const filename = path.join(directory, "historical-receipt.db"); const legacy = new DatabaseSync(filename, { enableDoubleQuotedStringLiterals: true });
  migrateFixture(legacy, "20261011120000_audited_player_ownership_release"); seedHistoricalAccessReceipt(legacy);
  legacy.exec(readFileSync(path.resolve("prisma/migrations", localOwnershipMigration, "migration.sql"), "utf8"));
  legacy.exec(readFileSync(path.resolve("prisma/migrations/20261012200000_club_pairing_preferences/migration.sql"), "utf8")); legacy.close();
  db = new PrismaClient({ datasources: { db: { url: `file:${filename.replaceAll("\\", "/")}` } } });
  const invite = await db.playerInvitation.findUniqueOrThrow({ where: { id: "legacy-invite" } });
  const receipt = await invitationExecutionReceipt(db, invite);
  expect(receipt).toMatchObject({ actorAccountId: "legacy-recipient", authorizedByAccountId: "legacy-admin", purpose: "ACCESS_RESTORE", targetPlayerId: "legacy-player", accessOutcome: "PRESERVED_ACTIVE", sourceRetired: false });
  await db.clubAccess.update({ where: { id: "legacy-access" }, data: { status: "REVOKED", role: "ADMIN" } });
  actor = { id: "legacy-recipient" }; const before = await state();
  const contextResponse = await invitationContextGet(apiRequest("/api/player-invites/legacy-invite"), invitationContext("legacy-invite"));
  expect(contextResponse.status).toBe(200); expect(await contextResponse.json()).toMatchObject({ completedReceipt: receipt });
  const replay = await invitationConfirmAccessRestorePost(apiRequest("/api/player-invites/legacy-invite/confirm-access-restore", { confirm: true }), invitationContext("legacy-invite"));
  expect(replay.status).toBe(410); expect(await invitationExecutionReceipt(db, invite)).toEqual(receipt);
  expect(await state()).toEqual(before);
});
