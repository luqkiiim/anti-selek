/** One computation clock, shared by preparation, search, verification and retries. */
export interface MatchmakingSearchBudget {
  readonly startedAt: number;
  readonly deadline: number;
  now(): number;
  remainingMs(): number;
  isExpired(): boolean;
  /** An absolute cutoff from the original request start, never a fresh allowance. */
  capAtElapsedMs(ms: number): MatchmakingSearchBudget;
}

const scopes = new WeakMap<MatchmakingSearchBudget, object>();
export interface MatchmakingSearchPhaseDiagnostic {
  engine: "recurrence" | "production";
  phase: string;
  elapsedMs: number;
  requestElapsedMs: number;
  exploredBranches: number;
  prunedBranches: number;
  interrupted: boolean;
  limit: "time" | "branches" | null;
  replayWitnessCount?: number | null;
  balanceWitness?: { rank: number; fairness: readonly number[]; maxBalanceGap: number; totalBalanceGap: number };
}
const phaseDiagnostics = new WeakMap<object, MatchmakingSearchPhaseDiagnostic[]>();

export function recordMatchmakingSearchPhase(budget: MatchmakingSearchBudget | undefined, diagnostic: MatchmakingSearchPhaseDiagnostic): void {
  if (!budget) return;
  const scope = getMatchmakingSearchBudgetScope(budget);
  const phases = phaseDiagnostics.get(scope) ?? [];
  phases.push(Object.freeze({ ...diagnostic, ...(diagnostic.balanceWitness ? {
    balanceWitness: Object.freeze({ ...diagnostic.balanceWitness, fairness: Object.freeze([...diagnostic.balanceWitness.fairness]) }),
  } : {}) }));
  phaseDiagnostics.set(scope, phases);
}

/** Request-scoped evidence; callers receive copies, never mutable search state. */
export function getMatchmakingSearchPhaseDiagnostics(budget: MatchmakingSearchBudget): readonly MatchmakingSearchPhaseDiagnostic[] {
  return (phaseDiagnostics.get(getMatchmakingSearchBudgetScope(budget)) ?? []).map((phase) => ({ ...phase,
    ...(phase.balanceWitness ? { balanceWitness: { ...phase.balanceWitness, fairness: [...phase.balanceWitness.fairness] } } : {}),
  }));
}

export class MatchmakingSearchBudgetExceededError extends Error {
  constructor() {
    super("Matchmaking computation budget exhausted.");
    this.name = "MatchmakingSearchBudgetExceededError";
  }
}

export function createMatchmakingSearchBudget({
  maxMs = 5_000,
  now = () => performance.now(),
}: { maxMs?: number; now?: () => number } = {}): MatchmakingSearchBudget {
  if (!Number.isFinite(maxMs) || maxMs < 0) throw new Error("Invalid matchmaking budget.");
  const startedAt = now();
  const scope = {};
  const createView = (deadline: number): MatchmakingSearchBudget => {
    const view: MatchmakingSearchBudget = Object.freeze({
      startedAt,
      deadline,
      now,
      remainingMs: () => Math.max(0, deadline - now()),
      isExpired: () => now() >= deadline,
      capAtElapsedMs: (ms: number) => {
        if (!Number.isFinite(ms) || ms < 0) throw new Error("Invalid matchmaking cutoff.");
        return createView(Math.min(deadline, startedAt + ms));
      },
    });
    scopes.set(view, scope);
    return view;
  };
  return createView(startedAt + maxMs);
}

/** Private request identity for complete, RNG-independent preparation caches. */
export function getMatchmakingSearchBudgetScope(budget: MatchmakingSearchBudget): object {
  return scopes.get(budget) ?? budget;
}

export function checkMatchmakingSearchBudget(budget?: MatchmakingSearchBudget): void {
  if (budget?.isExpired()) throw new MatchmakingSearchBudgetExceededError();
}
