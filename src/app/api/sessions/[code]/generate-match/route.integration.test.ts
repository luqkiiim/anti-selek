import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockedFunction } from "vitest";
import {
  MatchStatus,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionStatus,
  SessionType,
} from "@/types/enums";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

type RouteHandler = typeof import("./route")["POST"];
type PrismaInstance = typeof import("@/lib/prisma")["prisma"];

const tempDatabaseFile = path.resolve(
  process.cwd(),
  "prisma",
  `generate-match-route-${randomUUID()}.db`
);
const tempDatabaseUrl = `file:${tempDatabaseFile.replace(/\\/g, "/")}`;
const mutableEnv = process.env as Record<string, string | undefined>;
const previousEnv = {
  DATABASE_URL: mutableEnv.DATABASE_URL,
  TURSO_DATABASE_URL: mutableEnv.TURSO_DATABASE_URL,
  TURSO_AUTH_TOKEN: mutableEnv.TURSO_AUTH_TOKEN,
  NODE_ENV: mutableEnv.NODE_ENV,
};

let prisma: PrismaInstance;
let POST: RouteHandler;
let mockedAuth: MockedFunction<typeof import("@/lib/auth")["auth"]>;

function getPrismaBinary() {
  return path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prisma.cmd" : "prisma"
  );
}

function getSelectedIds(match: {
  team1User1Id?: string;
  team1User2Id?: string;
  team2User1Id?: string;
  team2User2Id?: string;
  team1User1?: { id: string };
  team1User2?: { id: string };
  team2User1?: { id: string };
  team2User2?: { id: string };
}) {
  const selectedIds = [
    match.team1User1Id ?? match.team1User1?.id,
    match.team1User2Id ?? match.team1User2?.id,
    match.team2User1Id ?? match.team2User1?.id,
    match.team2User2Id ?? match.team2User2?.id,
  ];

  if (selectedIds.some((userId) => typeof userId !== "string")) {
    throw new Error("Expected four selected user ids.");
  }

  return selectedIds as string[];
}

async function removeDatabaseFiles() {
  await Promise.all(
    ["", "-journal", "-shm", "-wal"].map((suffix) =>
      fs.rm(`${tempDatabaseFile}${suffix}`, { force: true })
    )
  );
}

async function createCommunityAdmin(prefix: string) {
  const adminUserId = `${prefix}-admin`;
  const communityId = `${prefix}-community`;

  await prisma.user.create({
    data: {
      id: adminUserId,
      email: `${prefix}-admin@example.com`,
      passwordHash: "test-password-hash",
      name: `${prefix} Admin`,
      isClaimed: true,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
    },
  });

  await prisma.community.create({
    data: {
      id: communityId,
      name: `${prefix} Community ${randomUUID()}`,
      createdById: adminUserId,
    },
  });

  await prisma.communityMember.create({
    data: {
      communityId,
      userId: adminUserId,
      role: "ADMIN",
    },
  });

  mockedAuth.mockResolvedValue({
    user: {
      id: adminUserId,
      isAdmin: false,
    },
  } as never);

  return { adminUserId, communityId };
}

async function createUsers(
  prefix: string,
  players: Array<{
    key: string;
    gender?: PlayerGender;
    partnerPreference?: PartnerPreference;
    elo?: number;
  }>
) {
  await prisma.user.createMany({
    data: players.map((player) => ({
      id: `${prefix}-${player.key}`,
      email: `${prefix}-${player.key}@example.com`,
      passwordHash: "test-password-hash",
      name: `${prefix}-${player.key}`,
      isClaimed: true,
      gender: player.gender ?? PlayerGender.MALE,
      partnerPreference: player.partnerPreference ?? PartnerPreference.OPEN,
      elo: player.elo ?? 1000,
    })),
  });
}

async function createSessionWithCourtsAndPlayers({
  prefix,
  communityId,
  type,
  mode,
  autoQueueEnabled = true,
  players,
  courtIds,
}: {
  prefix: string;
  communityId: string;
  type: SessionType;
  mode: SessionMode;
  autoQueueEnabled?: boolean;
  players: Array<{
    userId: string;
    gender?: PlayerGender;
    partnerPreference?: PartnerPreference;
    matchesPlayed?: number;
    availableSince?: Date;
    joinedAt?: Date;
  }>;
  courtIds: string[];
}) {
  const sessionId = `${prefix}-session`;
  const code = `${prefix}-code`;

  await prisma.session.create({
    data: {
      id: sessionId,
      code,
      communityId,
      name: `${prefix} Session`,
      type,
      mode,
      status: SessionStatus.ACTIVE,
      autoQueueEnabled,
      players: {
        create: players.map((player) => ({
          userId: player.userId,
          isGuest: false,
          gender: player.gender ?? PlayerGender.MALE,
          partnerPreference:
            player.partnerPreference ?? PartnerPreference.OPEN,
          matchesPlayed: player.matchesPlayed ?? 0,
          availableSince:
            player.availableSince ?? new Date("2026-04-04T00:00:00Z"),
          joinedAt: player.joinedAt ?? new Date("2026-04-04T00:00:00Z"),
        })),
      },
      courts: {
        create: courtIds.map((courtId, index) => ({
          id: courtId,
          courtNumber: index + 1,
        })),
      },
    },
  });

  return { sessionId, code };
}

async function postGenerateMatch(
  code: string,
  body: Record<string, unknown>
) {
  return POST(
    new Request(`http://localhost/api/sessions/${code}/generate-match`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    {
      params: Promise.resolve({ code }),
    }
  );
}

beforeAll(async () => {
  mutableEnv.DATABASE_URL = tempDatabaseUrl;
  mutableEnv.TURSO_DATABASE_URL = "";
  mutableEnv.TURSO_AUTH_TOKEN = "";
  mutableEnv.NODE_ENV = "test";

  await removeDatabaseFiles();

  const prismaBinary = getPrismaBinary();
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/c", prismaBinary, "db", "push", "--skip-generate"], {
      cwd: process.cwd(),
      env: process.env as NodeJS.ProcessEnv,
      stdio: "inherit",
    });
  } else {
    execFileSync(prismaBinary, ["db", "push", "--skip-generate"], {
      cwd: process.cwd(),
      env: process.env as NodeJS.ProcessEnv,
      stdio: "inherit",
    });
  }

  vi.resetModules();
  (globalThis as { prisma?: PrismaInstance }).prisma = undefined;

  const authModule = await import("@/lib/auth");
  mockedAuth = vi.mocked(authModule.auth);

  const prismaModule = await import("@/lib/prisma");
  prisma = prismaModule.prisma;

  const routeModule = await import("./route");
  POST = routeModule.POST;
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await prisma?.$disconnect();
  (globalThis as { prisma?: PrismaInstance }).prisma = undefined;

  mutableEnv.DATABASE_URL = previousEnv.DATABASE_URL;
  mutableEnv.TURSO_DATABASE_URL = previousEnv.TURSO_DATABASE_URL;
  mutableEnv.TURSO_AUTH_TOKEN = previousEnv.TURSO_AUTH_TOKEN;
  mutableEnv.NODE_ENV = previousEnv.NODE_ENV;

  await removeDatabaseFiles();
});

describe("generate match route integration", () => {
  it("creates a real automatic single-court match and assigns the court", async () => {
    const prefix = `single-${randomUUID().slice(0, 8)}`;
    const { communityId } = await createCommunityAdmin(prefix);
    const playerKeys = ["p1", "p2", "p3", "p4"];
    const playerIds = playerKeys.map((key) => `${prefix}-${key}`);
    const courtId = `${prefix}-court-1`;

    await createUsers(
      prefix,
      playerKeys.map((key) => ({ key }))
    );

    const { sessionId, code } = await createSessionWithCourtsAndPlayers({
      prefix,
      communityId,
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      players: playerIds.map((userId) => ({ userId })),
      courtIds: [courtId],
    });

    const response = await postGenerateMatch(code, { courtId });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe(MatchStatus.IN_PROGRESS);
    expect(payload.courtId).toBe(courtId);
    expect(getSelectedIds(payload).sort()).toEqual([...playerIds].sort());

    const storedCourt = await prisma.court.findUnique({
      where: { id: courtId },
    });
    const storedMatches = await prisma.match.findMany({
      where: { sessionId },
    });

    expect(storedMatches).toHaveLength(1);
    expect(storedCourt?.currentMatchId).toBe(payload.id);
  });

  it("does not auto-queue the next match for a single-court session with exactly eight active players", async () => {
    const prefix = `single-eight-${randomUUID().slice(0, 8)}`;
    const { communityId } = await createCommunityAdmin(prefix);
    const playerKeys = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
    const playerIds = playerKeys.map((key) => `${prefix}-${key}`);
    const courtId = `${prefix}-court-1`;

    await createUsers(
      prefix,
      playerKeys.map((key) => ({ key }))
    );

    const { sessionId, code } = await createSessionWithCourtsAndPlayers({
      prefix,
      communityId,
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      players: playerIds.map((userId) => ({ userId })),
      courtIds: [courtId],
    });

    const response = await postGenerateMatch(code, { courtId });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe(MatchStatus.IN_PROGRESS);
    expect(payload.courtId).toBe(courtId);
    expect(getSelectedIds(payload).every((userId) => playerIds.includes(userId))).toBe(
      true
    );
    expect(payload.queuedMatch).toBeNull();

    const storedCourt = await prisma.court.findUnique({
      where: { id: courtId },
    });
    const storedMatches = await prisma.match.findMany({
      where: { sessionId },
    });
    const storedQueuedMatch = await prisma.queuedMatch.findUnique({
      where: { sessionId },
    });

    expect(storedMatches).toHaveLength(1);
    expect(storedCourt?.currentMatchId).toBe(payload.id);
    expect(storedQueuedMatch).toBeNull();
  });

  it("still auto-queues the next match for a single-court session with more than eight active players", async () => {
    const prefix = `single-queue-${randomUUID().slice(0, 8)}`;
    const { communityId } = await createCommunityAdmin(prefix);
    const playerKeys = [
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
      "p6",
      "p7",
      "p8",
      "p9",
      "p10",
      "p11",
      "p12",
    ];
    const playerIds = playerKeys.map((key) => `${prefix}-${key}`);
    const courtId = `${prefix}-court-1`;

    await createUsers(
      prefix,
      playerKeys.map((key) => ({ key }))
    );

    const { sessionId, code } = await createSessionWithCourtsAndPlayers({
      prefix,
      communityId,
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      players: playerIds.map((userId) => ({ userId })),
      courtIds: [courtId],
    });

    const response = await postGenerateMatch(code, { courtId });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.queuedMatch).not.toBeNull();

    const selectedIds = getSelectedIds(payload);
    const queuedIds = getSelectedIds(payload.queuedMatch);
    const storedQueuedMatch = await prisma.queuedMatch.findUnique({
      where: { sessionId },
    });

    expect(new Set([...selectedIds, ...queuedIds]).size).toBe(8);
    expect(
      [...selectedIds, ...queuedIds].every((userId) => playerIds.includes(userId))
    ).toBe(true);
    expect(queuedIds.every((userId) => !selectedIds.includes(userId))).toBe(true);
    expect(storedQueuedMatch).not.toBeNull();
  });

  it("does not auto-queue when the session auto-queue toggle is off", async () => {
    const prefix = `batch-no-auto-queue-${randomUUID().slice(0, 8)}`;
    const { communityId } = await createCommunityAdmin(prefix);
    const playerKeys = [
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
      "p6",
      "p7",
      "p8",
      "p9",
      "p10",
      "p11",
      "p12",
    ];
    const playerIds = playerKeys.map((key) => `${prefix}-${key}`);
    const courtIds = [`${prefix}-court-1`, `${prefix}-court-2`];

    await createUsers(
      prefix,
      playerKeys.map((key) => ({ key }))
    );

    const { sessionId, code } = await createSessionWithCourtsAndPlayers({
      prefix,
      communityId,
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      autoQueueEnabled: false,
      players: playerIds.map((userId) => ({ userId })),
      courtIds,
    });

    const response = await postGenerateMatch(code, { courtIds });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.matches).toHaveLength(2);
    expect(payload.queuedMatch).toBeNull();

    const storedQueuedMatch = await prisma.queuedMatch.findUnique({
      where: { sessionId },
    });

    expect(storedQueuedMatch).toBeNull();
  });

  it("creates a real batch across two courts without duplicating players", async () => {
    const prefix = `batch-${randomUUID().slice(0, 8)}`;
    const { communityId } = await createCommunityAdmin(prefix);
    const playerKeys = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
    const playerIds = playerKeys.map((key) => `${prefix}-${key}`);
    const courtIds = [`${prefix}-court-1`, `${prefix}-court-2`];

    await createUsers(
      prefix,
      playerKeys.map((key) => ({ key }))
    );

    const { sessionId, code } = await createSessionWithCourtsAndPlayers({
      prefix,
      communityId,
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      players: playerIds.map((userId) => ({ userId })),
      courtIds,
    });

    const response = await postGenerateMatch(code, { courtIds });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.matches).toHaveLength(2);

    const selectedIds = payload.matches.flatMap(getSelectedIds);
    expect(new Set(selectedIds).size).toBe(8);
    expect(selectedIds.sort()).toEqual([...playerIds].sort());

    const storedCourts = await prisma.court.findMany({
      where: { id: { in: courtIds } },
      orderBy: { courtNumber: "asc" },
    });
    const storedMatches = await prisma.match.findMany({
      where: { sessionId },
    });

    expect(storedMatches).toHaveLength(2);
    expect(storedCourts.map((court) => court.currentMatchId).every(Boolean)).toBe(
      true
    );
  });

  it("creates a queued next match after filling the last open courts", async () => {
    const prefix = `batch-queue-${randomUUID().slice(0, 8)}`;
    const { communityId } = await createCommunityAdmin(prefix);
    const playerKeys = [
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
      "p6",
      "p7",
      "p8",
      "p9",
      "p10",
      "p11",
      "p12",
    ];
    const playerIds = playerKeys.map((key) => `${prefix}-${key}`);
    const courtIds = [`${prefix}-court-1`, `${prefix}-court-2`];

    await createUsers(
      prefix,
      playerKeys.map((key) => ({ key }))
    );

    const { sessionId, code } = await createSessionWithCourtsAndPlayers({
      prefix,
      communityId,
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      players: playerIds.map((userId) => ({ userId })),
      courtIds,
    });

    const response = await postGenerateMatch(code, { courtIds });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.matches).toHaveLength(2);
    expect(payload.queuedMatch).not.toBeNull();
    const selectedIds = payload.matches.flatMap(getSelectedIds);
    const queuedIds = getSelectedIds(payload.queuedMatch);

    expect(new Set([...selectedIds, ...queuedIds]).size).toBe(12);
    expect([...selectedIds, ...queuedIds].sort()).toEqual([...playerIds].sort());

    const storedQueuedMatch = await prisma.queuedMatch.findUnique({
      where: { sessionId },
    });

    expect(storedQueuedMatch).not.toBeNull();
  });

  it("reshuffles an in-progress match to a different quartet when alternates exist", async () => {
    const prefix = `reshuffle-${randomUUID().slice(0, 8)}`;
    const { communityId } = await createCommunityAdmin(prefix);
    const playerKeys = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const playerIds = playerKeys.map((key) => `${prefix}-${key}`);
    const originalQuartet = playerIds.slice(0, 4);
    const courtId = `${prefix}-court-1`;

    await createUsers(
      prefix,
      playerKeys.map((key) => ({ key }))
    );

    const { sessionId, code } = await createSessionWithCourtsAndPlayers({
      prefix,
      communityId,
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      players: playerIds.map((userId) => ({ userId })),
      courtIds: [courtId],
    });

    const currentMatch = await prisma.match.create({
      data: {
        id: `${prefix}-current-match`,
        sessionId,
        courtId,
        status: MatchStatus.IN_PROGRESS,
        team1User1Id: originalQuartet[0],
        team1User2Id: originalQuartet[1],
        team2User1Id: originalQuartet[2],
        team2User2Id: originalQuartet[3],
        createdAt: new Date("2026-04-04T00:00:00Z"),
      },
    });

    await prisma.court.update({
      where: { id: courtId },
      data: { currentMatchId: currentMatch.id },
    });

    const response = await postGenerateMatch(code, {
      courtId,
      forceReshuffle: true,
    });
    const payload = await response.json();
    const reshuffledIds = getSelectedIds(payload).sort();

    expect(response.status).toBe(200);
    expect(payload.id).not.toBe(currentMatch.id);
    expect(payload.courtId).toBe(courtId);
    expect(reshuffledIds).not.toEqual([...originalQuartet].sort());
    expect(
      reshuffledIds.some(
        (userId) => userId === `${prefix}-p5` || userId === `${prefix}-p6`
      )
    ).toBe(true);

    const refreshedCourt = await prisma.court.findUnique({
      where: { id: courtId },
    });
    const storedOriginalMatch = await prisma.match.findUnique({
      where: { id: currentMatch.id },
    });
    const storedMatches = await prisma.match.findMany({
      where: { sessionId },
    });

    expect(refreshedCourt?.currentMatchId).toBe(payload.id);
    expect(storedOriginalMatch).toBeNull();
    expect(storedMatches).toHaveLength(1);
  });

  it("replaces one live-match player with the next eligible waiting player", async () => {
    const prefix = `replace-live-${randomUUID().slice(0, 8)}`;
    const { communityId } = await createCommunityAdmin(prefix);
    const playerKeys = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const playerIds = playerKeys.map((key) => `${prefix}-${key}`);
    const courtId = `${prefix}-court-1`;

    await createUsers(
      prefix,
      playerKeys.map((key) => ({ key }))
    );

    const { sessionId, code } = await createSessionWithCourtsAndPlayers({
      prefix,
      communityId,
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      players: [
        { userId: playerIds[0], matchesPlayed: 2 },
        { userId: playerIds[1], matchesPlayed: 2 },
        { userId: playerIds[2], matchesPlayed: 2 },
        { userId: playerIds[3], matchesPlayed: 2 },
        { userId: playerIds[4], matchesPlayed: 0 },
        { userId: playerIds[5], matchesPlayed: 1 },
      ],
      courtIds: [courtId],
    });

    const currentMatch = await prisma.match.create({
      data: {
        id: `${prefix}-current-match`,
        sessionId,
        courtId,
        status: MatchStatus.IN_PROGRESS,
        team1User1Id: playerIds[0],
        team1User2Id: playerIds[1],
        team2User1Id: playerIds[2],
        team2User2Id: playerIds[3],
        createdAt: new Date("2026-04-04T00:00:00Z"),
      },
    });

    await prisma.court.update({
      where: { id: courtId },
      data: { currentMatchId: currentMatch.id },
    });

    const response = await postGenerateMatch(code, {
      courtId,
      replaceUserId: playerIds[1],
    });
    const payload = await response.json();
    const replacedIds = getSelectedIds(payload).sort();

    expect(response.status).toBe(200);
    expect(payload.id).not.toBe(currentMatch.id);
    expect(replacedIds).toEqual(
      [playerIds[0], playerIds[2], playerIds[3], playerIds[4]].sort()
    );

    const refreshedCourt = await prisma.court.findUnique({
      where: { id: courtId },
    });
    const storedOriginalMatch = await prisma.match.findUnique({
      where: { id: currentMatch.id },
    });

    expect(refreshedCourt?.currentMatchId).toBe(payload.id);
    expect(storedOriginalMatch).toBeNull();
  });

  it("undoes an in-progress match and clears the court when no queued match exists", async () => {
    const prefix = `undo-${randomUUID().slice(0, 8)}`;
    const { communityId } = await createCommunityAdmin(prefix);
    const playerKeys = ["p1", "p2", "p3", "p4"];
    const playerIds = playerKeys.map((key) => `${prefix}-${key}`);
    const courtId = `${prefix}-court-1`;

    await createUsers(
      prefix,
      playerKeys.map((key) => ({ key }))
    );

    const { sessionId, code } = await createSessionWithCourtsAndPlayers({
      prefix,
      communityId,
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      players: playerIds.map((userId) => ({ userId })),
      courtIds: [courtId],
    });

    const currentMatch = await prisma.match.create({
      data: {
        id: `${prefix}-current-match`,
        sessionId,
        courtId,
        status: MatchStatus.IN_PROGRESS,
        team1User1Id: playerIds[0],
        team1User2Id: playerIds[1],
        team2User1Id: playerIds[2],
        team2User2Id: playerIds[3],
        createdAt: new Date("2026-04-04T00:00:00Z"),
      },
    });

    await prisma.court.update({
      where: { id: courtId },
      data: { currentMatchId: currentMatch.id },
    });

    const response = await postGenerateMatch(code, {
      courtId,
      undoCurrentMatch: true,
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      undoneMatchId: currentMatch.id,
      autoAssignedMatch: null,
      queuedMatchCleared: false,
      queuedMatch: null,
    });

    const refreshedCourt = await prisma.court.findUnique({
      where: { id: courtId },
    });
    const storedMatch = await prisma.match.findUnique({
      where: { id: currentMatch.id },
    });
    const storedMatches = await prisma.match.findMany({
      where: { sessionId },
    });

    expect(refreshedCourt?.currentMatchId).toBeNull();
    expect(storedMatch).toBeNull();
    expect(storedMatches).toHaveLength(0);
  });

  it("undoes a live match, promotes the queued match, and rebuilds the queue", async () => {
    const prefix = `undo-refill-${randomUUID().slice(0, 8)}`;
    const { communityId } = await createCommunityAdmin(prefix);
    const playerKeys = [
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
      "p6",
      "p7",
      "p8",
      "p9",
      "p10",
      "p11",
      "p12",
    ];
    const playerIds = playerKeys.map((key) => `${prefix}-${key}`);
    const courtId = `${prefix}-court-1`;

    await createUsers(
      prefix,
      playerKeys.map((key) => ({ key }))
    );

    const { sessionId, code } = await createSessionWithCourtsAndPlayers({
      prefix,
      communityId,
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      players: playerIds.map((userId) => ({ userId })),
      courtIds: [courtId],
    });

    const currentMatch = await prisma.match.create({
      data: {
        id: `${prefix}-current-match`,
        sessionId,
        courtId,
        status: MatchStatus.IN_PROGRESS,
        team1User1Id: playerIds[0],
        team1User2Id: playerIds[1],
        team2User1Id: playerIds[2],
        team2User2Id: playerIds[3],
        createdAt: new Date("2026-04-04T00:00:00Z"),
      },
    });

    await prisma.court.update({
      where: { id: courtId },
      data: { currentMatchId: currentMatch.id },
    });

    await prisma.queuedMatch.create({
      data: {
        sessionId,
        team1User1Id: playerIds[4],
        team1User2Id: playerIds[5],
        team2User1Id: playerIds[6],
        team2User2Id: playerIds[7],
      },
    });

    const response = await postGenerateMatch(code, {
      courtId,
      undoCurrentMatch: true,
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.undoneMatchId).toBe(currentMatch.id);
    expect(payload.autoAssignedMatch).not.toBeNull();
    expect(payload.queuedMatchCleared).toBe(false);
    expect(payload.queuedMatch).not.toBeNull();
    const autoAssignedIds = getSelectedIds(payload.autoAssignedMatch).sort();
    const rebuiltQueuedIds = getSelectedIds(payload.queuedMatch).sort();

    expect(autoAssignedIds).toEqual(playerIds.slice(4, 8).sort());
    expect(
      rebuiltQueuedIds.every((userId) => !autoAssignedIds.includes(userId))
    ).toBe(true);
    expect(
      rebuiltQueuedIds.every((userId) =>
        [...playerIds.slice(0, 4), ...playerIds.slice(8, 12)].includes(userId)
      )
    ).toBe(true);

    const refreshedCourt = await prisma.court.findUnique({
      where: { id: courtId },
    });
    const storedQueuedMatch = await prisma.queuedMatch.findUnique({
      where: { sessionId },
    });

    expect(refreshedCourt?.currentMatchId).toBe(payload.autoAssignedMatch.id);
    expect(storedQueuedMatch).not.toBeNull();
    expect(getSelectedIds(storedQueuedMatch!).sort()).toEqual(rebuiltQueuedIds);
  });

  it("preserves the race regression behavior through the real POST route", async () => {
    const prefix = `race-${randomUUID().slice(0, 8)}`;
    const { communityId } = await createCommunityAdmin(prefix);
    const waitingSince = new Date("2026-04-04T00:00:00Z");
    const mixedAvailableSince = new Date("2026-04-04T00:21:00Z");
    const mixedFinishedAt = new Date("2026-04-04T00:20:00Z");
    const openCourtId = `${prefix}-court-open`;
    const busyCourtId = `${prefix}-court-busy`;

    await createUsers(prefix, [
      { key: "M1" },
      { key: "M2" },
      { key: "M3" },
      { key: "M4" },
      { key: "M5" },
      { key: "M6" },
      { key: "M7" },
      {
        key: "F1",
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      },
      {
        key: "F2",
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      },
      {
        key: "F3",
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      },
      {
        key: "F4",
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      },
      {
        key: "F5",
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      },
    ]);

    const { sessionId, code } = await createSessionWithCourtsAndPlayers({
      prefix,
      communityId,
      type: SessionType.RACE,
      mode: SessionMode.MIXICANO,
      players: [
        { userId: `${prefix}-M1`, availableSince: waitingSince },
        { userId: `${prefix}-M2`, availableSince: waitingSince },
        { userId: `${prefix}-M3`, availableSince: waitingSince },
        { userId: `${prefix}-M4`, availableSince: waitingSince },
        {
          userId: `${prefix}-M5`,
          matchesPlayed: 1,
          availableSince: mixedAvailableSince,
        },
        {
          userId: `${prefix}-M6`,
          matchesPlayed: 1,
          availableSince: mixedAvailableSince,
        },
        { userId: `${prefix}-M7`, availableSince: waitingSince },
        {
          userId: `${prefix}-F1`,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          matchesPlayed: 1,
          availableSince: mixedAvailableSince,
        },
        {
          userId: `${prefix}-F2`,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          matchesPlayed: 1,
          availableSince: mixedAvailableSince,
        },
        {
          userId: `${prefix}-F3`,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          availableSince: waitingSince,
        },
        {
          userId: `${prefix}-F4`,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          availableSince: waitingSince,
        },
        {
          userId: `${prefix}-F5`,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          availableSince: waitingSince,
        },
      ],
      courtIds: [openCourtId, busyCourtId],
    });

    const completedMatch = await prisma.match.create({
      data: {
        id: `${prefix}-mixed-completed`,
        sessionId,
        courtId: openCourtId,
        status: MatchStatus.COMPLETED,
        team1User1Id: `${prefix}-M5`,
        team1User2Id: `${prefix}-F1`,
        team2User1Id: `${prefix}-M6`,
        team2User2Id: `${prefix}-F2`,
        team1Score: 21,
        team2Score: 18,
        winnerTeam: 1,
        createdAt: new Date("2026-04-04T00:10:00Z"),
        completedAt: mixedFinishedAt,
      },
    });

    const activeMensMatch = await prisma.match.create({
      data: {
        id: `${prefix}-mens-active`,
        sessionId,
        courtId: busyCourtId,
        status: MatchStatus.IN_PROGRESS,
        team1User1Id: `${prefix}-M1`,
        team1User2Id: `${prefix}-M2`,
        team2User1Id: `${prefix}-M3`,
        team2User2Id: `${prefix}-M4`,
        createdAt: new Date("2026-04-04T00:15:00Z"),
      },
    });

    await prisma.court.update({
      where: { id: busyCourtId },
      data: { currentMatchId: activeMensMatch.id },
    });

    const response = await postGenerateMatch(code, { courtId: openCourtId });
    const payload = await response.json();
    const selectedIds = getSelectedIds(payload);
    const completedMixedIds = new Set([
      `${prefix}-M5`,
      `${prefix}-M6`,
      `${prefix}-F1`,
      `${prefix}-F2`,
    ]);
    const waitingIds = new Set([
      `${prefix}-M7`,
      `${prefix}-F3`,
      `${prefix}-F4`,
      `${prefix}-F5`,
    ]);

    expect(response.status).toBe(200);
    expect(payload.courtId).toBe(openCourtId);
    expect(selectedIds.filter((userId) => completedMixedIds.has(userId))).toHaveLength(
      1
    );
    expect(selectedIds.filter((userId) => waitingIds.has(userId))).toHaveLength(3);

    const refreshedOpenCourt = await prisma.court.findUnique({
      where: { id: openCourtId },
    });
    const refreshedBusyCourt = await prisma.court.findUnique({
      where: { id: busyCourtId },
    });
    const storedMatches = await prisma.match.findMany({
      where: { sessionId },
    });

    expect(refreshedOpenCourt?.currentMatchId).toBe(payload.id);
    expect(refreshedBusyCourt?.currentMatchId).toBe(activeMensMatch.id);
    expect(storedMatches.map((match) => match.id)).toContain(completedMatch.id);
    expect(storedMatches.map((match) => match.id)).toContain(activeMensMatch.id);
    expect(storedMatches.map((match) => match.id)).toContain(payload.id);
  });
});
