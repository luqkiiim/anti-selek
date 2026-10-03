# Matchmaking cadence and relationship coverage benchmark

Generated 2026-10-03T17:23:05.806Z; source commit 4ed8ace50de2ac3736055e722f497a3dc413505c; policy replay-envelope-best-plus-one; dirty worktree true. Primary seeds: 1; wide-profile Balanced seeds: 0.
Rendered from saved measurement data on 2026-10-03T18:16:02.269Z; measurement source hashes below identify the code used for the benchmark run.
Worktree note: Current checkout includes the strongest-class, Balanced-envelope, frozen best-replay-plus-one policy and benchmark instrumentation; hashes identify the exact sources used.
Tracked source changes from commit: core engine src/lib/matchmaking/v3/scoring.ts, src/lib/matchmaking/v3/singleCourt.ts, src/lib/matchmaking/v3/socialBatch.ts, src/lib/matchmaking/v3/types.ts; shared variety clean; measurement harness scripts/run-matchmaking-benchmark.mjs, src/lib/matchmaking/v3/socialCoverageBenchmark.test.ts, src/lib/matchmaking/v3/socialCoverageBenchmark.ts. Generated untracked artifacts can make the overall worktree dirty without changing these tracked source statuses.
Engine source SHA-256 1276953da02db993c72cff697cd8da40ef698b3c71c7cbcb266fa6cc48583176; measurement harness SHA-256 2a257abdeb996a8782662ec4aa66bd7e15fa90d920ab37f579275be5df6d1a93.

The roster uses the same P1–P14 identities, gender/preference assignments, latent skill ranks, and independent event-level court-completion schedule for every format at a given seed. The narrow profile maps the same rank vector to Points/Social strengths at 0.1 per rank and Rating strengths at 4 per rank; the wide profile maps it at 1 and 40 respectively. `pointDiff` stays 0 because this benchmark has no match scores. Each run has two active courts; one randomly scheduled court completes per event and is refilled. Coverage counts only completed matches. Rest turns count completed-match events while a player is available; active players do not accrue rest. The +1/+2 threshold counters include available idle events before a player's first match; assignment-rest gaps and back-to-back rates exclude first assignments.

Relationship coverage is the mean of each player’s feasible courtmate, partner, and opponent coverage ratios, excluding only empty opportunity facets. It is distinct from normalized Shannon entropy. Match-type coverage is reported separately. Percentages below are seed-level session averages and then mean/median/min/max across seeds.

## Primary narrow-skill profile

| Format | Completed | Relationship coverage (mean; median; min–max) | Partner / opponent / courtmate | MIXED / OWN_SIDE | Normalized entropy | Back-to-back rate | Max assignment rest gap (mean of per-seed maxima) | Mean / p95 assignment rest | +1 / +2 threshold reaches | Starvation changes / overdue (certified, unknown; rates) | Checkpoint / max fairness spread |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| Social (before → after) | 20 | 61.2%; 61.2%; 61.2%–61.2% | 40.7% / 63.7% / 79.1% | 100.0% / 92.9% | 79.0% | 30.3% → 28.8% | 5.00; 5.00; 5.00–5.00 → 4.00; 4.00; 4.00–4.00 | 1.45; 1.45; 1.45–1.45 / 3.00; 3.00; 3.00–3.00 | 4.0 / 0.0 | 0.0 changes (3 overdue; 3 certified, 0 unknown; overdue 0.0%, certified-only 0.0%) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Social (before → after) | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | 29.9% → 24.3% | 6.00; 6.00; 6.00–6.00 → 6.00; 6.00; 6.00–6.00 | 1.49; 1.49; 1.49–1.49 / 4.00; 4.00; 4.00–4.00 | 137.0 / 11.0 | 25.0 changes (105 overdue; 105 certified, 0 unknown; overdue 23.8%, certified-only 23.8%) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |
| Balanced Points (before → after) | 20 | 61.2%; 61.2%; 61.2%–61.2% | 40.7% / 63.7% / 79.1% | 100.0% / 92.9% | 79.0% | 30.3% → 28.8% | 5.00; 5.00; 5.00–5.00 → 4.00; 4.00; 4.00–4.00 | 1.45; 1.45; 1.45–1.45 / 3.00; 3.00; 3.00–3.00 | 4.0 / 0.0 | 0.0 changes (3 overdue; 3 certified, 0 unknown; overdue 0.0%, certified-only 0.0%) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Balanced Points (before → after) | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | 29.9% → 24.6% | 6.00; 6.00; 6.00–6.00 → 6.00; 6.00; 6.00–6.00 | 1.49; 1.49; 1.49–1.49 / 4.00; 4.00; 4.00–4.00 | 142.0 / 15.0 | 22.0 changes (111 overdue; 111 certified, 0 unknown; overdue 19.8%, certified-only 19.8%) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |
| Balanced Rating/Elo (before → after) | 20 | 60.1%; 60.1%; 60.1%–60.1% | 41.8% / 62.6% / 75.8% | 100.0% / 92.9% | 79.0% | 33.3% → 30.3% | 5.00; 5.00; 5.00–5.00 → 4.00; 4.00; 4.00–4.00 | 1.45; 1.45; 1.45–1.45 / 3.00; 3.00; 3.00–3.00 | 4.0 / 0.0 | 0.0 changes (3 overdue; 3 certified, 0 unknown; overdue 0.0%, certified-only 0.0%) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Balanced Rating/Elo (before → after) | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | 30.9% → 24.8% | 6.00; 6.00; 6.00–6.00 → 6.00; 6.00; 6.00–6.00 | 1.49; 1.49; 1.49–1.49 / 4.00; 4.00; 4.00–4.00 | 145.0 / 15.0 | 23.0 changes (115 overdue; 115 certified, 0 unknown; overdue 20.0%, certified-only 20.0%) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |

The table reports after-change coverage/entropy and before→after back-to-back rate and maximum assignment rest gap when a baseline report is supplied. Assignment rest is the completed-match rest-turn count sampled when players are selected; elapsed completion-event gaps are retained as a separate diagnostic and can include time spent in a match. `Starvation changed set` gives mean counterfactual set changes and the rate conditional on an overdue player being available. The fairness columns are checkpoint spread and maximum spread seen over the run. Exact per-seed values and missing relationship lists are in the adjacent JSON.

Decision cohorts: coverage, rest, and match-type checkpoints use completed matches only. Starvation's completed-decision count increments when every assignment in that optimizer decision has completed. Refill/type-override counts at checkpoint N include decisions assigned after completion events 1 through N−1; the latest refill can still be active. The opening two-court decision is excluded from type-override counts.
## Match-type priority overrides

These historical type-first counters are unavailable for the final replay-envelope policy. They are shown only when a report was measured under the type-entropy-first policy; unavailable historical fields remain n/a.

| Format | Overrides / certified refills | Rate | Mean selected match-type gain | Mean selected relationship gain |
|---|---:|---:|---:|---:|
| Social | n/a / n/a | n/a | n/a | n/a |
| Balanced Points | n/a / n/a | n/a | n/a | n/a |
| Balanced Rating/Elo | n/a / n/a | n/a | n/a | n/a |

## Frozen best-replay-plus-one envelope

After the strongest count/arrival/structure/starvation class and fixed Balanced envelope, the oracle recomputes the minimum number of immediate replays and admits candidates up to one above that minimum. The engine then optimizes combined entropy and soft rest within that frozen set.

| Format | Refills / replay-certified / full variety-certified | Uncertified | +1 selected / rate | >allowed but higher-entropy candidates: decisions / candidates | ≥5-rest episodes: accepted +1 origin / other rest-zero origin / no linked origin | No-starvation replay-certified / unknown |
|---|---:|---:|---:|---:|---:|---:|
| Social | 399 / 399 / 399 | 0.0 | 151.0 / 37.8% | 71.0 / 417.0 | 1.0 / 1.0 / 9.0 of 11.0 | 399.0 / 0.0 |
| Balanced Points | 399 / 399 / 399 | 0.0 | 152.0 / 38.1% | 64.0 / 444.0 | 2.0 / 2.0 / 11.0 of 15.0 | 399.0 / 0.0 |
| Balanced Rating/Elo | 399 / 399 / 399 | 0.0 | 157.0 / 39.3% | 56.0 / 356.0 | 1.0 / 3.0 / 11.0 of 15.0 | 399.0 / 0.0 |

A replay-origin long-wait count is decision-level evidence: it means the episode involved a rest-zero player selected by a certified decision using the +1 allowance; it does not claim that this player was uniquely the marginal extra. Counterfactual certification separately reruns the strongest class, Balanced envelope, and replay allowance without starvation. Refill decisions are counted after completed events 1 through N−1 at checkpoint N; the last refill may still be active, and the opening two-court decision is excluded.

## Completed match-type counts by session window

These are actual completed matches, not player-level match-type coverage. Early and late refer to the first and last 100 completed matches of each 400-match run.

| Format | At 20 completed: MIXED / OWN_SIDE | At 400 completed: MIXED / OWN_SIDE | First 100 OWN_SIDE | Last 100 OWN_SIDE |
|---|---:|---:|---:|---:|
| Social | 12.0 / 8.0 | 226.0 / 174.0 | 40.0 | 42.0 |
| Balanced Points | 12.0 / 8.0 | 227.0 / 173.0 | 40.0 | 41.0 |
| Balanced Rating/Elo | 12.0 / 8.0 | 227.0 / 173.0 | 42.0 | 43.0 |

## 400-match relationship completion

| Format | Seeds reaching 100% | Remaining structurally feasible relationships | Guardrail interpretation |
|---|---:|---|---|
| Social | 1/1 | 0 total facet-pairs across seeds | No balance guardrail. |
| Balanced Points | 1/1 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |
| Balanced Rating/Elo | 1/1 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |

The unseen relationship classification is finite-session evidence across successive opportunity layers: balance envelope, frozen replay minimum/allowance, combined-entropy frontier, and soft-cadence frontier. The static balance-feasibility audit is reported separately and can show whether a relationship is structurally feasible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.

## Long waits

There were 41 completed assignment gaps of at least five available completed-match rest turns in these runs. Deferred-refill classes: fairness_or_mixed_legality: 41. 10 had a linked immediately preceding rest-zero replay; 4 episodes involved a rest-zero player from a certified decision using the frozen +1 allowance. This is decision-level attribution; it does not identify a uniquely marginal player. Episode records include the strongest-class, balance-envelope, replay allowance, combined entropy, and soft-cadence evidence.

## Runtime

Total measured optimizer/oracle time across sessions: 61.7 seconds. Per-run timings are in JSON.

## Machine-readable compact summary

```json
{
  "sourceRevision": "4ed8ace50de2ac3736055e722f497a3dc413505c",
  "sourceProvenance": {
    "commitSha": "4ed8ace50de2ac3736055e722f497a3dc413505c",
    "workingTreeDirty": true,
    "workingTreeNote": "Current checkout includes the strongest-class, Balanced-envelope, frozen best-replay-plus-one policy and benchmark instrumentation; hashes identify the exact sources used.",
    "policyLabel": "replay-envelope-best-plus-one",
    "coreEngineTrackedDiffPaths": [
      "src/lib/matchmaking/v3/scoring.ts",
      "src/lib/matchmaking/v3/singleCourt.ts",
      "src/lib/matchmaking/v3/socialBatch.ts",
      "src/lib/matchmaking/v3/types.ts"
    ],
    "sharedVarietyTrackedDiffPaths": [],
    "measurementHarnessTrackedDiffPaths": [
      "scripts/run-matchmaking-benchmark.mjs",
      "src/lib/matchmaking/v3/socialCoverageBenchmark.test.ts",
      "src/lib/matchmaking/v3/socialCoverageBenchmark.ts"
    ],
    "engineSourceSha256": "1276953da02db993c72cff697cd8da40ef698b3c71c7cbcb266fa6cc48583176",
    "measurementHarnessSha256": "2a257abdeb996a8782662ec4aa66bd7e15fa90d920ab37f579275be5df6d1a93"
  },
  "primarySeeds": 1,
  "wideSeeds": 0,
  "groups": [
    {
      "profile": "narrow",
      "format": "Social",
      "completed": 20,
      "varietyCoverageMean": 0.6117216117216117,
      "varietyCoverageMedian": 0.6117216117216117,
      "varietyCoverageStdDev": 0,
      "varietyCoverageMin": 0.6117216117216117,
      "varietyCoverageMax": 0.6117216117216117,
      "partnerCoverageMean": 0.40659340659340665,
      "partnerCoverageStdDev": 0,
      "opponentCoverageMean": 0.6373626373626374,
      "opponentCoverageStdDev": 0,
      "courtmateCoverageMean": 0.7912087912087913,
      "courtmateCoverageStdDev": 0,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0.9285714285714286,
      "completedMixedMatchesMean": 12,
      "completedOwnSideMatchesMean": 8,
      "first100OwnSideMatchesMean": 40,
      "last100OwnSideMatchesMean": 42,
      "relationshipEntropyMean": 0.7597899897543241,
      "matchTypeEntropyMean": 0.8798401219411307,
      "normalizedEntropyMean": 0.7898025228010258,
      "backToBackRateMean": 0.2878787878787879,
      "maxAssignmentRestGapMean": 4,
      "maxAssignmentRestGapWorst": 4,
      "meanAssignmentRestGapMean": 1.4545454545454546,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 0,
      "decisionsWithOverdue": 3,
      "certifiedCounterfactualDecisions": 3,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 19,
      "backToBackAssignments": 19,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0,
      "starvationRateAcrossCompletedDecisions": 0,
      "starvationRateAmongCertified": 0
    },
    {
      "profile": "narrow",
      "format": "Social",
      "completed": 400,
      "varietyCoverageMean": 1,
      "varietyCoverageMedian": 1,
      "varietyCoverageStdDev": 0,
      "varietyCoverageMin": 1,
      "varietyCoverageMax": 1,
      "partnerCoverageMean": 1,
      "partnerCoverageStdDev": 0,
      "opponentCoverageMean": 1,
      "opponentCoverageStdDev": 0,
      "courtmateCoverageMean": 1,
      "courtmateCoverageStdDev": 0,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 1,
      "completedMixedMatchesMean": 226,
      "completedOwnSideMatchesMean": 174,
      "first100OwnSideMatchesMean": 40,
      "last100OwnSideMatchesMean": 42,
      "relationshipEntropyMean": 0.9747551569550312,
      "matchTypeEntropyMean": 0.9874697063981149,
      "normalizedEntropyMean": 0.9779337943158024,
      "backToBackRateMean": 0.24274905422446405,
      "maxAssignmentRestGapMean": 6,
      "maxAssignmentRestGapWorst": 6,
      "meanAssignmentRestGapMean": 1.4936948297604036,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 25,
      "decisionsWithOverdue": 105,
      "certifiedCounterfactualDecisions": 105,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 399,
      "backToBackAssignments": 385,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 5,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.23809523809523808,
      "starvationRateAcrossCompletedDecisions": 0.06265664160401002,
      "starvationRateAmongCertified": 0.23809523809523808
    },
    {
      "profile": "narrow",
      "format": "Balanced Points",
      "completed": 20,
      "varietyCoverageMean": 0.6117216117216117,
      "varietyCoverageMedian": 0.6117216117216117,
      "varietyCoverageStdDev": 0,
      "varietyCoverageMin": 0.6117216117216117,
      "varietyCoverageMax": 0.6117216117216117,
      "partnerCoverageMean": 0.40659340659340665,
      "partnerCoverageStdDev": 0,
      "opponentCoverageMean": 0.6373626373626374,
      "opponentCoverageStdDev": 0,
      "courtmateCoverageMean": 0.7912087912087913,
      "courtmateCoverageStdDev": 0,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0.9285714285714286,
      "completedMixedMatchesMean": 12,
      "completedOwnSideMatchesMean": 8,
      "first100OwnSideMatchesMean": 40,
      "last100OwnSideMatchesMean": 41,
      "relationshipEntropyMean": 0.7597899897543241,
      "matchTypeEntropyMean": 0.8798401219411307,
      "normalizedEntropyMean": 0.7898025228010258,
      "backToBackRateMean": 0.2878787878787879,
      "maxAssignmentRestGapMean": 4,
      "maxAssignmentRestGapWorst": 4,
      "meanAssignmentRestGapMean": 1.4545454545454546,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 0,
      "decisionsWithOverdue": 3,
      "certifiedCounterfactualDecisions": 3,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 19,
      "backToBackAssignments": 19,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0,
      "starvationRateAcrossCompletedDecisions": 0,
      "starvationRateAmongCertified": 0
    },
    {
      "profile": "narrow",
      "format": "Balanced Points",
      "completed": 400,
      "varietyCoverageMean": 1,
      "varietyCoverageMedian": 1,
      "varietyCoverageStdDev": 0,
      "varietyCoverageMin": 1,
      "varietyCoverageMax": 1,
      "partnerCoverageMean": 1,
      "partnerCoverageStdDev": 0,
      "opponentCoverageMean": 1,
      "opponentCoverageStdDev": 0,
      "courtmateCoverageMean": 1,
      "courtmateCoverageStdDev": 0,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 1,
      "completedMixedMatchesMean": 227,
      "completedOwnSideMatchesMean": 173,
      "first100OwnSideMatchesMean": 40,
      "last100OwnSideMatchesMean": 41,
      "relationshipEntropyMean": 0.9749573874718319,
      "matchTypeEntropyMean": 0.9864156301739515,
      "normalizedEntropyMean": 0.9778219481473621,
      "backToBackRateMean": 0.2459016393442623,
      "maxAssignmentRestGapMean": 6,
      "maxAssignmentRestGapWorst": 6,
      "meanAssignmentRestGapMean": 1.4943253467843631,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 22,
      "decisionsWithOverdue": 111,
      "certifiedCounterfactualDecisions": 111,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 399,
      "backToBackAssignments": 390,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 5,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.1981981981981982,
      "starvationRateAcrossCompletedDecisions": 0.05513784461152882,
      "starvationRateAmongCertified": 0.1981981981981982
    },
    {
      "profile": "narrow",
      "format": "Balanced Rating/Elo",
      "completed": 20,
      "varietyCoverageMean": 0.6007326007326007,
      "varietyCoverageMedian": 0.6007326007326007,
      "varietyCoverageStdDev": 0,
      "varietyCoverageMin": 0.6007326007326007,
      "varietyCoverageMax": 0.6007326007326007,
      "partnerCoverageMean": 0.4175824175824177,
      "partnerCoverageStdDev": 0,
      "opponentCoverageMean": 0.6263736263736265,
      "opponentCoverageStdDev": 0,
      "courtmateCoverageMean": 0.7582417582417583,
      "courtmateCoverageStdDev": 0,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0.9285714285714286,
      "completedMixedMatchesMean": 12,
      "completedOwnSideMatchesMean": 8,
      "first100OwnSideMatchesMean": 42,
      "last100OwnSideMatchesMean": 43,
      "relationshipEntropyMean": 0.7575264480729756,
      "matchTypeEntropyMean": 0.8856761337943814,
      "normalizedEntropyMean": 0.7895638695033271,
      "backToBackRateMean": 0.30303030303030304,
      "maxAssignmentRestGapMean": 4,
      "maxAssignmentRestGapWorst": 4,
      "meanAssignmentRestGapMean": 1.4545454545454546,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 0,
      "decisionsWithOverdue": 3,
      "certifiedCounterfactualDecisions": 3,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 19,
      "backToBackAssignments": 20,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0,
      "starvationRateAcrossCompletedDecisions": 0,
      "starvationRateAmongCertified": 0
    },
    {
      "profile": "narrow",
      "format": "Balanced Rating/Elo",
      "completed": 400,
      "varietyCoverageMean": 1,
      "varietyCoverageMedian": 1,
      "varietyCoverageStdDev": 0,
      "varietyCoverageMin": 1,
      "varietyCoverageMax": 1,
      "partnerCoverageMean": 1,
      "partnerCoverageStdDev": 0,
      "opponentCoverageMean": 1,
      "opponentCoverageStdDev": 0,
      "courtmateCoverageMean": 1,
      "courtmateCoverageStdDev": 0,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 1,
      "completedMixedMatchesMean": 227,
      "completedOwnSideMatchesMean": 173,
      "first100OwnSideMatchesMean": 42,
      "last100OwnSideMatchesMean": 43,
      "relationshipEntropyMean": 0.9748152225534202,
      "matchTypeEntropyMean": 0.9861229167176168,
      "normalizedEntropyMean": 0.9776421460944695,
      "backToBackRateMean": 0.24779319041614123,
      "maxAssignmentRestGapMean": 6,
      "maxAssignmentRestGapWorst": 6,
      "meanAssignmentRestGapMean": 1.4943253467843631,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 23,
      "decisionsWithOverdue": 115,
      "certifiedCounterfactualDecisions": 115,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 399,
      "backToBackAssignments": 393,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 5,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.2,
      "starvationRateAcrossCompletedDecisions": 0.05764411027568922,
      "starvationRateAmongCertified": 0.2
    }
  ]
}
```

## Seed-to-seed coverage variation (population SD)

| Profile | Format | Completed | Relationship VCS mean ± SD | Median | Min–max | Partner SD | Opponent SD | Courtmate SD |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| narrow | Social | 20 | 61.2% ± 0.0% | 61.2% | 61.2%–61.2% | 0.0% | 0.0% | 0.0% |
| narrow | Social | 400 | 100.0% ± 0.0% | 100.0% | 100.0%–100.0% | 0.0% | 0.0% | 0.0% |
| narrow | Balanced Points | 20 | 61.2% ± 0.0% | 61.2% | 61.2%–61.2% | 0.0% | 0.0% | 0.0% |
| narrow | Balanced Points | 400 | 100.0% ± 0.0% | 100.0% | 100.0%–100.0% | 0.0% | 0.0% | 0.0% |
| narrow | Balanced Rating/Elo | 20 | 60.1% ± 0.0% | 60.1% | 60.1%–60.1% | 0.0% | 0.0% | 0.0% |
| narrow | Balanced Rating/Elo | 400 | 100.0% ± 0.0% | 100.0% | 100.0%–100.0% | 0.0% | 0.0% | 0.0% |

## Completed ≥5-rest gaps by cohort

| Profile | Format | Count | Fairness / legality | Starvation | Balance envelope | Replay allowance | Combined entropy | Soft cadence | Later tie | Linked prior rest-zero replay |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| narrow | Social | 11 | 11 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| narrow | Balanced Points | 15 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| narrow | Balanced Rating/Elo | 15 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |

The wait stage columns identify the first active selection layer that lacked a candidate including the deferred player: fairness/legal availability, starvation, balance envelope, frozen replay allowance, combined entropy, soft cadence, or a later tie. Candidate gains and chosen sets/rest vectors are recorded per refill; these are observed finite-session opportunities, not proof of permanent impossibility.

## Static balance-guardrail dominance for wide skill profile

## Before/after optimizer timing (same narrow cohort)

| Engine | Production decisions | Direct optimizer calls / time | Paired starvation diagnostics | Diagnostic-inclusive time per decision | Search-limit / certification failures |
|---|---:|---:|---:|---:|---:|
| Baseline de0254f84adef7414b512e3d3fd936033d65bef8 | 1200 | 1200 / 21.7 s | none available | 18.05 ms | 0 / 0 |
| Current 4ed8ace50de2ac3736055e722f497a3dc413505c | 1200 | 866 / 24.7 s | 334 wrappers / 15.7 s | 33.67 ms | 0 / 0 |

Both rows cover the same 1 narrow seed(s) × 3 formats × 400 completed matches. On overdue decisions the current wrapper returns the production choice and runs one extra no-starvation search; its total time is included here, so the diagnostic-inclusive current number is a conservative instrumentation cost, not production-only latency. The baseline has no counterfactual API and its intervention count is unknown.
Per-session harness totals including matcher, independent oracle, and report instrumentation were 39.6 s baseline and 61.7 s current; this broader scope is not production-only matcher latency.

## Exact unseen relationship list and traces

### Social narrow seed 1: unseen at 400
All structurally feasible player/facet relationships were observed.

### Balanced Points narrow seed 1: unseen at 400
All structurally feasible player/facet relationships were observed.

### Balanced Rating/Elo narrow seed 1: unseen at 400
All structurally feasible player/facet relationships were observed.

### Balanced Points narrow: static equal-count, two-court balance exclusions
Static excluded 0 directed entries (0 distinct facet-pairs); Rating ceiling fallback: false.

### Balanced Rating/Elo narrow: static equal-count, two-court balance exclusions
Static excluded 0 directed entries (0 distinct facet-pairs); Rating ceiling fallback: false.

### Completed ≥5-rest assignments
- wait-narrow-SOCIAL_MIX-1-P4-51: Social narrow seed 1, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P11-89: Social narrow seed 1, P11, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P5-89: Social narrow seed 1, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P7-89: Social narrow seed 1, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P4-92: Social narrow seed 1, P4, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-84-court-1, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-SOCIAL_MIX-1-P9-92: Social narrow seed 1, P9, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P8-109: Social narrow seed 1, P8, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-103-court-1, fair alternatives 60, starvation-equivalent 60, balance-admissible 60, smoother 0.
- wait-narrow-SOCIAL_MIX-1-P12-109: Social narrow seed 1, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P14-109: Social narrow seed 1, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P11-112: Social narrow seed 1, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P2-301: Social narrow seed 1, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P4-51: Balanced Points narrow seed 1, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P12-89: Balanced Points narrow seed 1, P12, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P4-89: Balanced Points narrow seed 1, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P7-89: Balanced Points narrow seed 1, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P5-92: Balanced Points narrow seed 1, P5, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-84-court-1, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-POINTS-1-P14-92: Balanced Points narrow seed 1, P14, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P3-109: Balanced Points narrow seed 1, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P5-109: Balanced Points narrow seed 1, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P6-109: Balanced Points narrow seed 1, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P1-112: Balanced Points narrow seed 1, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P5-173: Balanced Points narrow seed 1, P5, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-164-court-1, fair alternatives 10, starvation-equivalent 10, balance-admissible 10, smoother 0.
- wait-narrow-POINTS-1-P4-187: Balanced Points narrow seed 1, P4, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-178-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-POINTS-1-P10-301: Balanced Points narrow seed 1, P10, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-289-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-POINTS-1-P11-367: Balanced Points narrow seed 1, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P6-374: Balanced Points narrow seed 1, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P11-51: Balanced Rating/Elo narrow seed 1, P11, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-44-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-ELO-1-P1-89: Balanced Rating/Elo narrow seed 1, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P14-89: Balanced Rating/Elo narrow seed 1, P14, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P10-89: Balanced Rating/Elo narrow seed 1, P10, rest 6, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-82-court-1, fair alternatives 60, starvation-equivalent 60, balance-admissible 60, smoother 0.
- wait-narrow-ELO-1-P11-92: Balanced Rating/Elo narrow seed 1, P11, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P5-92: Balanced Rating/Elo narrow seed 1, P5, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-84-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-ELO-1-P4-109: Balanced Rating/Elo narrow seed 1, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P1-109: Balanced Rating/Elo narrow seed 1, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P6-109: Balanced Rating/Elo narrow seed 1, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P3-112: Balanced Rating/Elo narrow seed 1, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P6-234: Balanced Rating/Elo narrow seed 1, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P10-269: Balanced Rating/Elo narrow seed 1, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P11-297: Balanced Rating/Elo narrow seed 1, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P7-301: Balanced Rating/Elo narrow seed 1, P7, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-289-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-ELO-1-P8-301: Balanced Rating/Elo narrow seed 1, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.

### Censored at the 400-match checkpoint
None.

### Search and timing scope

- Social narrow seed 1: ordinary optimizer 8382.43 ms; counterfactual wrapper 5230.19 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 19167 ms.
- Balanced Points narrow seed 1: ordinary optimizer 8281.03 ms; counterfactual wrapper 5348.41 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 1721.30 ms; whole harness 21597 ms.
- Balanced Rating/Elo narrow seed 1: ordinary optimizer 8027.56 ms; counterfactual wrapper 5137.09 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 1688.34 ms; whole harness 20889 ms.

## Compact human-readable checkpoint summary

| Profile | Format | Completed | VCS | Partner / opponent / courtmate | MIXED / OWN_SIDE player coverage | Completed MIXED / OWN_SIDE | First100 / last100 OWN_SIDE | Entropy people / type / all | B2B | Worst max / mean of per-seed maxima / mean / p95 assignment rest | Starvation changed / overdue / all completed |
|---|---|---:|---:|---|---|---:|---:|---|---:|---|---|
| narrow | Social | 20 | 61.2% | 40.7% / 63.7% / 79.1% | 100.0% / 92.9% | 12.0 / 8.0 | first100 OWN_SIDE 40.0 / last100 42.0 | 76.0% / 88.0% / 79.0% | 28.8% | 4.00 / 4.00 / 1.45 / 3.00 | 0 / 3 / 19 (0.0% / 0.0%; certified 0.0%; unknown 0) |
| narrow | Social | 400 | 100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 226.0 / 174.0 | first100 OWN_SIDE 40.0 / last100 42.0 | 97.5% / 98.7% / 97.8% | 24.3% | 6.00 / 6.00 / 1.49 / 4.00 | 25 / 105 / 399 (23.8% / 6.3%; certified 23.8%; unknown 0) |
| narrow | Balanced Points | 20 | 61.2% | 40.7% / 63.7% / 79.1% | 100.0% / 92.9% | 12.0 / 8.0 | first100 OWN_SIDE 40.0 / last100 41.0 | 76.0% / 88.0% / 79.0% | 28.8% | 4.00 / 4.00 / 1.45 / 3.00 | 0 / 3 / 19 (0.0% / 0.0%; certified 0.0%; unknown 0) |
| narrow | Balanced Points | 400 | 100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 227.0 / 173.0 | first100 OWN_SIDE 40.0 / last100 41.0 | 97.5% / 98.6% / 97.8% | 24.6% | 6.00 / 6.00 / 1.49 / 4.00 | 22 / 111 / 399 (19.8% / 5.5%; certified 19.8%; unknown 0) |
| narrow | Balanced Rating/Elo | 20 | 60.1% | 41.8% / 62.6% / 75.8% | 100.0% / 92.9% | 12.0 / 8.0 | first100 OWN_SIDE 42.0 / last100 43.0 | 75.8% / 88.6% / 79.0% | 30.3% | 4.00 / 4.00 / 1.45 / 3.00 | 0 / 3 / 19 (0.0% / 0.0%; certified 0.0%; unknown 0) |
| narrow | Balanced Rating/Elo | 400 | 100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 227.0 / 173.0 | first100 OWN_SIDE 42.0 / last100 43.0 | 97.5% / 98.6% / 97.8% | 24.8% | 6.00 / 6.00 / 1.49 / 4.00 | 23 / 115 / 399 (20.0% / 5.8%; certified 20.0%; unknown 0) |
