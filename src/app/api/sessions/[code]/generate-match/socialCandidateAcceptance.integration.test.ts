import { withLegacySportingAliases } from "@/lib/sportingIdentity";
import * as balancedRecurrence from "@/lib/matchmaking/v3/balancedRecurrence";
import * as socialBatch from "@/lib/matchmaking/v3/socialBatch";
import { withSocialVarietySnapshot } from "@/lib/matchmaking/v3/socialVariety";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MixedSide,
  MatchStatus,
  PartnerPreference,
  PlayerGender,
  SessionCollabFormat,
  SessionMode,
  SessionPool,
  SessionStatus,
  SessionType,
} from "@/types/enums";
import {
  buildMatchmakingState,
  getRankedCandidates,
  selectBatchMatches,
  selectBatchMatchesRespectingSkips,
  selectReplacementMatch,
  selectReplacementMatchRespectingSkips,
  selectSingleCourtMatch,
  selectSingleCourtMatchRespectingSkips,
} from "./selection";
import {
  resolveSocialCandidatePolicy,
  runSocialCandidateWithProductionFallback,
} from "./socialCandidateAcceptance";
import {
  resolveBalancedCandidatePolicy,
  type BalancedCandidateDecision,
} from "@/lib/matchmaking/v3/balancedCandidateAcceptance";
import { selectAutomaticMatchForSession } from "../queue-match/shared";
import { selectInterclubSingleCourtMatch } from "./interclub";
import type { MatchmakerV3Player } from "@/lib/matchmaking/v3/types";
import type { RotationBatchOptions } from "@/lib/matchmaking/v3/socialBatch";
import type { GenerateMatchSession } from "./shared";

const now = new Date("2026-04-01T00:00:00Z");
const policy = "courtmate-beneficial-rescue" as const;

function player(
  userId: string,
  gender = PlayerGender.MALE,
  overrides: Partial<GenerateMatchSession["players"][number]> = {}
): GenerateMatchSession["players"][number] {
  return withLegacySportingAliases({
    playerId: userId,
    gender,
    partnerPreference: gender === PlayerGender.FEMALE
      ? PartnerPreference.FEMALE_FLEX
      : PartnerPreference.OPEN,
    mixedSideOverride: null,
    pool: SessionPool.A,
    matchesPlayed: 0,
    matchmakingMatchesCredit: 0,
    sessionPoints: 0,
    isPaused: false,
    isGuest: false,
    lastPartnerPlayerId: null,
    representingClubId: null,
    availableSince: now,
    joinedAt: now,
    arrivalPriorityAt: null,
    inactiveSeconds: 0,
    player: { id: userId, name: userId, elo: 1000, ownerUserId: `account-${userId}` },
    ...overrides,
  }) as GenerateMatchSession["players"][number];
}

function session(overrides: Partial<GenerateMatchSession> = {}): GenerateMatchSession {
  return {
    id: "acceptance-session",
    code: "ACCEPT",
    clubId: null,
    name: "Candidate acceptance integration",
    type: SessionType.SOCIAL_MIX,
    mode: SessionMode.MEXICANO,
    status: SessionStatus.ACTIVE,
    respectPlayerRest: true,
    poolsEnabled: false,
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
  team1: [string, string],
  team2: [string, string],
  players: GenerateMatchSession["players"],
  overrides: Partial<GenerateMatchSession["matches"][number]> = {}
): GenerateMatchSession["matches"][number] {
  const partition = { team1, team2 };
  return withLegacySportingAliases({
    id,
    sessionId: "acceptance-session",
    courtId: "court-1",
    status: MatchStatus.COMPLETED,
    team1Player1Id: team1[0],
    team1Player2Id: team1[1],
    team2Player1Id: team2[0],
    team2Player2Id: team2[1],
    team1Score: null,
    team2Score: null,
    completedAt: now,
    createdAt: now,
    matchmakingReasonJson: withSocialVarietySnapshot(null, partition, players),
    ...overrides,
  }) as GenerateMatchSession["matches"][number];
}

function interclubSession(
  players: GenerateMatchSession["players"],
  matches: GenerateMatchSession["matches"] = []
) {
  return session({
    collabFormat: SessionCollabFormat.INTERCLUB,
    players,
    matches,
    sessionClubs: ["host", "partner"].map((clubId) => ({
      clubId,
      status: "ACCEPTED",
      role: clubId === "host" ? "HOST" : "PARTNER",
      club: { id: clubId, name: clubId },
    })) as GenerateMatchSession["sessionClubs"],
  });
}

function socialProfilePlayers(upperCount: number, lowerCount: number) {
  const count = upperCount + lowerCount;
  return Array.from({ length: count }, (_unused, index) => {
    const upper = index < upperCount;
    return player(`P${index + 1}`, upper ? PlayerGender.MALE : PlayerGender.FEMALE, {
      mixedSideOverride: upper ? MixedSide.UPPER : MixedSide.LOWER,
      sessionPoints: 10 + (count - index - 1) * 0.1,
    });
  });
}

function oneTypeInterclubPlayers() {
  const sides: Array<{ club: "host" | "partner"; side: MixedSide }> = [
    { club: "host", side: MixedSide.UPPER },
    { club: "host", side: MixedSide.UPPER },
    { club: "host", side: MixedSide.UPPER },
    { club: "host", side: MixedSide.LOWER },
    { club: "partner", side: MixedSide.UPPER },
    { club: "partner", side: MixedSide.LOWER },
    { club: "partner", side: MixedSide.LOWER },
    { club: "partner", side: MixedSide.LOWER },
  ];
  return sides.map(({ club, side }, index) => player(
    `${club}-${index + 1}`,
    side === MixedSide.UPPER ? PlayerGender.MALE : PlayerGender.FEMALE,
    { representingClubId: club, mixedSideOverride: side },
  ));
}

function seededRandom(seed: number) {
  let state = Math.abs(Math.floor(seed)) % 2_147_483_647;
  if (state === 0) state = 1;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
}

async function inputs(data: GenerateMatchSession) {
  const state = await buildMatchmakingState(data);
  const { rankedCandidates } = getRankedCandidates(data, state.busyPlayerIds);
  return { ...state, rankedCandidates, sessionData: data };
}

function readDecision(selection: { matchmakingReasonJson?: string | null }) {
  return JSON.parse(selection.matchmakingReasonJson ?? "{}").socialPolicyDecision;
}

type SocialSelectionLike = {
  ids: [string, string, string, string];
  partition: { team1: [string, string]; team2: [string, string] };
  matchmakingReasonJson?: string | null;
};

function expectCertifiedSocialDecision(selection: { matchmakingReasonJson?: string | null }) {
  const decision = readDecision(selection);
  expect(decision).toMatchObject({ requestedPolicy: policy });

  if (decision.outcome === "candidate-exact") {
    expect(decision).toMatchObject({ appliedPolicy: policy, reasonCodes: [] });
    expect(decision.candidateProof).toMatchObject({
      selectionPresent: true,
      echoedPolicy: true,
      fairnessCertified: true,
      scheduleCertified: true,
      starvationCertified: true,
      gmaxCertified: true,
      priorityCertified: true,
      varietyOptimal: true,
      searchLimitReached: false,
    });
    const { chosenCourtmateGain: chosenG, courtmateGainMaximum: gmax,
      chosenCourtmateGainDeficit: deficit, chosenRollingMatchTypeGain: chosenT,
      bestRollingMatchTypeGainAtGmax: bestT } = decision.candidateProof;
    expect(deficit).toBe(gmax - chosenG);
    expect([0, 1]).toContain(deficit);
    if (deficit === 1) expect(chosenT).toBeGreaterThan(bestT);
    else expect(chosenT).toBe(bestT);
  } else {
    expect(decision).toMatchObject({ appliedPolicy: "production", outcome: "production-fallback" });
    expect(decision.reasonCodes.length).toBeGreaterThan(0);
    expect(decision.fallbackProof).toMatchObject({
      selectionPresent: true,
      fairnessCertified: true,
      scheduleCertified: true,
      starvationCertified: true,
    });
  }

  return decision;
}

function readBalancedDecision(selection: { matchmakingReasonJson?: string | null }) {
  return JSON.parse(selection.matchmakingReasonJson ?? "{}").balancedPolicyDecision as BalancedCandidateDecision | undefined;
}

function expectCertifiedBalancedDecision(selection: { matchmakingReasonJson?: string | null }) {
  const decision = readBalancedDecision(selection);
  expect(decision).toMatchObject({ requestedPolicy: "strict-replay-rescue" });

  if (decision?.outcome === "candidate-exact") {
    expect(decision).toMatchObject({
      appliedPolicy: "strict-replay-rescue",
      reasonCodes: [],
      candidateProof: {
        selectionPresent: true,
        echoedPolicy: true,
        fairnessCertified: true,
        scheduleCertified: true,
        starvationCertified: true,
        balanceCertified: true,
        replayCertified: true,
        coverageGateCertified: true,
        recurrenceFrontierCertified: true,
        recurrenceAdmissionCertified: true,
        fullSearchCertified: true,
        structuralVocabularyVerified: true,
      },
    });
  } else {
    expect(decision?.outcome).toBe("production-fallback");
    expect(decision).toMatchObject({
      appliedPolicy: "production",
      fallbackProof: {
        selectionPresent: true,
        certified: true,
        fairnessCertified: true,
        scheduleCertified: true,
        starvationCertified: true,
        balanceCertified: true,
        replayCertified: true,
        coverageGateCertified: true,
        recurrenceCertified: false,
        lateVarietyCertified: false,
      },
    });
    expect(decision?.reasonCodes.length).toBeGreaterThan(0);
  }

  return decision;
}

describe("Social candidate acceptance at API selection boundaries", () => {
  const originalMatcher = socialBatch.findBestRotationBatchSelection;

  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.25);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses beneficial-rescue by default for Social and records its acceptance metadata", async () => {
    const data = session({
      mode: SessionMode.MIXICANO,
      players: socialProfilePlayers(5, 5),
    });
    const state = await inputs(data);
    const spy = vi.spyOn(socialBatch, "findBestRotationBatchSelection");

    const selection = selectSingleCourtMatch({ ...state, reshuffleSource: null });
    const decision = readDecision(selection);

    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls.map(([, options]) => options.socialPriorityPolicy)).toContain(policy);
    expect(decision).toMatchObject({
      requestedPolicy: policy,
      appliedPolicy: policy,
      outcome: "candidate-exact",
      reasonCodes: [],
    });
    expect("socialPolicyDecision" in selection ? selection.socialPolicyDecision : undefined).toEqual(decision);
    expect(decision.candidateProof).toMatchObject({
      fairnessCertified: true,
      scheduleCertified: true,
      starvationCertified: true,
      gmaxCertified: true,
      priorityCertified: true,
      varietyOptimal: true,
      searchLimitReached: false,
    });
  });

  it.each([SessionType.POINTS, SessionType.ELO])(
    "routes Balanced %s through default Arm 3 with omitted or internal Social policy",
    async (type) => {
      vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
      expect(process.env.BALANCED_RECURRENCE_CANDIDATE_ENABLED).toBeUndefined();
      expect(resolveBalancedCandidatePolicy(type)).toBe("strict-replay-rescue");
      const data = session({
        type,
        players: Array.from({ length: 8 }, (_, index) => player(`p${index + 1}`)),
      });
      const state = await inputs(data);
      const productionSpy = vi.spyOn(socialBatch, "findBestRotationBatchSelection");
      const balancedSpy = vi.spyOn(balancedRecurrence, "findBestBalancedRecurrenceSelection");

      for (const socialPriorityPolicy of [undefined, policy] as const) {
        productionSpy.mockClear();
        balancedSpy.mockClear();
        const selection = selectSingleCourtMatch({
          ...state,
          reshuffleSource: null,
          ...(socialPriorityPolicy ? { socialPriorityPolicy } : {}),
        });
        const balancedDecision = expectCertifiedBalancedDecision(selection);

        expect(balancedSpy).toHaveBeenCalled();
        expect(balancedSpy.mock.calls.every(([, options]) =>
          options.recurrencePolicy === "strict-replay-rescue" &&
          (!("socialPriorityPolicy" in options) || options.socialPriorityPolicy === undefined),
        )).toBe(true);
        expect(productionSpy.mock.calls.every(([, options]) => options.socialPriorityPolicy === undefined)).toBe(true);
        expect("balancedPolicyDecision" in selection ? selection.balancedPolicyDecision : undefined).toEqual(balancedDecision);
        expect("socialPolicyDecision" in selection ? selection.socialPolicyDecision : undefined).toBeUndefined();
        const reason = JSON.parse(selection.matchmakingReasonJson ?? "{}");
        expect(reason).not.toHaveProperty("socialPolicyDecision");
        expect(reason.balancedPolicyDecision).toEqual(balancedDecision);
      }

      vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", "0");
      expect(resolveBalancedCandidatePolicy(type)).toBeUndefined();
      productionSpy.mockClear();
      balancedSpy.mockClear();
      const rollbackSelection = selectSingleCourtMatch({
        ...state,
        reshuffleSource: null,
        socialPriorityPolicy: policy,
      });
      expect(productionSpy).toHaveBeenCalled();
      expect(productionSpy.mock.calls.every(([, options]) => options.socialPriorityPolicy === undefined)).toBe(true);
      expect(balancedSpy).not.toHaveBeenCalled();
      expect("balancedPolicyDecision" in rollbackSelection ? rollbackSelection.balancedPolicyDecision : undefined).toBeUndefined();
      expect("socialPolicyDecision" in rollbackSelection ? rollbackSelection.socialPolicyDecision : undefined).toBeUndefined();
      expect(JSON.parse(rollbackSelection.matchmakingReasonJson ?? "{}")).not.toHaveProperty("socialPolicyDecision");

      expect(resolveSocialCandidatePolicy(type)).toBeUndefined();
      expect(resolveSocialCandidatePolicy(type, policy)).toBeUndefined();
    }
  );

  it("resolves beneficial-rescue only for Social sessions", () => {
    expect(resolveSocialCandidatePolicy(SessionType.SOCIAL_MIX)).toBe(policy);
    expect(resolveSocialCandidatePolicy(SessionType.SOCIAL_MIX, policy)).toBe(policy);
    expect(resolveSocialCandidatePolicy(SessionType.POINTS)).toBeUndefined();
    expect(resolveSocialCandidatePolicy(SessionType.ELO)).toBeUndefined();
  });

  it("routes the automatic queue selector through the Social default acceptance gate", async () => {
    const data = session({
      mode: SessionMode.MIXICANO,
      players: socialProfilePlayers(5, 5),
    });

    const automaticSelection = await selectAutomaticMatchForSession(data as never);

    const decision = expectCertifiedSocialDecision(automaticSelection);
    expect(automaticSelection.selectedIds).toHaveLength(4);
    expect(new Set(automaticSelection.selectedIds).size).toBe(4);
    expect(decision.requestedPolicy).toBe(policy);
  });

  it("retries a skipped Social selection through the default acceptance gate", async () => {
    const players = socialProfilePlayers(6, 6);
    players[0].matchesPlayed = 0;
    players[0] = player("P1", PlayerGender.MALE, {
      mixedSideOverride: MixedSide.UPPER,
      skipNextMatchAt: now,
    });
    for (const entry of players.slice(1)) entry.matchesPlayed = 1;
    players.find((entry) => entry.userId === "P3")!.matchesPlayed = 2;
    const history = [
      match("skip-history-1", ["P2", "P3"], ["P4", "P5"], players),
      match("skip-history-2", ["P6", "P7"], ["P8", "P9"], players),
      match("skip-history-3", ["P10", "P11"], ["P12", "P3"], players),
    ];
    const state = await inputs(session({ mode: SessionMode.MIXICANO, players, matches: history }));
    const { selection, consumedSkipUserIds } = selectSingleCourtMatchRespectingSkips({
      ...state,
      reshuffleSource: null,
    });

    expect(selection.ids).not.toContain("P1");
    expect(expectCertifiedSocialDecision(selection).requestedPolicy).toBe(policy);
    expect(consumedSkipUserIds).toEqual(expect.arrayContaining(["P1"]));
  });

  it("accepts fully certified beneficial-rescue results through initial, multicourt, and replacement selectors", async () => {
    const players = Array.from({ length: 12 }, (_, index) => player(`p${index + 1}`));
    const data = session({ players });
    const state = await inputs(data);

    const single = selectSingleCourtMatchRespectingSkips({
      ...state,
      reshuffleSource: null,
    }).selection;
    expect(readDecision(single)).toMatchObject({ appliedPolicy: policy, outcome: "candidate-exact", reasonCodes: [] });

    const batch = selectBatchMatchesRespectingSkips({
      ...state,
      requestedMatchCount: 2,
      randomFn: () => 0.25,
    }).selection;
    expect(batch.selections).toHaveLength(2);
    for (const selection of batch.selections) {
      expect(readDecision(selection)).toMatchObject({ appliedPolicy: policy, outcome: "candidate-exact", reasonCodes: [] });
    }

    const replacement = selectReplacementMatchRespectingSkips({
      ...state,
      retainedUserIds: ["p1", "p2", "p3"],
    }).selection;
    expect(replacement.ids).toEqual(expect.arrayContaining(["p1", "p2", "p3"]));
    expect(readDecision(replacement)).toMatchObject({ appliedPolicy: policy, outcome: "candidate-exact", reasonCodes: [] });
    expect(originalMatcher).toBeDefined();
  });

  it("discards a diagnostic candidate and replays its random draws through production for refill and replacement", async () => {
    const players = Array.from({ length: 12 }, (_, index) => player(`p${index + 1}`));
    const data = session({ players });
    const state = await inputs(data);
    const calls: Array<string | undefined> = [];
    vi.spyOn(socialBatch, "findBestRotationBatchSelection").mockImplementation((sourcePlayers, options) => {
      calls.push(options.socialPriorityPolicy);
      const result = originalMatcher(sourcePlayers, options);
      if (options.socialPriorityPolicy === policy) {
        return {
          ...result,
          scheduleCertified: false,
          debug: { ...result.debug, scheduleCertified: false },
        };
      }
      return result;
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const single = selectSingleCourtMatch({ ...state, reshuffleSource: null });
    expect(calls.slice(0, 2)).toEqual([policy, undefined]);
    expect(readDecision(single)).toMatchObject({
      appliedPolicy: "production",
      outcome: "production-fallback",
      reasonCodes: expect.arrayContaining(["SCHEDULE_UNCERTIFIED"]),
      candidateProof: { scheduleCertified: false },
      fallbackProof: { selectionPresent: true, scheduleCertified: true },
    });

    calls.length = 0;
    const regenerated = selectSingleCourtMatch({
      ...state,
      reshuffleSource: { ids: single.ids, partition: single.partition },
    });
    expect(regenerated.ids).not.toEqual(single.ids);
    expect(calls).toContain(policy);
    expect(calls).toContain(undefined);
    expect(readDecision(regenerated).appliedPolicy).toBe("production");

    calls.length = 0;
    const replacement = selectReplacementMatch({
      ...state,
      retainedUserIds: ["p1", "p2", "p3"],
    });
    expect(calls).toContain(policy);
    expect(calls).toContain(undefined);
    expect(replacement.ids).toEqual(expect.arrayContaining(["p1", "p2", "p3"]));
    expect(readDecision(replacement).appliedPolicy).toBe("production");
    expect(warn).toHaveBeenCalled();
  });

  it.each([
    ["fairness", "FAIRNESS_UNCERTIFIED"],
    ["schedule", "SCHEDULE_UNCERTIFIED"],
    ["starvation", "STARVATION_UNCERTIFIED"],
    ["gmax", "GMAX_OR_TMAX_UNCERTIFIED"],
    ["priority", "FULL_PRIORITY_UNCERTIFIED"],
    ["variety", "VARIETY_SEARCH_INCOMPLETE"],
    ["limit", "SEARCH_LIMIT_REACHED_OR_UNKNOWN"],
    ["deficit", "COURTMATE_GAIN_DEFICIT_INVALID"],
    ["non-beneficial", "RESCUE_NOT_STRICTLY_BENEFICIAL"],
  ] as const)("fails closed on a corrupted %s certificate/admission proof", async (fault, expectedReason) => {
    const players = Array.from({ length: 8 }, (_, index) => player(`p${index + 1}`));
    const state = await inputs(session({ players }));
    vi.spyOn(socialBatch, "findBestRotationBatchSelection").mockImplementation((sourcePlayers, options) => {
      const result = originalMatcher(sourcePlayers, options);
      if (options.socialPriorityPolicy !== policy) return result;
      const debug = result.debug;
      switch (fault) {
        case "fairness":
          return { ...result, fairnessCertified: false, debug: { ...debug, fairnessCertified: false } };
        case "schedule":
          return { ...result, scheduleCertified: false, debug: { ...debug, scheduleCertified: false } };
        case "starvation":
          return { ...result, starvationCertified: false, debug: { ...debug, starvationCertified: false } };
        case "gmax":
          return {
            ...result,
            courtmateGainMaximumCertified: false,
            debug: { ...debug, courtmateGainMaximumCertified: false },
          };
        case "priority":
          return { ...result, priorityCertified: false, debug: { ...debug, priorityCertified: false } };
        case "variety":
          return { ...result, varietyOptimal: false, debug: { ...debug, varietyOptimal: false } };
        case "limit":
          return { ...result, debug: { ...debug, searchLimitReached: true } };
        case "deficit":
          return {
            ...result,
            chosenCourtmateGainDeficit: 2,
            debug: { ...debug, chosenCourtmateGainDeficit: 2 },
          };
        case "non-beneficial": {
          const gmax = result.courtmateGainMaximum!;
          const tmax = result.bestRollingMatchTypeGainAtGmax!;
          return {
            ...result,
            chosenNewCourtmatePairCount: gmax - 1,
            chosenCourtmateGainDeficit: 1,
            chosenRollingMatchTypeGain: tmax,
            debug: {
              ...debug,
              chosenNewCourtmatePairCount: gmax - 1,
              chosenCourtmateGainDeficit: 1,
              chosenRollingMatchTypeGain: tmax,
            },
          };
        }
      }
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const selection = selectSingleCourtMatch({ ...state, reshuffleSource: null });

    expect(readDecision(selection)).toMatchObject({
      appliedPolicy: "production",
      outcome: "production-fallback",
      reasonCodes: expect.arrayContaining([expectedReason]),
    });
  });

  it("rejects a certified-looking candidate that selects a player reserved on another court", async () => {
    const players = Array.from({ length: 8 }, (_, index) => player(`p${index + 1}`));
    const active = match("reserved", ["p1", "p2"], ["p3", "p4"], players, {
      status: MatchStatus.IN_PROGRESS,
      completedAt: null,
    });
    const state = await inputs(session({ players, matches: [active] }));
    const original = socialBatch.findBestRotationBatchSelection;
    vi.spyOn(socialBatch, "findBestRotationBatchSelection").mockImplementation((sourcePlayers, options) => {
      const result = original(sourcePlayers, options);
      if (options.socialPriorityPolicy !== policy || !result.selection) return result;
      const selected = result.selection.selections[0];
      const displacedId = selected.ids[0];
      const replacementId = "p1";
      const partition = {
        team1: selected.partition.team1.map((id) => id === displacedId ? replacementId : id) as [string, string],
        team2: selected.partition.team2.map((id) => id === displacedId ? replacementId : id) as [string, string],
      };
      return {
        ...result,
        selection: {
          ...result.selection,
          selections: [{
            ...selected,
            ids: selected.ids.map((id) => id === displacedId ? replacementId : id) as [string, string, string, string],
            players: selected.players.map((entry) => entry.userId === displacedId
              ? { ...entry, userId: replacementId }
              : entry) as typeof selected.players,
            partition,
          }],
        },
      };
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const selection = selectSingleCourtMatch({ ...state, reshuffleSource: null });

    expect(selection.ids).not.toContain("p1");
    expect(readDecision(selection)).toMatchObject({
      appliedPolicy: "production",
      reasonCodes: expect.arrayContaining(["INELIGIBLE_PLAYER_SELECTED"]),
    });
  });

  it("continues through a labelled production fallback when the candidate matcher throws", async () => {
    const players = Array.from({ length: 8 }, (_, index) => player(`p${index + 1}`));
    const state = await inputs(session({ players }));
    vi.spyOn(socialBatch, "findBestRotationBatchSelection").mockImplementation((sourcePlayers, options) => {
      if (options.socialPriorityPolicy === policy) throw new Error("candidate search failed");
      return originalMatcher(sourcePlayers, options);
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const selection = selectSingleCourtMatch({ ...state, reshuffleSource: null });

    expect(readDecision(selection)).toMatchObject({
      appliedPolicy: "production",
      outcome: "production-fallback",
      reasonCodes: ["CANDIDATE_MATCHER_ERROR"],
      fallbackProof: { selectionPresent: true, fairnessCertified: true, scheduleCertified: true, starvationCertified: true },
    });
    expect(warn).toHaveBeenCalledWith("social-matchmaking-policy-fallback", expect.objectContaining({
      appliedPolicy: "production",
      reasonCodes: ["CANDIDATE_MATCHER_ERROR"],
    }));
  });

  it("returns no assignment when neither candidate nor production fallback can prove fairness", async () => {
    const players = Array.from({ length: 8 }, (_, index) => player(`p${index + 1}`));
    const state = await inputs(session({ players }));
    vi.spyOn(socialBatch, "findBestRotationBatchSelection").mockImplementation((sourcePlayers, options) => {
      const result = originalMatcher(sourcePlayers, options);
      return { ...result, fairnessCertified: false, debug: { ...result.debug, fairnessCertified: false } };
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => selectSingleCourtMatch({ ...state, reshuffleSource: null }))
      .toThrow(/No valid pairing/);
    expect(warn).toHaveBeenCalledWith("social-matchmaking-policy-fallback", expect.objectContaining({
      appliedPolicy: "none",
      reasonCodes: expect.arrayContaining(["FAIRNESS_UNCERTIFIED", "PRODUCTION_FALLBACK_FAIRNESS_UNCERTIFIED"]),
    }));
  });

  it("falls back with an explicit reason when a Social candidate omits structural opportunity rules", () => {
    const candidatePlayers: MatchmakerV3Player[] = socialProfilePlayers(4, 4).map((entry) => ({
      userId: entry.userId,
      matchesPlayed: entry.matchesPlayed,
      matchmakingBaseline: entry.matchesPlayed,
      availableSince: entry.availableSince,
      strength: entry.sessionPoints,
      gender: entry.gender,
      partnerPreference: entry.partnerPreference,
      mixedSideOverride: entry.mixedSideOverride,
      isPaused: entry.isPaused,
      pool: entry.pool,
    }));
    const options: RotationBatchOptions<MatchmakerV3Player> = {
      courtCount: 1,
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      respectPlayerRest: true,
      rotationPlayerCount: candidatePlayers.length,
      completedMatches: [],
      socialHistoryMatches: [],
      randomFn: seededRandom(711),
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const run = runSocialCandidateWithProductionFallback({ candidatePlayers, options });

    expect(run.result.selection).not.toBeNull();
    expect(run.decision).toMatchObject({
      requestedPolicy: policy,
      appliedPolicy: "production",
      outcome: "production-fallback",
      reasonCodes: expect.arrayContaining(["STRUCTURAL_OPPORTUNITY_DEFINITION_MISSING"]),
      fallbackProof: {
        selectionPresent: true,
        fairnessCertified: true,
        scheduleCertified: true,
        starvationCertified: true,
      },
    });
  });

  it("rejects an Interclub candidate scored with unrestricted instead of legal structural types", async () => {
    const data = interclubSession(oneTypeInterclubPlayers());
    data.mode = SessionMode.MIXICANO;
    const state = await inputs(data);
    const original = socialBatch.findBestRotationBatchSelection;
    let receivedStructuralRuleCount: number | null = null;
    let receivedLegalSelectionConstraint = false;
    vi.spyOn(socialBatch, "findBestRotationBatchSelection").mockImplementation((candidatePlayers, options) => {
      if (options.socialPriorityPolicy !== policy) return original(candidatePlayers, options);
      receivedStructuralRuleCount = options.socialStructuralOpportunityConstraints?.length ?? null;
      receivedLegalSelectionConstraint = Boolean(options.selectionConstraints);
      // Simulate an engine regression: keep legal selection constraints, but
      // score the candidate as though every gender-valid club pairing were possible.
      return original(candidatePlayers, { ...options, socialStructuralOpportunityConstraints: [] });
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const selection = selectInterclubSingleCourtMatch({
      rankedCandidates: state.rankedCandidates,
      playersById: state.playersById,
      sessionData: data,
      reshuffleSource: null,
    });
    const decision = readDecision(selection);

    // Every legal 2-host/2-partner layout is mixed: the host has only one
    // lower-side player and the partner club only one upper-side player.
    // Thus each selected player has one feasible type and gains 1; dropping
    // the Interclub rule invents OWN_SIDE as a second type and reports 0.5.
    const legalTypes = new Set<string>();
    let legalQuartets = 0;
    const hostSides = [MixedSide.UPPER, MixedSide.UPPER, MixedSide.UPPER, MixedSide.LOWER];
    const partnerSides = [MixedSide.UPPER, MixedSide.LOWER, MixedSide.LOWER, MixedSide.LOWER];
    for (let h1 = 0; h1 < hostSides.length - 1; h1 += 1) {
      for (let h2 = h1 + 1; h2 < hostSides.length; h2 += 1) {
        for (let p1 = 0; p1 < partnerSides.length - 1; p1 += 1) {
          for (let p2 = p1 + 1; p2 < partnerSides.length; p2 += 1) {
            const hostLower = Number(hostSides[h1] === MixedSide.LOWER) + Number(hostSides[h2] === MixedSide.LOWER);
            const partnerLower = Number(partnerSides[p1] === MixedSide.LOWER) + Number(partnerSides[p2] === MixedSide.LOWER);
            if (hostLower === partnerLower && [0, 1, 2].includes(hostLower)) {
              legalQuartets += 1;
              legalTypes.add(hostLower === 1 ? "MIXED" : "OWN_SIDE");
            }
          }
        }
      }
    }
    expect(legalQuartets).toBe(9);
    expect([...legalTypes]).toEqual(["MIXED"]);
    expect(receivedStructuralRuleCount).toBe(1);
    expect(receivedLegalSelectionConstraint).toBe(true);
    expect(selection.partition.team1.every((id) => id.startsWith("host-"))).toBe(true);
    expect(selection.partition.team2.every((id) => id.startsWith("partner-"))).toBe(true);
    expect(decision).toMatchObject({
      appliedPolicy: "production",
      outcome: "production-fallback",
      reasonCodes: expect.arrayContaining(["SELECTED_T_RECOMPUTATION_MISMATCH"]),
      candidateProof: {
        chosenCourtmateGain: 6,
        courtmateGainMaximum: 6,
        chosenRollingMatchTypeGain: 2,
      },
      fallbackProof: {
        selectionPresent: true,
        fairnessCertified: true,
        scheduleCertified: true,
        starvationCertified: true,
      },
    });
  });

  it("uses full Interclub structural vocabulary and preserves saved completed-role snapshots for the candidate only", async () => {
    const players = ["host", "partner"].flatMap((club) =>
      Array.from({ length: 6 }, (_, index) => player(
        `${club}-${index + 1}`,
        index % 2 === 0 ? PlayerGender.MALE : PlayerGender.FEMALE,
        { representingClubId: club }
      ))
    );
    const historical = match(
      "role-switch-history",
      ["host-1", "host-2"],
      ["partner-1", "partner-2"],
      players
    );
    const data = interclubSession(players, [historical]);
    data.players.find((entry) => entry.userId === "host-1")!.gender = PlayerGender.FEMALE;
    data.players.find((entry) => entry.userId === "partner-1")!.gender = PlayerGender.FEMALE;
    const state = await inputs(data);
    const seenCandidateHistories: Array<unknown[]> = [];
    vi.spyOn(socialBatch, "findBestRotationBatchSelection").mockImplementation((sourcePlayers, options) => {
      if (options.socialPriorityPolicy === policy) seenCandidateHistories.push(options.completedMatches ?? []);
      return originalMatcher(sourcePlayers, options);
    });

    const selection = selectSingleCourtMatch({ ...state, reshuffleSource: null });
    const reason = readDecision(selection);
    expect(reason.requestedPolicy).toBe(policy);
    expect(seenCandidateHistories).not.toHaveLength(0);
    const savedHistory = seenCandidateHistories[0][0] as { socialVariety?: { courtType?: string | null } };
    expect(savedHistory.socialVariety?.courtType).toBe("MIXED");
    expect(selection.partition.team1.every((id) => id.startsWith("host"))).toBe(true);
    expect(selection.partition.team2.every((id) => id.startsWith("partner"))).toBe(true);
  });

  it("gates the Interclub replacement and two-court batch paths and records fallback on each selection", async () => {
    const players = ["host", "partner"].flatMap((club) =>
      Array.from({ length: 8 }, (_, index) => player(
        `${club}-${index + 1}`,
        index % 2 === 0 ? PlayerGender.MALE : PlayerGender.FEMALE,
        { representingClubId: club }
      ))
    );
    const data = interclubSession(players);
    const state = await inputs(data);
    const original = socialBatch.findBestRotationBatchSelection;
    vi.spyOn(socialBatch, "findBestRotationBatchSelection").mockImplementation((sourcePlayers, options) => {
      const result = original(sourcePlayers, options);
      if (options.socialPriorityPolicy === policy) {
        return { ...result, priorityCertified: false, debug: { ...result.debug, priorityCertified: false } };
      }
      return result;
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const replacement = selectReplacementMatch({
      ...state,
      retainedUserIds: ["host-1", "host-2", "partner-1"],
    });
    expect(replacement.ids).toEqual(expect.arrayContaining(["host-1", "host-2", "partner-1"]));
    expect(replacement.partition.team1.every((id) => id.startsWith("host"))).toBe(true);
    expect(replacement.partition.team2.every((id) => id.startsWith("partner"))).toBe(true);
    expect(readDecision(replacement)).toMatchObject({ appliedPolicy: "production", outcome: "production-fallback" });

    const batch = selectBatchMatches({ ...state, requestedMatchCount: 2, randomFn: () => 0.25 });
    expect(batch.selections).toHaveLength(2);
    for (const entry of batch.selections) {
      expect(entry.partition.team1.every((id) => id.startsWith("host"))).toBe(true);
      expect(entry.partition.team2.every((id) => id.startsWith("partner"))).toBe(true);
      expect(readDecision(entry)).toMatchObject({ appliedPolicy: "production", outcome: "production-fallback" });
    }
  });

  it("rejects a same-quartet Interclub partition that violates the club-side normalization law", async () => {
    const players = ["host", "partner"].flatMap((club) =>
      Array.from({ length: 6 }, (_, index) => player(
        `${club}-${index + 1}`,
        index % 2 === 0 ? PlayerGender.MALE : PlayerGender.FEMALE,
        { representingClubId: club }
      ))
    );
    const state = await inputs(interclubSession(players));
    const original = socialBatch.findBestRotationBatchSelection;
    vi.spyOn(socialBatch, "findBestRotationBatchSelection").mockImplementation((sourcePlayers, options) => {
      const result = original(sourcePlayers, options);
      if (options.socialPriorityPolicy !== policy || !result.selection) return result;
      const selected = result.selection.selections[0];
      const [hostA, hostB, partnerA, partnerB] = selected.ids;
      return {
        ...result,
        selection: {
          ...result.selection,
          selections: [{
            ...selected,
            partition: {
              team1: [hostA, partnerA],
              team2: [hostB, partnerB],
            },
          }],
        },
      };
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const selection = selectSingleCourtMatch({ ...state, reshuffleSource: null });

    expect(selection.partition.team1.every((id) => id.startsWith("host"))).toBe(true);
    expect(selection.partition.team2.every((id) => id.startsWith("partner"))).toBe(true);
    expect(readDecision(selection)).toMatchObject({
      appliedPolicy: "production",
      reasonCodes: expect.arrayContaining(["PARTITION_NORMALIZATION_MISMATCH"]),
    });
  });

  it.each([
    { upper: 5, lower: 5, courts: 2 },
    { upper: 6, lower: 6, courts: 2 },
    { upper: 7, lower: 7, courts: 2 },
    { upper: 8, lower: 6, courts: 2 },
    { upper: 9, lower: 5, courts: 2 },
    { upper: 8, lower: 7, courts: 3 },
    { upper: 8, lower: 8, courts: 2 },
    { upper: 8, lower: 8, courts: 3 },
    { upper: 9, lower: 9, courts: 3 },
  ])(
    "keeps API acceptance proof-gated at normal budget for $upper+$lower players / $courts courts",
    async ({ upper, lower, courts }) => {
      const data = session({
        players: socialProfilePlayers(upper, lower),
        mode: SessionMode.MIXICANO,
        courts: Array.from({ length: courts }, (_unused, index) => ({
          id: `court-${index + 1}`,
          sessionId: "acceptance-session",
          courtNumber: index + 1,
          label: null,
          currentMatchId: null,
          currentMatch: null,
        })),
      });
      const state = await inputs(data);
      const { selection: batch } = selectBatchMatchesRespectingSkips({
        ...state,
        requestedMatchCount: courts,
        randomFn: seededRandom(1),
      });

      expect(batch.selections).toHaveLength(courts);
      const decision = readDecision(batch.selections[0]);
      expect(decision?.outcome, `${upper}+${lower}/${courts} outcome`).toBe("candidate-exact");
      expect(decision).toMatchObject({ requestedPolicy: policy });
      if (decision?.outcome === "candidate-exact") {
        expect(decision).toMatchObject({ appliedPolicy: policy, reasonCodes: [] });
        expect(decision.candidateProof).toMatchObject({
          selectionPresent: true,
          echoedPolicy: true,
          fairnessCertified: true,
          scheduleCertified: true,
          starvationCertified: true,
          gmaxCertified: true,
          priorityCertified: true,
          varietyOptimal: true,
          searchLimitReached: false,
        });
      } else {
        expect(decision).toMatchObject({ outcome: "production-fallback", appliedPolicy: "production" });
        expect(decision?.fallbackProof).toMatchObject({
          selectionPresent: true,
          fairnessCertified: true,
          scheduleCertified: true,
          starvationCertified: true,
        });
      }
      for (const courtSelection of batch.selections) {
        expect(courtSelection.ids).toHaveLength(4);
        expect(new Set(courtSelection.ids).size).toBe(4);
      }
    },
    60_000
  );

  it.each([
    { upper: 8, lower: 8, courts: 2, seed: 1 },
    { upper: 8, lower: 8, courts: 2, seed: 4729 },
    { upper: 8, lower: 8, courts: 2, seed: 104729 },
    { upper: 9, lower: 9, courts: 3, seed: 1 },
    { upper: 9, lower: 9, courts: 3, seed: 4729 },
    { upper: 9, lower: 9, courts: 3, seed: 104729 },
  ])(
    "uses the omitted-policy Social gate for asynchronous $upper+$lower session seed $seed through 21 completions",
    async ({ upper, lower, courts, seed }) => {
      vi.spyOn(Math, "random").mockImplementation(seededRandom(seed));
      const data = session({
        mode: SessionMode.MIXICANO,
        players: socialProfilePlayers(upper, lower),
        courts: Array.from({ length: courts }, (_unused, index) => ({
          id: `court-${index + 1}`,
          sessionId: "acceptance-session",
          courtNumber: index + 1,
          label: null,
          currentMatchId: null,
          currentMatch: null,
        })),
      });
      const active: Array<{
        record: GenerateMatchSession["matches"][number];
        courtIndex: number;
        finishAt: number;
      }> = [];
      let currentTime = now.getTime();
      let nextAssignmentId = 1;
      let completedMatches = 0;
      let attemptedCandidateAssignments = 0;
      let exactCandidateAssignments = 0;
      let fallbackAssignments = 0;
      let onePairConcessions = 0;
      let zeroBenefitConcessions = 0;
      let conditionalTBenefit = 0;
      let maximumPairDeficit = 0;
      const randomFn = seededRandom(seed);

      const startAssignment = (
        selection: SocialSelectionLike,
        courtIndex: number,
      ) => {
        const decision = expectCertifiedSocialDecision(selection);
        attemptedCandidateAssignments += 1;
        if (decision.outcome === "candidate-exact") exactCandidateAssignments += 1;
        else fallbackAssignments += 1;
        if (decision.outcome === "candidate-exact") {
          const { chosenCourtmateGain, courtmateGainMaximum, chosenCourtmateGainDeficit,
            chosenRollingMatchTypeGain, bestRollingMatchTypeGainAtGmax } = decision.candidateProof;
          maximumPairDeficit = Math.max(maximumPairDeficit, chosenCourtmateGainDeficit ?? 0);
          if (chosenCourtmateGainDeficit === 1) {
            onePairConcessions += 1;
            const benefit = (chosenRollingMatchTypeGain ?? 0) - (bestRollingMatchTypeGainAtGmax ?? 0);
            conditionalTBenefit += benefit;
            if (benefit === 0) zeroBenefitConcessions += 1;
          }
          expect(courtmateGainMaximum! - chosenCourtmateGain!).toBe(chosenCourtmateGainDeficit);
        }

        const activeIds = new Set(active.flatMap(({ record }) => [
          record.team1Player1Id,
          record.team1Player2Id,
          record.team2Player1Id,
          record.team2Player2Id,
        ]));
        expect(selection.ids.some((id) => activeIds.has(id))).toBe(false);

        const ordinal = nextAssignmentId++;
        const startedAt = currentTime;
        const durationMs = 60_000 + ordinal * 137 + courtIndex * 19;
        const record = match(
          `async-${seed}-${ordinal}`,
          selection.partition.team1,
          selection.partition.team2,
          data.players,
          {
            courtId: `court-${courtIndex + 1}`,
            status: MatchStatus.IN_PROGRESS,
            createdAt: new Date(startedAt),
            completedAt: null,
          },
        );
        data.matches.push(record);
        active.push({ record, courtIndex, finishAt: startedAt + durationMs });
      };

      const initialState = await inputs(data);
      const { selection: opening } = selectBatchMatchesRespectingSkips({
        ...initialState,
        requestedMatchCount: courts,
        randomFn,
      });
      expect(opening.selections).toHaveLength(courts);
      opening.selections.forEach((selection, courtIndex) => startAssignment(selection, courtIndex));

      while (completedMatches < 21) {
        const nextFinishAt = Math.min(...active.map((assignment) => assignment.finishAt));
        currentTime = nextFinishAt;
        const completedAtThisClock = active.filter((assignment) => assignment.finishAt === nextFinishAt);
        const acceptedCompletions = completedAtThisClock.slice(0, 21 - completedMatches);
        for (const assignment of acceptedCompletions) {
          assignment.record.status = MatchStatus.COMPLETED;
          assignment.record.completedAt = new Date(currentTime);
          for (const userId of [
            assignment.record.team1Player1Id,
            assignment.record.team1Player2Id,
            assignment.record.team2Player1Id,
            assignment.record.team2Player2Id,
          ]) {
            const current = data.players.find((entry) => entry.userId === userId);
            if (current) current.matchesPlayed += 1;
          }
          completedMatches += 1;
        }
        for (const assignment of acceptedCompletions) {
          active.splice(active.indexOf(assignment), 1);
        }
        for (const assignment of acceptedCompletions) {
          if (completedMatches >= 21) continue;
          const refillState = await inputs(data);
          const refill = selectSingleCourtMatchRespectingSkips({
            ...refillState,
            reshuffleSource: null,
          }).selection;
          startAssignment(refill, assignment.courtIndex);
        }
      }

      expect(completedMatches).toBe(21);
      expect(attemptedCandidateAssignments).toBeGreaterThanOrEqual(courts);
      expect(attemptedCandidateAssignments).toBe(exactCandidateAssignments + fallbackAssignments);
      expect(fallbackAssignments).toBe(0);
      expect(maximumPairDeficit).toBeLessThanOrEqual(1);
      expect(active.length).toBeGreaterThan(0);
      expect(data.matches.filter((entry) => entry.status === MatchStatus.COMPLETED)).toHaveLength(21);
      expect(zeroBenefitConcessions).toBe(0);
      console.info("default-social-async-regression", JSON.stringify({
        upper,
        lower,
        courts,
        seed,
        completedMatches,
        assignedQuartets: nextAssignmentId - 1,
        exactCandidateAssignments,
        fallbackAssignments,
        onePairConcessions,
        zeroBenefitConcessions,
        conditionalTBenefit,
        maximumPairDeficit,
      }));
    },
    180_000,
  );

  it("falls back to certified production for the normal-budget 20-player / 3-court opening", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const players = socialProfilePlayers(10, 10);
    const data = session({
      players,
      mode: SessionMode.MIXICANO,
      courts: ["court-1", "court-2", "court-3"].map((id, index) => ({
        id,
        sessionId: "acceptance-session",
        courtNumber: index + 1,
        label: null,
        currentMatchId: null,
        currentMatch: null,
      })),
    });
    const state = await inputs(data);
    const { selection: batch } = selectBatchMatchesRespectingSkips({
      ...state,
      requestedMatchCount: 3,
      randomFn: seededRandom(1),
    });

    expect(batch.selections).toHaveLength(3);
    expect(readDecision(batch.selections[0])).toMatchObject({
      requestedPolicy: policy,
      appliedPolicy: "production",
      outcome: "production-fallback",
      candidateProof: {
        priorityCertified: false,
        varietyOptimal: false,
        searchLimitReached: true,
      },
      fallbackProof: {
        selectionPresent: true,
        fairnessCertified: true,
        scheduleCertified: true,
        starvationCertified: true,
        replayCertified: true,
        coverageGateCertified: true,
      },
    });
  }, 60_000);
});
