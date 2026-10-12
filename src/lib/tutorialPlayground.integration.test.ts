import { PrismaClient } from "@prisma/client";
import { vi } from "vitest";
import { clubOwnershipTransaction, claimClubPlayer } from "./clubPlayerOwnership";
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
} from "vitest";
import {
  ADMIN_ONBOARDING_TUTORIAL_KEY,
} from "./adminOnboarding";
import { buildClubPulse } from "./clubPulse";
import {
  MatchStatus,
  PartnerPreference,
  PlayerGender,
  SessionStatus,
} from "@/types/enums";

type PrismaInstance = typeof import("@/lib/prisma")["prisma"];
type TutorialPlaygroundModule = typeof import("./tutorialPlayground");

const tempDatabaseFile = path.resolve(
  process.cwd(),
  "prisma",
  `tutorial-playground-${randomUUID()}.db`
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
let tutorialPlayground: TutorialPlaygroundModule;
vi.mock("@/lib/prisma", () => ({ get prisma() { return prisma; } }));

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

async function createOwner(id = "owner-1") { return prisma.user.create({ data: { id, email: `${id}@example.com`, passwordHash: "fixture", name: "Owner", gender: PlayerGender.MALE } }); }

async function clearDatabase() { await prisma?.$disconnect(); await fs.copyFile(`${tempDatabaseFile}.baseline`, tempDatabaseFile); prisma = new PrismaClient({ datasources: { db: { url: tempDatabaseUrl } } }); }

function expectSeededNames(expectFn: typeof expect, names: string[]) {
  expectFn(names).toEqual(
    tutorialPlayground.TUTORIAL_FAKE_PLAYERS.map((player) => player.name).sort()
  );
  expectFn(names.every((name) => name.length < 9)).toBe(true);
}

async function buildSeededClubPulse(clubId: string) {
  const [members, sessions, completedMatches] = await Promise.all([
    prisma.clubMember.findMany({
      where: { clubId, archivedAt: null },
      include: { player: { select: { id: true, name: true } } },
    }),
    prisma.session.findMany({
      where: { clubId },
      include: {
        players: { include: { player: { select: { id: true, name: true } } } },
      },
    }),
    prisma.match.findMany({
      where: {
        status: MatchStatus.COMPLETED,
        session: { clubId, isTest: false },
      },
      include: {
        team1Player1: { select: { id: true, name: true } },
        team1Player2: { select: { id: true, name: true } },
        team2Player1: { select: { id: true, name: true } },
        team2Player2: { select: { id: true, name: true } },
        session: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            createdAt: true,
            endedAt: true,
          },
        },
      },
    }),
  ]);

  return buildClubPulse({
    members: members.map((member) => ({
      id: member.player.id,
      name: member.player.name,
      elo: member.elo,
    })),
    sessions: sessions.map((session) => ({
      id: session.id,
      code: session.code,
      name: session.name,
      type: session.type,
      status: session.status,
      isTest: session.isTest,
      createdAt: session.createdAt,
      endedAt: session.endedAt,
      players: session.players.map((player) => ({
        user: {
          id: player.player.id,
          name: player.player.name,
        },
      })),
    })),
    completedMatches: completedMatches.map((match) => ({
      id: match.id,
      completedAt: match.completedAt,
      session: match.session,
      winnerTeam: match.winnerTeam,
      team1User1Id: match.team1Player1Id,
      team1User2Id: match.team1Player2Id,
      team2User1Id: match.team2Player1Id,
      team2User2Id: match.team2Player2Id,
      team1User1: match.team1Player1,
      team1User2: match.team1Player2,
      team2User1: match.team2Player1,
      team2User2: match.team2Player2,
      team1Score: match.team1Score,
      team2Score: match.team2Score,
      team1EloChange: match.team1EloChange,
      team2EloChange: match.team2EloChange,
    })),
  });
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
    execFileSync("cmd.exe", ["/c", prismaBinary, "migrate", "deploy"], {
      cwd: process.cwd(),
      env: process.env as NodeJS.ProcessEnv,
      stdio: "pipe",
    });
  } else {
    execFileSync(prismaBinary, ["migrate", "deploy"], {
      cwd: process.cwd(),
      env: process.env as NodeJS.ProcessEnv,
      stdio: "pipe",
    });
  }

  await fs.copyFile(tempDatabaseFile, `${tempDatabaseFile}.baseline`);
  tutorialPlayground = await import("./tutorialPlayground");
}, 60000);

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await prisma?.$disconnect();
  (globalThis as { prisma?: PrismaInstance }).prisma = undefined;

  mutableEnv.DATABASE_URL = previousEnv.DATABASE_URL;
  mutableEnv.TURSO_DATABASE_URL = previousEnv.TURSO_DATABASE_URL;
  mutableEnv.TURSO_AUTH_TOKEN = previousEnv.TURSO_AUTH_TOKEN;
  mutableEnv.NODE_ENV = previousEnv.NODE_ENV;

  await removeDatabaseFiles();
  await fs.rm(`${tempDatabaseFile}.baseline`, { force: true });
});

describe("tutorial playground service", () => {
  it("creates a private seeded playground with history, fake players, and a live two-court session", async () => {
    const owner = await createOwner();

    const summary = await tutorialPlayground.ensureTutorialPlayground(owner.id);

    expect(summary.clubName).toBe(
      tutorialPlayground.TUTORIAL_PLAYGROUND_LABEL
    );
    expect(summary.playersCount).toBe(13);
    expect(summary.courtsCount).toBe(2);
    expect(summary.sessionCode).toEqual(expect.any(String));

    const club = await prisma.club.findUnique({
      where: { id: summary.clubId },
      include: {
        members: {
          include: { player: true },
          orderBy: { createdAt: "asc" },
        },
        sessions: {
          include: {
            courts: true,
            players: { include: { player: true } },
            matches: true,
          },
        },
      },
    });

    expect(club?.isTutorial).toBe(true);
    expect(club?.tutorialOwnerId).toBe(owner.id);
    expect(club?.name).not.toBe(summary.clubName);
    expect(club?.name).toContain(summary.clubName);
    const ownerAccess = await prisma.clubAccess.findUnique({
      where: { clubId_userId: { clubId: summary.clubId, userId: owner.id } },
    });
    expect(ownerAccess).toMatchObject({ role: "OWNER", status: "ACTIVE" });

    const fakeMembers =
      club?.members.filter((member) => member.ownerUserId !== owner.id) ?? [];
    expect(fakeMembers).toHaveLength(13);
    expectSeededNames(
      expect,
      fakeMembers.map((member) => member.player.name).sort()
    );
    expect(
      fakeMembers.every((member) => member.player.ownerUserId === null)
    ).toBe(true);
    expect(
      await prisma.user.count({
        where: { id: { in: fakeMembers.map((member) => member.playerId) } },
      })
    ).toBe(0);

    const practiceSession = club?.sessions.find(
      (session) => session.isTest
    );
    expect(practiceSession?.status).toBe(SessionStatus.ACTIVE);
    expect(practiceSession?.isTest).toBe(true);
    expect(practiceSession?.players).toHaveLength(13);
    expect(practiceSession?.courts).toHaveLength(2);
    expect(
      practiceSession?.courts.every((court) => court.currentMatchId !== null)
    ).toBe(true);
    expect(
      practiceSession?.matches.filter(
        (match) => match.status === MatchStatus.IN_PROGRESS
      )
    ).toHaveLength(2);

    const completedPracticeSessions =
      club?.sessions.filter(
        (session) =>
          !session.isTest && session.status === SessionStatus.COMPLETED
      ) ?? [];
    expect(completedPracticeSessions).toHaveLength(3);
    expect(completedPracticeSessions.map((session) => session.name).sort()).toEqual(
      [...tutorialPlayground.TUTORIAL_HISTORY_SESSION_NAMES].sort()
    );
    expect(
      completedPracticeSessions.flatMap((session) =>
        session.matches.filter((match) => match.status === MatchStatus.COMPLETED)
      )
    ).toHaveLength(18);
    expect(
      await prisma.matchEloAdjustment.count({
        where: { clubId: summary.clubId },
      })
    ).toBe(72);

    const rankedNames =
      club?.members
        .filter((member) => member.ownerUserId !== owner.id)
        .slice()
        .sort((left, right) => right.elo - left.elo)
        .slice(0, 5)
        .map((member) => member.player.name) ?? [];
    expect(rankedNames).toEqual([
      "Danish",
      "Farah",
      "Amir",
      "Aiman",
      "Siti",
    ]);

    const pulse = await buildSeededClubPulse(summary.clubId);
    expect(pulse.metrics.completedTournaments).toBe(3);
    expect(pulse.metrics.recentMatches).toBe(18);
    expect(pulse.hotPlayers.length).toBeGreaterThan(0);
    expect(pulse.hotPlayers.map((player) => player.user.name)).toContain(
      "Farah"
    );
    expect(pulse.rivalries[0].players.map((player) => player.name).sort()).toEqual([
      "Aiman",
      "Haziq",
    ]);
    expect(pulse.rivalries[0].matches).toBe(4);
    expect(pulse.rivalries[0].playerOneWins).toBe(2);
    expect(pulse.rivalries[0].playerTwoWins).toBe(2);
    expect(
      pulse.partnerships[0].players.map((player) => player.name).sort()
    ).toEqual(["Danish", "Farah"]);
    expect(pulse.partnerships[0].wins).toBe(6);
    expect(pulse.latestStory?.session.name).toBe("Weekend Cup");
  });

  it("resets seeded sessions, fake users, and tutorial progress", async () => {
    const owner = await createOwner();
    const firstSummary = await tutorialPlayground.ensureTutorialPlayground(owner.id);
    const originalFakeUserIds = (
      await prisma.clubMember.findMany({
        where: {
          clubId: firstSummary.clubId,
          ownerUserId: null,
        },
        select: { playerId: true },
      })
    ).map((member) => member.playerId);

    await prisma.tutorialProgress.create({
      data: {
        userId: owner.id,
        tutorialKey: ADMIN_ONBOARDING_TUTORIAL_KEY,
        completedStepIdsJson: JSON.stringify(["score-match"]),
      },
    });

    const resetSummary = await tutorialPlayground.resetTutorialPlayground(owner.id);

    expect(resetSummary.clubId).toBe(firstSummary.clubId);
    expect(resetSummary.sessionCode).not.toBe(firstSummary.sessionCode);
    expect(resetSummary.playersCount).toBe(13);
    expect(resetSummary.courtsCount).toBe(2);
    expect(resetSummary.clubName).toBe(
      tutorialPlayground.TUTORIAL_PLAYGROUND_LABEL
    );
    expect(
      await prisma.tutorialProgress.findUnique({
        where: {
          userId_tutorialKey: {
            userId: owner.id,
            tutorialKey: ADMIN_ONBOARDING_TUTORIAL_KEY,
          },
        },
      })
    ).toBeNull();
    expect(
      await prisma.player.findMany({
        where: { id: { in: originalFakeUserIds } },
      })
    ).toHaveLength(0);

    const fakeNames = (
      await prisma.clubMember.findMany({
        where: {
          clubId: resetSummary.clubId,
          ownerUserId: null,
        },
        include: { player: true },
      })
    )
      .map((member) => member.player.name)
      .sort();
    expectSeededNames(expect, fakeNames);
    expect(
      await prisma.session.count({
        where: {
          clubId: resetSummary.clubId,
          isTest: false,
          status: SessionStatus.COMPLETED,
        },
      })
    ).toBe(3);
    expect(
      await prisma.match.count({
        where: {
          status: MatchStatus.COMPLETED,
          session: {
            clubId: resetSummary.clubId,
            isTest: false,
          },
        },
      })
    ).toBe(18);
  }, 15_000);
});



async function createExistingClubProfile(ownerId: string, suffix: string) {
  const club = await prisma.club.create({ data: { id: `existing-${suffix}`, name: `Existing ${suffix}`, createdById: ownerId } });
  await prisma.clubAccess.create({ data: { clubId: club.id, userId: ownerId, role: "OWNER", status: "ACTIVE" } });
  const player = await prisma.player.create({ data: { id: `existing-player-${suffix}`, name: `Placeholder ${suffix}`, gender: PlayerGender.MALE, elo: 1275 } });
  await prisma.clubMember.create({ data: { clubId: club.id, playerId: player.id, elo: 1337 } });
  await clubOwnershipTransaction(prisma, tx => claimClubPlayer(tx, { clubId: club.id, playerId: player.id, userId: ownerId, actorUserId: ownerId }));
  return { clubId: club.id, playerId: player.id };
}

async function existingProfileSnapshot(ids: { clubId: string; playerId: string }[]) {
  return Promise.all(ids.map(async id => ({
    club: await prisma.club.findUnique({ where: { id: id.clubId } }),
    player: await prisma.player.findUnique({ where: { id: id.playerId } }),
    member: await prisma.clubMember.findUnique({ where: { clubId_playerId: id } }),
    access: await prisma.clubAccess.findMany({ where: { clubId: id.clubId } }),
    events: await prisma.clubPlayerOwnershipEvent.findMany({ where: { clubId: id.clubId } }),
  })));
}

describe("tutorial profile isolation", () => {
  it.each([0, 2])("creates, resets and deletes an isolated profile with %i existing owned club profiles", async count => {
    const owner = await createOwner(`owner-${count}`);
    const profiles = [];
    for (let index = 0; index < count; index++) profiles.push(await createExistingClubProfile(owner.id, `${count}-${index}`));
    const before = await existingProfileSnapshot(profiles);
    const accountBefore = await prisma.user.findUnique({ where: { id: owner.id } });
    const first = await tutorialPlayground.ensureTutorialPlayground(owner.id);
    const ownMember = await prisma.clubMember.findFirstOrThrow({ where: { clubId: first.clubId, ownerUserId: owner.id }, include: { player: true } });
    expect(ownMember.playerId).not.toBe(owner.id);
    expect(profiles.map(profile => profile.playerId)).not.toContain(ownMember.playerId);
    expect(ownMember.player).toMatchObject({ name: "Owner", ownerUserId: null });
    const seeded = await prisma.session.findMany({ where: { clubId: first.clubId }, include: { players: true } });
    expect(seeded).toHaveLength(4);
    expect(seeded.every(session => session.ratingPolicyVersion === 2)).toBe(true);
    expect(seeded.flatMap(session => session.players).every(player => player.profileClubId === first.clubId && player.participantAccountId === null && !player.isGuest)).toBe(true);
    const repeat = await tutorialPlayground.ensureTutorialPlayground(owner.id);
    expect(repeat).toEqual(first);
    expect(await existingProfileSnapshot(profiles)).toEqual(before);
    const reset = await tutorialPlayground.resetTutorialPlayground(owner.id);
    expect(reset.clubId).toBe(first.clubId); expect(reset.sessionCode).not.toBe(first.sessionCode);
    expect(await prisma.clubMember.findUnique({ where: { id: ownMember.id } })).toMatchObject({ playerId: ownMember.playerId, ownerUserId: owner.id });
    expect(await existingProfileSnapshot(profiles)).toEqual(before);
    await expect(tutorialPlayground.deleteTutorialPlayground(`wrong-${count}`, first.clubId)).rejects.toThrow("Tutorial playground not found");
    await tutorialPlayground.deleteTutorialPlayground(owner.id, first.clubId);
    expect(await prisma.club.findUnique({ where: { id: first.clubId } })).toBeNull();
    expect(await prisma.session.count({ where: { clubId: first.clubId } })).toBe(0);
    expect(await existingProfileSnapshot(profiles)).toEqual(before);
    expect(await prisma.user.findUnique({ where: { id: owner.id } })).toEqual(accountBefore);
  }, 30000);
});
