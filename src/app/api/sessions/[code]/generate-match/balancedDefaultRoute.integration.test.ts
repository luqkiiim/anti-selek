import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import {
  afterAll,
  afterEach,
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
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionPool,
  SessionStatus,
  SessionType,
} from "@/types/enums";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

type PrismaInstance = typeof import("@/lib/prisma")["prisma"];
type GenerateMatchPost = typeof import("./route")["POST"];
type QueueMatchPost = typeof import("../queue-match/route")["POST"];
type QueueMatchAssignPost = typeof import("../queue-match/assign/route")["POST"];
type RebuildQueuedMatch = typeof import("../queue-match/shared")["tryRebuildQueuedMatchForSessionId"];
type RebuildAutomaticQueuedMatch = typeof import("../queue-match/shared")["tryRebuildAutomaticQueuedMatchForSessionId"];

const tempDatabaseFile = path.resolve(
  process.cwd(),
  "prisma",
  `balanced-default-route-${randomUUID()}.db`,
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
let POST: GenerateMatchPost;
let queuePOST: QueueMatchPost;
let assignQueuedPOST: QueueMatchAssignPost;
let rebuildQueuedMatch: RebuildQueuedMatch;
let rebuildAutomaticQueuedMatch: RebuildAutomaticQueuedMatch;
let balancedRecurrence: typeof import("@/lib/matchmaking/v3/balancedRecurrence");
let balancedAcceptance: typeof import("@/lib/matchmaking/v3/balancedCandidateAcceptance");
let socialBatch: typeof import("@/lib/matchmaking/v3/socialBatch");
let mockedAuth: MockedFunction<typeof import("@/lib/auth")["auth"]>;

interface FixtureOptions {
  prefix: string;
  type: SessionType;
  playerCount: number;
  courtCount: number;
  respectPlayerRest?: boolean;
  pausedPlayerIndexes?: number[];
  skipNextPlayerIndexes?: number[];
}

interface SessionFixture {
  sessionId: string;
  code: string;
  playerIds: string[];
  courtIds: string[];
}

async function removeDatabaseFiles() {
  await Promise.all(
    ["", "-journal", "-shm", "-wal"].map((suffix) =>
      fs.rm(`${tempDatabaseFile}${suffix}`, { force: true }),
    ),
  );
}

async function createFixture({
  prefix,
  type,
  playerCount,
  courtCount,
  respectPlayerRest = true,
  pausedPlayerIndexes = [],
  skipNextPlayerIndexes = [],
}: FixtureOptions): Promise<SessionFixture> {
  const playerIds = Array.from(
    { length: playerCount },
    (_unused, index) => `${prefix}-player-${index + 1}`,
  );
  const accountIds = playerIds.map((playerId) => `account-${playerId}`);
  const courtIds = Array.from(
    { length: courtCount },
    (_unused, index) => `${prefix}-court-${index + 1}`,
  );
  const sessionId = `${prefix}-session`;
  const code = `${prefix}-code`;
  const now = new Date("2026-10-01T00:00:00.000Z");

  await prisma.user.createMany({
    data: playerIds.map((playerId, index) => ({
      id: accountIds[index],
      email: `${playerId}@example.com`,
      passwordHash: "test-password-hash",
      name: playerId,
    })),
  });
  await prisma.player.createMany({
    data: playerIds.map((playerId, index) => ({
      id: playerId,
      name: playerId,
      ownerUserId: accountIds[index],
      gender: index % 2 === 0 ? PlayerGender.MALE : PlayerGender.FEMALE,
      partnerPreference:
        index % 2 === 0
          ? PartnerPreference.OPEN
          : PartnerPreference.FEMALE_FLEX,
      mixedSideOverride:
        index % 2 === 0 ? MixedSide.UPPER : MixedSide.LOWER,
      elo: 1000 + index * 7,
    })),
  });

  await prisma.session.create({
    data: {
      id: sessionId,
      code,
      name: `${prefix} Balanced default session`,
      type,
      mode: SessionMode.MEXICANO,
      status: SessionStatus.ACTIVE,
      respectPlayerRest,
      autoQueueEnabled: true,
      poolsEnabled: false,
      players: {
        create: playerIds.map((playerId, index) => ({
          playerId,
          gender: index % 2 === 0 ? PlayerGender.MALE : PlayerGender.FEMALE,
          partnerPreference:
            index % 2 === 0
              ? PartnerPreference.OPEN
              : PartnerPreference.FEMALE_FLEX,
          mixedSideOverride:
            index % 2 === 0 ? MixedSide.UPPER : MixedSide.LOWER,
          pool: SessionPool.A,
          sessionPoints: 10 + index,
          availableSince: now,
          joinedAt: now,
          isPaused: pausedPlayerIndexes.includes(index),
          skipNextMatchAt: skipNextPlayerIndexes.includes(index) ? now : null,
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

  mockedAuth.mockResolvedValue({
    user: { id: `operator-${prefix}`, isAdmin: true },
  } as never);

  return { sessionId, code, playerIds, courtIds };
}

async function createCurrentMatch(
  fixture: SessionFixture,
  courtIndex = 0,
  playerStartIndex = 0,
) {
  const [team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id] =
    fixture.playerIds.slice(playerStartIndex, playerStartIndex + 4);
  const match = await prisma.match.create({
    data: {
      sessionId: fixture.sessionId,
      courtId: fixture.courtIds[courtIndex],
      status: MatchStatus.IN_PROGRESS,
      team1Player1Id,
      team1Player2Id,
      team2Player1Id,
      team2Player2Id,
      createdAt: new Date("2026-09-30T00:00:00.000Z"),
    },
  });
  await prisma.court.update({
    where: { id: fixture.courtIds[courtIndex] },
    data: { currentMatchId: match.id },
  });
  return match;
}

function selectedIds(match: {
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
}) {
  return [
    match.team1Player1Id,
    match.team1Player2Id,
    match.team2Player1Id,
    match.team2Player2Id,
  ];
}

function readBalancedDecision(reasonJson: string | null | undefined) {
  return JSON.parse(reasonJson ?? "{}").balancedPolicyDecision as {
    requestedPolicy: string;
    appliedPolicy: string;
    outcome: string;
    reasonCodes: string[];
    candidateProof: {
      fullSearchCertified: boolean;
      structuralVocabularyVerified: boolean;
      structuralVocabularyPlayerCount: number;
    };
    fallbackProof?: {
      certified: boolean;
      recurrenceCertified: false;
      lateVarietyCertified: false;
    };
  } | undefined;
}

function expectCertifiedBalancedDecision(reasonJson: string | null | undefined) {
  const decision = readBalancedDecision(reasonJson);
  expect(decision?.requestedPolicy).toBe("strict-replay-rescue");
  if (decision?.outcome === "candidate-exact") {
    expect(decision.appliedPolicy).toBe("strict-replay-rescue");
    expect(decision.candidateProof).toMatchObject({
      fullSearchCertified: true,
      structuralVocabularyVerified: true,
    });
  } else {
    expect(decision?.outcome).toBe("production-fallback");
    expect(decision?.appliedPolicy).toBe("production");
    expect(decision?.fallbackProof).toMatchObject({
      certified: true,
      recurrenceCertified: false,
      lateVarietyCertified: false,
    });
  }
  return decision;
}

async function postGenerateMatch(code: string, body: Record<string, unknown>) {
  return POST(
    new Request(`http://localhost/api/sessions/${code}/generate-match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ code }) },
  );
}

async function postQueueMatch(code: string, body: Record<string, unknown> = {}) {
  return queuePOST(
    new Request(`http://localhost/api/sessions/${code}/queue-match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ code }) },
  );
}

async function postAssignQueuedMatch(code: string) {
  return assignQueuedPOST(
    new Request(`http://localhost/api/sessions/${code}/queue-match/assign`, {
      method: "POST",
    }),
    { params: Promise.resolve({ code }) },
  );
}

function wrapWriterDelegate(
  delegate: object,
  delegateName: "match" | "queuedMatch",
  events: string[],
) {
  const methods = new Set(
    delegateName === "match" ? ["create"] : ["create", "update"],
  );
  return new Proxy(delegate, {
    get(target, property, receiver) {
      const method = Reflect.get(target, property, receiver);
      if (typeof method !== "function") return method;
      if (methods.has(String(property))) {
        return (...args: unknown[]) => {
          events.push(`${delegateName}.${String(property)}`);
          return Reflect.apply(method, target, args);
        };
      }
      return method.bind(target);
    },
  });
}

function traceAutomaticWriters(options: { watchCandidateEngine?: boolean } = {}) {
  const events: string[] = [];
  const originalMatcher = balancedRecurrence.findBestBalancedRecurrenceSelection;
  const matcherSpy = options.watchCandidateEngine === false
    ? undefined
    : vi
        .spyOn(balancedRecurrence, "findBestBalancedRecurrenceSelection")
        .mockImplementation((players, matcherOptions) => {
          events.push("candidate-engine");
          return originalMatcher(players, matcherOptions);
        });
  const originalGate = balancedAcceptance.runBalancedCandidateWithProductionFallback;
  const gateSpy = vi
    .spyOn(balancedAcceptance, "runBalancedCandidateWithProductionFallback")
    .mockImplementation((input) => {
      const run = originalGate(input);
      const decision = run.decision;
      const candidateProof = decision.candidateProof;
      const fullCandidateProof =
        decision.outcome === "candidate-exact" &&
        decision.appliedPolicy === "strict-replay-rescue" &&
        candidateProof.selectionPresent &&
        candidateProof.echoedPolicy &&
        candidateProof.fairnessCertified &&
        candidateProof.scheduleCertified &&
        candidateProof.starvationCertified &&
        candidateProof.balanceCertified &&
        candidateProof.replayCertified &&
        candidateProof.coverageGateCertified &&
        candidateProof.recurrenceFrontierCertified &&
        candidateProof.recurrenceAdmissionCertified &&
        candidateProof.fullSearchCertified &&
        candidateProof.structuralVocabularyVerified;
      const certifiedFallback =
        decision.outcome === "production-fallback" &&
        decision.appliedPolicy === "production" &&
        decision.fallbackProof?.certified === true &&
        decision.fallbackProof.fairnessCertified &&
        decision.fallbackProof.scheduleCertified &&
        decision.fallbackProof.starvationCertified &&
        decision.fallbackProof.balanceCertified &&
        decision.fallbackProof.replayCertified &&
        decision.fallbackProof.coverageGateCertified &&
        decision.fallbackProof.recurrenceCertified === false &&
        decision.fallbackProof.lateVarietyCertified === false;
      events.push(
        fullCandidateProof
          ? "certified:candidate-exact"
          : certifiedFallback
            ? "certified:production-fallback"
            : "no-certified-selection",
      );
      return run;
    });
  const originalTransaction = prisma.$transaction.bind(prisma);
  const transactionSpy = vi.spyOn(prisma, "$transaction");
  transactionSpy.mockImplementation(
    ((callback: (tx: Prisma.TransactionClient) => unknown) =>
      originalTransaction(async (tx) => {
        events.push("transaction.begin");
        const traced = new Proxy(tx, {
          get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (property === "match") {
              return wrapWriterDelegate(value as object, "match", events);
            }
            if (property === "queuedMatch") {
              return wrapWriterDelegate(value as object, "queuedMatch", events);
            }
            return value;
          },
        });
        try {
          return await callback(traced);
        } finally {
          events.push("transaction.end");
        }
      })) as typeof prisma.$transaction,
  );

  return {
    events,
    matcherSpy,
    gateSpy,
    restore: () => {
      matcherSpy?.mockRestore();
      gateSpy.mockRestore();
      transactionSpy.mockRestore();
    },
  };
}

function expectSelectionBeforeAutomaticWrites(events: string[]) {
  const writerEvents = events.filter((event) =>
    event === "match.create" ||
    event === "queuedMatch.create" ||
    event === "queuedMatch.update"
  );
  const certificationEvents = events.filter((event) =>
    event === "certified:candidate-exact" ||
    event === "certified:production-fallback"
  );
  expect(writerEvents.length).toBeGreaterThan(0);
  expect(certificationEvents.length).toBeGreaterThan(0);

  let certifiedSelectionReady = false;
  let insideTransaction = false;

  for (const event of events) {
    if (event === "certified:candidate-exact" || event === "certified:production-fallback") {
      certifiedSelectionReady = true;
    }
    if (event === "transaction.begin") {
      expect(certifiedSelectionReady).toBe(true);
      certifiedSelectionReady = false;
      insideTransaction = true;
    }
    if (event === "match.create" || event === "queuedMatch.create" || event === "queuedMatch.update") {
      expect(insideTransaction).toBe(true);
    }
    if (event === "transaction.end") insideTransaction = false;
  }
}

function expectStoredQueueConsumption(events: string[]) {
  const matchCreateIndex = events.indexOf("match.create");
  expect(matchCreateIndex).toBeGreaterThan(-1);
  expect(events.slice(0, matchCreateIndex)).toContain("transaction.begin");
  expect(events.slice(0, matchCreateIndex)).not.toContain("candidate-engine");
  expect(events.slice(0, matchCreateIndex)).not.toContain("certified:candidate-exact");
  expect(events.slice(0, matchCreateIndex)).not.toContain("certified:production-fallback");

  const laterQueueWriterIndex = events.findIndex((event, index) =>
    index > matchCreateIndex &&
    (event === "queuedMatch.create" || event === "queuedMatch.update")
  );
  if (laterQueueWriterIndex >= 0) {
    const laterCertificationIndex = events.findIndex((event, index) =>
      index > matchCreateIndex &&
      (event === "certified:candidate-exact" || event === "certified:production-fallback")
    );
    expect(laterCertificationIndex).toBeGreaterThan(matchCreateIndex);
    expectSelectionBeforeAutomaticWrites(events.slice(laterCertificationIndex));
  }
}

beforeAll(async () => {
  mutableEnv.DATABASE_URL = tempDatabaseUrl;
  mutableEnv.TURSO_DATABASE_URL = "";
  mutableEnv.TURSO_AUTH_TOKEN = "";
  mutableEnv.NODE_ENV = "test";

  await removeDatabaseFiles();
  await fs.writeFile(tempDatabaseFile, "");
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { cwd: process.cwd(), env: process.env as NodeJS.ProcessEnv, stdio: "pipe" },
  );

  vi.resetModules();
  (globalThis as { prisma?: PrismaInstance }).prisma = undefined;

  const authModule = await import("@/lib/auth");
  mockedAuth = vi.mocked(authModule.auth);
  const prismaModule = await import("@/lib/prisma");
  prisma = prismaModule.prisma;
  POST = (await import("./route")).POST;
  queuePOST = (await import("../queue-match/route")).POST;
  assignQueuedPOST = (await import("../queue-match/assign/route")).POST;
  const queueModule = await import("../queue-match/shared");
  rebuildQueuedMatch = queueModule.tryRebuildQueuedMatchForSessionId;
  rebuildAutomaticQueuedMatch = queueModule.tryRebuildAutomaticQueuedMatchForSessionId;
  balancedRecurrence = await import("@/lib/matchmaking/v3/balancedRecurrence");
  balancedAcceptance = await import("@/lib/matchmaking/v3/balancedCandidateAcceptance");
  socialBatch = await import("@/lib/matchmaking/v3/socialBatch");
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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

describe("Balanced default through production POST routes", () => {
  it.each([SessionType.POINTS, SessionType.ELO])(
    "%s supports explicit production rollback while still writing a legal automatic match and queue",
    async (type) => {
      vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", "0");
      const trace = traceAutomaticWriters();
      const fixture = await createFixture({
        prefix: `balanced-rollback-${type.toLowerCase()}-${randomUUID().slice(0, 8)}`,
        type,
        playerCount: 12,
        courtCount: 1,
      });

      const response = await postGenerateMatch(fixture.code, {
        courtId: fixture.courtIds[0],
      });
      const payload = await response.json() as {
        id: string;
        queuedMatch: { id: string; isAutomatic: boolean } | null;
      };
      const storedMatch = await prisma.match.findUnique({ where: { id: payload.id } });
      const storedQueue = await prisma.queuedMatch.findUnique({
        where: { sessionId: fixture.sessionId },
      });

      expect(response.status).toBe(200);
      expect(payload.queuedMatch?.isAutomatic).toBe(true);
      expect(trace.matcherSpy).not.toHaveBeenCalled();
      expect(trace.gateSpy).not.toHaveBeenCalled();
      expect(trace.events.filter((event) => event === "match.create")).toHaveLength(1);
      expect(trace.events.filter((event) => event === "queuedMatch.create")).toHaveLength(1);
      expect(storedMatch).toBeTruthy();
      expect(storedQueue?.isAutomatic).toBe(true);
      expect(new Set(selectedIds(storedMatch!)).size).toBe(4);
      expect(new Set(selectedIds(storedQueue!)).size).toBe(4);
      expect(
        selectedIds(storedQueue!).filter((playerId) =>
          selectedIds(storedMatch!).includes(playerId),
        ),
      ).toEqual([]);
      expect(readBalancedDecision(storedMatch?.matchmakingReasonJson)).toBeUndefined();
      expect(readBalancedDecision(storedQueue?.matchmakingReasonJson)).toBeUndefined();

      trace.restore();
    },
  );

  it.each([SessionType.POINTS, SessionType.ELO])(
    "%s applies the default to an initial single-court selection before the match and automatic queue writes",
    async (type) => {
      vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
      const trace = traceAutomaticWriters();
      const fixture = await createFixture({
        prefix: `balanced-initial-${type.toLowerCase()}-${randomUUID().slice(0, 8)}`,
        type,
        playerCount: 12,
        courtCount: 1,
      });

      const response = await postGenerateMatch(fixture.code, {
        courtId: fixture.courtIds[0],
      });
      const payload = await response.json() as {
        id: string;
        queuedMatch: { id: string; isAutomatic: boolean } | null;
      };
      const storedMatch = await prisma.match.findUnique({ where: { id: payload.id } });
      const storedQueue = await prisma.queuedMatch.findUnique({
        where: { sessionId: fixture.sessionId },
      });

      expect(response.status).toBe(200);
      expect(payload.queuedMatch?.isAutomatic).toBe(true);
      expect(trace.matcherSpy).toHaveBeenCalled();
      expectSelectionBeforeAutomaticWrites(trace.events);
      expect(trace.events.filter((event) => event === "match.create")).toHaveLength(1);
      expect(trace.events.filter((event) => event === "queuedMatch.create")).toHaveLength(1);
      expectCertifiedBalancedDecision(storedMatch?.matchmakingReasonJson);
      expectCertifiedBalancedDecision(storedQueue?.matchmakingReasonJson);

      trace.restore();
    },
  );

  it.each([SessionType.POINTS, SessionType.ELO])(
    "%s applies the default to initial batch selection before match writes",
    async (type) => {
      vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
      const trace = traceAutomaticWriters();
      const fixture = await createFixture({
        prefix: `balanced-batch-${type.toLowerCase()}-${randomUUID().slice(0, 8)}`,
        type,
        playerCount: 12,
        courtCount: 3,
        skipNextPlayerIndexes: [0, 1, 2, 3],
      });
      // Make all four pending skips due by count fairness, independent of the
      // randomized tie-break. A pending skip is consumed only when that player
      // would otherwise be selected.
      await prisma.sessionPlayer.updateMany({
        where: {
          sessionId: fixture.sessionId,
          playerId: { in: fixture.playerIds.slice(4) },
        },
        data: { matchmakingMatchesCredit: 1 },
      });

      const response = await postGenerateMatch(fixture.code, {
        courtIds: fixture.courtIds.slice(0, 2),
      });
      const payload = await response.json() as {
        matches: Array<{ id: string }>;
        queuedMatch: unknown;
      };
      const storedMatches = await prisma.match.findMany({
        where: { sessionId: fixture.sessionId },
        orderBy: { createdAt: "asc" },
      });

      expect(response.status).toBe(200);
      expect(payload.matches).toHaveLength(2);
      expect(payload.queuedMatch).toBeNull();
      expect(trace.matcherSpy).toHaveBeenCalled();
      expectSelectionBeforeAutomaticWrites(trace.events);
      expect(trace.events.filter((event) => event === "match.create")).toHaveLength(2);
      expect(storedMatches).toHaveLength(2);
      const skippedPlayerIds = new Set(fixture.playerIds.slice(0, 4));
      expect(storedMatches.flatMap(selectedIds).filter((id) => skippedPlayerIds.has(id)))
        .toEqual([]);
      const skippedPlayersAfterAssignments = await prisma.sessionPlayer.findMany({
        where: {
          sessionId: fixture.sessionId,
          playerId: { in: fixture.playerIds.slice(0, 4) },
        },
        select: { playerId: true, skipNextMatchAt: true, matchmakingMatchesCredit: true },
      });
      expect(skippedPlayersAfterAssignments.map((player) => player.playerId).sort())
        .toEqual(fixture.playerIds.slice(0, 4).sort());
      expect(skippedPlayersAfterAssignments.every((player) => player.skipNextMatchAt === null))
        .toBe(true);
      expect(skippedPlayersAfterAssignments.map((player) => player.matchmakingMatchesCredit))
        .toEqual([1, 1, 1, 1]);
      for (const stored of storedMatches) {
        expectCertifiedBalancedDecision(stored.matchmakingReasonJson);
      }

      trace.restore();
    },
  );

  it.each([SessionType.POINTS, SessionType.ELO])(
    "%s refills beside a busy court, rebuilds and reshuffles the automatic queue, replaces a queued player, and consumes that persisted lineup",
    async (type) => {
      vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
      const fixture = await createFixture({
        prefix: `balanced-queue-${type.toLowerCase()}-${randomUUID().slice(0, 8)}`,
        type,
        playerCount: 16,
        courtCount: 2,
        pausedPlayerIndexes: [15],
      });
      const originalActiveMatch = await createCurrentMatch(fixture, 0, 0);
      const trace = traceAutomaticWriters();

      const refillResponse = await postGenerateMatch(fixture.code, {
        courtId: fixture.courtIds[1],
      });
      const refillPayload = await refillResponse.json() as {
        id: string;
        matchmakingReason?: { balancedPolicyDecision?: unknown };
        queuedMatch: { id: string; isAutomatic: boolean } | null;
      };
      expect(refillResponse.status).toBe(200);
      expect(refillPayload.queuedMatch?.isAutomatic).toBe(true);
      expect(trace.matcherSpy).toHaveBeenCalled();
      expectSelectionBeforeAutomaticWrites(trace.events);
      expect(trace.events.filter((event) => event === "match.create")).toHaveLength(1);
      expect(trace.events.filter((event) => event === "queuedMatch.create")).toHaveLength(1);
      const refillMatch = await prisma.match.findUnique({
        where: { id: refillPayload.id },
      });
      expectCertifiedBalancedDecision(refillMatch?.matchmakingReasonJson);
      const queuedBeforeRebuild = await prisma.queuedMatch.findUnique({
        where: { sessionId: fixture.sessionId },
      });
      expectCertifiedBalancedDecision(queuedBeforeRebuild?.matchmakingReasonJson);
      expect(selectedIds(queuedBeforeRebuild!)).not.toContain(fixture.playerIds[15]);
      expect(selectedIds(queuedBeforeRebuild!)).not.toEqual(
        expect.arrayContaining(fixture.playerIds.slice(0, 4)),
      );
      expect(readBalancedDecision(refillMatch?.matchmakingReasonJson)?.candidateProof)
        .toMatchObject({ structuralVocabularyVerified: true, structuralVocabularyPlayerCount: 16 });

      const queueIdsBeforeRetain = selectedIds(queuedBeforeRebuild!).sort();
      const retainedEventCount = trace.events.length;
      const retained = await rebuildQueuedMatch(fixture.sessionId);
      const retainedStored = await prisma.queuedMatch.findUnique({
        where: { sessionId: fixture.sessionId },
      });
      expect(retained?.id).toBe(queuedBeforeRebuild?.id);
      expect(selectedIds(retainedStored!).sort()).toEqual(queueIdsBeforeRetain);
      expect(trace.events).toHaveLength(retainedEventCount);

      trace.events.length = 0;
      await rebuildAutomaticQueuedMatch(fixture.sessionId);
      const rebuiltStored = await prisma.queuedMatch.findUnique({
        where: { sessionId: fixture.sessionId },
      });
      expectCertifiedBalancedDecision(rebuiltStored?.matchmakingReasonJson);
      expectSelectionBeforeAutomaticWrites(trace.events);
      expect(trace.events.filter((event) => event === "queuedMatch.update")).toHaveLength(1);
      expect(trace.events).not.toContain("match.create");

      trace.events.length = 0;
      const reshuffleResponse = await postQueueMatch(fixture.code, { reshuffle: true });
      const reshufflePayload = await reshuffleResponse.json() as {
        queuedMatch: { id: string; matchmakingReason?: unknown };
      };
      expect(reshuffleResponse.status).toBe(200);
      expect(reshufflePayload.queuedMatch).toBeTruthy();
      const reshuffledStored = await prisma.queuedMatch.findUnique({
        where: { sessionId: fixture.sessionId },
      });
      expectCertifiedBalancedDecision(reshuffledStored?.matchmakingReasonJson);
      expectSelectionBeforeAutomaticWrites(trace.events);
      expect(trace.events.filter((event) => event === "queuedMatch.update")).toHaveLength(1);

      const replacementTargetId = reshuffledStored!.team1Player1Id;
      trace.events.length = 0;
      const replacementResponse = await postQueueMatch(fixture.code, {
        replaceUserId: replacementTargetId,
      });
      expect(replacementResponse.status).toBe(200);
      const replacementStored = await prisma.queuedMatch.findUnique({
        where: { sessionId: fixture.sessionId },
      });
      expectCertifiedBalancedDecision(replacementStored?.matchmakingReasonJson);
      expect(selectedIds(replacementStored!).filter((id) => id !== replacementTargetId))
        .toEqual(expect.arrayContaining(selectedIds(reshuffledStored!).filter((id) => id !== replacementTargetId)));
      expectSelectionBeforeAutomaticWrites(trace.events);
      expect(trace.events.filter((event) => event === "queuedMatch.update")).toHaveLength(1);

      await prisma.match.update({
        where: { id: refillPayload.id },
        data: {
          status: MatchStatus.COMPLETED,
          completedAt: new Date("2026-10-02T00:00:00.000Z"),
          team1Score: 21,
          team2Score: 18,
        },
      });
      await prisma.court.update({
        where: { id: fixture.courtIds[1] },
        data: { currentMatchId: null },
      });

      const queuedDecisionBeforeConsume = readBalancedDecision(
        replacementStored?.matchmakingReasonJson,
      );
      trace.events.length = 0;
      const consumeResponse = await postAssignQueuedMatch(fixture.code);
      const consumedPayload = await consumeResponse.json() as {
        id: string;
        queuedMatch?: unknown;
      };
      expect(consumeResponse.status).toBe(200);
      const consumedMatch = await prisma.match.findUnique({
        where: { id: consumedPayload.id },
      });
      expect(selectedIds(consumedMatch!)).toEqual(selectedIds(replacementStored!));
      expect(readBalancedDecision(consumedMatch?.matchmakingReasonJson))
        .toEqual(queuedDecisionBeforeConsume);
      expectStoredQueueConsumption(trace.events);
      const stillBusyCourt = await prisma.court.findUnique({
        where: { id: fixture.courtIds[0] },
      });
      expect(stillBusyCourt?.currentMatchId).toBe(originalActiveMatch.id);

      trace.restore();
    },
  );

  it.each([SessionType.POINTS, SessionType.ELO])(
    "%s certifies an automatic replacement on the production route before replacing the current match",
    async (type) => {
      vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
      const fixture = await createFixture({
        prefix: `balanced-match-replace-${type.toLowerCase()}-${randomUUID().slice(0, 8)}`,
        type,
        playerCount: 12,
        courtCount: 1,
      });
      const current = await createCurrentMatch(fixture);
      const trace = traceAutomaticWriters();

      const response = await postGenerateMatch(fixture.code, {
        courtId: fixture.courtIds[0],
        replaceUserId: current.team1Player1Id,
      });
      const payload = await response.json() as { id: string };
      const replacement = await prisma.match.findUnique({ where: { id: payload.id } });

      expect(response.status).toBe(200);
      expect(payload.id).not.toBe(current.id);
      expect(replacement).toBeTruthy();
      expect(selectedIds(replacement!)).toContain(current.team1Player2Id);
      expect(selectedIds(replacement!)).toContain(current.team2Player1Id);
      expect(selectedIds(replacement!)).toContain(current.team2Player2Id);
      expectCertifiedBalancedDecision(replacement?.matchmakingReasonJson);
      expect(trace.matcherSpy).toHaveBeenCalled();
      expectSelectionBeforeAutomaticWrites(trace.events);
      expect(trace.events.filter((event) => event === "match.create")).toHaveLength(1);

      trace.restore();
    },
  );

  it.each([SessionType.POINTS, SessionType.ELO])(
    "%s writes a rest-disabled result only with the certified production-fallback label",
    async (type) => {
      vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
      const trace = traceAutomaticWriters();
      const fixture = await createFixture({
        prefix: `balanced-rest-disabled-${type.toLowerCase()}-${randomUUID().slice(0, 8)}`,
        type,
        playerCount: 12,
        courtCount: 1,
        respectPlayerRest: false,
      });

      const response = await postGenerateMatch(fixture.code, {
        courtId: fixture.courtIds[0],
      });
      const payload = await response.json() as { id: string };
      const stored = await prisma.match.findUnique({ where: { id: payload.id } });
      const decision = readBalancedDecision(stored?.matchmakingReasonJson);

      expect(response.status).toBe(200);
      expect(decision).toMatchObject({
        requestedPolicy: "strict-replay-rescue",
        appliedPolicy: "production",
        outcome: "production-fallback",
        reasonCodes: expect.arrayContaining(["REPLAY_GATES_DISABLED"]),
        fallbackProof: { certified: true },
      });
      expectCertifiedBalancedDecision(stored?.matchmakingReasonJson);
      expectSelectionBeforeAutomaticWrites(trace.events);
      trace.restore();
    },
  );

  it("retains the legacy explicitly manual write without Balanced certification", async () => {
    vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
    const fixture = await createFixture({
      prefix: `balanced-manual-${randomUUID().slice(0, 8)}`,
      type: SessionType.POINTS,
      playerCount: 4,
      courtCount: 1,
    });

    const response = await postGenerateMatch(fixture.code, {
      courtId: fixture.courtIds[0],
      manualTeams: {
        team1: fixture.playerIds.slice(0, 2),
        team2: fixture.playerIds.slice(2, 4),
      },
    });
    const payload = await response.json() as { id: string };
    const stored = await prisma.match.findUnique({ where: { id: payload.id } });

    expect(response.status).toBe(200);
    const reason = JSON.parse(stored?.matchmakingReasonJson ?? "{}");
    expect(reason.socialVariety).toBeDefined();
    expect(reason.balancedPolicyDecision).toBeUndefined();
    expect(readBalancedDecision(stored?.matchmakingReasonJson)).toBeUndefined();
  });

  it("retains a manually queued lineup without claiming automatic Balanced certification", async () => {
    vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
    const fixture = await createFixture({
      prefix: `balanced-manual-queue-${randomUUID().slice(0, 8)}`,
      type: SessionType.POINTS,
      playerCount: 8,
      courtCount: 1,
    });
    await createCurrentMatch(fixture, 0, 0);

    const response = await postQueueMatch(fixture.code, {
      manualTeams: {
        team1: fixture.playerIds.slice(4, 6),
        team2: fixture.playerIds.slice(6, 8),
      },
    });
    const payload = await response.json() as {
      queuedMatch: { id: string; isAutomatic: boolean; matchmakingReason?: unknown };
    };
    const stored = await prisma.queuedMatch.findUnique({
      where: { sessionId: fixture.sessionId },
    });
    const trace = traceAutomaticWriters();
    const retained = await rebuildAutomaticQueuedMatch(fixture.sessionId);

    expect(response.status).toBe(200);
    expect(payload.queuedMatch.isAutomatic).toBe(false);
    expect(stored?.isAutomatic).toBe(false);
    const reason = JSON.parse(stored?.matchmakingReasonJson ?? "{}");
    expect(reason.socialVariety).toBeDefined();
    expect(reason.balancedPolicyDecision).toBeUndefined();
    expect(retained?.isAutomatic).toBe(false);
    expect(readBalancedDecision(stored?.matchmakingReasonJson)).toBeUndefined();
    expect(trace.events).toEqual([]);
    expect(trace.matcherSpy).not.toHaveBeenCalled();
    trace.restore();
  });

  it.each([SessionType.POINTS, SessionType.ELO])(
    "%s consumes a legacy automatic queue without certification metadata or re-matching",
    async (type) => {
      vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
      const fixture = await createFixture({
        prefix: "balanced-legacy-queue-" + type.toLowerCase() + "-" + randomUUID().slice(0, 8),
        type,
        playerCount: 8,
        courtCount: 1,
      });
      await prisma.session.update({
        where: { id: fixture.sessionId },
        data: { autoQueueEnabled: false },
      });
      const storedQueue = await prisma.queuedMatch.create({
        data: {
          sessionId: fixture.sessionId,
          team1Player1Id: fixture.playerIds[3],
          team1Player2Id: fixture.playerIds[1],
          team2Player1Id: fixture.playerIds[2],
          team2Player2Id: fixture.playerIds[0],
          isAutomatic: true,
          matchmakingReasonJson: null,
        },
      });
      const trace = traceAutomaticWriters();
      try {
        const response = await postAssignQueuedMatch(fixture.code);
        const payload = await response.json() as { id: string };
        expect(response.status).toBe(200);
        const storedMatch = await prisma.match.findUnique({ where: { id: payload.id } });
        expect(selectedIds(storedMatch!)).toEqual(selectedIds(storedQueue));
        expect(readBalancedDecision(storedMatch?.matchmakingReasonJson)).toBeUndefined();
        expectStoredQueueConsumption(trace.events);
        expect(trace.matcherSpy).not.toHaveBeenCalled();
        expect(trace.gateSpy).not.toHaveBeenCalled();
        expect(await prisma.queuedMatch.findUnique({
          where: { sessionId: fixture.sessionId },
        })).toBeNull();
      } finally {
        trace.restore();
      }
    },
  );

  it("keeps Level Match (RACE) isolated from the default and explicit production rollback", async () => {
    const candidateSpy = vi.spyOn(
      balancedRecurrence,
      "findBestBalancedRecurrenceSelection",
    );
    for (const [suffix, flag] of [["default", undefined], ["rollback", "0"]] as const) {
      vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", flag);
      const fixture = await createFixture({
        prefix: `balanced-race-${suffix}-${randomUUID().slice(0, 8)}`,
        type: SessionType.RACE,
        playerCount: 4,
        courtCount: 1,
      });

      const response = await postGenerateMatch(fixture.code, {
        courtId: fixture.courtIds[0],
      });
      const payload = await response.json() as { id: string };
      const stored = await prisma.match.findUnique({ where: { id: payload.id } });

      expect(response.status).toBe(200);
      expect(JSON.parse(stored?.matchmakingReasonJson ?? "{}").balancedPolicyDecision)
        .toBeUndefined();
    }

    expect(candidateSpy).not.toHaveBeenCalled();
  });

  it.each([SessionType.POINTS, SessionType.ELO])(
    "%s refuses to create a match when candidate and production proofs are tampered",
    async (type) => {
      vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
      const fixture = await createFixture({
        prefix: `balanced-tamper-${type.toLowerCase()}-${randomUUID().slice(0, 8)}`,
        type,
        playerCount: 12,
        courtCount: 1,
      });

      const originalCandidate = balancedRecurrence.findBestBalancedRecurrenceSelection;
      const candidateTamperSpy = vi.spyOn(balancedRecurrence, "findBestBalancedRecurrenceSelection")
        .mockImplementation((players, options) => {
          const result = originalCandidate(players, options);
          return {
            ...result,
            recurrenceCertified: false,
            debug: { ...result.debug, recurrenceCertified: false },
          } as typeof result;
        });
      const originalProduction = socialBatch.findBestRotationBatchSelection;
      vi.spyOn(socialBatch, "findBestRotationBatchSelection")
        .mockImplementation((players, options) => {
          const result = originalProduction(players, options);
          return {
            ...result,
            selection: null,
            debug: { ...result.debug, searchLimitReached: true },
          } as typeof result;
        });
      const trace = traceAutomaticWriters({ watchCandidateEngine: false });

      const response = await postGenerateMatch(fixture.code, {
        courtId: fixture.courtIds[0],
      });
      const payload = await response.json() as { error?: string };
      const storedMatches = await prisma.match.findMany({
        where: { sessionId: fixture.sessionId },
      });
      const storedCourt = await prisma.court.findUnique({
        where: { id: fixture.courtIds[0] },
      });

      expect(response.status).toBe(400);
      expect(payload.error).toMatch(/No valid pairing|time limit/);
      expect(candidateTamperSpy).toHaveBeenCalled();
      expect(trace.events).toContain("no-certified-selection");
      expect(trace.events).not.toContain("certified:candidate-exact");
      expect(trace.events).not.toContain("certified:production-fallback");
      expect(trace.events).not.toContain("transaction.begin");
      expect(trace.events).not.toContain("match.create");
      expect(storedMatches).toHaveLength(0);
      expect(storedCourt?.currentMatchId).toBeNull();
      trace.restore();
    },
  );
});
