import { withLegacySportingAliases } from "@/lib/sportingIdentity";
import * as balancedAcceptance from "@/lib/matchmaking/v3/balancedCandidateAcceptance";
import * as balancedRecurrence from "@/lib/matchmaking/v3/balancedRecurrence";
import * as matchmakingV3 from "@/lib/matchmaking/v3";
import * as socialBatch from "@/lib/matchmaking/v3/socialBatch";
import { buildSocialStructuralVarietyContext } from "@/lib/matchmaking/v3/socialVariety";
import type { MatchmakerV3Player } from "@/lib/matchmaking/v3/types";
import type { RotationBatchOptions } from "@/lib/matchmaking/v3/socialBatch";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MatchStatus,
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionCollabFormat,
  SessionCrossoverFrequency,
  SessionMode,
  SessionPool,
  SessionStatus,
  SessionType,
} from "@/types/enums";
import {
  buildMatchmakingState,
  getRankedCandidates,
  selectBatchMatches,
  selectReplacementMatch,
  selectSingleCourtMatch,
} from "@/app/api/sessions/[code]/generate-match/selection";
import {
  createQueuedMatchForSession,
  replaceQueuedMatchPlayerForSession,
  reshuffleQueuedMatchForSession,
  tryRebuildAutomaticQueuedMatchForSessionId,
} from "@/app/api/sessions/[code]/queue-match/shared";
import {
  GenerateMatchError,
  type GenerateMatchSession,
} from "@/app/api/sessions/[code]/generate-match/shared";

const database = vi.hoisted(() => ({
  transaction: vi.fn(),
  courtFindMany: vi.fn(),
  courtCount: vi.fn(),
  loadSessionRecordById: vi.fn(),
  loadSessionRecord: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: database.transaction,
    court: {
      findMany: database.courtFindMany,
      count: database.courtCount,
    },
  },
}));

vi.mock("@/app/api/sessions/[code]/generate-match/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/api/sessions/[code]/generate-match/shared")>();
  return {
    ...actual,
    loadSessionRecordById: database.loadSessionRecordById,
    loadSessionRecord: database.loadSessionRecord,
  };
});

const now = new Date("2026-10-07T00:00:00.000Z");
type EngineCall = {
  players: MatchmakerV3Player[];
  options: RotationBatchOptions<MatchmakerV3Player>;
  result: ReturnType<typeof balancedRecurrence.findBestBalancedRecurrenceSelection>;
};

function makePlayer(
  userId: string,
  index: number,
  overrides: Partial<GenerateMatchSession["players"][number]> = {},
) {
  const upper = index % 2 === 0;
  const gender = upper ? PlayerGender.MALE : PlayerGender.FEMALE;
  return withLegacySportingAliases({
    playerId: userId,
    gender,
    partnerPreference: gender === PlayerGender.FEMALE
      ? PartnerPreference.FEMALE_FLEX
      : PartnerPreference.OPEN,
    mixedSideOverride: upper ? MixedSide.UPPER : MixedSide.LOWER,
    pool: SessionPool.A,
    matchesPlayed: 0,
    matchmakingMatchesCredit: 0,
    sessionPoints: 10 + index,
    isPaused: false,
    isGuest: false,
    lastPartnerPlayerId: null,
    representingClubId: null,
    availableSince: now,
    joinedAt: now,
    arrivalPriorityAt: null,
    inactiveSeconds: 0,
    player: { id: userId, name: userId, elo: 1000 + index, ownerUserId: `owner-${userId}` },
    ...overrides,
  }) as GenerateMatchSession["players"][number];
}

function players(
  count: number,
  overrides: (index: number) => Partial<GenerateMatchSession["players"][number]> = () => ({}),
) {
  return Array.from({ length: count }, (_unused, index) =>
    makePlayer(`P${index + 1}`, index, overrides(index))
  );
}

function baseSession(overrides: Partial<GenerateMatchSession> = {}): GenerateMatchSession {
  return {
    id: "balanced-candidate-session",
    code: "BALCANDIDATE",
    clubId: null,
    name: "Balanced recurrence candidate integration",
    type: SessionType.POINTS,
    mode: SessionMode.MIXICANO,
    status: SessionStatus.ACTIVE,
    respectPlayerRest: true,
    poolsEnabled: false,
    courts: [{ id: "court-1", currentMatch: { id: "active-1" } }, { id: "court-2", currentMatch: { id: "active-2" } }],
    sessionClubs: [],
    players: players(12),
    matches: [],
    queuedMatch: null,
    autoQueueEnabled: true,
    ...overrides,
  } as unknown as GenerateMatchSession;
}

function match(
  id: string,
  ids: [string, string, string, string],
  status: MatchStatus,
): GenerateMatchSession["matches"][number] {
  return withLegacySportingAliases({
    id,
    sessionId: "balanced-candidate-session",
    courtId: "court-1",
    status,
    team1Player1Id: ids[0],
    team1Player2Id: ids[1],
    team2Player1Id: ids[2],
    team2Player2Id: ids[3],
    team1Score: status === MatchStatus.COMPLETED ? 21 : null,
    team2Score: status === MatchStatus.COMPLETED ? 18 : null,
    completedAt: status === MatchStatus.COMPLETED ? new Date(now.getTime() - 60_000) : null,
    createdAt: now,
    matchmakingReasonJson: null,
  }) as GenerateMatchSession["matches"][number];
}

function queuedRecord(ids: [string, string, string, string] = ["P5", "P6", "P7", "P8"]) {
  return {
    id: "queued-1",
    sessionId: "balanced-candidate-session",
    createdAt: now,
    team1User1Id: ids[0],
    team1User2Id: ids[1],
    team2User1Id: ids[2],
    team2User2Id: ids[3],
    team1Player1Id: ids[0],
    team1Player2Id: ids[1],
    team2Player1Id: ids[2],
    team2Player2Id: ids[3],
    team1ClubId: null,
    team2ClubId: null,
    targetPool: null,
    courtGroupType: null,
    poolASeatCount: null,
    poolBSeatCount: null,
    isAutomatic: true,
    matchmakingReasonJson: null,
  };
}

function makeTransaction(sessionData: GenerateMatchSession) {
  const queueCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...queuedRecord(),
    ...data,
    id: "created-queue",
    createdAt: now,
  }));
  const queueUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...queuedRecord(),
    ...data,
    id: "queued-1",
    createdAt: now,
  }));
  return {
    session: {
      findUnique: vi.fn(async () => ({
        poolsEnabled: Boolean(sessionData.poolsEnabled),
        type: sessionData.type,
        mode: sessionData.mode,
        scoringType: null,
        matchmakingStyle: null,
        balanceMetric: null,
        pairingMode: null,
      })),
    },
    queuedMatch: { create: queueCreate, update: queueUpdate },
    sessionPlayer: {
      findMany: vi.fn(async ({ where }: { where: { playerId?: { in?: string[] } } }) => {
        const ids = where.playerId?.in ?? [];
        return ids.flatMap((userId) => {
          const found = sessionData.players.find((entry) => entry.userId === userId);
          return found ? [{
            playerId: found.userId,
            pool: found.pool,
            gender: found.gender,
            partnerPreference: found.partnerPreference,
            mixedSideOverride: found.mixedSideOverride,
          }] : [];
        });
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  };
}

async function selectionInputs(sessionData: GenerateMatchSession) {
  const state = await buildMatchmakingState(sessionData);
  const { rankedCandidates } = getRankedCandidates(sessionData, state.busyPlayerIds);
  return { ...state, rankedCandidates, sessionData };
}

function captureBalancedEngine(calls: EngineCall[]) {
  const original = balancedRecurrence.findBestBalancedRecurrenceSelection;
  return vi.spyOn(balancedRecurrence, "findBestBalancedRecurrenceSelection")
    .mockImplementation((sourcePlayers, options) => {
      const result = original(sourcePlayers, options);
      calls.push({
        players: sourcePlayers as MatchmakerV3Player[],
        options: options as RotationBatchOptions<MatchmakerV3Player>,
        result: result as EngineCall["result"],
      });
      return result;
    });
}

function interclubSession(type: SessionType = SessionType.POINTS) {
  const sides: Array<{ club: "host" | "partner"; side: MixedSide }> = [
    { club: "host", side: MixedSide.UPPER },
    { club: "host", side: MixedSide.LOWER },
    { club: "host", side: MixedSide.LOWER },
    { club: "host", side: MixedSide.LOWER },
    { club: "partner", side: MixedSide.UPPER },
    { club: "partner", side: MixedSide.UPPER },
    { club: "partner", side: MixedSide.UPPER },
    { club: "partner", side: MixedSide.LOWER },
    { club: "host", side: MixedSide.LOWER },
    { club: "host", side: MixedSide.LOWER },
    { club: "partner", side: MixedSide.UPPER },
    { club: "partner", side: MixedSide.UPPER },
  ];
  const sessionPlayers = sides.map(({ club, side }, index) => makePlayer(`I${index + 1}`, index, {
    representingClubId: club,
    mixedSideOverride: side,
    gender: side === MixedSide.UPPER ? PlayerGender.MALE : PlayerGender.FEMALE,
    ...(index === 8 ? { isPaused: true } : {}),
  }));
  return baseSession({
    id: "balanced-interclub-session",
    code: "BALINTERCLUB",
    type,
    players: sessionPlayers,
    collabFormat: SessionCollabFormat.INTERCLUB,
    sessionClubs: ["host", "partner"].map((clubId) => ({
      clubId,
      status: "ACCEPTED",
      role: clubId === "host" ? "HOST" : "PARTNER",
      club: { id: clubId, name: clubId },
    })) as GenerateMatchSession["sessionClubs"],
    matches: [
      match("interclub-completed", ["I1", "I2", "I5", "I8"], MatchStatus.COMPLETED),
      match("interclub-live", ["I2", "I5", "I3", "I6"], MatchStatus.IN_PROGRESS),
    ],
    queuedMatch: queuedRecord(["I3", "I6", "I4", "I7"]),
  });
}

describe("Balanced recurrence integration paths", () => {
  let activeSession: GenerateMatchSession;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    Object.values(database).forEach((mock) => mock.mockReset());
    activeSession = baseSession();
    database.courtFindMany.mockResolvedValue([{ id: "court-1", currentMatchId: "active-1" }]);
    database.courtCount.mockResolvedValue(2);
    database.loadSessionRecordById.mockImplementation(async () => activeSession);
    database.loadSessionRecord.mockImplementation(async () => activeSession);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([SessionType.POINTS, SessionType.ELO])(
    "%s defaults to a certified single-court, grouped, replacement, queue-create, and queue-rebuild path",
    async (type) => {
      // Exercise the production default without an opt-in environment value.
      vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
      const calls: EngineCall[] = [];
      const engineSpy = captureBalancedEngine(calls);
      const completed = match("completed-1", ["P9", "P10", "P11", "P12"], MatchStatus.COMPLETED);
      const live = match("live-1", ["P1", "P2", "P3", "P4"], MatchStatus.IN_PROGRESS);
      const groupPlayers = players(20, (index) => ({
        pool: index < 10 ? SessionPool.A : SessionPool.B,
        mixedSideOverride: index < 10 ? MixedSide.UPPER : MixedSide.LOWER,
        gender: index < 10 ? PlayerGender.MALE : PlayerGender.FEMALE,
        ...(index >= 18 ? { isPaused: true } : {}),
      }));
      const grouped = baseSession({
        type,
        poolsEnabled: true,
        crossoverFrequency: SessionCrossoverFrequency.BALANCED,
        players: groupPlayers,
        matches: [completed, match("live-group", ["P11", "P12", "P17", "P18"], MatchStatus.IN_PROGRESS)],
        queuedMatch: queuedRecord(["P13", "P14", "P15", "P16"]),
      });
      activeSession = grouped;
      const groupedState = await selectionInputs(grouped);
      const groupedGateSpy = vi.spyOn(balancedAcceptance, "runBalancedCandidateWithProductionFallback");
      let groupedResult: ReturnType<typeof selectBatchMatches>;
      try {
        groupedResult = selectBatchMatches({
          ...groupedState,
          requestedMatchCount: 2,
          randomFn: () => 0.25,
        });
      } catch (error) {
        const gateDiagnostics = groupedGateSpy.mock.results.flatMap((entry) => {
          if (entry.type !== "return") return [];
          const { decision } = entry.value;
          return [{
            outcome: decision.outcome,
            reasonCodes: decision.reasonCodes,
            candidateProof: decision.candidateProof,
            candidateSearch: decision.candidateSearch,
            fallbackProof: decision.fallbackProof,
            fallbackSearch: decision.fallbackSearch,
          }];
        });
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${message}; Balanced gate diagnostics: ${JSON.stringify(gateDiagnostics)}`);
      }

      expect(groupedResult.selections).toHaveLength(2);
      const groupedCall = calls.find(({ options }) => Array.isArray(options.schedules));
      expect(groupedCall).toBeDefined();
      expect(groupedCall!.players).toHaveLength(20);
      expect(groupedCall!.players.find((player) => player.userId === "P19")?.isPaused).toBe(true);
      expect(groupedCall!.players.find((player) => player.userId === "P11")?.isBusy).toBe(true);
      expect(groupedCall!.players.find((player) => player.userId === "P13")?.isBusy).toBe(true);
      expect(groupedCall!.options.socialStructuralOpportunityConstraints?.length).toBeGreaterThan(0);
      expect(groupedCall!.options.socialHistoryMatches).toHaveLength(1);
      const fullRosterStructural = buildSocialStructuralVarietyContext(
        groupedCall!.players,
        groupedCall!.options.completedMatches?.map((entry) => ({ team1: entry.team1, team2: entry.team2 })) ?? [],
        {
          sessionMode: SessionMode.MIXICANO,
          opportunityConstraints: groupedCall!.options.socialStructuralOpportunityConstraints,
        },
      );
      const unrestrictedStructural = buildSocialStructuralVarietyContext(
        groupedCall!.players,
        [],
        { sessionMode: SessionMode.MIXICANO },
      );
      expect([...unrestrictedStructural.playersByUserId.get("P1")!.matchType.opportunities])
        .toEqual(expect.arrayContaining(["MIXED", "OWN_SIDE"]));
      expect([...fullRosterStructural.playersByUserId.get("P1")!.matchType.opportunities])
        .toEqual(expect.arrayContaining(["MIXED", "OWN_SIDE"]));
      // The full structural union contains every legal pool composition. In
      // this case that union preserves both match types, while the actual
      // active schedule can still select only currently available Pool A seats.
      expect(groupedResult.selections.flatMap((selection) => selection.ids).every((id) =>
        groupedCall!.players.find((player) => player.userId === id)?.pool === SessionPool.A
      )).toBe(true);
      expect(fullRosterStructural.playersByUserId.has("P19")).toBe(true);
      expect(("balancedPolicyDecision" in groupedResult
        ? groupedResult.balancedPolicyDecision
        : undefined)?.requestedPolicy).toBe("strict-replay-rescue");
      expect(groupedResult.selections.every((selection) => {
        const reason = JSON.parse(selection.matchmakingReasonJson ?? "{}");
        return reason.balancedPolicyDecision?.requestedPolicy === "strict-replay-rescue";
      })).toBe(true);

      const singlePlayers = players(12);
      const singleSession = baseSession({ type, players: singlePlayers, matches: [completed] });
      activeSession = singleSession;
      const singleState = await selectionInputs(singleSession);
      const single = selectSingleCourtMatch({ ...singleState, reshuffleSource: null });
      expect(single.ids).toHaveLength(4);
      expect(single.balancedPolicyDecision?.requestedPolicy).toBe("strict-replay-rescue");
      expect(JSON.parse(single.matchmakingReasonJson ?? "{}").balancedPolicyDecision).toBeDefined();

      const replacement = selectReplacementMatch({
        ...singleState,
        retainedUserIds: ["P1", "P2", "P3"],
        excludedUserIds: ["P4", "P9"],
      });
      expect(replacement.ids).toEqual(expect.arrayContaining(["P1", "P2", "P3"]));
      expect(replacement.ids).not.toContain("P4");
      expect(replacement.ids).not.toContain("P9");
      expect(replacement.balancedPolicyDecision?.requestedPolicy).toBe("strict-replay-rescue");

      const queueSession = baseSession({
        id: `balanced-queue-${type.toLowerCase()}`,
        type,
        players: players(12),
        matches: [live],
        queuedMatch: null,
      });
      activeSession = queueSession;
      let tx = makeTransaction(queueSession);
      database.transaction.mockImplementation(async (callback: (client: unknown) => unknown) =>
        callback(tx as never));
      const created = await createQueuedMatchForSession(queueSession as never);
      expect(created.isAutomatic).toBe(true);
      expect(tx.queuedMatch.create).toHaveBeenCalledTimes(1);
      const createReason = tx.queuedMatch.create.mock.calls[0]?.[0].data.matchmakingReasonJson;
      expect(JSON.parse(String(createReason)).balancedPolicyDecision?.requestedPolicy).toBe("strict-replay-rescue");

      const rebuildSession = { ...queueSession, queuedMatch: queuedRecord() } as GenerateMatchSession;
      activeSession = rebuildSession;
      tx = makeTransaction(rebuildSession);
      database.transaction.mockImplementation(async (callback: (client: unknown) => unknown) =>
        callback(tx as never));
      database.loadSessionRecordById.mockResolvedValue(rebuildSession);
      const rebuilt = await tryRebuildAutomaticQueuedMatchForSessionId(rebuildSession.id);
      expect(rebuilt?.isAutomatic).toBe(true);
      expect(tx.queuedMatch.update).toHaveBeenCalledTimes(1);
      const rebuildReason = tx.queuedMatch.update.mock.calls[0]?.[0].data.matchmakingReasonJson;
      expect(JSON.parse(String(rebuildReason)).balancedPolicyDecision?.requestedPolicy).toBe("strict-replay-rescue");

      const reshuffleSession = { ...queueSession, queuedMatch: queuedRecord() } as GenerateMatchSession;
      activeSession = reshuffleSession;
      tx = makeTransaction(reshuffleSession);
      database.transaction.mockImplementation(async (callback: (client: unknown) => unknown) =>
        callback(tx as never));
      const reshuffled = await reshuffleQueuedMatchForSession(reshuffleSession as never);
      expect(reshuffled.isAutomatic).toBe(true);
      expect(tx.queuedMatch.update).toHaveBeenCalledTimes(1);
      const reshuffleReason = tx.queuedMatch.update.mock.calls[0]?.[0].data.matchmakingReasonJson;
      expect(JSON.parse(String(reshuffleReason)).balancedPolicyDecision?.requestedPolicy).toBe("strict-replay-rescue");

      const replacementSession = { ...queueSession, queuedMatch: queuedRecord() } as GenerateMatchSession;
      activeSession = replacementSession;
      tx = makeTransaction(replacementSession);
      database.transaction.mockImplementation(async (callback: (client: unknown) => unknown) =>
        callback(tx as never));
      const replaced = await replaceQueuedMatchPlayerForSession(replacementSession as never, "P8");
      expect(replaced.isAutomatic).toBe(true);
      expect(tx.queuedMatch.update).toHaveBeenCalledTimes(1);
      const replacementReason = tx.queuedMatch.update.mock.calls[0]?.[0].data.matchmakingReasonJson;
      expect(JSON.parse(String(replacementReason)).balancedPolicyDecision?.requestedPolicy).toBe("strict-replay-rescue");

      expect(engineSpy).toHaveBeenCalled();
      expect(calls.some(({ options }) => options.sessionType === type)).toBe(true);
    },
  );

  it("does not bypass a rejected Balanced grouped replacement through the generic quartet selector", async () => {
    vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
    const queued = queuedRecord(["P5", "P6", "P7", "P8"]);
    const completed = match("completed-retry", ["P9", "P10", "P11", "P12"], MatchStatus.COMPLETED);
    const data = baseSession({
      type: SessionType.POINTS,
      poolsEnabled: true,
      players: players(12, (index) => ({
        pool: SessionPool.A,
        ...(index === 11 ? { isPaused: true } : {}),
      })),
      matches: [completed],
      queuedMatch: queued,
    });
    activeSession = data;
    const tx = makeTransaction(data);
    database.transaction.mockImplementation(async (callback: (client: unknown) => unknown) =>
      callback(tx as never));
    const gate = vi.spyOn(balancedAcceptance, "runBalancedCandidateWithProductionFallback")
      .mockImplementation(() => {
        throw new GenerateMatchError(400, "Candidate selection proof failed.");
      });
    const genericSingleCourtSelector = vi.spyOn(matchmakingV3, "findBestSingleCourtSelectionV3");

    await expect(replaceQueuedMatchPlayerForSession(data as never, "P8"))
      .rejects.toThrow("No eligible replacement player was available for this match.");
    expect(gate).toHaveBeenCalledTimes(1);
    expect(genericSingleCourtSelector).not.toHaveBeenCalled();
    expect(tx.queuedMatch.update).not.toHaveBeenCalled();
  });

  it.each([SessionType.POINTS, SessionType.ELO])(
    "%s constrains interclub T from full club opportunities and completed-only maturity history",
    async (type) => {
      vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
      const calls: EngineCall[] = [];
      captureBalancedEngine(calls);
      const gateHistories: Array<{
        legacyCount: number;
        candidateCount: number;
        legacyUserIds: string[];
        candidateUserIds: string[];
      }> = [];
      const originalGate = balancedAcceptance.runBalancedCandidateWithProductionFallback;
      vi.spyOn(balancedAcceptance, "runBalancedCandidateWithProductionFallback")
        .mockImplementation((input) => {
          gateHistories.push({
            legacyCount: input.options.socialHistoryMatches?.length ?? 0,
            candidateCount: input.candidateOptions?.socialHistoryMatches?.length ?? 0,
            legacyUserIds: input.options.socialHistoryMatches?.flatMap((entry) => [
              ...entry.team1,
              ...entry.team2,
            ]) ?? [],
            candidateUserIds: input.candidateOptions?.socialHistoryMatches?.flatMap((entry) => [
              ...entry.team1,
              ...entry.team2,
            ]) ?? [],
          });
          return originalGate(input);
        });
      const data = interclubSession(type);
      activeSession = data;
      const state = await selectionInputs(data);
      const selected = selectSingleCourtMatch({ ...state, reshuffleSource: null });
      const batch = selectBatchMatches({ ...state, requestedMatchCount: 1, randomFn: () => 0.25 });

      expect(selected.ids).toHaveLength(4);
      expect(batch.selections).toHaveLength(1);
      expect(("balancedPolicyDecision" in batch ? batch.balancedPolicyDecision : undefined)?.requestedPolicy)
        .toBe("strict-replay-rescue");
      const call = calls.find(({ options }) => options.selectionConstraints);
      expect(call).toBeDefined();
      expect(call!.players.map((player) => player.userId)).toHaveLength(12);
      expect(call!.players.find((player) => player.userId === "I9")?.isPaused).toBe(true);
      expect(call!.players.find((player) => player.userId === "I2")?.isBusy).toBe(true);
      expect(call!.players.find((player) => player.userId === "I3")?.isBusy).toBe(true);
      expect(call!.options.socialStructuralOpportunityConstraints).toHaveLength(1);
      expect(call!.options.completedMatches).toHaveLength(1);
      expect(call!.options.socialHistoryMatches).toHaveLength(1);
      const completedHistoryUserIds = call!.options.completedMatches!.flatMap((entry) => [
        ...entry.team1,
        ...entry.team2,
      ]).sort();
      expect(completedHistoryUserIds).toEqual(["I1", "I2", "I5", "I8"]);

      const completedHistory = call!.options.completedMatches?.map((match) => ({
        team1: match.team1,
        team2: match.team2,
      })) ?? [];
      const constrained = buildSocialStructuralVarietyContext(call!.players, completedHistory, {
        sessionMode: SessionMode.MIXICANO,
        opportunityConstraints: call!.options.socialStructuralOpportunityConstraints,
      });
      const unrestricted = buildSocialStructuralVarietyContext(call!.players, completedHistory, {
        sessionMode: SessionMode.MIXICANO,
      });
      for (const player of call!.players) {
        expect([...unrestricted.playersByUserId.get(player.userId)!.matchType.opportunities])
          .toEqual(expect.arrayContaining(["MIXED", "OWN_SIDE"]));
        expect([...constrained.playersByUserId.get(player.userId)!.matchType.opportunities])
          .toEqual(["MIXED"]);
      }
      const actualVocabulary = new Map(call!.result.structuralOpportunityVocabulary.map((entry) => [entry.userId, entry]));
      const expectedPartnerAndOpponentSets = [
        {
          userId: "I1",
          partners: ["I2", "I3", "I4", "I9", "I10"],
          opponents: ["I5", "I6", "I7", "I8", "I11", "I12"],
          courtmates: 11,
        },
        {
          userId: "I9",
          partners: ["I1"],
          opponents: ["I5", "I6", "I7", "I8", "I11", "I12"],
          courtmates: 7,
        },
        {
          userId: "I2",
          partners: ["I1"],
          opponents: ["I5", "I6", "I7", "I8", "I11", "I12"],
          courtmates: 7,
        },
        {
          userId: "I5",
          partners: ["I8"],
          opponents: ["I1", "I2", "I3", "I4", "I9", "I10"],
          courtmates: 7,
        },
      ];
      for (const expected of expectedPartnerAndOpponentSets) {
        const entry = actualVocabulary.get(expected.userId);
        expect(entry).toBeDefined();
        expect(entry!.feasibleMatchTypes).toEqual(["MIXED"]);
        expect(entry!.feasiblePartners).toEqual([...expected.partners].sort());
        expect(entry!.feasibleOpponents).toEqual([...expected.opponents].sort());
        expect(entry!.feasibleCourtmates).toEqual(
          [...new Set([...expected.partners, ...expected.opponents])].sort()
        );
        expect(entry!.feasibleCourtmates).toHaveLength(expected.courtmates);
      }
      expect(actualVocabulary.get("I2")?.feasibleCourtmates).not.toContain("I9");
      expect(actualVocabulary.get("I2")?.feasiblePartners).not.toContain("I9");
      expect(actualVocabulary.get("I2")?.feasibleOpponents).not.toContain("I9");

      expect(call!.result.matureTypeEligiblePlayerCount).toBe(4);
      expect(call!.result.firstExposureCompletePlayerCount).toBe(4);
      expect(call!.result.chosenMatureDeltaTUnits).toBe("0");
      expect(call!.result.bestMatureDeltaTAtRminUnits).toBe("0");
      expect(call!.result.recurrenceExceptionEligible).toBe(false);
      const selectedMatureEvidence = new Map(call!.result.matureRecurrencePlayers.map((entry) => [entry.userId, entry]));
      for (const userId of ["I1", "I8"]) {
        const evidence = selectedMatureEvidence.get(userId);
        expect(evidence?.completedAppearancesBefore).toBe(1);
        expect(evidence?.firstExposureCompleteBefore).toBe(true);
        expect(evidence?.feasibleMatchTypes).toEqual(["MIXED"]);
        expect(evidence?.deltaT).toBe(0);
      }
      expect(gateHistories.some(({ legacyCount, candidateCount }) =>
        legacyCount > candidateCount && candidateCount === 1
      )).toBe(true);
      const historySplit = gateHistories.find(({ legacyCount, candidateCount }) =>
        legacyCount > candidateCount && candidateCount === 1
      );
      expect(historySplit?.candidateUserIds.sort()).toEqual(["I1", "I2", "I5", "I8"]);
      expect(historySplit?.legacyUserIds).toEqual(expect.arrayContaining(["I3", "I4", "I6", "I7"]));
      expect(selected.balancedPolicyDecision?.candidateProof.structuralVocabularyVerified).toBe(true);
      expect(selected.balancedPolicyDecision?.candidateProof.structuralVocabularyPlayerCount).toBe(12);
    },
  );

  it("fails closed before queue writes when the candidate and production fallback proofs are tampered", async () => {
    vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
    const input = baseSession({
      type: SessionType.POINTS,
      players: players(12),
      matches: [match("live-1", ["P1", "P2", "P3", "P4"], MatchStatus.IN_PROGRESS)],
    });
    activeSession = input;
    const tx = makeTransaction(input);
    database.transaction.mockImplementation(async (callback: (client: unknown) => unknown) =>
      callback(tx as never));

    const originalCandidate = balancedRecurrence.findBestBalancedRecurrenceSelection;
    vi.spyOn(balancedRecurrence, "findBestBalancedRecurrenceSelection").mockImplementation((sourcePlayers, options) => {
      const result = originalCandidate(sourcePlayers, options);
      return {
        ...result,
        recurrenceCertified: false,
        debug: { ...result.debug, recurrenceCertified: false },
      } as typeof result;
    });
    const originalProduction = socialBatch.findBestRotationBatchSelection;
    vi.spyOn(socialBatch, "findBestRotationBatchSelection").mockImplementation((sourcePlayers, options) => {
      const result = originalProduction(sourcePlayers, options);
      return {
        ...result,
        selection: null,
        debug: { ...result.debug, searchLimitReached: true },
      } as typeof result;
    });

    await expect(createQueuedMatchForSession(input as never)).rejects.toThrow();
    expect(tx.queuedMatch.create).not.toHaveBeenCalled();
  });

  it("supports explicit production rollback and leaves Social dispatch alone", async () => {
    vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", "0");
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const balancedEngine = vi.spyOn(balancedRecurrence, "findBestBalancedRecurrenceSelection");
    const points = baseSession({ type: SessionType.POINTS, players: players(12) });
    const pointsState = await selectionInputs(points);
    const defaultSelection = selectSingleCourtMatch({ ...pointsState, reshuffleSource: null });
    expect(defaultSelection.balancedPolicyDecision).toBeUndefined();
    expect(balancedEngine).not.toHaveBeenCalled();

    vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
    const social = baseSession({ type: SessionType.SOCIAL_MIX, players: players(12) });
    const socialDefaultState = await selectionInputs(social);
    const socialDefault = selectSingleCourtMatch({ ...socialDefaultState, reshuffleSource: null });
    vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", "1");
    const socialEnabledState = await selectionInputs(social);
    const socialSelection = selectSingleCourtMatch({ ...socialEnabledState, reshuffleSource: null });
    const socialDecision = "socialPolicyDecision" in socialSelection
      ? socialSelection.socialPolicyDecision
      : undefined;
    const socialDefaultDecision = "socialPolicyDecision" in socialDefault
      ? socialDefault.socialPolicyDecision
      : undefined;
    expect(socialDecision?.requestedPolicy).toBe("courtmate-beneficial-rescue");
    expect(socialSelection.balancedPolicyDecision).toBeUndefined();
    expect(balancedEngine).not.toHaveBeenCalled();
    expect(socialDecision).toEqual(socialDefaultDecision);
    expect(socialSelection.matchmakingReasonJson).toBe(socialDefault.matchmakingReasonJson);
    expect(JSON.parse(socialSelection.matchmakingReasonJson ?? "{}").balancedPolicyDecision).toBeUndefined();
  });

  it("keeps Level Match (RACE) outside Balanced dispatch with the flag absent and enabled", async () => {
    const balancedEngine = vi.spyOn(balancedRecurrence, "findBestBalancedRecurrenceSelection");
    const race = baseSession({ type: SessionType.RACE, players: players(12) });

    vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
    const defaultState = await selectionInputs(race);
    const defaultSelection = selectSingleCourtMatch({
      ...defaultState,
      reshuffleSource: null,
    });

    vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", "1");
    const enabledState = await selectionInputs(race);
    const enabledSelection = selectSingleCourtMatch({
      ...enabledState,
      reshuffleSource: null,
    });

    expect(balancedEngine).not.toHaveBeenCalled();
    expect(defaultSelection.balancedPolicyDecision).toBeUndefined();
    expect(enabledSelection.balancedPolicyDecision).toBeUndefined();
    expect(JSON.parse(defaultSelection.matchmakingReasonJson ?? "{}").balancedPolicyDecision)
      .toBeUndefined();
    expect(JSON.parse(enabledSelection.matchmakingReasonJson ?? "{}").balancedPolicyDecision)
      .toBeUndefined();
  });

  it.each([SessionType.POINTS, SessionType.ELO])(
    "%s labels a rest-disabled automatic selection as a certified production fallback",
    async (type) => {
      vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
      const data = baseSession({
        type,
        respectPlayerRest: false,
        players: players(12),
      });
      const input = await selectionInputs(data);
      const selected = selectSingleCourtMatch({ ...input, reshuffleSource: null });
      const reason = JSON.parse(selected.matchmakingReasonJson ?? "{}");

      expect(selected.balancedPolicyDecision).toMatchObject({
        requestedPolicy: "strict-replay-rescue",
        appliedPolicy: "production",
        outcome: "production-fallback",
        reasonCodes: expect.arrayContaining(["REPLAY_GATES_DISABLED"]),
        fallbackProof: { certified: true },
      });
      expect(reason.balancedPolicyDecision).toEqual(selected.balancedPolicyDecision);
    },
  );
});
