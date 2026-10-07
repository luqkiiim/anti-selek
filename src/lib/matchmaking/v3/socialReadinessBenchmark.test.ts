import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it, vi } from "vitest";
import type { RotationBatchOptions } from "./socialBatch";
import type { MatchmakerV3Player, SocialHistoryMatch, V3DoublesPartition } from "./types";
import {
  runSocialJointRefillSession,
  type SocialJointRefillScenario,
  type SocialJointRefillSessionResult,
} from "./socialJointRefillExperiment";

interface MeasuredMatcherCall {
  readonly elapsedMs: number;
  readonly input: {
    readonly courtCount: number;
    readonly rotationPlayerCount: number | null;
    readonly sessionMode: string;
    readonly sessionType: string;
    readonly respectPlayerRest: boolean | null;
    readonly socialPriorityPolicy: string | null;
    readonly searchLimits: { maxBranches?: number; maxMs?: number } | null;
    readonly availablePlayerIds: string[];
    readonly playerState: Array<{
      userId: string;
      matchesPlayed: number;
      matchmakingBaseline: number;
      restTurns: number;
      isBusy: boolean;
      isPaused: boolean;
    }>;
    readonly completedHistoryIds: string[];
    readonly socialHistoryIds: string[];
  };
  readonly proof: {
    readonly selectionReturned: boolean;
    readonly exploredBranches: number;
    readonly prunedBranches: number;
    readonly searchLimitReached: boolean;
    readonly fairnessCertified: boolean;
    readonly starvationCertified: boolean;
    readonly varietyOptimal: boolean;
    readonly replayCertified: boolean;
    readonly coverageGateCertified: boolean;
    readonly priorityCertified: boolean | null;
    readonly courtmateGainMaximumCertified: boolean | null;
    readonly courtmateGainMaximum: number | null;
    readonly chosenCourtmateGain: number | null;
    readonly chosenCourtmateGainDeficit: number | null;
    readonly chosenRollingMatchTypeGain: number | null;
    readonly bestRollingMatchTypeGainAtGmax: number | null;
  };
  readonly selectedAssignments: Array<{
    readonly ids: string[];
    readonly partition: V3DoublesPartition;
    readonly socialVariety: unknown;
  }>;
  readonly thrownError?: string;
}

const matcherCallLog = vi.hoisted(() => [] as MeasuredMatcherCall[]);

vi.mock("./socialBatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./socialBatch")>();
  return {
    ...actual,
    findBestRotationBatchSelection: ((
      players: MatchmakerV3Player[],
      options: RotationBatchOptions<MatchmakerV3Player>,
    ) => {
      const startedAt = performance.now();
      try {
        const result = actual.findBestRotationBatchSelection(players, options);
        const elapsedMs = performance.now() - startedAt;
        matcherCallLog.push({
          elapsedMs,
          input: {
            courtCount: options.courtCount,
            rotationPlayerCount: options.rotationPlayerCount ?? null,
            sessionMode: options.sessionMode,
            sessionType: options.sessionType,
            respectPlayerRest: options.respectPlayerRest ?? null,
            socialPriorityPolicy: options.socialPriorityPolicy ?? null,
            searchLimits: options.searchLimits ?? null,
            availablePlayerIds: players.filter((player) => !player.isBusy && !player.isPaused)
              .map((player) => player.userId),
            playerState: players.map((player) => ({
              userId: player.userId,
              matchesPlayed: player.matchesPlayed,
              matchmakingBaseline: player.matchmakingBaseline,
              restTurns: Math.max(0, player.restTurns ?? 0),
              isBusy: Boolean(player.isBusy),
              isPaused: Boolean(player.isPaused),
            })),
            completedHistoryIds: (options.completedMatches ?? []).map((match) => (match as SocialHistoryMatch).id ?? ""),
            socialHistoryIds: (options.socialHistoryMatches ?? []).map((match) => match.id ?? ""),
          },
          proof: {
            selectionReturned: Boolean(result.selection),
            exploredBranches: result.debug.exploredBranches,
            prunedBranches: result.debug.prunedBranches,
            searchLimitReached: result.debug.searchLimitReached,
            fairnessCertified: result.fairnessCertified,
            starvationCertified: result.starvationCertified,
            varietyOptimal: result.varietyOptimal,
            replayCertified: result.replayCertified,
            coverageGateCertified: result.coverageGateCertified,
            priorityCertified: result.priorityCertified ?? null,
            courtmateGainMaximumCertified: result.courtmateGainMaximumCertified ?? null,
            courtmateGainMaximum: result.courtmateGainMaximum ?? null,
            chosenCourtmateGain: result.chosenNewCourtmatePairCount ?? null,
            chosenCourtmateGainDeficit: result.chosenCourtmateGainDeficit ?? null,
            chosenRollingMatchTypeGain: result.chosenRollingMatchTypeGain ?? null,
            bestRollingMatchTypeGainAtGmax: result.bestRollingMatchTypeGainAtGmax ?? null,
          },
          selectedAssignments: (result.selection?.selections ?? []).map((selection) => ({
            ids: [...selection.ids],
            partition: {
              team1: [...selection.partition.team1] as [string, string],
              team2: [...selection.partition.team2] as [string, string],
            },
            socialVariety: selection.socialVariety ?? null,
          })),
        });
        return result;
      } catch (error) {
        matcherCallLog.push({
          elapsedMs: performance.now() - startedAt,
          input: {
            courtCount: options.courtCount,
            rotationPlayerCount: options.rotationPlayerCount ?? null,
            sessionMode: options.sessionMode,
            sessionType: options.sessionType,
            respectPlayerRest: options.respectPlayerRest ?? null,
            socialPriorityPolicy: options.socialPriorityPolicy ?? null,
            searchLimits: options.searchLimits ?? null,
            availablePlayerIds: players.filter((player) => !player.isBusy && !player.isPaused)
              .map((player) => player.userId),
            playerState: players.map((player) => ({
              userId: player.userId,
              matchesPlayed: player.matchesPlayed,
              matchmakingBaseline: player.matchmakingBaseline,
              restTurns: Math.max(0, player.restTurns ?? 0),
              isBusy: Boolean(player.isBusy),
              isPaused: Boolean(player.isPaused),
            })),
            completedHistoryIds: (options.completedMatches ?? []).map((match) => (match as SocialHistoryMatch).id ?? ""),
            socialHistoryIds: (options.socialHistoryMatches ?? []).map((match) => match.id ?? ""),
          },
          proof: {
            selectionReturned: false,
            exploredBranches: 0,
            prunedBranches: 0,
            searchLimitReached: false,
            fairnessCertified: false,
            starvationCertified: false,
            varietyOptimal: false,
            replayCertified: false,
            coverageGateCertified: false,
            priorityCertified: null,
            courtmateGainMaximumCertified: null,
            courtmateGainMaximum: null,
            chosenCourtmateGain: null,
            chosenCourtmateGainDeficit: null,
            chosenRollingMatchTypeGain: null,
            bestRollingMatchTypeGainAtGmax: null,
          },
          selectedAssignments: [],
          thrownError: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }) as typeof actual.findBestRotationBatchSelection,
  };
});

const runClockGrid = process.env.RUN_SOCIAL_READINESS_CLOCK_GRID === "1";
const arms = [
  { id: "production-immediate", engineVersion: "production", scheduler: "immediate" },
  { id: "beneficial-immediate", engineVersion: "courtmate-beneficial-rescue", scheduler: "immediate" },
  { id: "beneficial-conditional-wait", engineVersion: "courtmate-beneficial-rescue", scheduler: "conditional-wait" },
] as const;

function previewReferences(session: SocialJointRefillSessionResult) {
  const result: Array<{ decisionId: number; previewKind: "immediate" | "future" | "execution"; preview: unknown }> = [];
  for (const decision of session.decisions) {
    result.push({ decisionId: decision.decisionId, previewKind: "immediate", preview: decision.immediatePreview });
    if (decision.futurePreview) result.push({ decisionId: decision.decisionId, previewKind: "future", preview: decision.futurePreview.preview });
    if (decision.execution) result.push({ decisionId: decision.decisionId, previewKind: "execution", preview: decision.execution });
  }
  return result;
}

function assertCorrelatedCall(call: MeasuredMatcherCall, reference: { preview: unknown }, where: string) {
  const preview = reference.preview as {
    availablePlayerIds: string[];
    completedHistoryMatchIds: string[];
    activeReservationSnapshots: Array<{ assignmentId: string; courtIndex: number }>;
    chosenAssignments: Array<{ ids: string[]; partition: V3DoublesPartition; socialVariety: unknown }>;
    matcherCertificates: Record<string, unknown>;
    playerStateSnapshot: Array<Record<string, unknown>>;
  };
  const proofToPreview: Record<string, string> = {
    selectionReturned: "selectionReturned",
    exploredBranches: "exploredBranches",
    prunedBranches: "prunedBranches",
    searchLimitReached: "searchLimitReached",
    fairnessCertified: "fairnessCertified",
    starvationCertified: "starvationCertified",
    varietyOptimal: "matcherVarietyOptimal",
    replayCertified: "replayCertified",
    coverageGateCertified: "coverageGateCertified",
    priorityCertified: "priorityCertified",
    courtmateGainMaximumCertified: "gMaxCertified",
    courtmateGainMaximum: "courtmateGainMaximum",
    chosenCourtmateGain: "chosenCourtmateGain",
    chosenCourtmateGainDeficit: "chosenCourtmateGainDeficit",
    chosenRollingMatchTypeGain: "chosenRollingMatchTypeGain",
    bestRollingMatchTypeGainAtGmax: "bestRollingMatchTypeGainAtGmax",
  };
  for (const [callKey, previewKey] of Object.entries(proofToPreview)) {
    if (call.input.socialPriorityPolicy === null &&
        (callKey === "chosenCourtmateGain" || callKey === "chosenRollingMatchTypeGain")) {
      if (call.proof[callKey as keyof typeof call.proof] !== null) {
        throw new Error(`${where}: production matcher unexpectedly exposed candidate-only ${callKey}.`);
      }
      continue;
    }
    if (call.proof[callKey as keyof typeof call.proof] !== preview.matcherCertificates[previewKey]) {
      throw new Error(`${where}: matcher call ${callKey} differs from its saved preview.`);
    }
  }
  const expectedSocialHistoryIds = [
    ...preview.completedHistoryMatchIds,
    ...preview.activeReservationSnapshots.map((reservation) => `active-${reservation.assignmentId}`),
  ];
  if (JSON.stringify(call.input.completedHistoryIds) !== JSON.stringify(preview.completedHistoryMatchIds)) {
    throw new Error(`${where}: completed-history IDs do not match the evaluated preview.`);
  }
  if (JSON.stringify(call.input.socialHistoryIds) !== JSON.stringify(expectedSocialHistoryIds)) {
    const expectedIds = [...expectedSocialHistoryIds].sort();
    const actualIds = [...call.input.socialHistoryIds].sort();
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
      throw new Error(`${where}: reservation history IDs do not match the evaluated preview.`);
    }
  }
  if (JSON.stringify([...call.input.availablePlayerIds].sort()) !== JSON.stringify([...preview.availablePlayerIds].sort())) {
    throw new Error(`${where}: available-player IDs do not match the evaluated preview.`);
  }
  const callLayouts = call.selectedAssignments.map((assignment) => ({ ids: assignment.ids, partition: assignment.partition }));
  const previewLayouts = preview.chosenAssignments.map((assignment) => ({ ids: assignment.ids, partition: assignment.partition }));
  if (JSON.stringify(callLayouts) !== JSON.stringify(previewLayouts)) {
    throw new Error(`${where}: returned selection does not match its evaluated preview.`);
  }
}

describe("Social realistic-clock readiness benchmark bridge", () => {
  it.skipIf(!runClockGrid)("writes one scenario's paired real-clock sessions as pending raw input", async () => {
    const scenarioValue = process.env.READINESS_SCENARIO;
    const seedsValue = process.env.READINESS_SEEDS;
    const targetValue = process.env.READINESS_TARGET_MATCHES;
    const outputValue = process.env.READINESS_JSON_PATH;
    const provenanceValue = process.env.READINESS_PROVENANCE;
    if (!scenarioValue || !seedsValue || !targetValue || !outputValue || !provenanceValue) {
      throw new Error("The readiness runner must set scenario, seeds, target, output path, and source provenance.");
    }
    const scenario = JSON.parse(scenarioValue) as SocialJointRefillScenario;
    const seeds = JSON.parse(seedsValue) as number[];
    const targetCompletedMatches = Number(targetValue);
    const sourceProvenance = JSON.parse(provenanceValue) as Record<string, unknown>;
    if (!scenario || typeof scenario.id !== "string" || !Number.isInteger(scenario.upper) ||
        !Number.isInteger(scenario.lower) || !Number.isInteger(scenario.courtCount) ||
        scenario.upper + scenario.lower < scenario.courtCount * 4) {
      throw new Error("READINESS_SCENARIO must contain an integer roster and enough players for every opening court.");
    }
    if (!Array.isArray(seeds) || seeds.length !== 3 || seeds.some((seed) => !Number.isSafeInteger(seed) || seed <= 0)) {
      throw new Error("READINESS_SEEDS must contain the three matched positive seeds.");
    }
    if (targetCompletedMatches !== 100) throw new Error("The formal readiness grid is fixed at 100 completed matches.");

    const absolutePath = resolve(outputValue);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(`${absolutePath}.pending`, `${JSON.stringify({
      schemaVersion: "social-realistic-readiness-clock-v1",
      validationStatus: "pending",
      scenario,
      seeds,
      targetCompletedMatches,
      arms: arms.map((arm) => arm.id),
      sourceProvenance,
    }, null, 2)}\n`, { flag: "wx" });
    const sessions: Array<SocialJointRefillSessionResult & {
      readonly scenarioId: string;
      readonly arm: (typeof arms)[number]["id"];
      readonly searchTelemetry: Array<Record<string, unknown>>;
    }> = [];
    const generatedAt = new Date().toISOString();
    for (const arm of arms) {
      for (const seed of seeds) {
        matcherCallLog.splice(0, matcherCallLog.length);
        const session = runSocialJointRefillSession({
          scenario,
          seed,
          scheduler: arm.scheduler,
          engineVersion: arm.engineVersion,
          targetCompletedMatches,
        });
        const references = previewReferences(session);
        if (references.length > matcherCallLog.length) {
          throw new Error(`${scenario.id}/${seed}/${arm.id}: matcher call log is missing ${references.length - matcherCallLog.length} saved preview/execution calls.`);
        }
        const searchTelemetry: Array<Record<string, unknown>> = references.map((reference, callIndex) => {
          const call = matcherCallLog[callIndex];
          const where = `${scenario.id}/seed${seed}/${arm.id}/call${callIndex + 1}`;
          assertCorrelatedCall(call, reference, where);
          return {
            scenarioId: scenario.id,
            seed,
            arm: arm.id,
            callIndex: callIndex + 1,
            decisionId: reference.decisionId,
            previewKind: reference.previewKind,
            elapsedMs: call.elapsedMs,
            input: call.input,
            proof: call.proof,
            selectedAssignments: call.selectedAssignments,
            ...(call.thrownError ? { thrownError: call.thrownError } : {}),
          };
        });
        for (const [offset, call] of matcherCallLog.slice(references.length).entries()) {
          if (session.status !== "error" || !call.thrownError) {
            throw new Error(`${scenario.id}/${seed}/${arm.id}: unmatched matcher call ${references.length + offset + 1} is not a recorded session error.`);
          }
          searchTelemetry.push({
            scenarioId: scenario.id,
            seed,
            arm: arm.id,
            callIndex: references.length + offset + 1,
            decisionId: null,
            previewKind: "orphaned-error",
            elapsedMs: call.elapsedMs,
            input: call.input,
            proof: call.proof,
            selectedAssignments: call.selectedAssignments,
            thrownError: call.thrownError,
          });
        }
        sessions.push({ ...session, scenarioId: scenario.id, arm: arm.id, searchTelemetry });
        console.info(`[social-readiness] ${scenario.id} ${arm.id} seed=${seed}: ${session.status} ${session.completedHistory.length}/${targetCompletedMatches} matches, calls=${searchTelemetry.length}, waits=${session.waiting.waitsTaken}`);
      }
    }

    const report = {
      schemaVersion: "social-realistic-readiness-clock-v1",
      validationStatus: "pending",
      generatedAt,
      scenario,
      seeds,
      targetCompletedMatches,
      arms: arms.map((arm) => arm.id),
      timing: {
        baseDurationMinutes: 20,
        durationJitterFraction: 0.2,
        wakeThresholdMinutes: 5,
        minimumNewCourtmateGainPerCourt: 1,
        minimumRollingTypeGainPerCourt: 0.5,
        durationMinutesOverrides: {},
      },
      sourceProvenance,
      sessions,
    };
    writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  }, 30 * 60 * 1000);
});
