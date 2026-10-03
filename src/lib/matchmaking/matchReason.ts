import { CourtGroupType, SessionMode, SessionType } from "@/types/enums";
import { getCourtGroupTypeLabel } from "@/lib/playerGroups";
import {
  buildSocialVarietySnapshot,
  parseSocialVarietySnapshot,
} from "./v3/socialVariety";
import type {
  ActiveMatchmakerV3Player,
  V3SingleCourtSelection,
  SocialVarietyGains,
  SocialVarietySnapshot,
  V3SocialStarvationSummary,
  V3BalanceGuardrail,
  V3FinalTieBreak,
} from "./v3/types";

export interface MatchmakingReason {
  version: 1;
  source: "v3";
  sessionType: string;
  sessionMode: string;
  selectedUserIds: [string, string, string, string];
  team1UserIds: [string, string];
  team2UserIds: [string, string];
  summary: string[];
  socialVariety?: SocialVarietySnapshot;
  metrics: {
    fairnessBand: number | null;
    selectedMatchCounts: number[];
    balanceGap: number;
    pointDiffGap?: number;
    sharedCourtRepeatPenalty?: number;
    partnerCoveragePenalty?: number;
    opponentCoveragePenalty?: number;
    socialVarietyGain?: number;
    socialVarietyGains?: SocialVarietyGains;
    socialStarvation?: V3SocialStarvationSummary;
    balanceGuardrail?: V3BalanceGuardrail;
    finalTieBreak?: V3FinalTieBreak | null;
    fairnessVector?: number[];
    schedulingRank?: number;
    partnerRepeatPenalty: number;
    opponentRepeatPenalty: number;
    exactRematchPenalty: number;
    consecutivePlayCount?: number;
    consecutivePlayMaxBurden?: number;
    consecutivePlayTotalBurden?: number;
    restTurnRange: number;
    minimumRestTurns: number;
    totalRestTurns: number;
    waitRangeSeconds?: number;
    minimumWaitSeconds?: number;
    totalWaitSeconds?: number;
    waitToleranceSeconds?: number;
    targetPool?: string | null;
    missedPool?: string | null;
    courtGroupType?: CourtGroupType | string | null;
    poolASeatCount?: number;
    poolBSeatCount?: number;
    competitiveTargetRatio?: number;
    mixedMode: boolean;
  };
}

type V3ReasonContext = {
  sessionType: SessionType | string;
  sessionMode: SessionMode | string;
  targetPool?: string | null;
  missedPool?: string | null;
  courtGroupType?: CourtGroupType | string | null;
  poolASeatCount?: number;
  poolBSeatCount?: number;
  competitiveTargetRatio?: number;
  respectPlayerRest?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringTuple(value: unknown, length: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((item) => typeof item === "string")
  );
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function roundMetric(value: number) {
  return Math.round(value * 10) / 10;
}

function formatMetric(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function getBalanceUnit(sessionType: SessionType | string) {
  return sessionType === SessionType.POINTS ||
    sessionType === SessionType.SOCIAL_MIX
    ? "point"
    : "rating";
}

function buildReasonSummary({
  sessionMode,
  sessionType,
  metrics,
  respectPlayerRest,
}: {
  sessionMode: SessionMode | string;
  sessionType: SessionType | string;
  metrics: MatchmakingReason["metrics"];
  respectPlayerRest?: boolean;
}) {
  const uniqueMatchCounts = [...new Set(metrics.selectedMatchCounts)].sort(
    (left, right) => left - right
  );
  const balanceUnit = getBalanceUnit(sessionType);
  const balanced = sessionType === SessionType.POINTS || sessionType === SessionType.ELO;
  const summary = [
    uniqueMatchCounts.length === 1
      ? `All selected players are in fairness band ${uniqueMatchCounts[0]}.`
      : `Selected across fairness bands ${uniqueMatchCounts.join(", ")} after legal-match filtering.`,
  ];

  summary.push(
    `Team balance gap is ${formatMetric(metrics.balanceGap)} ${balanceUnit}${
      metrics.balanceGap === 1 ? "" : "s"
    }.`
  );

  if (sessionType === SessionType.POINTS) {
    summary.push(
      `Point-difference balance gap is ${formatMetric(
        metrics.pointDiffGap ?? 0
      )} point${metrics.pointDiffGap === 1 ? "" : "s"}.`
    );
  }

  if (
    metrics.socialVarietyGain === undefined &&
    respectPlayerRest !== false &&
    metrics.totalRestTurns > 0
  ) {
    summary.push(
      `Rest priority used completed-match turns: selected players had ${formatMetric(
        metrics.totalRestTurns
      )} total rest turn${
        metrics.totalRestTurns === 1 ? "" : "s"
      }, with minimum ${formatMetric(metrics.minimumRestTurns)}.`
    );
  }

  if (
    metrics.consecutivePlayCount !== undefined &&
    metrics.consecutivePlayCount > 0
  ) {
    summary.push(
      `${formatMetric(
        metrics.consecutivePlayCount
      )} selected player${
        metrics.consecutivePlayCount === 1 ? "" : "s"
      } also played the previous match; highest prior back-to-back burden is ${formatMetric(
        metrics.consecutivePlayMaxBurden ?? 0
      )}.`
    );
  }

  if (sessionType === SessionType.SOCIAL_MIX || balanced) {
    if (metrics.socialVarietyGain !== undefined) {
      const rotationPriorities = metrics.courtGroupType
        ? "fair turns, arrival priority, applicable player-group rules and overdue-turn protection"
        : "fair turns, arrival priority and overdue-turn protection";
      const priorities = `${rotationPriorities}${balanced ? " and the balance guardrail" : ""}`;
      summary.push(
        sessionMode === SessionMode.MIXICANO
          ? `Selected for ongoing courtmate, partner, opponent and match-type variety after ${priorities}${respectPlayerRest === false ? "." : "; longer breaks only decide between equally varied choices."}`
          : `Selected for ongoing courtmate, partner and opponent variety after ${priorities}${respectPlayerRest === false ? "." : "; longer breaks only decide between equally varied choices."}`
      );
      if (respectPlayerRest !== false && metrics.totalRestTurns > 0) {
        summary.push(
          `Selected players had ${formatMetric(metrics.totalRestTurns)} total completed-match rest turns, with minimum ${formatMetric(metrics.minimumRestTurns)}.`
        );
      }
      if (metrics.socialStarvation?.availableOverdueCount) {
        const starvation = metrics.socialStarvation;
        summary.push(
          `Across this refill, ${formatMetric(starvation.selectedOverdueCount)} of ${formatMetric(starvation.availableOverdueCount)} available players beyond the ${formatMetric(starvation.idealRestGap)}-match usual rest gap were selected; ${formatMetric(starvation.leftOutOverdueCount)} overdue player${starvation.leftOutOverdueCount === 1 ? " remains" : "s remain"} outside the batch.`
        );
      }
    } else if (!balanced) {
      summary.push(
        metrics.sharedCourtRepeatPenalty === 0
          ? "All six shared-court pairings are first-time contacts this session."
          : `Shared-court repeat penalty is ${formatMetric(
              metrics.sharedCourtRepeatPenalty ?? 0
            )} of 6 possible pairings.`
      );
      summary.push(
        metrics.partnerCoveragePenalty === 0
          ? "Both partner pairings are new for this session."
          : `Partner coverage penalty is ${formatMetric(
              metrics.partnerCoveragePenalty ?? 0
            )} of 2 pairings.`
      );
      summary.push(
        metrics.opponentCoveragePenalty === 0
          ? "All four opponent pairings are new for this session."
          : `Opponent coverage penalty is ${formatMetric(
              metrics.opponentCoveragePenalty ?? 0
            )} of 4 pairings.`
      );
    }
  } else if (!balanced) {
    summary.push(
      metrics.partnerRepeatPenalty === 0
        ? "No recent partner repeat penalty on this selection."
        : `Partner repeat penalty is ${formatMetric(
            metrics.partnerRepeatPenalty
          )}.`
    );

    if (sessionType === SessionType.POINTS) {
      summary.push(
        metrics.opponentRepeatPenalty === 0
          ? "Opponent repeat pressure stayed at zero."
          : `Opponent repeat penalty is ${formatMetric(
              metrics.opponentRepeatPenalty
            )}.`
      );
    }
  }

  if (balanced && metrics.balanceGuardrail) {
    const guardrail = metrics.balanceGuardrail;
    summary.push(
      `Within the same fairness, arrival, structural and starvation state, the best achievable worst-court balance gap was ${formatMetric(guardrail.bestMaxBalanceGap)} ${balanceUnit}s; the allowed batch envelope is at most ${formatMetric(guardrail.allowedMaxBalanceGap)} ${balanceUnit}s per court (${formatMetric(guardrail.nearBestWindow)} near-best window).`
    );
    if (guardrail.absoluteCeiling !== null) {
      summary.push(guardrail.ceilingFeasible
        ? `The ${formatMetric(guardrail.absoluteCeiling)}-rating safety ceiling also applies.`
        : `The ${formatMetric(guardrail.absoluteCeiling)}-rating ceiling is unattainable within this stronger rotation state; minimum worst-court and total imbalance were required.`);
    }
    if (guardrail.allowedTotalBalanceGap !== null) {
      summary.push(`The allowed total batch balance gap is at most ${formatMetric(guardrail.allowedTotalBalanceGap)} ${balanceUnit}s.`);
    }
  }
  if (balanced && metrics.socialVarietyGain !== undefined) {
    const gain = metrics.socialVarietyGain.toPrecision(5);
    const facets = metrics.socialVarietyGains;
    summary.push(`Normalized entropy gain is ${gain}${facets ? ` (courtmates ${facets.courtmates.toPrecision(5)}, partners ${facets.partners.toPrecision(5)}, opponents ${facets.opponents.toPrecision(5)}, match type ${facets.matchType.toPrecision(5)})` : ""}.`);
    if (metrics.finalTieBreak === "EXACT_REMATCH") summary.push("Exact rematch avoidance decided only after entropy, ordinary rest and actual balance tied.");
    else if (metrics.finalTieBreak === "RANDOM") summary.push("Randomness decided only the final tied choices.");
    else if (metrics.finalTieBreak === "DETERMINISTIC") summary.push("A deterministic final tie-break decided between equivalent choices.");
  }

  if (sessionMode === SessionMode.MIXICANO) {
    summary.push("Mixed court legality was satisfied before scoring.");
  }

  // targetPool/missedPool are retained only for legacy reason payloads. New
  // player-group matches describe the immutable court composition below.
  if (metrics.targetPool && !metrics.courtGroupType) {
    summary.push(
      metrics.missedPool
        ? `Served pool ${metrics.targetPool}; pool ${metrics.missedPool} still had waiting players.`
        : `Served pool ${metrics.targetPool}.`
    );
  }

  const courtGroupLabel = getCourtGroupTypeLabel(
    metrics.courtGroupType ?? null
  );
  if (courtGroupLabel) {
    summary.push(
      `${courtGroupLabel} court: ${metrics.poolASeatCount ?? 0} Competitive and ${
        metrics.poolBSeatCount ?? 0
      } Social seats.`
    );
  }

  if (typeof metrics.competitiveTargetRatio === "number") {
    summary.push(
      `Active-player target is ${Math.round(
        metrics.competitiveTargetRatio * 100
      )}% Competitive seats.`
    );
  }

  return summary;
}

export function buildV3MatchmakingReason<
  T extends ActiveMatchmakerV3Player = ActiveMatchmakerV3Player,
>(
  selection: V3SingleCourtSelection<T>,
  context: V3ReasonContext
): MatchmakingReason {
  const selectedMatchCounts = selection.players.map(
    (player) => player.effectiveMatchCount
  );
  const restTurnValues = selection.restSummary.restTurnVector;
  const maxRestTurns = restTurnValues[0] ?? 0;
  const minRestTurns = restTurnValues[restTurnValues.length - 1] ?? 0;
  const metrics: MatchmakingReason["metrics"] = {
    fairnessBand:
      selectedMatchCounts.length > 0 ? Math.min(...selectedMatchCounts) : null,
    selectedMatchCounts,
    balanceGap: selection.balanceGuardrail ? selection.balanceGap : roundMetric(selection.balanceGap),
    pointDiffGap: selection.balanceGuardrail ? selection.pointDiffGap : roundMetric(selection.pointDiffGap),
    sharedCourtRepeatPenalty: selection.sharedCourtRepeatPenalty,
    partnerCoveragePenalty: selection.partnerCoveragePenalty,
    opponentCoveragePenalty: selection.opponentCoveragePenalty,
    ...(selection.socialVarietyGain !== undefined
      ? { socialVarietyGain: selection.socialVarietyGain }
      : {}),
    ...(selection.socialVarietyGains
      ? { socialVarietyGains: selection.socialVarietyGains }
      : {}),
    ...(selection.socialStarvation
      ? { socialStarvation: selection.socialStarvation }
      : {}),
    ...(selection.balanceGuardrail ? { balanceGuardrail: selection.balanceGuardrail } : {}),
    ...(selection.finalTieBreak ? { finalTieBreak: selection.finalTieBreak } : {}),
    ...(selection.fairnessVector ? { fairnessVector: selection.fairnessVector.filter(Number.isFinite) } : {}),
    ...(selection.schedulingRank !== undefined ? { schedulingRank: selection.schedulingRank } : {}),
    partnerRepeatPenalty: selection.partnerRepeatPenalty,
    opponentRepeatPenalty: selection.opponentRepeatPenalty,
    exactRematchPenalty: selection.exactRematchPenalty,
    restTurnRange: maxRestTurns - minRestTurns,
    minimumRestTurns: selection.restSummary.minimumRestTurns,
    totalRestTurns: selection.restSummary.totalRestTurns,
    targetPool: context.targetPool ?? null,
    missedPool: context.missedPool ?? null,
    courtGroupType: context.courtGroupType ?? null,
    poolASeatCount: context.poolASeatCount,
    poolBSeatCount: context.poolBSeatCount,
    competitiveTargetRatio: context.competitiveTargetRatio,
    mixedMode: context.sessionMode === SessionMode.MIXICANO,
  };

  if (
    context.respectPlayerRest !== false &&
    (selection.consecutivePlayCount > 0 ||
      selection.consecutivePlayMaxBurden > 0 ||
      selection.consecutivePlayTotalBurden > 0)
  ) {
    metrics.consecutivePlayCount = selection.consecutivePlayCount;
    metrics.consecutivePlayMaxBurden = selection.consecutivePlayMaxBurden;
    metrics.consecutivePlayTotalBurden = selection.consecutivePlayTotalBurden;
  }

  return {
    version: 1,
    source: "v3",
    sessionType: context.sessionType,
    sessionMode: context.sessionMode,
    selectedUserIds: selection.ids,
    team1UserIds: selection.partition.team1,
    team2UserIds: selection.partition.team2,
    summary: buildReasonSummary({
      sessionMode: context.sessionMode,
      sessionType: context.sessionType,
      metrics,
      respectPlayerRest: context.respectPlayerRest,
    }),
    ...([SessionType.SOCIAL_MIX, SessionType.POINTS, SessionType.ELO].includes(context.sessionType as SessionType)
      ? {
          socialVariety:
            selection.socialVariety ??
            buildSocialVarietySnapshot(selection.partition, selection.players),
        }
      : {}),
    metrics,
  };
}

export function buildV3MatchmakingReasonJson<
  T extends ActiveMatchmakerV3Player = ActiveMatchmakerV3Player,
>(
  selection: V3SingleCourtSelection<T>,
  context: V3ReasonContext
) {
  return JSON.stringify(buildV3MatchmakingReason(selection, context));
}

export function parseMatchmakingReasonJson(
  value: unknown
): MatchmakingReason | null {
  if (!value) {
    return null;
  }

  let parsed: unknown;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  } else {
    parsed = value;
  }

  if (!isRecord(parsed) || parsed.version !== 1 || parsed.source !== "v3") {
    return null;
  }

  const metrics = parsed.metrics;
  const hasRestTurnMetrics =
    isRecord(metrics) &&
    typeof metrics.restTurnRange === "number" &&
    typeof metrics.minimumRestTurns === "number" &&
    typeof metrics.totalRestTurns === "number";
  const hasLegacyWaitMetrics =
    isRecord(metrics) &&
    typeof metrics.waitRangeSeconds === "number" &&
    typeof metrics.minimumWaitSeconds === "number" &&
    typeof metrics.totalWaitSeconds === "number";

  if (
    typeof parsed.sessionType !== "string" ||
    typeof parsed.sessionMode !== "string" ||
    !isStringTuple(parsed.selectedUserIds, 4) ||
    !isStringTuple(parsed.team1UserIds, 2) ||
    !isStringTuple(parsed.team2UserIds, 2) ||
    !isStringArray(parsed.summary) ||
    !isRecord(metrics) ||
    !isNumberArray(metrics.selectedMatchCounts) ||
    typeof metrics.balanceGap !== "number" ||
    typeof metrics.partnerRepeatPenalty !== "number" ||
    typeof metrics.opponentRepeatPenalty !== "number" ||
    typeof metrics.exactRematchPenalty !== "number" ||
    (!hasRestTurnMetrics && !hasLegacyWaitMetrics) ||
    typeof metrics.mixedMode !== "boolean"
  ) {
    return null;
  }

  if (
    metrics.pointDiffGap !== undefined &&
    typeof metrics.pointDiffGap !== "number"
  ) {
    return null;
  }

  if (
    metrics.sharedCourtRepeatPenalty !== undefined &&
    typeof metrics.sharedCourtRepeatPenalty !== "number"
  ) {
    return null;
  }

  if (
    metrics.partnerCoveragePenalty !== undefined &&
    typeof metrics.partnerCoveragePenalty !== "number"
  ) {
    return null;
  }

  if (
    metrics.opponentCoveragePenalty !== undefined &&
    typeof metrics.opponentCoveragePenalty !== "number"
  ) {
    return null;
  }

  if (
    metrics.fairnessBand !== null &&
    typeof metrics.fairnessBand !== "number"
  ) {
    return null;
  }

  if (
    metrics.waitToleranceSeconds !== undefined &&
    typeof metrics.waitToleranceSeconds !== "number"
  ) {
    return null;
  }

  if (
    metrics.consecutivePlayCount !== undefined &&
    typeof metrics.consecutivePlayCount !== "number"
  ) {
    return null;
  }

  if (
    metrics.consecutivePlayMaxBurden !== undefined &&
    typeof metrics.consecutivePlayMaxBurden !== "number"
  ) {
    return null;
  }

  if (
    metrics.consecutivePlayTotalBurden !== undefined &&
    typeof metrics.consecutivePlayTotalBurden !== "number"
  ) {
    return null;
  }

  if (
    metrics.courtGroupType !== undefined &&
    metrics.courtGroupType !== null &&
    typeof metrics.courtGroupType !== "string"
  ) {
    return null;
  }

  for (const value of [
    metrics.poolASeatCount,
    metrics.poolBSeatCount,
    metrics.competitiveTargetRatio,
  ]) {
    if (value !== undefined && typeof value !== "number") {
      return null;
    }
  }

  const restTurnRange = hasRestTurnMetrics
    ? (metrics.restTurnRange as number)
    : 0;
  const minimumRestTurns = hasRestTurnMetrics
    ? (metrics.minimumRestTurns as number)
    : 0;
  const totalRestTurns = hasRestTurnMetrics
    ? (metrics.totalRestTurns as number)
    : 0;
  const waitRangeSeconds = hasLegacyWaitMetrics
    ? (metrics.waitRangeSeconds as number)
    : undefined;
  const minimumWaitSeconds = hasLegacyWaitMetrics
    ? (metrics.minimumWaitSeconds as number)
    : undefined;
  const totalWaitSeconds = hasLegacyWaitMetrics
    ? (metrics.totalWaitSeconds as number)
    : undefined;
  const socialVariety = parseSocialVarietySnapshot(parsed, {
    team1: parsed.team1UserIds as [string, string],
    team2: parsed.team2UserIds as [string, string],
  });
  const socialVarietyGains = parseSocialVarietyGains(metrics.socialVarietyGains);
  const socialStarvation = parseSocialStarvationSummary(metrics.socialStarvation);
  const balanceGuardrail = parseBalanceGuardrail(metrics.balanceGuardrail);

  return {
    version: 1,
    source: "v3",
    sessionType: parsed.sessionType,
    sessionMode: parsed.sessionMode,
    selectedUserIds: parsed.selectedUserIds as [string, string, string, string],
    team1UserIds: parsed.team1UserIds as [string, string],
    team2UserIds: parsed.team2UserIds as [string, string],
    summary: parsed.summary,
    ...(socialVariety ? { socialVariety } : {}),
    metrics: {
      fairnessBand: metrics.fairnessBand,
      selectedMatchCounts: metrics.selectedMatchCounts,
      balanceGap: metrics.balanceGap,
      pointDiffGap: metrics.pointDiffGap,
      sharedCourtRepeatPenalty: metrics.sharedCourtRepeatPenalty,
      partnerCoveragePenalty: metrics.partnerCoveragePenalty,
      opponentCoveragePenalty: metrics.opponentCoveragePenalty,
      ...(typeof metrics.socialVarietyGain === "number" &&
        Number.isFinite(metrics.socialVarietyGain)
        ? { socialVarietyGain: metrics.socialVarietyGain }
        : {}),
      ...(socialVarietyGains ? { socialVarietyGains } : {}),
      ...(socialStarvation ? { socialStarvation } : {}),
      ...(balanceGuardrail ? { balanceGuardrail } : {}),
      ...(["EXACT_REMATCH", "RANDOM", "DETERMINISTIC"].includes(metrics.finalTieBreak as string)
        ? { finalTieBreak: metrics.finalTieBreak as V3FinalTieBreak } : {}),
      ...(isNumberArray(metrics.fairnessVector) && metrics.fairnessVector.every(Number.isFinite)
        ? { fairnessVector: metrics.fairnessVector } : {}),
      ...(typeof metrics.schedulingRank === "number" && Number.isFinite(metrics.schedulingRank)
        ? { schedulingRank: metrics.schedulingRank } : {}),
      partnerRepeatPenalty: metrics.partnerRepeatPenalty,
      opponentRepeatPenalty: metrics.opponentRepeatPenalty,
      exactRematchPenalty: metrics.exactRematchPenalty,
      consecutivePlayCount: metrics.consecutivePlayCount,
      consecutivePlayMaxBurden: metrics.consecutivePlayMaxBurden,
      consecutivePlayTotalBurden: metrics.consecutivePlayTotalBurden,
      restTurnRange,
      minimumRestTurns,
      totalRestTurns,
      waitRangeSeconds,
      minimumWaitSeconds,
      totalWaitSeconds,
      waitToleranceSeconds: metrics.waitToleranceSeconds,
      targetPool:
        typeof metrics.targetPool === "string" ? metrics.targetPool : null,
      missedPool:
        typeof metrics.missedPool === "string" ? metrics.missedPool : null,
      courtGroupType:
        typeof metrics.courtGroupType === "string"
          ? metrics.courtGroupType
          : null,
      poolASeatCount:
        typeof metrics.poolASeatCount === "number"
          ? metrics.poolASeatCount
          : undefined,
      poolBSeatCount:
        typeof metrics.poolBSeatCount === "number"
          ? metrics.poolBSeatCount
          : undefined,
      competitiveTargetRatio:
        typeof metrics.competitiveTargetRatio === "number"
          ? metrics.competitiveTargetRatio
          : undefined,
      mixedMode: metrics.mixedMode,
    },
  };
}

function parseSocialVarietyGains(value: unknown): SocialVarietyGains | undefined {
  if (!isRecord(value)) return undefined;
  const keys = ["courtmates", "partners", "opponents", "matchType"] as const;
  if (
    keys.some(
      (key) => typeof value[key] !== "number" || !Number.isFinite(value[key])
    )
  ) {
    return undefined;
  }
  return {
    courtmates: value.courtmates as number,
    partners: value.partners as number,
    opponents: value.opponents as number,
    matchType: value.matchType as number,
  };
}

function parseSocialStarvationSummary(value: unknown): V3SocialStarvationSummary | undefined {
  if (!isRecord(value)) return undefined;
  const keys = [
    "idealRestGap",
    "availableOverdueCount",
    "selectedOverdueCount",
    "leftOutOverdueCount",
    "highestLeftOutRestTurns",
    "totalLeftOutRestTurns",
  ] as const;
  if (keys.some((key) => typeof value[key] !== "number" || !Number.isFinite(value[key]))) {
    return undefined;
  }
  return {
    idealRestGap: value.idealRestGap as number,
    availableOverdueCount: value.availableOverdueCount as number,
    selectedOverdueCount: value.selectedOverdueCount as number,
    leftOutOverdueCount: value.leftOutOverdueCount as number,
    highestLeftOutRestTurns: value.highestLeftOutRestTurns as number,
    totalLeftOutRestTurns: value.totalLeftOutRestTurns as number,
  };
}

function parseBalanceGuardrail(value: unknown): V3BalanceGuardrail | undefined {
  if (!isRecord(value) || !["POINTS", "RATING"].includes(value.mode as string)) return undefined;
  for (const key of ["bestMaxBalanceGap", "bestTotalBalanceGap", "nearBestWindow", "allowedMaxBalanceGap"] as const) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] < 0) return undefined;
  }
  for (const key of ["absoluteCeiling", "allowedTotalBalanceGap"] as const) {
    if (value[key] !== null && (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] < 0)) return undefined;
  }
  if (typeof value.ceilingFeasible !== "boolean" || typeof value.baselineCertified !== "boolean") return undefined;
  return {
    mode: value.mode as V3BalanceGuardrail["mode"],
    bestMaxBalanceGap: value.bestMaxBalanceGap as number,
    bestTotalBalanceGap: value.bestTotalBalanceGap as number,
    nearBestWindow: value.nearBestWindow as number,
    absoluteCeiling: value.absoluteCeiling as number | null,
    allowedMaxBalanceGap: value.allowedMaxBalanceGap as number,
    allowedTotalBalanceGap: value.allowedTotalBalanceGap as number | null,
    ceilingFeasible: value.ceilingFeasible,
    baselineCertified: value.baselineCertified,
  };
}
