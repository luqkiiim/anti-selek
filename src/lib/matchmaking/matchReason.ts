import { SessionMode, SessionType } from "@/types/enums";
import { POINTS_WAIT_TOLERANCE_MS } from "./v3/scoring";
import type {
  ActiveMatchmakerV3Player,
  V3SingleCourtSelection,
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
  metrics: {
    fairnessBand: number | null;
    selectedMatchCounts: number[];
    balanceGap: number;
    partnerRepeatPenalty: number;
    opponentRepeatPenalty: number;
    exactRematchPenalty: number;
    waitRangeSeconds: number;
    minimumWaitSeconds: number;
    totalWaitSeconds: number;
    waitToleranceSeconds?: number;
    targetPool?: string | null;
    missedPool?: string | null;
    mixedMode: boolean;
  };
}

type V3ReasonContext = {
  sessionType: SessionType | string;
  sessionMode: SessionMode | string;
  targetPool?: string | null;
  missedPool?: string | null;
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

function secondsFromMs(value: number) {
  return roundMetric(value / 1000);
}

function formatMetric(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function getBalanceUnit(sessionType: SessionType | string) {
  return sessionType === SessionType.POINTS ? "point" : "rating";
}

function buildReasonSummary({
  sessionMode,
  sessionType,
  metrics,
}: {
  sessionMode: SessionMode | string;
  sessionType: SessionType | string;
  metrics: MatchmakingReason["metrics"];
}) {
  const uniqueMatchCounts = [...new Set(metrics.selectedMatchCounts)].sort(
    (left, right) => left - right
  );
  const balanceUnit = getBalanceUnit(sessionType);
  const summary = [
    uniqueMatchCounts.length === 1
      ? `All selected players are in fairness band ${uniqueMatchCounts[0]}.`
      : `Selected across fairness bands ${uniqueMatchCounts.join(", ")} after legal-match filtering.`,
    `Team balance gap is ${formatMetric(metrics.balanceGap)} ${balanceUnit}${
      metrics.balanceGap === 1 ? "" : "s"
    }.`,
  ];

  if (metrics.waitToleranceSeconds !== undefined) {
    summary.push(
      `Wait differences within ${formatMetric(
        metrics.waitToleranceSeconds
      )} seconds were treated as tied.`
    );
  }

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

  if (sessionMode === SessionMode.MIXICANO) {
    summary.push("Mixed court legality was satisfied before scoring.");
  }

  if (metrics.targetPool) {
    summary.push(
      metrics.missedPool
        ? `Served pool ${metrics.targetPool}; pool ${metrics.missedPool} still had waiting players.`
        : `Served pool ${metrics.targetPool}.`
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
  const waitValues = selection.waitSummary.waitVector;
  const maxWaitMs = waitValues[0] ?? 0;
  const minWaitMs = waitValues[waitValues.length - 1] ?? 0;
  const metrics: MatchmakingReason["metrics"] = {
    fairnessBand:
      selectedMatchCounts.length > 0 ? Math.min(...selectedMatchCounts) : null,
    selectedMatchCounts,
    balanceGap: roundMetric(selection.balanceGap),
    partnerRepeatPenalty: selection.partnerRepeatPenalty,
    opponentRepeatPenalty: selection.opponentRepeatPenalty,
    exactRematchPenalty: selection.exactRematchPenalty,
    waitRangeSeconds: secondsFromMs(maxWaitMs - minWaitMs),
    minimumWaitSeconds: secondsFromMs(selection.waitSummary.minimumWaitMs),
    totalWaitSeconds: secondsFromMs(selection.waitSummary.totalWaitMs),
    targetPool: context.targetPool ?? null,
    missedPool: context.missedPool ?? null,
    mixedMode: context.sessionMode === SessionMode.MIXICANO,
  };

  if (context.sessionType === SessionType.POINTS) {
    metrics.waitToleranceSeconds = secondsFromMs(POINTS_WAIT_TOLERANCE_MS);
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
    }),
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
    typeof metrics.waitRangeSeconds !== "number" ||
    typeof metrics.minimumWaitSeconds !== "number" ||
    typeof metrics.totalWaitSeconds !== "number" ||
    typeof metrics.mixedMode !== "boolean"
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

  return {
    version: 1,
    source: "v3",
    sessionType: parsed.sessionType,
    sessionMode: parsed.sessionMode,
    selectedUserIds: parsed.selectedUserIds as [string, string, string, string],
    team1UserIds: parsed.team1UserIds as [string, string],
    team2UserIds: parsed.team2UserIds as [string, string],
    summary: parsed.summary,
    metrics: {
      fairnessBand: metrics.fairnessBand,
      selectedMatchCounts: metrics.selectedMatchCounts,
      balanceGap: metrics.balanceGap,
      partnerRepeatPenalty: metrics.partnerRepeatPenalty,
      opponentRepeatPenalty: metrics.opponentRepeatPenalty,
      exactRematchPenalty: metrics.exactRematchPenalty,
      waitRangeSeconds: metrics.waitRangeSeconds,
      minimumWaitSeconds: metrics.minimumWaitSeconds,
      totalWaitSeconds: metrics.totalWaitSeconds,
      waitToleranceSeconds: metrics.waitToleranceSeconds,
      targetPool:
        typeof metrics.targetPool === "string" ? metrics.targetPool : null,
      missedPool:
        typeof metrics.missedPool === "string" ? metrics.missedPool : null,
      mixedMode: metrics.mixedMode,
    },
  };
}
