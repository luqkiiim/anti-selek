import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { admissionTransaction } from "./clubAdmissions";
import { assertRulesAgreed, getCollaborationState, mutateCollaboration } from "./sessionCollaboration";
import { createLineupRow, editLineupRow, isLineupRowReady, startLineupRow } from "./sessionLineup";

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () => null), checkInvalidTargetRateLimit: vi.fn(async () => null), invalidTargetResponse: vi.fn(),
}));

const database = path.join(tmpdir(), `collaboration-${randomUUID()}.db`);
const databaseUrl = `file:${database}`;
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const tx = <T>(operation: (client: Prisma.TransactionClient) => Promise<T>) => admissionTransaction(db, operation);

beforeAll(async () => {
  await writeFile(database, "");
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl, TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "" }, stdio: "pipe",
  });
}, 30_000);
afterAll(async () => {
  await db.$disconnect();
  await Promise.all(["", "-journal", "-wal", "-shm"].map(suffix => rm(database + suffix, { force: true })));
});

async function fixture() {
  const prefix = randomUUID();
  const host = { userId: `${prefix}-host` };
  const partner = { userId: `${prefix}-partner` };
  const clubs = [`${prefix}-home`, `${prefix}-away`];
  const players = Array.from({ length: 8 }, (_, i) => `${prefix}-p${i}`);
  for (const [i, actor] of [host, partner].entries()) {
    await db.user.create({ data: { id: actor.userId, email: `${actor.userId}@example.test`, name: "Admin", passwordHash: "unused-test-hash" } });
    await db.club.create({ data: { id: clubs[i], name: clubs[i], createdById: actor.userId } });
    await db.clubAccess.create({ data: { clubId: clubs[i], userId: actor.userId, role: "OWNER" } });
    for (const playerId of players.slice(i * 4, i * 4 + 4)) {
      await db.player.create({ data: { id: playerId, name: playerId } });
      await db.clubMember.create({ data: { clubId: clubs[i], playerId } });
    }
  }
  const session = await db.session.create({ data: {
    code: prefix, name: "Club friendly", clubId: clubs[0], collaborationVersion: 2,
    ratingPolicyVersion: 2, collabFormat: "INTERCLUB", schedulingMode: "LINEUP", ratingMode: "UNRATED",
    scoringFormat: "BEST_OF_THREE", autoQueueEnabled: false,
    sessionClubs: { create: clubs.map((clubId, i) => ({ clubId, role: i ? "PARTNER" : "HOST", status: "ACCEPTED" })) },
    courts: { create: [{ courtNumber: 1 }, { courtNumber: 2 }] },
    players: { create: players.map((playerId, i) => ({ playerId, profileClubId: clubs[i < 4 ? 0 : 1], representingClubId: clubs[i < 4 ? 0 : 1] })) },
  }, include: { courts: true } });
  async function readyRow(offset = 0) {
    let row = await tx(client => createLineupRow(client, session.id, host));
    row = await tx(client => editLineupRow(client, session.id, row.id, host, { action: "pair", revision: row.revision, clubId: clubs[0], playerIds: players.slice(offset, offset + 2) }));
    row = await tx(client => editLineupRow(client, session.id, row.id, partner, { action: "pair", revision: row.revision, clubId: clubs[1], playerIds: players.slice(4 + offset, 6 + offset) }));
    row = await tx(client => editLineupRow(client, session.id, row.id, host, { action: "confirm", revision: row.revision, clubId: clubs[0] }));
    return tx(client => editLineupRow(client, session.id, row.id, partner, { action: "confirm", revision: row.revision, clubId: clubs[1] }));
  }
  async function agreeAndStart() {
    for (const [i, actor] of [host, partner].entries()) await tx(client => mutateCollaboration(client, session.id, actor, { action: "confirmRules", clubId: clubs[i], revision: 0 }));
    await db.session.update({ where: { id: session.id }, data: { status: "ACTIVE" } });
  }
  return { host, partner, clubs, players, session, readyRow, agreeAndStart };
}

describe("shared collaboration against migrated SQLite", () => {
  it("creates empty invitations without visitor access and pins mixed-club players to the host profile", async () => {
    const f = await fixture();
    const { createSessionForUser } = await import("@/app/api/sessions/createSessionService");
    const { parseCreateSessionRequest } = await import("@/app/api/sessions/createSessionRequest");
    const create = (fields: Record<string, unknown>) => createSessionForUser({ requesterId: f.host.userId, requesterIsAdmin: false, input: parseCreateSessionRequest({ name: "New friendly", clubId: f.clubs[0], partnerClubId: f.clubs[1], ...fields }) });
    const empty = await create({ collabFormat: "INTERCLUB" });
    expect(empty).toMatchObject({ collaborationVersion: 2, ratingMode: "UNRATED", schedulingMode: "FREE_PLAY" });
    expect(await db.sessionPlayer.count({ where: { sessionId: empty.id } })).toBe(0);
    expect(await db.sessionClub.findFirst({ where: { sessionId: empty.id, role: "PARTNER" } })).toMatchObject({ status: "PENDING", rulesConfirmedRevision: null });
    await expect(create({ playerIds: [f.players[4]] })).rejects.toThrow(/own players/);
    // An identity in both clubs still uses the host's profile at creation.
    await db.clubMember.create({ data: { clubId: f.clubs[1], playerId: f.players[0] } });
    const mixed = await create({ collabFormat: "FREE_PLAY", playerIds: [f.players[0]] });
    expect(await db.sessionPlayer.findFirst({ where: { sessionId: mixed.id } })).toMatchObject({ profileClubId: f.clubs[0], representingClubId: f.clubs[0] });
  });

  it("separates invitation acceptance from rules agreement and invalidates old confirmations", async () => {
    const f = await fixture();
    const state = await getCollaborationState(db, f.session.id, f.partner);
    expect(state.capabilities).toMatchObject({ host: false, manageClubIds: [f.clubs[1]], adminClubIds: [f.clubs[1]] });
    expect(() => assertRulesAgreed({ rulesRevision: state.rulesRevision, sessionClubs: state.clubs })).toThrow(/confirm/);
    await tx(client => mutateCollaboration(client, f.session.id, f.host, { action: "confirmRules", clubId: f.clubs[0], revision: 0 }));
    await expect(tx(client => mutateCollaboration(client, f.session.id, f.host, { action: "confirmRules", clubId: f.clubs[1], revision: 0 }))).rejects.toThrow(/your club/);
    await tx(client => mutateCollaboration(client, f.session.id, f.host, { action: "updateRules", revision: 0, scoringFormat: "SINGLE_GAME", ratingMode: "RATED" }));
    await expect(tx(client => mutateCollaboration(client, f.session.id, f.partner, { action: "confirmRules", clubId: f.clubs[1], revision: 0 }))).rejects.toThrow(/changed/);
    const updated = await getCollaborationState(db, f.session.id, f.host);
    expect(updated.rulesRevision).toBe(1);
    expect(updated.clubs.every(club => club.rulesConfirmedRevision === null)).toBe(true);
  });

  it("allows partial rows, restricts edits to own side, and rejects stale substitutions", async () => {
    const f = await fixture();
    const empty = await tx(client => createLineupRow(client, f.session.id, f.host));
    expect(isLineupRowReady(empty)).toBe(false);
    await expect(tx(client => editLineupRow(client, f.session.id, empty.id, f.partner, { action: "pair", revision: 0, clubId: f.clubs[0], playerIds: f.players.slice(0, 2) }))).rejects.toThrow(/only your club/);
    await expect(tx(client => editLineupRow(client, f.session.id, empty.id, f.host, { action: "pair", revision: 0, clubId: f.clubs[0], playerIds: [f.players[0], f.players[4]] }))).rejects.toThrow(/representing your club/);
    const ready = await f.readyRow();
    expect(isLineupRowReady(ready)).toBe(true);
    const changed = await tx(client => editLineupRow(client, f.session.id, ready.id, f.partner, { action: "pair", revision: ready.revision, clubId: f.clubs[1], playerIds: [f.players[4], f.players[6]] }));
    expect(changed.hostConfirmedRevision).toBeNull();
    expect(changed.partnerConfirmedRevision).toBeNull();
    await expect(tx(client => editLineupRow(client, f.session.id, ready.id, f.host, { action: "confirm", revision: ready.revision, clubId: f.clubs[0] }))).rejects.toThrow(/changed/);
  });

  it("reorders rows with revision checks while preserving pair agreements", async () => {
    const f = await fixture();
    const first = await f.readyRow();
    const second = await f.readyRow(2);
    await tx(client => editLineupRow(client, f.session.id, second.id, f.host, { action: "schedule", revision: second.revision, position: 1 }));
    const shifted = await db.sessionLineupRow.findUniqueOrThrow({ where: { id: first.id } });
    expect(shifted.position).toBe(2);
    expect(shifted.revision).toBe(first.revision + 1);
    expect(isLineupRowReady(shifted)).toBe(true);
    await expect(tx(client => editLineupRow(client, f.session.id, first.id, f.host, { action: "schedule", revision: first.revision, position: 1 }))).rejects.toThrow(/changed/);
  });

  it("creates exactly one match per row and prevents simultaneous player or court bookings", async () => {
    const f = await fixture();
    const row = await f.readyRow();
    const repeated = await f.readyRow();
    const separate = await f.readyRow(2);
    await f.agreeAndStart();
    const start = () => tx(client => startLineupRow(client, f.session.id, row.id, f.host, { revision: row.revision, courtId: f.session.courts[0].id }));
    const concurrent = await Promise.allSettled([start(), start()]);
    expect(concurrent.filter(result => result.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    const match = await start();
    expect(match.scoringFormat).toBe("BEST_OF_THREE");
    expect(await db.match.count({ where: { sessionId: f.session.id } })).toBe(1);
    expect(await db.sessionPlayer.count({ where: { sessionId: f.session.id, hasStartedMatch: true } })).toBe(4);
    await expect(tx(client => startLineupRow(client, f.session.id, repeated.id, f.host, { revision: repeated.revision, courtId: f.session.courts[1].id }))).rejects.toThrow(/already playing/);
    await expect(tx(client => startLineupRow(client, f.session.id, separate.id, f.host, { revision: separate.revision, courtId: f.session.courts[0].id }))).rejects.toThrow(/available court/);
    await expect(tx(client => startLineupRow(client, f.session.id, separate.id, f.partner, { revision: separate.revision, courtId: f.session.courts[1].id }))).rejects.toThrow(/host club/);
    await tx(client => startLineupRow(client, f.session.id, separate.id, f.host, { revision: separate.revision, courtId: f.session.courts[1].id }));
    expect(await db.match.count({ where: { sessionId: f.session.id } })).toBe(2);
    const current = await db.sessionLineupRow.findUniqueOrThrow({ where: { id: row.id } });
    await expect(tx(client => editLineupRow(client, f.session.id, row.id, f.host, { action: "pair", revision: current.revision, clubId: f.clubs[0], playerIds: [null, null] }))).rejects.toThrow(/started match/);
  });

  it("keeps cancellation scoreless and reset approval tied to the results revision", async () => {
    const f = await fixture();
    const row = await f.readyRow();
    await tx(client => editLineupRow(client, f.session.id, row.id, f.host, { action: "cancel", revision: row.revision }));
    expect(await db.match.count({ where: { sessionId: f.session.id } })).toBe(0);
    expect((await db.sessionLineupRow.findUniqueOrThrow({ where: { id: row.id } })).cancelled).toBe(true);
    await f.agreeAndStart();
    await tx(client => mutateCollaboration(client, f.session.id, f.host, { action: "confirmReset", revision: 0, clubId: f.clubs[0] }));
    await db.session.update({ where: { id: f.session.id }, data: { resultsRevision: { increment: 1 } } });
    await expect(tx(client => mutateCollaboration(client, f.session.id, f.partner, { action: "confirmReset", revision: 0, clubId: f.clubs[1] }))).rejects.toThrow(/changed/);
    const state = await getCollaborationState(db, f.session.id, f.partner);
    expect(state.clubs.find(club => club.id === f.clubs[0])?.resetConfirmedRevision).not.toBe(state.resultsRevision);
    await expect(tx(client => mutateCollaboration(client, f.session.id, f.host, { action: "updateRules", revision: 0, scoringFormat: "SINGLE_GAME", ratingMode: "RATED" }))).rejects.toThrow(/locked/);
  });

  it("starts with a ready row while later rows are incomplete, then requires reset consent from both clubs", async () => {
    const f = await fixture();
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({ user: { id: f.host.userId } } as never);
    const { POST: start } = await import("@/app/api/sessions/[code]/start/route");
    const { POST: reset } = await import("@/app/api/sessions/[code]/reset/route");
    const request = () => new Request(`http://localhost/api/sessions/${f.session.code}`, { method: "POST" });
    const params = { params: Promise.resolve({ code: f.session.code }) };
    const ready = await f.readyRow();
    await tx(client => createLineupRow(client, f.session.id, f.host));
    expect((await start(request(), params)).status).toBe(409);
    for (const [i, actor] of [f.host, f.partner].entries()) await tx(client => mutateCollaboration(client, f.session.id, actor, { action: "confirmRules", clubId: f.clubs[i], revision: 0 }));
    const started = await start(request(), params);
    expect(await started.clone().json()).not.toHaveProperty("error");
    expect(started.status).toBe(200);
    await tx(client => startLineupRow(client, f.session.id, ready.id, f.host, { revision: ready.revision, courtId: f.session.courts[0].id }));
    expect((await reset(request(), params)).status).toBe(409);
    for (const [i, actor] of [f.host, f.partner].entries()) await tx(client => mutateCollaboration(client, f.session.id, actor, { action: "confirmReset", clubId: f.clubs[i], revision: 1 }));
    const resetResponse = await reset(request(), params);
    expect(await resetResponse.clone().json()).not.toHaveProperty("error");
    expect(resetResponse.status).toBe(200);
    const state = await getCollaborationState(db, f.session.id, f.host);
    expect(state.status).toBe("WAITING");
    expect(state.lineup.find(row => row.id === ready.id)).toMatchObject({ team1Player1Id: f.players[0], team2Player1Id: f.players[4], matchId: null, hostConfirmedRevision: null, partnerConfirmedRevision: null });
    expect(state.clubs.every(club => club.rulesConfirmedRevision === null && club.resetConfirmedRevision === null)).toBe(true);
    expect(await db.match.count({ where: { sessionId: f.session.id } })).toBe(0);
  });

  it("requires acknowledgement of remaining lineup rows and refuses to discard started matches", async () => {
    const f = await fixture();
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({ user: { id: f.host.userId } } as never);
    const { POST: end } = await import("@/app/api/sessions/[code]/end/route");
    const params = { params: Promise.resolve({ code: f.session.code }) };
    const request = (acknowledgeRemainingLineup = false) => new Request("http://localhost/end", { method: "POST", body: JSON.stringify({ acknowledgeRemainingLineup }) });
    const row = await f.readyRow();
    await f.agreeAndStart();
    expect((await end(request(), params)).status).toBe(409);
    await tx(client => startLineupRow(client, f.session.id, row.id, f.host, { revision: row.revision, courtId: f.session.courts[0].id }));
    expect((await end(request(true), params)).status).toBe(409);
    await db.court.updateMany({ where: { sessionId: f.session.id }, data: { currentMatchId: null } });
    await db.match.deleteMany({ where: { sessionId: f.session.id } });
    const ended = await end(request(true), params);
    expect(await ended.clone().json()).not.toHaveProperty("error");
    expect(ended.status).toBe(200);
    expect((await db.sessionLineupRow.findUniqueOrThrow({ where: { id: row.id } })).cancelled).toBe(true);
  });

  it("withdrawal preserves the two-club session and blocks play", async () => {
    const f = await fixture();
    await tx(client => mutateCollaboration(client, f.session.id, f.partner, { action: "withdraw", clubId: f.clubs[1] }));
    const state = await getCollaborationState(db, f.session.id, f.host);
    expect(state.clubs).toHaveLength(2);
    expect(state.clubs.find(club => club.id === f.clubs[1])?.status).toBe("WITHDRAWN");
    expect(() => assertRulesAgreed({ rulesRevision: state.rulesRevision, sessionClubs: state.clubs })).toThrow(/Both clubs/);
    expect(await db.sessionCollaborationEvent.count({ where: { sessionId: f.session.id, action: "withdraw" } })).toBe(1);
  });
});
