import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { emptySessionDetails } from "@/lib/sessionDetails";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: vi.fn(async () => null), checkInvalidTargetRateLimit: vi.fn(async () => null), invalidTargetResponse: vi.fn(() => Response.json({ error: "Unavailable" }, { status: 403 })) }));
const database = path.join(tmpdir(), `session-details-${randomUUID()}.db`);
const db = new PrismaClient({ datasources: { db: { url: `file:${database}` } } });
let PATCH: typeof import("./route").PATCH;
beforeAll(async () => {
  await writeFile(database, "");
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: `file:${database}`, TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "" }, stdio: "pipe" });
  PATCH = (await import("./route")).PATCH;
});
afterAll(async () => {
  await db.$disconnect();
  await Promise.all(["", "-journal", "-wal", "-shm"].map(suffix => rm(database + suffix, { force: true })));
});
beforeEach(() => mocks.auth.mockResolvedValue({ user: { id: "host" } }));

async function fixture() {
  for (const id of ["host", "partner", "member", "outsider"]) await db.user.upsert({ where: { id }, update: {}, create: { id, name: id, email: `${id}@example.test`, passwordHash: "test-only" } });
  const prefix = randomUUID();
  const home = await db.club.create({ data: { name: prefix, createdById: "host", accountAccess: { create: [{ userId: "host", role: "STAFF" }, { userId: "member", role: "MEMBER" }] } } });
  const away = await db.club.create({ data: { name: prefix + "-away", createdById: "partner", accountAccess: { create: { userId: "partner", role: "OWNER" } } } });
  const session = await db.session.create({ data: {
    code: prefix, name: "Friendly", clubId: home.id, collaborationVersion: 2, status: "ACTIVE", autoQueueEnabled: true,
    sessionClubs: { create: [{ clubId: home.id, role: "HOST", status: "ACCEPTED" }, { clubId: away.id, role: "PARTNER", status: "ACCEPTED" }] },
    courts: { create: [{ courtNumber: 1, label: "East" }, { courtNumber: 2, isActive: false }] },
    queuedMatch: { create: { team1Player1Id: "p1", team1Player2Id: "p2", team2Player1Id: "p3", team2Player2Id: "p4", isAutomatic: true } },
  }, include: { courts: true, queuedMatch: true } });
  const request = (details: unknown) => PATCH(new Request(`http://localhost/api/sessions/${prefix}/details`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ details }) }), { params: Promise.resolve({ code: prefix }) });
  return { session, request, home, away };
}

it("persists optional details and court times when creating a session", async () => {
  const f = await fixture();
  const { parseCreateSessionRequest } = await import("../../createSessionRequest");
  const { createSessionForUser } = await import("../../createSessionService");
  const input = parseCreateSessionRequest({ name: "New friendly", clubId: f.home.id, partnerClubId: f.away.id, collabFormat: "INTERCLUB", courtCount: 2,
    details: { ...emptySessionDetails(), venue: "New hall", courtLabels: [{ courtNumber: 1, label: "  Court 5  " }, { courtNumber: 2, label: "West" }], startsAt: "2026-11-04T12:00:00.000Z", endsAt: "2026-11-04T14:00:00.000Z", courtBookings: [{ courtNumber: 2, startsAt: "2026-11-04T13:00:00.000Z", endsAt: "2026-11-04T14:00:00.000Z" }] },
  });
  const created = await createSessionForUser({ requesterId: "host", requesterIsAdmin: false, input });
  const saved = await db.session.findUniqueOrThrow({ where: { code: created.code }, include: { courts: { orderBy: { courtNumber: "asc" } } } });
  expect(saved.venue).toBe("New hall");
  expect(saved.scheduledStartAt?.toISOString()).toBe(input.details?.startsAt);
  expect(saved.courts[0].bookingStartAt).toBeNull();
  expect(saved.courts[1].bookingStartAt?.toISOString()).toBe("2026-11-04T13:00:00.000Z");
  expect(saved.courts.map(court => court.label)).toEqual(["Court 5", "West"]);
});

it("saves and clears court labels atomically, preserves omitted labels and rejects unavailable or duplicate courts", async () => {
  const f = await fixture();
  const details = { ...emptySessionDetails(), venue: "Main hall", courtLabels: [{ courtNumber: 1, label: "  Court 7  " }] };
  const response = await f.request(details);
  expect(response.status).toBe(200);
  expect((await response.json()).details.courtLabels).toEqual([{ courtNumber: 1, label: "Court 7" }]);
  for (const courtLabels of [
    [{ courtNumber: 2, label: "Unavailable" }],
    [{ courtNumber: 1, label: "First" }, { courtNumber: 1, label: "Duplicate" }],
    [{ courtNumber: 1, label: "x".repeat(25) }],
  ]) {
    expect((await f.request({ ...details, venue: "Must not save", courtLabels })).status).toBe(400);
    expect((await db.session.findUniqueOrThrow({ where: { id: f.session.id } })).venue).toBe("Main hall");
    expect((await db.court.findFirstOrThrow({ where: { sessionId: f.session.id, courtNumber: 1 } })).label).toBe("Court 7");
  }
  expect((await f.request(emptySessionDetails())).status).toBe(200);
  expect((await db.court.findFirstOrThrow({ where: { sessionId: f.session.id, courtNumber: 1 } })).label).toBe("Court 7");
  expect((await f.request({ ...emptySessionDetails(), courtLabels: [{ courtNumber: 1, label: "" }] })).status).toBe(200);
  expect((await db.court.findFirstOrThrow({ where: { sessionId: f.session.id, courtNumber: 1 } })).label).toBeNull();
});

it("saves logistics and court overrides atomically while preserving queue, rules, scores and inactive courts", async () => {
  const f = await fixture();
  const details = { ...emptySessionDetails(), venue: "  Main hall  ", startsAt: "2026-11-04T15:00:00.000Z", endsAt: "2026-11-04T17:00:00.000Z", courtBookings: [{ courtNumber: 1, startsAt: "2026-11-04T14:00:00.000Z", endsAt: "2026-11-04T17:00:00.000Z" }] };
  expect((await f.request(details)).status).toBe(200);
  const after = await db.session.findUniqueOrThrow({ where: { id: f.session.id }, include: { courts: true, queuedMatch: true } });
  expect(after).toMatchObject({ venue: "Main hall", status: "ACTIVE", autoQueueEnabled: true, respectPlayerRest: f.session.respectPlayerRest, rulesRevision: f.session.rulesRevision, resultsRevision: f.session.resultsRevision });
  expect(after.queuedMatch).toEqual(f.session.queuedMatch);
  expect(after.courts.find(court => court.courtNumber === 2)).toEqual(f.session.courts.find(court => court.courtNumber === 2));
  const invalid = await f.request({ ...details, venue: "Must not save", endsAt: details.startsAt });
  expect(invalid.status).toBe(400);
  expect((await db.session.findUniqueOrThrow({ where: { id: f.session.id } })).venue).toBe("Main hall");
  expect((await f.request(emptySessionDetails())).status).toBe(200);
  expect((await db.court.findFirstOrThrow({ where: { sessionId: f.session.id, courtNumber: 1 } })).bookingStartAt).toBeNull();
});

it.each(["partner", "member", "outsider"])("rejects %s even when they can operate a different club", async userId => {
  const f = await fixture();
  mocks.auth.mockResolvedValue({ user: { id: userId } });
  expect((await f.request(emptySessionDetails())).status).toBe(409);
  expect((await db.session.findUniqueOrThrow({ where: { id: f.session.id } })).timeZone).toBeNull();
});

it("rejects quick access, unauthenticated users, completed sessions, revoked roles and inactive courts", async () => {
  const f = await fixture();
  mocks.auth.mockResolvedValue(null);
  expect((await f.request(emptySessionDetails())).status).toBe(401);
  mocks.auth.mockResolvedValue({ user: { id: "host", isQuickAccess: true } });
  expect((await f.request(emptySessionDetails())).status).toBe(403);
  mocks.auth.mockResolvedValue({ user: { id: "host" } });
  expect((await f.request({ ...emptySessionDetails(), courtBookings: [{ courtNumber: 2, startsAt: null, endsAt: null }] })).status).toBe(400);
  await db.clubAccess.update({ where: { clubId_userId: { clubId: f.home.id, userId: "host" } }, data: { status: "REVOKED" } });
  expect((await f.request(emptySessionDetails())).status).toBe(409);
  mocks.auth.mockResolvedValue({ user: { id: "outsider", isAdmin: true } });
  expect((await f.request(emptySessionDetails())).status).toBe(200);
  await db.session.update({ where: { id: f.session.id }, data: { status: "COMPLETED" } });
  expect((await f.request(emptySessionDetails())).status).toBe(409);
});
