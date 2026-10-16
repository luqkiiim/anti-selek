import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildMatchmakingState, getRankedCandidates, selectBatchMatchesRespectingSkips, selectSingleCourtMatchRespectingSkips } from "@/app/api/sessions/[code]/generate-match/selection";
import { usesGroupedMixedCapacityBudget } from "@/app/api/sessions/[code]/generate-match/queueBudget";
import { getEffectiveSessionMode, getEffectiveSessionType } from "@/lib/sessionSettings";
import type { GenerateMatchSession } from "@/app/api/sessions/[code]/generate-match/shared";
import { createMatchmakingSearchBudget, getMatchmakingSearchPhaseDiagnostics } from "./v3/searchBudget";
import { CourtGroupType, MatchStatus, MixedSide, PartnerPreference, PlayerGender, SessionMode, SessionPool, SessionType } from "@/types/enums";

const now = new Date("2026-10-15T00:00:00.000Z");

type Profile = "balanced" | "skewed";
type Refill = "opening" | "individual" | "joint";

function compareNumberLists(left: number[], right: number[]) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function effectiveCount(player: GenerateMatchSession["players"][number]) {
  return player.matchesPlayed + Math.max(0, player.matchmakingMatchesCredit ?? 0);
}

function legalPointGaps(ids: readonly string[], byId: Map<string, GenerateMatchSession["players"][number]>, courtGroupType: CourtGroupType | string | null) {
  const partitions = [
    [[ids[0], ids[1]], [ids[2], ids[3]]],
    [[ids[0], ids[2]], [ids[1], ids[3]]],
    [[ids[0], ids[3]], [ids[1], ids[2]]],
  ];
  return partitions.flatMap(([team1, team2]) => {
    const firstPoolACount = team1.filter((id) => byId.get(id)?.pool === SessionPool.A).length;
    const secondPoolACount = team2.filter((id) => byId.get(id)?.pool === SessionPool.A).length;
    if (courtGroupType === CourtGroupType.CROSSOVER && (firstPoolACount !== 1 || secondPoolACount !== 1)) return [];
    if (courtGroupType === CourtGroupType.OPEN_OVERFLOW && firstPoolACount + secondPoolACount === 2 && firstPoolACount === 1) return [];
    const lower1 = team1.filter((id) => byId.get(id)?.mixedSideOverride === MixedSide.LOWER).length;
    const lower2 = team2.filter((id) => byId.get(id)?.mixedSideOverride === MixedSide.LOWER).length;
    if (lower1 !== lower2) return [];
    const points1 = team1.reduce((sum, id) => sum + byId.get(id)!.sessionPoints, 0);
    const points2 = team2.reduce((sum, id) => sum + byId.get(id)!.sessionPoints, 0);
    return [Math.abs(points1 / 2 - points2 / 2)];
  });
}

function makeSession(countA: number, countB: number, profile: Profile = "balanced", seed = 1, refill: Refill = "opening", courtCount = 3): GenerateMatchSession {
  // A stable PRNG keeps each history reproducible without mocking engine RNG.
  let state = seed;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const players = Array.from({ length: countA + countB }, (_, index) => {
    const userId = `P${index + 1}`;
    const poolIndex = index < countA ? index : index - countA;
    const upper = profile === "balanced" ? poolIndex % 2 === 0 : index < countA ? poolIndex % 3 !== 0 : poolIndex % 3 === 0;
    return {
      userId,
      matchesPlayed: 0,
      matchmakingMatchesCredit: 0,
      availableSince: now,
      joinedAt: now,
      ladderEntryAt: now,
      arrivalPriorityAt: null,
      sessionPoints: profile === "balanced" ? 10 + (index % 6) : 4 + (index * 7) % 31,
      isPaused: false,
      isGuest: false,
      gender: upper ? PlayerGender.MALE : PlayerGender.FEMALE,
      partnerPreference: upper || index % 5 === 0 ? PartnerPreference.OPEN : PartnerPreference.FEMALE_FLEX,
      mixedSideOverride: upper ? MixedSide.UPPER : MixedSide.LOWER,
      pool: index < countA ? SessionPool.A : SessionPool.B,
      lastPartnerId: null,
      user: { id: userId, name: userId, elo: profile === "balanced" ? 1000 + index * 7 : 800 + (index * 89) % 550 },
    };
  });
  const completed = refill === "opening" ? [] : Array.from({ length: 100 }, (_, index) => {
    const eligible = [...players];
    const selected = Array.from({ length: 4 }, () => eligible.splice(Math.floor(random() * eligible.length), 1)[0]);
    const ids = selected.map((player) => player.userId);
    return {
      id: `history-${index}`,
      courtId: `court-${(index % courtCount) + 1}`,
      status: MatchStatus.COMPLETED,
      createdAt: new Date(now.getTime() - (101 - index) * 600_000),
      completedAt: new Date(now.getTime() - (100 - index) * 600_000),
      team1User1Id: ids[0], team1User2Id: ids[1],
      team2User1Id: ids[2], team2User2Id: ids[3],
      team1Player1Id: ids[0], team1Player2Id: ids[1],
      team2Player1Id: ids[2], team2Player2Id: ids[3],
      team1Score: 21, team2Score: 18,
      courtGroupType: selected.every((player) => player.pool === SessionPool.A)
        ? CourtGroupType.COMPETITIVE : selected.every((player) => player.pool === SessionPool.B)
          ? CourtGroupType.SOCIAL : CourtGroupType.OPEN_OVERFLOW,
      poolASeatCount: selected.filter((player) => player.pool === SessionPool.A).length,
      poolBSeatCount: selected.filter((player) => player.pool === SessionPool.B).length,
    };
  });
  if (refill !== "opening") {
    const counts = new Map(players.map((player) => [player.userId, 0]));
    for (const match of completed) for (const id of [match.team1User1Id, match.team1User2Id, match.team2User1Id, match.team2User2Id]) counts.set(id, counts.get(id)! + 1);
    for (const player of players) player.matchesPlayed = counts.get(player.userId)!;
  }
  const busyIds = refill === "individual" ? players.slice(0, (courtCount - 1) * 4).map((player) => player.userId) : [];
  const current = busyIds.length ? Array.from({ length: courtCount - 1 }, (_, index) => ({
    id: `live-${index}`,
    courtId: `court-${index + 1}`,
    status: MatchStatus.IN_PROGRESS,
    createdAt: now,
    team1User1Id: busyIds[index * 4], team1User2Id: busyIds[index * 4 + 1],
    team2User1Id: busyIds[index * 4 + 2], team2User2Id: busyIds[index * 4 + 3],
    team1Player1Id: busyIds[index * 4], team1Player2Id: busyIds[index * 4 + 1],
    team2Player1Id: busyIds[index * 4 + 2], team2Player2Id: busyIds[index * 4 + 3],
  })) : [];
  return {
    id: `capacity-${countA}-${countB}`,
    code: "CAPACITY",
    clubId: null,
    type: SessionType.POINTS,
    mode: SessionMode.MIXICANO,
    poolsEnabled: true,
    respectPlayerRest: true,
    courts: Array.from({ length: courtCount }, (_, index) => ({ id: `court-${index + 1}`, currentMatchId: refill === "individual" && index < courtCount - 1 ? `live-${index}` : null })),
    players,
    matches: [...completed, ...current],
    queuedMatch: null,
    sessionClubs: [],
  } as unknown as GenerateMatchSession;
}

async function run(sessionData: GenerateMatchSession, seed = 1) {
  let state = seed;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const startedAt = performance.now();
  const requestedCourtIds = sessionData.courts.filter((court) => !court.currentMatchId).map((court) => court.id);
  const rootBudgetExpected = usesGroupedMixedCapacityBudget({
    poolsEnabled: sessionData.poolsEnabled,
    sessionType: getEffectiveSessionType(sessionData),
    sessionMode: getEffectiveSessionMode(sessionData),
    requestedMatchCount: requestedCourtIds.length,
    eligiblePlayerCount: sessionData.players.filter((player) => !player.isPaused).length,
  });
  // Match the route's policy: one root clock exists only for an eligible request.
  const searchBudget = rootBudgetExpected ? createMatchmakingSearchBudget({ now: () => performance.now() }) : undefined;
  const timing = () => ({
    elapsedMs: performance.now() - startedAt,
    rootBudgetExpected,
    rootBudgetApplied: Boolean(searchBudget),
    rootBudgetElapsedMs: searchBudget ? searchBudget.now() - searchBudget.startedAt : null,
    rootBudgetRemainingMs: searchBudget?.remainingMs() ?? null,
    phaseDiagnostics: searchBudget ? getMatchmakingSearchPhaseDiagnostics(searchBudget) : [],
  });
  try {
    const matchmakingState = await buildMatchmakingState(sessionData);
    const { rankedCandidates } = getRankedCandidates(sessionData, matchmakingState.busyPlayerIds);
    const result = requestedCourtIds.length === 1 ? (() => {
      // The HTTP route has a distinct single-court selector and uses Math.random.
      const randomSpy = vi.spyOn(Math, "random").mockImplementation(random);
      try {
        const single = selectSingleCourtMatchRespectingSkips({
          ...matchmakingState, rankedCandidates, sessionData,
          reshuffleSource: null, searchBudget,
        }).selection;
        return { selections: [single] };
      } finally {
        randomSpy.mockRestore();
      }
    })() : selectBatchMatchesRespectingSkips({
      ...matchmakingState,
      rankedCandidates,
      sessionData,
      requestedMatchCount: requestedCourtIds.length,
      requestedCourtIds,
      randomFn: random,
      searchBudget,
    }).selection;
    return { ...timing(), result, error: undefined };
  } catch (error) {
    return { ...timing(), result: undefined as { selections: Array<ReturnType<typeof selectSingleCourtMatchRespectingSkips>["selection"]> } | undefined, error };
  }
}

async function completeMatcherTrajectory(countA: number, countB: number, seed: number, profile: Profile, refill: "joint" | "individual", verify: (session: GenerateMatchSession, outcome: Awaited<ReturnType<typeof run>>) => void) {
  const courtCount = countA + countB === 8 ? 1 : countA + countB === 16 ? 2 : 3;
  const session = makeSession(countA, countB, profile, seed, "opening", courtCount);
  const artifact = {
    fixtureVersion: 4,
    sourceFingerprint: process.env.GROUPED_CAPACITY_FINGERPRINT ?? null,
    countA, countB, seed, profile, refill, courtCount,
    fixture: {
      pointsPolicy: true,
      mixedMode: true,
      rootBudgetPolicy: "production usesGroupedMixedCapacityBudget",
      winnerScore: 21,
      loserScore: 18,
      winnerStandingPointIncrement: 3,
      groupCountA: countA,
      groupCountB: countB,
      upperCount: session.players.filter((player) => player.mixedSideOverride === MixedSide.UPPER).length,
      lowerCount: session.players.filter((player) => player.mixedSideOverride === MixedSide.LOWER).length,
      openPreferenceCount: session.players.filter((player) => player.partnerPreference === PartnerPreference.OPEN).length,
      femaleFlexPreferenceCount: session.players.filter((player) => player.partnerPreference === PartnerPreference.FEMALE_FLEX).length,
    },
    completedCount: 0,
    steps: [] as Array<{ step: number; completedCount: number; requestedCourts: number; unpausedPlayerCount: number; selectedCourts: number; elapsedMs: number; rootBudgetExpected: boolean; rootBudgetApplied: boolean; rootBudgetElapsedMs: number | null; rootBudgetRemainingMs: number | null; phaseDiagnostics: ReturnType<typeof getMatchmakingSearchPhaseDiagnostics> | []; maxPointGap: number; courtAssignments: Array<{ courtId: string; courtGroupType: string | null; playerIds: string[]; team1: string[]; team2: string[]; balanceGap: number | null; matchmakingReasonJson: string | null }>; error?: string }>,
    failureState: null as unknown,
  };
  const destination = path.join(process.cwd(), "private", `grouped-capacity-trajectory-${countA}-${countB}-${profile}-${seed}-${refill}.json`);
  const save = () => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(artifact, null, 2));
  };
  const byId = new Map(session.players.map((player) => [player.userId, player]));
  const active = new Map<string, GenerateMatchSession["matches"][number]>();
  let sequence = 0;
  let eventTimeMs = now.getTime();
  let lastCompletedAtMs = Number.NEGATIVE_INFINITY;
  const schedule = async () => {
    const requestedCourtIds = session.courts.filter((court) => !court.currentMatchId).map((court) => court.id);
    const outcome = await run(session, seed + sequence * 104729);
    const step = {
      step: sequence, completedCount: artifact.completedCount,
      requestedCourts: requestedCourtIds.length,
      unpausedPlayerCount: session.players.filter((player) => !player.isPaused).length,
      selectedCourts: outcome.result?.selections.length ?? 0,
      elapsedMs: outcome.elapsedMs,
      rootBudgetExpected: outcome.rootBudgetExpected,
      rootBudgetApplied: outcome.rootBudgetApplied,
      rootBudgetElapsedMs: outcome.rootBudgetElapsedMs,
      rootBudgetRemainingMs: outcome.rootBudgetRemainingMs,
      phaseDiagnostics: outcome.phaseDiagnostics,
      maxPointGap: 0,
      courtAssignments: [] as Array<{ courtId: string; courtGroupType: string | null; playerIds: string[]; team1: string[]; team2: string[]; balanceGap: number | null; matchmakingReasonJson: string | null }>,
      ...(outcome.error ? { error: outcome.error instanceof Error ? outcome.error.message : String(outcome.error) } : {}),
    };
    artifact.steps.push(step);
    try {
      for (const [index, selection] of (outcome.result?.selections ?? []).entries()) {
        const teams = [selection.partition.team1, selection.partition.team2];
        const teamPoints = teams.map((team) => team.reduce((total, id) => total + byId.get(id)!.sessionPoints, 0));
        step.maxPointGap = Math.max(step.maxPointGap, Math.abs(teamPoints[0] / 2 - teamPoints[1] / 2));
        step.courtAssignments.push({
          courtId: requestedCourtIds[index], courtGroupType: selection.courtGroupType ?? null,
          playerIds: [...selection.ids], team1: [...teams[0]], team2: [...teams[1]],
          balanceGap: "balanceGap" in selection ? selection.balanceGap : null,
          matchmakingReasonJson: "matchmakingReasonJson" in selection ? selection.matchmakingReasonJson ?? null : null,
        });
      }
      verify(session, outcome);
      expect(outcome.result?.selections).toHaveLength(requestedCourtIds.length);
      expect(outcome.rootBudgetApplied).toBe(outcome.rootBudgetExpected);
      if (outcome.rootBudgetApplied) expect(outcome.rootBudgetElapsedMs).toBeLessThanOrEqual(5_100);
      for (const [index, selection] of outcome.result!.selections.entries()) {
        const courtId = requestedCourtIds[index];
        const teams = [selection.partition.team1, selection.partition.team2];
        const match = {
          id: `trajectory-${sequence}-${index}`,
          courtId,
          status: MatchStatus.IN_PROGRESS,
          createdAt: new Date(eventTimeMs),
          team1User1Id: teams[0][0], team1User2Id: teams[0][1],
          team2User1Id: teams[1][0], team2User2Id: teams[1][1],
          team1Player1Id: teams[0][0], team1Player2Id: teams[0][1],
          team2Player1Id: teams[1][0], team2Player2Id: teams[1][1],
          courtGroupType: selection.courtGroupType,
          poolASeatCount: selection.poolASeatCount,
          poolBSeatCount: selection.poolBSeatCount,
        } as GenerateMatchSession["matches"][number];
        expect(match.createdAt.getTime()).toBeGreaterThanOrEqual(lastCompletedAtMs);
        for (const id of selection.ids) expect(byId.get(id)!.availableSince.getTime()).toBeLessThanOrEqual(match.createdAt.getTime());
        session.matches.push(match);
        const court = session.courts.find((entry) => entry.id === courtId)!;
        court.currentMatchId = match.id;
        active.set(courtId, match);
      }
      sequence += 1;
    } catch (error) {
      artifact.failureState = session;
      save();
      throw error;
    }
  };
  try {
    await schedule();
    while (artifact.completedCount < 100) {
      const finishing = refill === "joint" ? [...active.entries()] : [active.entries().next().value!];
      const count = Math.min(finishing.length, 100 - artifact.completedCount);
      eventTimeMs += 600_000;
      for (const [courtId, match] of finishing.slice(0, count)) {
        const completedAt = new Date(eventTimeMs);
        expect(completedAt.getTime()).toBeGreaterThan(match.createdAt.getTime());
        expect(completedAt.getTime()).toBeGreaterThanOrEqual(lastCompletedAtMs);
        lastCompletedAtMs = completedAt.getTime();
        match.status = MatchStatus.COMPLETED;
        match.completedAt = completedAt;
        match.team1Score = 21;
        match.team2Score = 18;
        for (const [one, two] of [[match.team1User1Id, match.team1User2Id], [match.team2User1Id, match.team2User2Id]]) {
          for (const [id, partner] of [[one, two], [two, one]]) {
            const player = byId.get(id)!;
            player.matchesPlayed += 1;
            if (match.team1User1Id === id || match.team1User2Id === id) player.sessionPoints += 3;
            player.lastPartnerId = partner;
            player.availableSince = completedAt;
          }
        }
        session.courts.find((court) => court.id === courtId)!.currentMatchId = null;
        active.delete(courtId);
        artifact.completedCount += 1;
      }
      if (artifact.completedCount < 100) await schedule();
      if (artifact.completedCount % 12 === 0) save();
    }
    save();
    return artifact;
  } catch (error) {
    save();
    throw error;
  }
}

describe("grouped Balanced Points Mixed capacity", () => {
  it("excludes same-pool teams from crossover balance alternatives", () => {
    const session = makeSession(12, 12);
    const byId = new Map(session.players.map((player) => [player.userId, player]));
    for (const [id, points] of [["P14", 20], ["P20", 20], ["P6", 24], ["P8", 17]] as const) {
      const player = byId.get(id)!;
      player.sessionPoints = points;
      player.mixedSideOverride = MixedSide.LOWER;
    }
    const quartet = ["P14", "P20", "P6", "P8"];
    expect(legalPointGaps(quartet, byId, CourtGroupType.CROSSOVER)).toEqual([3.5, 3.5]);
    expect(legalPointGaps(quartet, byId, CourtGroupType.OPEN_OVERFLOW)).toEqual([0.5]);
  });

  function verify(session: GenerateMatchSession, outcome: Awaited<ReturnType<typeof run>>) {
    if (outcome.error) throw outcome.error;
    const selections = outcome.result!.selections;
    const busy = new Set(session.matches.filter((match) => match.status === MatchStatus.IN_PROGRESS)
      .flatMap((match) => [match.team1User1Id, match.team1User2Id, match.team2User1Id, match.team2User2Id]));
    const eligible = new Set(session.players.filter((player) => !player.isPaused && !busy.has(player.userId)).map((player) => player.userId));
    const occupied = selections.flatMap((selection) => selection.ids);
    expect(new Set(occupied).size).toBe(occupied.length);
    expect(occupied.every((id) => eligible.has(id))).toBe(true);
    const byId = new Map(session.players.map((player) => [player.userId, player]));
    const selected = new Set(occupied);
    const selectedCounts = occupied.map((id) => effectiveCount(byId.get(id)!)).sort((a, b) => a - b);
    // A same-pool, same-side substitution leaves every group composition and
    // Mixed partition legal. Such a substitution may not improve the count tier.
    for (const selectedId of occupied) for (const waiting of session.players) {
      if (!eligible.has(waiting.userId) || selected.has(waiting.userId)) continue;
      const current = byId.get(selectedId)!;
      if (current.pool !== waiting.pool || current.mixedSideOverride !== waiting.mixedSideOverride ||
        current.partnerPreference !== waiting.partnerPreference) continue;
      const alternative = occupied.map((id) => id === selectedId ? effectiveCount(waiting) : effectiveCount(byId.get(id)!))
        .sort((a, b) => a - b);
      expect(compareNumberLists(selectedCounts, alternative)).toBeLessThanOrEqual(0);
    }
    const localMinMax = Math.max(...selections.map((selection) => {
      const gaps = legalPointGaps(selection.ids, byId, selection.courtGroupType ?? null);
      expect(gaps.length).toBeGreaterThan(0);
      return Math.min(...gaps);
    }));
    for (const selection of selections) {
      expect(selection.ids).toHaveLength(4);
      const a = selection.ids.filter((id) => byId.get(id)?.pool === SessionPool.A).length;
      const b = selection.ids.filter((id) => byId.get(id)?.pool === SessionPool.B).length;
      expect(Object.values(CourtGroupType)).toContain(selection.courtGroupType);
      expect([a, b]).toEqual([selection.poolASeatCount, selection.poolBSeatCount]);
      if (selection.courtGroupType === CourtGroupType.COMPETITIVE) expect([a, b]).toEqual([4, 0]);
      if (selection.courtGroupType === CourtGroupType.SOCIAL) expect([a, b]).toEqual([0, 4]);
      if (selection.courtGroupType === CourtGroupType.CROSSOVER) expect([a, b]).toEqual([2, 2]);
      if (selection.courtGroupType === CourtGroupType.OPEN_OVERFLOW) {
        expect([1, 2, 3]).toContain(a);
        expect([1, 2, 3]).toContain(b);
      }
      const teams = [selection.partition.team1, selection.partition.team2];
      expect(new Set(teams.flat()).size).toBe(4);
      const teamPoolACounts = teams.map((team) => team.filter((id) => byId.get(id)?.pool === SessionPool.A).length);
      if (selection.courtGroupType === CourtGroupType.CROSSOVER) expect(teamPoolACounts).toEqual([1, 1]);
      if (selection.courtGroupType === CourtGroupType.OPEN_OVERFLOW && a === 2) {
        expect(teamPoolACounts.slice().sort((left, right) => left - right)).toEqual([0, 2]);
      }
      const lowerCounts = teams.map((team) => team.filter((id) => byId.get(id)?.mixedSideOverride === MixedSide.LOWER).length);
      expect(lowerCounts[0]).toBe(lowerCounts[1]);
      const actualGap = Math.abs(
        teams[0].reduce((sum, id) => sum + byId.get(id)!.sessionPoints, 0) -
        teams[1].reduce((sum, id) => sum + byId.get(id)!.sessionPoints, 0)
      ) / 2;
      expect("balanceGap" in selection).toBe(true);
      if ("balanceGap" in selection) expect(selection.balanceGap).toBe(actualGap);
      expect(actualGap).toBeLessThanOrEqual(localMinMax + 1.5);
    }
  }

  it.each([[11, 11], [12, 12]] as const)("fills three courts with %i/%i groups", async (countA, countB) => {
    const session = makeSession(countA, countB);
    const outcome = await run(session);
    console.log(JSON.stringify({ countA, countB, elapsedMs: outcome.elapsedMs, courts: outcome.result?.selections.length, error: outcome.error instanceof Error ? outcome.error.message : undefined }));
    verify(session, outcome);
    expect(outcome.result?.selections).toHaveLength(3);
  });

  it("matches an exhaustive 8-player fairness and balance oracle within its group composition", async () => {
    const session = makeSession(4, 4, "balanced", 4729, "opening", 1);
    const credits = [0, 2, 1, 0, 1, 0, 2, 0];
    session.players.forEach((player, index) => { player.matchmakingMatchesCredit = credits[index]; });
    const outcome = await run(session, 4729);
    verify(session, outcome);
    expect(outcome.result?.selections).toHaveLength(1);
    const selection = outcome.result!.selections[0];
    const byId = new Map(session.players.map((player) => [player.userId, player]));
    let bestFairness: number[] | null = null;
    let bestGap = Infinity;
    let legalQuartets = 0;
    const players = session.players;
    for (let a = 0; a < 5; a += 1) for (let b = a + 1; b < 6; b += 1)
      for (let c = b + 1; c < 7; c += 1) for (let d = c + 1; d < 8; d += 1) {
        const quartet = [players[a], players[b], players[c], players[d]];
        const groupASeats = quartet.filter((player) => player.pool === SessionPool.A).length;
        if (groupASeats !== selection.poolASeatCount) continue;
        const gaps = legalPointGaps(quartet.map((player) => player.userId), byId, selection.courtGroupType ?? null);
        if (!gaps.length) continue;
        legalQuartets += 1;
        const fairness = quartet.map(effectiveCount).sort((left, right) => left - right);
        const comparison = bestFairness === null ? -1 : compareNumberLists(fairness, bestFairness);
        if (comparison < 0) {
          bestFairness = fairness;
          bestGap = Math.min(...gaps);
        } else if (comparison === 0) bestGap = Math.min(bestGap, ...gaps);
      }
    expect(legalQuartets).toBeGreaterThan(1);
    expect(selection.ids.map((id) => effectiveCount(byId.get(id)!)).sort((left, right) => left - right)).toEqual(bestFairness);
    const chosenGap = Math.abs(
      selection.partition.team1.reduce((sum, id) => sum + byId.get(id)!.sessionPoints, 0) -
      selection.partition.team2.reduce((sum, id) => sum + byId.get(id)!.sessionPoints, 0)
    ) / 2;
    expect(chosenGap).toBeLessThanOrEqual(bestGap + 1.5);
  }, 30_000);

  it.skipIf(process.env.RUN_GROUPED_CAPACITY_OPENING !== "1")("measures one budgeted cold opening for 24 grouped players", async () => {
    const session = makeSession(12, 12, "balanced", 1, "opening", 3);
    const outcome = await run(session, 1);
    const destination = path.join(process.cwd(), "private", "grouped-capacity-opening-budgeted.json");
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify({
      fixtureVersion: 4,
      sourceFingerprint: process.env.GROUPED_CAPACITY_FINGERPRINT ?? null,
      countA: 12, countB: 12, seed: 1, courtCount: 3,
      rootBudgetExpected: outcome.rootBudgetExpected,
      rootBudgetApplied: outcome.rootBudgetApplied,
      rootBudgetElapsedMs: outcome.rootBudgetElapsedMs,
      rootBudgetRemainingMs: outcome.rootBudgetRemainingMs,
      phaseDiagnostics: outcome.phaseDiagnostics,
      selectedCourts: outcome.result?.selections.length ?? 0,
      error: outcome.error instanceof Error ? outcome.error.message : null,
    }, null, 2));
    verify(session, outcome);
    expect(outcome.result?.selections).toHaveLength(3);
    expect(outcome.rootBudgetElapsedMs).toBeLessThanOrEqual(5_100);
  }, 30_000);

  it.skipIf(process.env.RUN_GROUPED_CAPACITY_SYNTHETIC !== "1").each([[11, 11], [12, 12]] as const)("fills three courts with a synthetic 100 completed match history and %i/%i groups", async (countA, countB) => {
    const session = makeSession(countA, countB, "balanced", 4729, "joint");
    const outcome = await run(session, 4729);
    console.log(JSON.stringify({ countA, countB, history: 100, elapsedMs: outcome.elapsedMs, courts: outcome.result?.selections.length, error: outcome.error instanceof Error ? outcome.error.message : undefined }));
    verify(session, outcome);
    expect(outcome.result?.selections).toHaveLength(3);
  }, 30_000);

  it.skipIf(process.env.RUN_GROUPED_CAPACITY_TRAJECTORY !== "1")("completes 100 actual grouped matcher assignments", async () => {
    const countA = Number(process.env.GROUPED_CAPACITY_A ?? 11);
    const countB = Number(process.env.GROUPED_CAPACITY_B ?? 11);
    const seed = Number(process.env.GROUPED_CAPACITY_SEED ?? 1);
    const profile = process.env.GROUPED_CAPACITY_PROFILE === "skewed" ? "skewed" : "balanced";
    const refill = process.env.GROUPED_CAPACITY_REFILL === "individual" ? "individual" : "joint";
    const artifact = await completeMatcherTrajectory(countA, countB, seed, profile, refill, verify);
    expect(artifact.completedCount).toBe(100);
    console.log(JSON.stringify({ completedCount: artifact.completedCount, steps: artifact.steps.length, maximumElapsedMs: Math.max(...artifact.steps.map((step) => step.elapsedMs)) }));
  }, 900_000);

  it.skipIf(process.env.RUN_GROUPED_CAPACITY_SYNTHETIC_MATRIX !== "1")("records the synthetic snapshot diagnostic matrix", async () => {
    const records: unknown[] = [];
    const cases = [[11, 11], [12, 10], [12, 12], [14, 10], [16, 8], [4, 4], [8, 8]] as const;
    try {
      for (const [countA, countB] of cases) for (const profile of ["balanced", "skewed"] as const) for (const seed of [1, 4729, 104729]) for (const refill of ["opening", "individual", "joint"] as const) {
        const courtCount = countA + countB === 8 ? 1 : countA + countB === 16 ? 2 : 3;
        if (refill === "individual" && courtCount === 1) continue;
        const session = makeSession(countA, countB, profile, seed, refill, courtCount);
        const outcome = await run(session, seed);
        records.push({ countA, countB, profile, seed, refill, elapsedMs: outcome.elapsedMs, courts: outcome.result?.selections.length, error: outcome.error instanceof Error ? outcome.error.message : undefined });
        verify(session, outcome);
        expect(outcome.result?.selections).toHaveLength(refill === "individual" ? 1 : courtCount);
      }
    } finally {
      const destination = path.join(process.cwd(), "private", "grouped-capacity-matrix.json");
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, JSON.stringify(records, null, 2));
      console.log(`Grouped capacity records: ${destination}`);
    }
  }, 900_000);
});
