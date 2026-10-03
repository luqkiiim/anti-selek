import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CourtGroupType,
  MatchStatus,
  PartnerPreference,
  PlayerGender,
  SessionCollabFormat,
  SessionCrossoverFrequency,
  SessionMode,
  SessionPool,
  SessionStatus,
  SessionType,
} from "@/types/enums";
import { buildSocialSessionHistory } from "@/lib/matchmaking/socialSessionHistory";
import { getSocialIdealRestGap } from "@/lib/matchmaking/v3/scoring";
import * as socialHistory from "@/lib/matchmaking/socialSessionHistory";
import {
  buildSocialVarietyContext,
  getSocialVarietyGains,
  parseSocialVarietySnapshot,
  withSocialVarietySnapshot,
} from "@/lib/matchmaking/v3/socialVariety";
import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  V3DoublesPartition,
  V3SelectionConstraints,
} from "@/lib/matchmaking/v3/types";
import {
  buildPlayerGroupCourtPlans,
  getPlayerGroupSelectionConstraints,
} from "@/lib/matchmaking/playerGroupPlanner";
import {
  buildMatchmakingState,
  getRankedCandidates,
  selectBatchMatches,
  selectReplacementMatch,
  selectSingleCourtMatch,
} from "./selection";
import type { GenerateMatchSession } from "./shared";

const joinedAt = new Date("2026-04-01T00:00:00Z");
const completedAt = new Date("2026-04-01T00:10:00Z");
const availableSince = new Date("2026-04-01T00:20:00Z");
type ContextPlayer = MatchmakerV3Player & { representingClubId: string | null };

function player(
  userId: string,
  gender = PlayerGender.MALE,
  overrides: Partial<GenerateMatchSession["players"][number]> = {}
): GenerateMatchSession["players"][number] {
  return {
    userId,
    gender,
    partnerPreference: gender === PlayerGender.FEMALE ? PartnerPreference.FEMALE_FLEX : PartnerPreference.OPEN,
    mixedSideOverride: null,
    pool: SessionPool.A,
    matchesPlayed: 1,
    matchmakingMatchesCredit: 0,
    sessionPoints: 0,
    isPaused: false,
    isGuest: false,
    lastPartnerId: null,
    representingClubId: null,
    availableSince,
    joinedAt,
    arrivalPriorityAt: null,
    inactiveSeconds: 0,
    user: { id: userId, name: userId, elo: 1000 },
    ...overrides,
  } as GenerateMatchSession["players"][number];
}

function session(overrides: Partial<GenerateMatchSession> = {}): GenerateMatchSession {
  return {
    id: "social-session",
    code: "SOCIAL",
    clubId: null,
    name: "Social integration",
    type: SessionType.SOCIAL_MIX,
    mode: SessionMode.MIXICANO,
    status: SessionStatus.ACTIVE,
    respectPlayerRest: true,
    poolsEnabled: false,
    crossoverFrequency: SessionCrossoverFrequency.BALANCED,
    courts: [{ id: "court-1" }, { id: "court-2" }],
    sessionClubs: [],
    players: [],
    matches: [],
    queuedMatch: null,
    ...overrides,
  } as unknown as GenerateMatchSession;
}

function match(
  id: string,
  partition: V3DoublesPartition,
  players: GenerateMatchSession["players"],
  status = MatchStatus.COMPLETED,
  overrides: Partial<GenerateMatchSession["matches"][number]> = {}
): GenerateMatchSession["matches"][number] {
  return {
    id,
    sessionId: "social-session",
    courtId: "court-1",
    status,
    team1User1Id: partition.team1[0],
    team1User2Id: partition.team1[1],
    team2User1Id: partition.team2[0],
    team2User2Id: partition.team2[1],
    team1Score: null,
    team2Score: null,
    completedAt: status === MatchStatus.COMPLETED ? completedAt : null,
    createdAt: joinedAt,
    matchmakingReasonJson: withSocialVarietySnapshot(null, partition, players),
    ...overrides,
  } as GenerateMatchSession["matches"][number];
}

function contextPlayers(data: GenerateMatchSession): ContextPlayer[] {
  return data.players.map((entry) => ({
    userId: entry.userId,
    gender: entry.gender,
    partnerPreference: entry.partnerPreference,
    mixedSideOverride: entry.mixedSideOverride,
    matchesPlayed: entry.matchesPlayed,
    matchmakingBaseline: entry.matchesPlayed,
    availableSince: entry.availableSince,
    strength: entry.sessionPoints,
    isPaused: entry.isPaused,
    pool: entry.pool,
    representingClubId: entry.representingClubId,
  }));
}

async function inputs(data: GenerateMatchSession) {
  // Social settings make this route adapter read-only and require no rating queries.
  const state = await buildMatchmakingState(data);
  const { rankedCandidates } = getRankedCandidates(data, state.busyPlayerIds);
  return { ...state, rankedCandidates, sessionData: data };
}

function expectHistoryScore(
  selection: { partition: V3DoublesPartition; matchmakingReasonJson?: string | null },
  context: ReturnType<typeof buildSocialVarietyContext>
) {
  const reason = JSON.parse(selection.matchmakingReasonJson ?? "{}");
  const recorded = reason.metrics?.socialVarietyGains ?? reason.socialVarietyGains;
  const expected = getSocialVarietyGains(selection.partition, context);
  for (const key of ["courtmates", "partners", "opponents", "matchType"] as const) {
    expect(recorded[key]).toBeCloseTo(expected[key], 12);
  }
  expect(parseSocialVarietySnapshot(reason, selection.partition)).not.toBeNull();
}

function standardFixture() {
  const players = [
    ...Array.from({ length: 6 }, (_, index) => player(`M${index + 1}`)),
    ...Array.from({ length: 6 }, (_, index) => player(`F${index + 1}`, PlayerGender.FEMALE)),
  ];
  const mens = match("manual-men", { team1: ["M1", "M2"], team2: ["M3", "M4"] }, players);
  const womens = match("manual-women", { team1: ["F1", "F2"], team2: ["F3", "F4"] }, players);
  const active = match("active", { team1: ["M5", "F5"], team2: ["M6", "F6"] }, players, MatchStatus.IN_PROGRESS);
  const data = session({
    players,
    matches: [mens, womens, active],
    queuedMatch: { ...active, id: "queue-transfer", isAutomatic: false } as unknown as GenerateMatchSession["queuedMatch"],
  });
  // The immutable men's history remains same-side after these players switch roles.
  data.players.find((entry) => entry.userId === "M1")!.mixedSideOverride = "LOWER";
  data.players.find((entry) => entry.userId === "M2")!.mixedSideOverride = "LOWER";
  return data;
}

function interclubConstraints(): V3SelectionConstraints<ActiveMatchmakerV3Player<ContextPlayer>> {
  return {
    isQuartetAllowed: (quartet) => quartet.filter((entry) => entry.representingClubId === "host").length === 2,
    normalizePartition: ({ partition, playersById }) => {
      const clubs = [partition.team1, partition.team2].map((team) => team.map((id) => playersById.get(id)?.representingClubId));
      return clubs.every((team) => team[0] === team[1]) && clubs[0][0] !== clubs[1][0] ? partition : null;
    },
  };
}

function interclubSession(players: GenerateMatchSession["players"], overrides: Partial<GenerateMatchSession> = {}) {
  return session({
    collabFormat: SessionCollabFormat.INTERCLUB,
    players,
    sessionClubs: ["host", "partner"].map((clubId) => ({ clubId, status: "ACCEPTED", role: clubId === "host" ? "HOST" : "PARTNER", club: { id: clubId, name: clubId } })) as GenerateMatchSession["sessionClubs"],
    ...overrides,
  });
}

describe("Social generation route adapters", () => {
  beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.25));
  afterEach(() => vi.restoreAllMocks());

  it("uses immutable manual history and active/queue commitments in standard single-court scoring", async () => {
    const data = standardFixture();
    const history = buildSocialSessionHistory(data);
    expect(history.map((entry) => entry.id)).toEqual(["manual-men", "manual-women", "active"]);
    const context = buildSocialVarietyContext(contextPlayers(data), history, { sessionMode: SessionMode.MIXICANO });
    expect(context.playersByUserId.get("M1")!.matchType.counts.get("OWN_SIDE")).toBe(1);
    expect(context.playersByUserId.get("M5")!.matchType.counts.get("MIXED")).toBe(1);
    const state = await inputs(data);
    const selection = selectSingleCourtMatch({ ...state, reshuffleSource: null });
    expect(selection.ids.every((id) => !state.busyPlayerIds.has(id))).toBe(true);
    expectHistoryScore(selection, context);
    expect(parseSocialVarietySnapshot(selection.matchmakingReasonJson, selection.partition)?.courtType).toBe("MIXED");
  });

  it("evaluates two standard courts against one full-roster history context", async () => {
    const data = standardFixture();
    const state = await inputs(data);
    const context = buildSocialVarietyContext(contextPlayers(data), buildSocialSessionHistory(data), { sessionMode: SessionMode.MIXICANO });
    const result = selectBatchMatches({ ...state, requestedMatchCount: 2, randomFn: () => 0.25 });
    expect(result.selections).toHaveLength(2);
    expect(new Set(result.selections.flatMap((entry) => entry.ids)).size).toBe(8);
    expect(result.selections.flatMap((entry) => entry.ids).every((id) => !state.busyPlayerIds.has(id))).toBe(true);
    for (const selection of result.selections) expectHistoryScore(selection, context);
    expect(result.selections.map((entry) => parseSocialVarietySnapshot(entry.matchmakingReasonJson, entry.partition)?.courtType).sort()).toEqual(["LOWER", "MIXED"]);
  });

  it("counts a distinct manual queue once, reserves its players and preserves its original type", async () => {
    const data = standardFixture();
    data.matches = data.matches.filter((entry) => entry.id !== "active");
    data.players.find((entry) => entry.userId === "M5")!.mixedSideOverride = "LOWER";
    const history = buildSocialSessionHistory(data);
    expect(history.map((entry) => entry.id)).toEqual(["manual-men", "manual-women", "queue-transfer"]);
    const context = buildSocialVarietyContext(contextPlayers(data), history, { sessionMode: SessionMode.MIXICANO });
    expect(context.playersByUserId.get("M5")!.matchType.counts.get("MIXED")).toBe(1);
    const state = await inputs(data);
    const selection = selectSingleCourtMatch({ ...state, reshuffleSource: null });
    expect(selection.ids).not.toContain("M5");
    expectHistoryScore(selection, context);
  });

  it("compares equally fair Social replacement candidates instead of taking the first eligible player", async () => {
    const players = ["a", "b", "r1", "r2", "r3"].map((id) => player(id, PlayerGender.MALE, { matchesPlayed: 6 }));
    const repeated = Array.from({ length: 6 }, (_, index) => match(`repeated-${index}`, {
      team1: ["r1", "a"], team2: ["r2", "r3"],
    }, players));
    const data = session({ mode: SessionMode.MEXICANO, players, matches: repeated });
    const state = await inputs(data);
    const rankedCandidates = [...state.rankedCandidates].sort((left, right) => left.userId.localeCompare(right.userId));
    expect(rankedCandidates[0].userId).toBe("a");
    const selection = selectReplacementMatch({ ...state, rankedCandidates, retainedUserIds: ["r1", "r2", "r3"] });
    expect(selection.ids).toContain("b");
    expect(selection.ids).not.toContain("a");
    const context = buildSocialVarietyContext(contextPlayers(data), buildSocialSessionHistory(data), { sessionMode: SessionMode.MEXICANO });
    expectHistoryScore(selection, context);
  });

  it("uses shared history across player-group plans while keeping the fairest eight players", async () => {
    const players = [SessionPool.A, SessionPool.B].flatMap((pool) =>
      Array.from({ length: 6 }, (_, index) => player(`${pool}${index + 1}`, PlayerGender.MALE, {
        pool,
        matchesPlayed: index < 4 ? 1 : 3,
      }))
    );
    const history = Array.from({ length: 4 }, (_, index) => match(
      `manual-${index}`,
      index % 2 === 0
        ? { team1: ["A1", "B1"], team2: ["A2", "B2"] }
        : { team1: ["A3", "B3"], team2: ["A4", "B4"] },
      players,
      MatchStatus.COMPLETED,
      { courtGroupType: CourtGroupType.CROSSOVER, poolASeatCount: 2, poolBSeatCount: 2 }
    ));
    const data = session({ poolsEnabled: true, mode: SessionMode.MEXICANO, players, matches: history });
    const state = await inputs(data);
    const opportunities = buildPlayerGroupCourtPlans({
      requestedCourtCount: 1,
      activePoolAPlayerCount: 6,
      activePoolBPlayerCount: 6,
      waitingPoolAPlayerCount: 6,
      waitingPoolBPlayerCount: 6,
      crossoverFrequency: data.crossoverFrequency,
    }).flatMap((plan) => plan.compositions.map((composition) => getPlayerGroupSelectionConstraints<ActiveMatchmakerV3Player<ContextPlayer>>(composition)));
    const context = buildSocialVarietyContext(contextPlayers(data), buildSocialSessionHistory(data), {
      sessionMode: SessionMode.MEXICANO,
      opportunityConstraints: opportunities,
    });
    const result = selectBatchMatches({ ...state, requestedMatchCount: 2, requestedCourtIds: ["court-1", "court-2"], randomFn: () => 0.25 });
    expect(result.selections).toHaveLength(2);
    expect(result.selections.flatMap((entry) => entry.ids).sort()).toEqual(["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"]);
    for (const selection of result.selections) expectHistoryScore(selection, context);
  });

  it("keeps Social player-group batch selections valid while variety precedes rest", async () => {
    const players = [SessionPool.A, SessionPool.B].flatMap((pool) =>
      Array.from({ length: 6 }, (_, index) => player(`${pool}${index + 1}`, PlayerGender.MALE, { pool }))
    );
    const recent = match("latest", { team1: ["A5", "B5"], team2: ["A6", "B6"] }, players, MatchStatus.COMPLETED, {
      completedAt: new Date("2026-04-01T00:30:00Z"),
      courtGroupType: CourtGroupType.CROSSOVER,
      poolASeatCount: 2,
      poolBSeatCount: 2,
    });
    const data = session({ poolsEnabled: true, mode: SessionMode.MEXICANO, players, matches: [recent] });
    const state = await inputs(data);
    const result = selectBatchMatches({ ...state, requestedMatchCount: 2, randomFn: () => 0.25 });
    expect(result.selections).toHaveLength(2);
    expect(new Set(result.selections.flatMap((entry) => entry.ids)).size).toBe(8);
    for (const selection of result.selections) {
      expect((selection.poolASeatCount ?? 0) + (selection.poolBSeatCount ?? 0)).toBe(4);
      expect(selection.courtGroupType).toBeTruthy();
    }
  });

  it.each([
    ["MIXED", "MIXED", 1],
    ["MIXED", "MIXED", 4729],
    ["MENS", "WOMENS", 104729],
  ] as const)("keeps Social variety active through alternating queue-disabled refills after %s + %s openings (seed %i)", async (firstOpeningType, secondOpeningType, seed) => {
    let randomState = seed;
    vi.mocked(Math.random).mockImplementation(() => {
      randomState = (randomState * 48271) % 2147483647;
      return randomState / 2147483647;
    });
    const players = [
      ...Array.from({ length: 7 }, (_, index) => player(`M${index + 1}`, PlayerGender.MALE, { matchesPlayed: 0, availableSince: joinedAt })),
      ...Array.from({ length: 7 }, (_, index) => player(`F${index + 1}`, PlayerGender.FEMALE, { matchesPlayed: 0, availableSince: joinedAt })),
    ];
    const openingPairs: Record<string, [V3DoublesPartition, V3DoublesPartition]> = {
      "MIXED+MIXED": [
        { team1: ["M1", "F1"], team2: ["M2", "F2"] },
        { team1: ["M3", "F3"], team2: ["M4", "F4"] },
      ],
      "MENS+WOMENS": [
        { team1: ["M1", "M2"], team2: ["M3", "M4"] },
        { team1: ["F1", "F2"], team2: ["F3", "F4"] },
      ],
    };
    const [firstPartition, secondPartition] = openingPairs[`${firstOpeningType}+${secondOpeningType}`];
    const data = session({
      players,
      queuedMatch: null,
      matches: [
        match("opening-court-1", firstPartition, players, MatchStatus.IN_PROGRESS, { courtId: "court-1" }),
        match("opening-court-2", secondPartition, players, MatchStatus.IN_PROGRESS, { courtId: "court-2" }),
      ],
    });
    const currentMatchByCourt = new Map([
      ["court-1", "opening-court-1"],
      ["court-2", "opening-court-2"],
    ]);
    const selectedTypes: string[] = [];
    const gendersById = new Map(players.map((entry) => [entry.userId, entry.gender]));
    const waitStartedAtCompletion = new Map<string, number>();
    const observedRestGaps: number[] = [];
    let completionEventCount = 0;

    for (let refill = 0; refill < 45; refill += 1) {
      const freedCourtId = refill % 2 === 0 ? "court-1" : "court-2";
      const busyCourtId = freedCourtId === "court-1" ? "court-2" : "court-1";
      const currentMatchId = currentMatchByCourt.get(freedCourtId)!;
      const completedAt = new Date(joinedAt.getTime() + (refill + 1) * 10 * 60 * 1000);
      const completed = data.matches.find((entry) => entry.id === currentMatchId)!;
      completed.status = MatchStatus.COMPLETED;
      completed.completedAt = completedAt;
      completionEventCount += 1;
      for (const userId of [completed.team1User1Id, completed.team1User2Id, completed.team2User1Id, completed.team2User2Id]) {
        const entry = data.players.find((candidate) => candidate.userId === userId)!;
        entry.matchesPlayed += 1;
        entry.availableSince = completedAt;
        waitStartedAtCompletion.set(userId, completionEventCount);
      }
      const completedCounts = data.players.map((entry) => entry.matchesPlayed);
      expect(Math.max(...completedCounts) - Math.min(...completedCounts)).toBeLessThanOrEqual(1);

      const state = await inputs(data);
      const busyMatch = data.matches.find((entry) => entry.id === currentMatchByCourt.get(busyCourtId))!;
      expect(state.busyPlayerIds).toEqual(new Set([
        busyMatch.team1User1Id, busyMatch.team1User2Id, busyMatch.team2User1Id, busyMatch.team2User2Id,
      ]));
      expect(data.queuedMatch).toBeNull();
      const selection = selectSingleCourtMatch({ ...state, reshuffleSource: null });
      expect(selection.ids.every((id) => !state.busyPlayerIds.has(id))).toBe(true);
      const countsById = new Map(data.players.map((entry) => [
        entry.userId,
        Math.max(entry.matchesPlayed, entry.matchesPlayed + Math.max(0, entry.matchmakingMatchesCredit ?? 0)),
      ]));
      const expectedCounts = state.rankedCandidates
        .map((entry) => countsById.get(entry.userId)!)
        .sort((left, right) => left - right)
        .slice(0, 4);
      const selectedCounts = selection.ids
        .map((id) => countsById.get(id)!)
        .sort((left, right) => left - right);
      expect(selectedCounts).toEqual(expectedCounts);
      for (const userId of selection.ids) {
        const startedAt = waitStartedAtCompletion.get(userId);
        if (startedAt !== undefined) {
          observedRestGaps.push(completionEventCount - startedAt);
          waitStartedAtCompletion.delete(userId);
        }
      }
      const men = selection.ids.filter((id) => gendersById.get(id) === PlayerGender.MALE).length;
      expect([0, 2, 4]).toContain(men);
      selectedTypes.push(men === 4 ? "MENS" : men === 0 ? "WOMENS" : "MIXED");

      const nextMatchId = `refill-${refill}`;
      data.matches.push(match(nextMatchId, selection.partition, data.players, MatchStatus.IN_PROGRESS, {
        courtId: freedCourtId,
        createdAt: completedAt,
        matchmakingReasonJson: selection.matchmakingReasonJson,
      }));
      currentMatchByCourt.set(freedCourtId, nextMatchId);
    }

    expect(new Set(selectedTypes.slice(-24))).toEqual(new Set(["MENS", "WOMENS", "MIXED"]));
    const maxRestGap = getSocialIdealRestGap(players.filter((entry) => !entry.isPaused).length) + 1;
    expect(observedRestGaps.length).toBeGreaterThan(0);
    expect(Math.max(...observedRestGaps)).toBeLessThanOrEqual(maxRestGap);
    const censoredRestGaps = [...waitStartedAtCompletion.values()].map((startedAt) => completionEventCount - startedAt);
    expect(censoredRestGaps.length).toBeGreaterThan(0);
    expect(Math.max(...censoredRestGaps)).toBeLessThanOrEqual(maxRestGap);
  });

  it("uses constrained full-roster Social history for Interclub batches", async () => {
    const players = ["host", "partner"].flatMap((club) =>
      Array.from({ length: 6 }, (_, index) => player(`${club}-${index + 1}`, index % 2 === 0 ? PlayerGender.MALE : PlayerGender.FEMALE, { representingClubId: club }))
    );
    const completed = match("manual-interclub", { team1: ["host-1", "host-2"], team2: ["partner-1", "partner-2"] }, players);
    const active = match("active-interclub", { team1: ["host-5", "host-6"], team2: ["partner-5", "partner-6"] }, players, MatchStatus.IN_PROGRESS);
    const data = interclubSession(players, {
      matches: [completed, active],
    });
    const context = buildSocialVarietyContext(contextPlayers(data), buildSocialSessionHistory(data), {
      sessionMode: SessionMode.MIXICANO,
      opportunityConstraints: [interclubConstraints()],
    });
    expect(context.playersByUserId.get("host-1")!.partners.opportunities.has("host-5")).toBe(true);
    expect(context.playersByUserId.get("host-1")!.partners.opportunities.has("partner-1")).toBe(false);
    const state = await inputs(data);
    const result = selectBatchMatches({ ...state, requestedMatchCount: 2, randomFn: () => 0.25 });
    expect(result.selections).toHaveLength(2);
    for (const selection of result.selections) {
      expect(JSON.parse(selection.matchmakingReasonJson ?? "{}").socialStarvation).toMatchObject({
        idealRestGap: 2,
      });
      expect(selection.partition.team1.every((id) => id.startsWith("host"))).toBe(true);
      expect(selection.partition.team2.every((id) => id.startsWith("partner"))).toBe(true);
      expect(selection.ids.every((id) => !state.busyPlayerIds.has(id))).toBe(true);
      expectHistoryScore(selection, context);
    }
  });

  it("finds the fairest legal Interclub Mixed game when each club's lowest cohort is incompatible", async () => {
    const players = ["host", "partner"].flatMap((club) =>
      Array.from({ length: 4 }, (_, index) => {
        const gender = index < 2 ? PlayerGender.MALE : PlayerGender.FEMALE;
        const lowest = club === "host" ? gender === PlayerGender.MALE : gender === PlayerGender.FEMALE;
        return player(`${club}-${index + 1}`, gender, { representingClubId: club, matchesPlayed: lowest ? 0 : 1 });
      })
    );
    const data = interclubSession(players);
    const state = await inputs(data);
    const selection = selectSingleCourtMatch({ ...state, reshuffleSource: null });
    expect(selection.ids).toHaveLength(4);
    expect(selection.partition.team1.every((id) => id.startsWith("host"))).toBe(true);
    expect(selection.partition.team2.every((id) => id.startsWith("partner"))).toBe(true);
    expect(selection.ids.map((id) => players.find((entry) => entry.userId === id)!.matchesPlayed).sort()).toEqual([0, 0, 1, 1]);
    expect(parseSocialVarietySnapshot(selection.matchmakingReasonJson, selection.partition)?.courtType).not.toBeNull();
    const context = buildSocialVarietyContext(contextPlayers(data), [], {
      sessionMode: SessionMode.MIXICANO, opportunityConstraints: [interclubConstraints()],
    });
    expectHistoryScore(selection, context);
  });

  it("keeps an unrelated manual queue in the history used for an Interclub active replacement", async () => {
    const players = ["host", "partner"].flatMap((club) =>
      Array.from({ length: 8 }, (_, index) => player(`${club}-${index + 1}`, index % 2 === 0 ? PlayerGender.MALE : PlayerGender.FEMALE, { representingClubId: club }))
    );
    const queued = match("unrelated-queue", { team1: ["host-7", "host-8"], team2: ["partner-7", "partner-8"] }, players, MatchStatus.PENDING);
    // This is the live replacement route's session projection: only the active match
    // being replaced has been removed; the distinct reserved queue stays present.
    const data = interclubSession(players, {
      queuedMatch: { ...queued, isAutomatic: false } as unknown as GenerateMatchSession["queuedMatch"],
    });
    const historySpy = vi.spyOn(socialHistory, "buildSocialSessionHistory");
    const state = await inputs(data);
    const selection = selectReplacementMatch({ ...state, retainedUserIds: ["host-1", "host-2", "partner-1"], excludedUserIds: ["partner-2"] });
    expect(selection.ids).not.toContain("partner-2");
    expect(selection.ids.every((id) => !state.busyPlayerIds.has(id))).toBe(true);
    const replacementHistory = historySpy.mock.results
      .filter((result) => result.type === "return")
      .map((result) => result.value as ReturnType<typeof buildSocialSessionHistory>);
    expect(replacementHistory).not.toHaveLength(0);
    expect(replacementHistory.every((history) => history.some((entry) => entry.id === "unrelated-queue"))).toBe(true);
    const context = buildSocialVarietyContext(contextPlayers(data), buildSocialSessionHistory(data), {
      sessionMode: SessionMode.MIXICANO, opportunityConstraints: [interclubConstraints()],
    });
    expectHistoryScore(selection, context);
  });
});
