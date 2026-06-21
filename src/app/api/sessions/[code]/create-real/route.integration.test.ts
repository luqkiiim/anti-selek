import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from "vitest";
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
  `create-real-route-${randomUUID()}.db`
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

async function removeDatabaseFiles() {
  await Promise.all(
    ["", "-journal", "-shm", "-wal"].map((suffix) =>
      fs.rm(`${tempDatabaseFile}${suffix}`, { force: true })
    )
  );
}

async function createClubAdmin(prefix: string) {
  const adminUserId = `${prefix}-admin`;
  const clubId = `${prefix}-community`;

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

  await prisma.club.create({
    data: {
      id: clubId,
      name: `${prefix} Community ${randomUUID()}`,
      createdById: adminUserId,
    },
  });

  await prisma.clubMember.create({
    data: {
      clubId,
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

  return { adminUserId, clubId };
}

async function createPlayers(prefix: string, clubId: string, keys: string[]) {
  await prisma.user.createMany({
    data: keys.map((key) => ({
      id: `${prefix}-${key}`,
      email: `${prefix}-${key}@example.com`,
      passwordHash: "test-password-hash",
      name: `${prefix}-${key}`,
      isClaimed: true,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      elo: 1000,
    })),
  });

  await prisma.clubMember.createMany({
    data: keys.map((key) => ({
      clubId,
      userId: `${prefix}-${key}`,
      role: "MEMBER",
      elo: 1000,
    })),
  });
}

async function createTestSessionWithMatch(prefix: string, clubId: string) {
  const playerIds = ["p1", "p2", "p3", "p4"].map((key) => `${prefix}-${key}`);
  const sessionId = `${prefix}-test-session`;
  const code = `${prefix}-test-code`;
  const courtId = `${prefix}-court-1`;
  const completedAt = new Date("2026-05-02T10:30:00.000Z");

  await prisma.session.create({
    data: {
      id: sessionId,
      code,
      clubId,
      name: `${prefix} Test Session`,
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      status: SessionStatus.ACTIVE,
      isTest: true,
      players: {
        create: playerIds.map((userId) => ({
          userId,
          isGuest: false,
          gender: PlayerGender.MALE,
          partnerPreference: PartnerPreference.OPEN,
          joinedAt: new Date("2026-05-02T09:00:00.000Z"),
          availableSince: new Date("2026-05-02T09:00:00.000Z"),
          ladderEntryAt: new Date("2026-05-02T09:00:00.000Z"),
        })),
      },
      courts: {
        create: [
          {
            id: courtId,
            courtNumber: 1,
          },
        ],
      },
    },
  });

  await prisma.match.create({
    data: {
      id: `${prefix}-completed-match`,
      sessionId,
      courtId,
      status: MatchStatus.COMPLETED,
      team1User1Id: playerIds[0],
      team1User2Id: playerIds[1],
      team2User1Id: playerIds[2],
      team2User2Id: playerIds[3],
      team1Score: 11,
      team2Score: 9,
      winnerTeam: 1,
      createdAt: new Date("2026-05-02T10:00:00.000Z"),
      completedAt,
    },
  });

  await prisma.match.create({
    data: {
      id: `${prefix}-active-match`,
      sessionId,
      courtId,
      status: MatchStatus.IN_PROGRESS,
      team1User1Id: playerIds[0],
      team1User2Id: playerIds[2],
      team2User1Id: playerIds[1],
      team2User2Id: playerIds[3],
      createdAt: new Date("2026-05-02T11:00:00.000Z"),
    },
  });

  return { sessionId, code, playerIds, completedAt };
}

async function postCreateReal(code: string, body?: Record<string, unknown>) {
  return POST(
    new Request(`http://localhost/api/sessions/${code}/create-real`, {
      method: "POST",
      ...(body
        ? {
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          }
        : {}),
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
  await fs.writeFile(tempDatabaseFile, "");

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

describe("create real session route integration", () => {
  it("keeps setup-only copies free of test results by default", async () => {
    const prefix = `setup-${randomUUID().slice(0, 8)}`;
    const { clubId } = await createClubAdmin(prefix);
    await createPlayers(prefix, clubId, ["p1", "p2", "p3", "p4"]);
    const { sessionId, code } = await createTestSessionWithMatch(
      prefix,
      clubId
    );

    const response = await postCreateReal(code);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.isTest).toBe(false);
    expect(payload.sourceSessionId).toBe(sessionId);
    expect(payload.status).toBe(SessionStatus.WAITING);

    const copiedMatches = await prisma.match.findMany({
      where: { sessionId: payload.id },
    });
    const copiedPlayers = await prisma.sessionPlayer.findMany({
      where: { sessionId: payload.id },
    });

    expect(copiedMatches).toHaveLength(0);
    expect(
      copiedPlayers.every(
        (player) => player.sessionPoints === 0 && player.matchesPlayed === 0
      )
    ).toBe(true);
  });

  it("copies completed results into the real session and replays standings and ratings", async () => {
    const prefix = `results-${randomUUID().slice(0, 8)}`;
    const { clubId } = await createClubAdmin(prefix);
    await createPlayers(prefix, clubId, ["p1", "p2", "p3", "p4"]);
    const { sessionId, code, playerIds, completedAt } =
      await createTestSessionWithMatch(prefix, clubId);

    const response = await postCreateReal(code, { includeResults: true });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.isTest).toBe(false);
    expect(payload.sourceSessionId).toBe(sessionId);
    expect(payload.status).toBe(SessionStatus.ACTIVE);

    const copiedMatches = await prisma.match.findMany({
      where: { sessionId: payload.id },
    });
    expect(copiedMatches).toHaveLength(1);
    expect(copiedMatches[0]).toEqual(
      expect.objectContaining({
        status: MatchStatus.COMPLETED,
        team1Score: 11,
        team2Score: 9,
        winnerTeam: 1,
        completedAt,
      })
    );

    const copiedPlayers = await prisma.sessionPlayer.findMany({
      where: { sessionId: payload.id },
      orderBy: { userId: "asc" },
    });
    const copiedPlayerByUserId = new Map(
      copiedPlayers.map((player) => [player.userId, player])
    );

    expect(copiedPlayerByUserId.get(playerIds[0])?.sessionPoints).toBe(3);
    expect(copiedPlayerByUserId.get(playerIds[1])?.sessionPoints).toBe(3);
    expect(copiedPlayerByUserId.get(playerIds[2])?.sessionPoints).toBe(0);
    expect(copiedPlayerByUserId.get(playerIds[3])?.sessionPoints).toBe(0);
    expect(copiedPlayers.every((player) => player.matchesPlayed === 1)).toBe(
      true
    );
    expect(copiedPlayerByUserId.get(playerIds[0])?.lastPartnerId).toBe(
      playerIds[1]
    );
    expect(copiedPlayerByUserId.get(playerIds[2])?.lastPartnerId).toBe(
      playerIds[3]
    );

    const clubMembers = await prisma.clubMember.findMany({
      where: { clubId, userId: { in: playerIds } },
    });
    const eloByUserId = new Map(
      clubMembers.map((member) => [member.userId, member.elo])
    );
    expect(eloByUserId.get(playerIds[0])).toBe(1016);
    expect(eloByUserId.get(playerIds[1])).toBe(1016);
    expect(eloByUserId.get(playerIds[2])).toBe(984);
    expect(eloByUserId.get(playerIds[3])).toBe(984);

    const sourceMatches = await prisma.match.findMany({
      where: { sessionId },
    });
    expect(sourceMatches).toHaveLength(2);

    const duplicateResponse = await postCreateReal(code, {
      includeResults: true,
    });
    const duplicatePayload = await duplicateResponse.json();

    expect(duplicateResponse.status).toBe(409);
    expect(duplicatePayload.error).toContain("already has a real copy");
  });
});
