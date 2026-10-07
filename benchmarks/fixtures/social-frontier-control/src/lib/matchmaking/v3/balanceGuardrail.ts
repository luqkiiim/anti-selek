import { SessionType } from "../../../types/enums";
import type { V3BalanceGuardrail } from "./types";

export const POINTS_BALANCE_VARIETY_TOLERANCE = 1.5;
/** Adapt the previous 30-rating exact-rematch window to near-best variety. */
export const RATING_BALANCE_VARIETY_TOLERANCE = 30;
export const ELO_BALANCE_GAP_CEILING = 50;

export interface BalanceGuardrailPolicy {
  mode: "POINTS" | "RATING";
  nearBestWindow: number;
  absoluteCeiling: number | null;
}

/** Retain the existing strength-unit safeguards, now as fixed envelopes. */
export function getBalanceGuardrailPolicy(
  sessionType: SessionType,
  overrides?: Partial<Pick<BalanceGuardrailPolicy, "nearBestWindow" | "absoluteCeiling">>
): BalanceGuardrailPolicy | null {
  if (sessionType !== SessionType.POINTS && sessionType !== SessionType.ELO) return null;
  const policy: BalanceGuardrailPolicy = {
    mode: sessionType === SessionType.POINTS ? "POINTS" : "RATING",
    nearBestWindow: sessionType === SessionType.POINTS
      ? POINTS_BALANCE_VARIETY_TOLERANCE : RATING_BALANCE_VARIETY_TOLERANCE,
    absoluteCeiling: sessionType === SessionType.ELO ? ELO_BALANCE_GAP_CEILING : null,
    ...overrides,
  };
  if (!Number.isFinite(policy.nearBestWindow) || policy.nearBestWindow < 0 ||
    (policy.absoluteCeiling !== null && (!Number.isFinite(policy.absoluteCeiling) || policy.absoluteCeiling < 0))) {
    throw new RangeError("Balance guardrail limits must be finite and nonnegative.");
  }
  return policy;
}

export function buildBalanceGuardrail(
  policy: BalanceGuardrailPolicy,
  baseline: { maxBalanceGap: number; totalBalanceGap: number },
  baselineCertified = true
): V3BalanceGuardrail {
  const ceilingFeasible = policy.absoluteCeiling === null || baseline.maxBalanceGap <= policy.absoluteCeiling;
  return {
    ...policy,
    bestMaxBalanceGap: baseline.maxBalanceGap,
    bestTotalBalanceGap: baseline.totalBalanceGap,
    allowedMaxBalanceGap: ceilingFeasible
      ? Math.min(baseline.maxBalanceGap + policy.nearBestWindow, policy.absoluteCeiling ?? Infinity)
      : baseline.maxBalanceGap,
    // If the safety ceiling is impossible, use the actual minimax optimum.
    allowedTotalBalanceGap: ceilingFeasible ? null : baseline.totalBalanceGap,
    ceilingFeasible,
    baselineCertified,
  };
}

export function isBalanceGuardrailAdmissible(
  balance: { maxBalanceGap: number; totalBalanceGap: number },
  guardrail: V3BalanceGuardrail
) {
  return balance.maxBalanceGap <= guardrail.allowedMaxBalanceGap &&
    (guardrail.allowedTotalBalanceGap === null || balance.totalBalanceGap <= guardrail.allowedTotalBalanceGap);
}
