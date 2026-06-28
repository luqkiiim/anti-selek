"use client";

import { ModalFrame } from "@/components/ui/chrome";
import type { MatchmakingReason } from "@/lib/matchmaking/matchReason";
import { SessionType } from "@/types/enums";

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function formatTurns(value: number) {
  return `${formatNumber(value)} turn${value === 1 ? "" : "s"}`;
}

function buildMetricRows(reason: MatchmakingReason) {
  const { metrics } = reason;
  const rows = [
    {
      label: "Fairness band",
      value:
        metrics.fairnessBand === null
          ? "Unknown"
          : metrics.fairnessBand.toString(),
    },
    {
      label: "Match counts",
      value: metrics.selectedMatchCounts.join(", "),
    },
    {
      label: "Balance gap",
      value: formatNumber(metrics.balanceGap),
    },
    ...(metrics.pointDiffGap !== undefined
      ? [
          {
            label: "Point-diff gap",
            value: formatNumber(metrics.pointDiffGap),
          },
        ]
      : []),
    {
      label: "Rest range",
      value: formatTurns(metrics.restTurnRange),
    },
    {
      label: "Minimum rest",
      value: formatTurns(metrics.minimumRestTurns),
    },
    {
      label: "Total rest",
      value: formatTurns(metrics.totalRestTurns),
    },
    ...(metrics.sharedCourtRepeatPenalty !== undefined
      ? [
          {
            label: "Shared-court repeats",
            value: formatNumber(metrics.sharedCourtRepeatPenalty),
          },
        ]
      : []),
    ...(metrics.partnerCoveragePenalty !== undefined
      ? [
          {
            label: "Partner coverage",
            value: formatNumber(metrics.partnerCoveragePenalty),
          },
        ]
      : []),
    ...(metrics.opponentCoveragePenalty !== undefined
      ? [
          {
            label: "Opponent coverage",
            value: formatNumber(metrics.opponentCoveragePenalty),
          },
        ]
      : []),
    ...(metrics.consecutivePlayCount !== undefined
      ? [
          {
            label: "Back-to-back players",
            value: formatNumber(metrics.consecutivePlayCount),
          },
        ]
      : []),
    ...(metrics.consecutivePlayMaxBurden !== undefined
      ? [
          {
            label: "Back-to-back max",
            value: formatNumber(metrics.consecutivePlayMaxBurden),
          },
        ]
      : []),
    ...(reason.sessionType !== SessionType.POINTS
      ? [
          {
            label: "Partner repeats",
            value: formatNumber(metrics.partnerRepeatPenalty),
          },
          {
            label: "Opponent repeats",
            value: formatNumber(metrics.opponentRepeatPenalty),
          },
        ]
      : []),
  ];

  if (
    reason.sessionType !== SessionType.POINTS &&
    metrics.exactRematchPenalty > 0
  ) {
    rows.push({
      label: "Exact rematch",
      value: formatNumber(metrics.exactRematchPenalty),
    });
  }

  if (metrics.targetPool) {
    rows.push({
      label: "Pool",
      value: metrics.missedPool
        ? `${metrics.targetPool} over ${metrics.missedPool}`
        : metrics.targetPool,
    });
  }

  return rows;
}

export function MatchReasonModal({
  reason,
  onClose,
}: {
  reason: MatchmakingReason;
  onClose: () => void;
}) {
  const metricRows = buildMetricRows(reason);

  return (
    <ModalFrame
      title="Match Reason"
      subtitle="Auto matcher details."
      onClose={onClose}
      bodyClassName="p-4 sm:p-5"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
          <ul className="space-y-2 text-sm font-medium leading-relaxed text-gray-800">
            {reason.summary.map((item, index) => (
              <li key={`${index}:${item}`}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {metricRows.map((row) => (
            <div
              key={row.label}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2"
            >
              <p className="text-[11px] font-semibold uppercase text-gray-500">
                {row.label}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-gray-900">
                {row.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </ModalFrame>
  );
}
