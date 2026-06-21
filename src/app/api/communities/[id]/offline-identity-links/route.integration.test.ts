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
  OfflineIdentityLinkStatus,
  PartnerPreference,
  PlayerGender,
  SessionClubRole,
  SessionClubStatus,
  SessionMode,
  SessionStatus,
  SessionType,
} from "@/types/enums";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

type PrismaInstance = typeof import("@/lib/prisma")["prisma"];
type PostLinkRoute = typeof import("./route")["POST"];
type GetRosterRoute =
  typeof import("@/app/api/clubs/[id]/collab-roster/route")["GET"];
type PatchLinkRoute = typeof import("./[requestId]/route")["PATCH"];
type ScoreRoute = typeof import("@/app/api/matches/[id]/score/route")["POST"];
type RollbackRoute =
  typeof import("@/app/api/sessions/[code]/rollback/route")["POST"];

const tempDatabaseFile = path.resolve(
  process.cwd(),
  "prisma",
  `offline-identity-links-${randomUUID()}.db`
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
let POST_LINK: PostLinkRoute;
let PATCH_LINK: PatchLinkRoute;
let GET_ROSTER: GetRosterRoute;
let SCORE_MATCH: ScoreRoute;
let ROLLBACK_SESSION: RollbackRoute;
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

function mockUser(userId: string, isAdmin = false) {
  mockedAuth.mockResolvedValue({
    user: {
      id: userId,
      isAdmin,
    },
  } as never);
}

async function createUser({
  id,
  name,
  email = null,
  isClaimed = false,
}: {
  id: string;
  name: string;
  email?: string | null;
  isClaimed?: boolean;
}) {
  await prisma.user.create({
    data: {
      id,
      name,
      email,
      passwordHash: isClaimed ? "test-password-hash" : null,
      isClaimed,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
    },
  });
}

async function createClub({
  id,
  name,
  adminId,
}: {
  id: string;
  name: string;
  adminId: string;
}) {
  await prisma.club.create({
    data: {
      id,
      name,
      createdById: adminId,
    },
  });
  await prisma.clubMember.create({
    data: {
      clubId: id,
      userId: adminId,
      role: "ADMIN",
    },
  });
}

async function addMember(clubId: string, userId: string, elo = 1000) {
  await prisma.clubMember.create({
    data: {
      clubId,
      userId,
      role: "MEMBER",
      elo,
    },
  });
}

async function postLink(body: Record<string, unknown>, clubId: string) {
  return POST_LINK(
    new Request(`http://localhost/api/clubs/${clubId}/offline-identity-links`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: clubId }) }
  );
}

async function patchLink(
  requestId: string,
  clubId: string,
  status: OfflineIdentityLinkStatus.ACCEPTED | OfflineIdentityLinkStatus.REJECTED
) {
  return PATCH_LINK(
    new Request(
      `http://localhost/api/clubs/${clubId}/offline-identity-links/${requestId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      }
    ),
    { params: Promise.resolve({ id: clubId, requestId }) }
  );
}

async function createLinkedCommunities(prefix: string) {
  const communityAId = `${prefix}-community-a`;
  const communityBId = `${prefix}-community-b`;
  const adminAId = `${prefix}-admin-a`;
  const adminBId = `${prefix}-admin-b`;
  const haziqAId = `${prefix}-haziq-a`;
  const haziqBId = `${prefix}-haziq-b`;

  await createUser({
    id: adminAId,
    name: "Admin A",
    email: `${prefix}-admin-a@example.com`,
    isClaimed: true,
  });
  await createUser({
    id: adminBId,
    name: "Admin B",
    email: `${prefix}-admin-b@example.com`,
    isClaimed: true,
  });
  await createUser({ id: haziqAId, name: "Haziq" });
  await createUser({ id: haziqBId, name: "Haziq" });
  await createClub({
    id: communityAId,
    name: `${prefix} Community A`,
    adminId: adminAId,
  });
  await createClub({
    id: communityBId,
    name: `${prefix} Community B`,
    adminId: adminBId,
  });
  await addMember(communityAId, haziqAId);
  await addMember(communityBId, haziqBId);

  mockUser(adminAId);
  const createResponse = await postLink(
    {
      sourceUserId: haziqAId,
      targetClubId: communityBId,
      targetUserId: haziqBId,
    },
    communityAId
  );
  const createPayload = await createResponse.json();
  expect(createResponse.status).toBe(201);

  mockUser(adminBId);
  const approveResponse = await patchLink(
    createPayload.id,
    communityBId,
    OfflineIdentityLinkStatus.ACCEPTED
  );
  expect(approveResponse.status).toBe(200);

  return {
    communityAId,
    communityBId,
    adminAId,
    adminBId,
    haziqAId,
    haziqBId,
  };
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

  POST_LINK = (await import("./route")).POST;
  PATCH_LINK = (await import("./[requestId]/route")).PATCH;
  GET_ROSTER = (await import("@/app/api/clubs/[id]/collab-roster/route")).GET;
  SCORE_MATCH = (await import("@/app/api/matches/[id]/score/route")).POST;
  ROLLBACK_SESSION = (await import("@/app/api/sessions/[code]/rollback/route")).POST;
});

beforeEach(async () => {
  vi.clearAllMocks();
  await prisma.matchEloAdjustment.deleteMany();
  await prisma.match.deleteMany();
  await prisma.court.deleteMany();
  await prisma.sessionPlayer.deleteMany();
  await prisma.sessionClub.deleteMany();
  await prisma.session.deleteMany();
  await prisma.offlineIdentityLinkRequest.deleteMany();
  await prisma.offlineIdentityMember.deleteMany();
  await prisma.offlineIdentity.deleteMany();
  await prisma.clubMember.deleteMany();
  await prisma.club.deleteMany();
  await prisma.user.deleteMany();
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

describe("offline identity links", () => {
  it("requires source and target club admin approval", async () => {
    const prefix = `approval-${randomUUID().slice(0, 8)}`;
    const communityAId = `${prefix}-community-a`;
    const communityBId = `${prefix}-community-b`;
    const adminAId = `${prefix}-admin-a`;
    const adminBId = `${prefix}-admin-b`;
    const unrelatedAdminId = `${prefix}-admin-c`;
    const unrelatedClubId = `${prefix}-community-c`;
    const haziqAId = `${prefix}-haziq-a`;
    const haziqBId = `${prefix}-haziq-b`;

    await createUser({ id: adminAId, name: "Admin A", email: `${prefix}-a@example.com`, isClaimed: true });
    await createUser({ id: adminBId, name: "Admin B", email: `${prefix}-b@example.com`, isClaimed: true });
    await createUser({ id: unrelatedAdminId, name: "Admin C", email: `${prefix}-c@example.com`, isClaimed: true });
    await createUser({ id: haziqAId, name: "Haziq" });
    await createUser({ id: haziqBId, name: "Haziq" });
    await createClub({ id: communityAId, name: `${prefix} A`, adminId: adminAId });
    await createClub({ id: communityBId, name: `${prefix} B`, adminId: adminBId });
    await createClub({ id: unrelatedClubId, name: `${prefix} C`, adminId: unrelatedAdminId });
    await addMember(communityAId, haziqAId);
    await addMember(communityBId, haziqBId);

    mockUser(adminBId);
    const forbiddenCreate = await postLink(
      {
        sourceUserId: haziqAId,
        targetClubId: communityBId,
        targetUserId: haziqBId,
      },
      communityAId
    );
    expect(forbiddenCreate.status).not.toBe(201);

    mockUser(adminAId);
    const createResponse = await postLink(
      {
        sourceUserId: haziqAId,
        targetClubId: communityBId,
        targetUserId: haziqBId,
      },
      communityAId
    );
    const createPayload = await createResponse.json();
    expect(createResponse.status).toBe(201);
    expect(createPayload.status).toBe(OfflineIdentityLinkStatus.PENDING);

    mockUser(unrelatedAdminId);
    const unrelatedApprove = await patchLink(
      createPayload.id,
      communityBId,
      OfflineIdentityLinkStatus.ACCEPTED
    );
    expect(unrelatedApprove.status).not.toBe(200);

    mockUser(adminBId);
    const approveResponse = await patchLink(
      createPayload.id,
      communityBId,
      OfflineIdentityLinkStatus.ACCEPTED
    );
    const approvePayload = await approveResponse.json();
    expect(approveResponse.status).toBe(200);
    expect(approvePayload.status).toBe(OfflineIdentityLinkStatus.ACCEPTED);

    const members = await prisma.offlineIdentityMember.findMany();
    expect(members).toHaveLength(2);
  });

  it("dedupes linked placeholders in collab rosters and updates both club ratings", async () => {
    const prefix = `elo-${randomUUID().slice(0, 8)}`;
    const {
      communityAId,
      communityBId,
      adminAId,
      haziqAId,
      haziqBId,
    } = await createLinkedCommunities(prefix);
    const playerIds = ["p2", "p3", "p4"].map((key) => `${prefix}-${key}`);
    for (const playerId of playerIds) {
      await createUser({
        id: playerId,
        name: playerId,
        email: `${playerId}@example.com`,
        isClaimed: true,
      });
      await addMember(communityAId, playerId);
    }

    mockUser(adminAId);
    const rosterResponse = await GET_ROSTER(
      new Request(
        `http://localhost/api/clubs/${communityAId}/collab-roster?partnerClubId=${communityBId}`
      ),
      { params: Promise.resolve({ id: communityAId }) }
    );
    const rosterPayload = await rosterResponse.json();
    expect(rosterResponse.status).toBe(200);
    expect(
      rosterPayload.filter((player: { name: string }) => player.name === "Haziq")
    ).toHaveLength(1);

    const sessionId = `${prefix}-session`;
    const courtId = `${prefix}-court`;
    const matchId = `${prefix}-match`;
    await prisma.session.create({
      data: {
        id: sessionId,
        code: `${prefix}-code`,
        clubId: communityAId,
        name: `${prefix} Session`,
        type: SessionType.ELO,
        mode: SessionMode.MEXICANO,
        status: SessionStatus.ACTIVE,
        sessionClubs: {
          create: [
            {
              clubId: communityAId,
              role: SessionClubRole.HOST,
              status: SessionClubStatus.ACCEPTED,
              requestedById: adminAId,
              reviewedById: adminAId,
              reviewedAt: new Date(),
            },
            {
              clubId: communityBId,
              role: SessionClubRole.PARTNER,
              status: SessionClubStatus.ACCEPTED,
              requestedById: adminAId,
              reviewedById: adminAId,
              reviewedAt: new Date(),
            },
          ],
        },
        courts: {
          create: [{ id: courtId, courtNumber: 1 }],
        },
        players: {
          create: [haziqAId, ...playerIds].map((userId) => ({
            userId,
            gender: PlayerGender.MALE,
            partnerPreference: PartnerPreference.OPEN,
          })),
        },
      },
    });
    await prisma.match.create({
      data: {
        id: matchId,
        sessionId,
        courtId,
        status: MatchStatus.IN_PROGRESS,
        team1User1Id: haziqAId,
        team1User2Id: playerIds[0],
        team2User1Id: playerIds[1],
        team2User2Id: playerIds[2],
      },
    });

    const scoreResponse = await SCORE_MATCH(
      new Request(`http://localhost/api/matches/${matchId}/score`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ team1Score: 11, team2Score: 8 }),
      }),
      { params: Promise.resolve({ id: matchId }) }
    );
    expect(scoreResponse.status).toBe(200);

    const [haziqA, haziqB] = await Promise.all([
      prisma.clubMember.findUnique({
        where: { clubId_userId: { clubId: communityAId, userId: haziqAId } },
      }),
      prisma.clubMember.findUnique({
        where: { clubId_userId: { clubId: communityBId, userId: haziqBId } },
      }),
    ]);
    expect(haziqA?.elo).toBeGreaterThan(1000);
    expect(haziqB?.elo).toBeGreaterThan(1000);

    await prisma.session.update({
      where: { id: sessionId },
      data: { status: SessionStatus.COMPLETED, endedAt: new Date() },
    });
    const rollbackResponse = await ROLLBACK_SESSION(
      new Request(`http://localhost/api/sessions/${prefix}-code/rollback`, {
        method: "POST",
      }),
      { params: Promise.resolve({ code: `${prefix}-code` }) }
    );
    expect(rollbackResponse.status).toBe(200);

    const [rolledBackA, rolledBackB] = await Promise.all([
      prisma.clubMember.findUnique({
        where: { clubId_userId: { clubId: communityAId, userId: haziqAId } },
      }),
      prisma.clubMember.findUnique({
        where: { clubId_userId: { clubId: communityBId, userId: haziqBId } },
      }),
    ]);
    expect(rolledBackA?.elo).toBe(1000);
    expect(rolledBackB?.elo).toBe(1000);
  });
});
