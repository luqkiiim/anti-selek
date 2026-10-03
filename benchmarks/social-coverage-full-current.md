# Matchmaking cadence and relationship coverage benchmark

Generated 2026-10-03T17:51:57.594Z; source commit 7ab071ad0102ff8a2012a267d8cfe796a1f325a8; policy replay-envelope-best-plus-one; dirty worktree true. Primary seeds: 5; wide-profile Balanced seeds: 3.
Rendered from saved measurement data on 2026-10-03T18:16:14.682Z; measurement source hashes below identify the code used for the benchmark run.
Worktree note: Current checkout includes the strongest-class, Balanced-envelope, frozen best-replay-plus-one policy and benchmark instrumentation; hashes identify the exact sources used.
Tracked source changes from commit: core engine clean; shared variety clean; measurement harness clean. Generated untracked artifacts can make the overall worktree dirty without changing these tracked source statuses.
Engine source SHA-256 a9dac9d1de2b379a59aa07e2f0df4dab9b0dd0d8a4a298630b85fd395a1c512c; measurement harness SHA-256 e6bb42ad5c613e0d7346f2704d2a30d34c1c6967912ca96ed082b6889a3f32f8.

The roster uses the same P1–P14 identities, gender/preference assignments, latent skill ranks, and independent event-level court-completion schedule for every format at a given seed. The narrow profile maps the same rank vector to Points/Social strengths at 0.1 per rank and Rating strengths at 4 per rank; the wide profile maps it at 1 and 40 respectively. `pointDiff` stays 0 because this benchmark has no match scores. Each run has two active courts; one randomly scheduled court completes per event and is refilled. Coverage counts only completed matches. Rest turns count completed-match events while a player is available; active players do not accrue rest. The +1/+2 threshold counters include available idle events before a player's first match; assignment-rest gaps and back-to-back rates exclude first assignments.

Relationship coverage is the mean of each player’s feasible courtmate, partner, and opponent coverage ratios, excluding only empty opportunity facets. It is distinct from normalized Shannon entropy. Match-type coverage is reported separately. Percentages below are seed-level session averages and then mean/median/min/max across seeds.

## Primary narrow-skill profile

| Format | Completed | Relationship coverage (mean; median; min–max) | Partner / opponent / courtmate | MIXED / OWN_SIDE | Normalized entropy | Back-to-back rate | Max assignment rest gap (mean of per-seed maxima) | Mean / p95 assignment rest | +1 / +2 threshold reaches | Starvation changes / overdue (certified, unknown; rates) | Checkpoint / max fairness spread |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| Social (before → after) | 20 | 62.1%; 62.3%; 57.1%–65.9% | 42.2% / 64.4% / 79.8% | 100.0% / 95.7% | 79.8% | 30.3% → 24.5% | 4.40; 4.00; 4.00–5.00 → 4.20; 4.00; 4.00–5.00 | 1.47; 1.47; 1.45–1.48 / 3.80; 4.00; 3.00–4.00 | 4.8 / 0.2 | 0.6 changes (19 overdue; 19 certified, 0 unknown; overdue 18.0%, certified-only 18.0%) | 1.00; 1.00; 1.00–1.00 / 2.40; 2.00; 2.00–3.00 |
| Social (before → after) | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | 29.5% → 24.9% | 5.80; 6.00; 5.00–7.00 → 5.80; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 141.0 / 13.4 | 27.4 changes (558 overdue; 558 certified, 0 unknown; overdue 24.5%, certified-only 24.5%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Points (before → after) | 20 | 62.1%; 62.3%; 57.1%–65.9% | 42.2% / 64.4% / 79.8% | 100.0% / 95.7% | 79.8% | 30.3% → 24.5% | 4.40; 4.00; 4.00–5.00 → 4.20; 4.00; 4.00–5.00 | 1.47; 1.47; 1.45–1.48 / 3.80; 4.00; 3.00–4.00 | 4.8 / 0.2 | 0.6 changes (19 overdue; 19 certified, 0 unknown; overdue 18.0%, certified-only 18.0%) | 1.00; 1.00; 1.00–1.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Points (before → after) | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.7% | 29.7% → 24.7% | 5.80; 6.00; 5.00–7.00 → 5.80; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 140.4 / 15.0 | 25.6 changes (556 overdue; 556 certified, 0 unknown; overdue 23.0%, certified-only 23.0%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Rating/Elo (before → after) | 20 | 62.1%; 62.3%; 57.9%–65.9% | 42.4% / 64.4% / 79.3% | 100.0% / 95.7% | 79.8% | 30.9% → 24.8% | 4.40; 4.00; 4.00–5.00 → 4.20; 4.00; 4.00–5.00 | 1.47; 1.47; 1.45–1.48 / 3.80; 4.00; 3.00–4.00 | 5.0 / 0.2 | 0.8 changes (20 overdue; 20 certified, 0 unknown; overdue 21.3%, certified-only 21.3%) | 1.00; 1.00; 1.00–1.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Rating/Elo (before → after) | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | 29.8% → 24.8% | 5.80; 6.00; 5.00–7.00 → 5.80; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 142.4 / 15.4 | 25.2 changes (562 overdue; 562 certified, 0 unknown; overdue 22.4%, certified-only 22.4%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |

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
| Social | 399 / 399 / 399 | 0.0 | 150.4 / 37.7% | 60.2 / 361.8 | 2.8 / 1.4 / 9.2 of 13.4 | 399.0 / 0.0 |
| Balanced Points | 399 / 399 / 399 | 0.0 | 146.8 / 36.8% | 60.2 / 365.0 | 3.2 / 1.6 / 10.2 of 15.0 | 399.0 / 0.0 |
| Balanced Rating/Elo | 399 / 399 / 399 | 0.0 | 148.2 / 37.1% | 56.4 / 338.4 | 3.2 / 2.0 / 10.2 of 15.4 | 399.0 / 0.0 |

A replay-origin long-wait count is decision-level evidence: it means the episode involved a rest-zero player selected by a certified decision using the +1 allowance; it does not claim that this player was uniquely the marginal extra. Counterfactual certification separately reruns the strongest class, Balanced envelope, and replay allowance without starvation. Refill decisions are counted after completed events 1 through N−1 at checkpoint N; the last refill may still be active, and the opening two-court decision is excluded.

## Completed match-type counts by session window

These are actual completed matches, not player-level match-type coverage. Early and late refer to the first and last 100 completed matches of each 400-match run.

| Format | At 20 completed: MIXED / OWN_SIDE | At 400 completed: MIXED / OWN_SIDE | First 100 OWN_SIDE | Last 100 OWN_SIDE |
|---|---:|---:|---:|---:|
| Social | 12.2 / 7.8 | 224.8 / 175.2 | 42.2 | 43.8 |
| Balanced Points | 12.2 / 7.8 | 226.2 / 173.8 | 42.0 | 44.8 |
| Balanced Rating/Elo | 12.2 / 7.8 | 226.2 / 173.8 | 42.4 | 45.2 |

## Wide-skill guardrail sensitivity

| Format | Completed | Relationship coverage | Partner / opponent / courtmate | Normalized entropy | Back-to-back rate | Max assignment rest gap | Starvation changes / certified / unknown (rate) | Checkpoint / max fairness spread |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| Balanced Points | 20 | 61.2% | 40.3% / 63.7% / 79.5% | 80.4% | 25.3% | 4.33 | 0.67 / 10 / 0 (19.4%) | 1.00 / 2.33 |
| Balanced Points | 400 | 98.5% | 95.6% / 100.0% / 100.0% | 96.6% | 25.6% | 6.67 | 24.33 / 324 / 0 (22.5%) | 1.33 / 5.00 |
| Balanced Rating/Elo | 20 | 60.3% | 37.4% / 61.5% / 82.1% | 77.6% | 26.3% | 4.00 | 1.00 / 9 / 0 (51.1%) | 1.00 / 2.33 |
| Balanced Rating/Elo | 400 | 95.6% | 89.0% / 97.8% / 100.0% | 95.3% | 26.5% | 5.67 | 28.67 / 333 / 0 (26.1%) | 1.33 / 5.00 |

The wide profile uses the same skill ranks at 10× the narrow strength spread. It is a sensitivity run for balance-envelope restrictions; the primary relationship denominator remains structural and does not shrink to the guardrail.
Static equal-count two-court enumeration excluded 8 directed opportunity records (4 distinct facet-pairs) for wide Balanced Points; the JSON appendix lists the exact pairs.
Static equal-count two-court enumeration excluded 24 directed opportunity records (12 distinct facet-pairs) for wide Balanced Rating/Elo; the JSON appendix lists the exact pairs.

## 400-match relationship completion

| Format | Seeds reaching 100% | Remaining structurally feasible relationships | Guardrail interpretation |
|---|---:|---|---|
| Social | 5/5 | 0 total facet-pairs across seeds | No balance guardrail. |
| Balanced Points | 5/5 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |
| Balanced Rating/Elo | 5/5 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |

The unseen relationship classification is finite-session evidence across successive opportunity layers: balance envelope, frozen replay minimum/allowance, combined-entropy frontier, and soft-cadence frontier. The static balance-feasibility audit is reported separately and can show whether a relationship is structurally feasible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.

## Long waits

There were 298 completed assignment gaps of at least five available completed-match rest turns in these runs. Deferred-refill classes: fairness_or_mixed_legality: 272; combined_entropy_priority_exclusion: 23; balance_guardrail: 2; starvation_priority: 1. 90 had a linked immediately preceding rest-zero replay; 61 episodes involved a rest-zero player from a certified decision using the frozen +1 allowance. This is decision-level attribution; it does not identify a uniquely marginal player. Episode records include the strongest-class, balance-envelope, replay allowance, combined entropy, and soft-cadence evidence.

## Runtime

Total measured optimizer/oracle time across sessions: 309.6 seconds. Per-run timings are in JSON.

## Machine-readable compact summary

```json
{
  "sourceRevision": "7ab071ad0102ff8a2012a267d8cfe796a1f325a8",
  "sourceProvenance": {
    "commitSha": "7ab071ad0102ff8a2012a267d8cfe796a1f325a8",
    "workingTreeDirty": true,
    "workingTreeNote": "Current checkout includes the strongest-class, Balanced-envelope, frozen best-replay-plus-one policy and benchmark instrumentation; hashes identify the exact sources used.",
    "policyLabel": "replay-envelope-best-plus-one",
    "coreEngineTrackedDiffPaths": [],
    "sharedVarietyTrackedDiffPaths": [],
    "measurementHarnessTrackedDiffPaths": [],
    "engineSourceSha256": "a9dac9d1de2b379a59aa07e2f0df4dab9b0dd0d8a4a298630b85fd395a1c512c",
    "measurementHarnessSha256": "e6bb42ad5c613e0d7346f2704d2a30d34c1c6967912ca96ed082b6889a3f32f8"
  },
  "primarySeeds": 5,
  "wideSeeds": 3,
  "groups": [
    {
      "profile": "narrow",
      "format": "Social",
      "completed": 20,
      "varietyCoverageMean": 0.6212454212454213,
      "varietyCoverageMedian": 0.6227106227106226,
      "varietyCoverageStdDev": 0.029722289780367415,
      "varietyCoverageMin": 0.5714285714285715,
      "varietyCoverageMax": 0.6593406593406593,
      "partnerCoverageMean": 0.4219780219780221,
      "partnerCoverageStdDev": 0.01490621974313249,
      "opponentCoverageMean": 0.643956043956044,
      "opponentCoverageStdDev": 0.0337632780126093,
      "courtmateCoverageMean": 0.7978021978021979,
      "courtmateCoverageStdDev": 0.04373571152117013,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0.9571428571428571,
      "completedMixedMatchesMean": 12.2,
      "completedOwnSideMatchesMean": 7.8,
      "first100OwnSideMatchesMean": 42.2,
      "last100OwnSideMatchesMean": 43.8,
      "relationshipEntropyMean": 0.772086432060118,
      "matchTypeEntropyMean": 0.873874753564934,
      "normalizedEntropyMean": 0.797533512436322,
      "backToBackRateMean": 0.24545454545454545,
      "maxAssignmentRestGapMean": 4.2,
      "maxAssignmentRestGapWorst": 5,
      "meanAssignmentRestGapMean": 1.4666666666666668,
      "p95AssignmentRestGapMean": 3.8,
      "starvationInterventions": 3,
      "decisionsWithOverdue": 19,
      "certifiedCounterfactualDecisions": 19,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 95,
      "backToBackAssignments": 81,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2.4,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.15789473684210525,
      "starvationRateAcrossCompletedDecisions": 0.031578947368421054,
      "starvationRateAmongCertified": 0.15789473684210525
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
      "completedMixedMatchesMean": 224.8,
      "completedOwnSideMatchesMean": 175.2,
      "first100OwnSideMatchesMean": 42.2,
      "last100OwnSideMatchesMean": 43.8,
      "relationshipEntropyMean": 0.9738908912359566,
      "matchTypeEntropyMean": 0.9885591185354153,
      "normalizedEntropyMean": 0.9775579480608215,
      "backToBackRateMean": 0.24854981084489283,
      "maxAssignmentRestGapMean": 5.8,
      "maxAssignmentRestGapWorst": 7,
      "meanAssignmentRestGapMean": 1.4968474148802016,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 137,
      "decisionsWithOverdue": 558,
      "certifiedCounterfactualDecisions": 558,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1995,
      "backToBackAssignments": 1971,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 4.6,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.24551971326164876,
      "starvationRateAcrossCompletedDecisions": 0.06867167919799498,
      "starvationRateAmongCertified": 0.24551971326164876
    },
    {
      "profile": "narrow",
      "format": "Balanced Points",
      "completed": 20,
      "varietyCoverageMean": 0.6212454212454213,
      "varietyCoverageMedian": 0.6227106227106226,
      "varietyCoverageStdDev": 0.029722289780367415,
      "varietyCoverageMin": 0.5714285714285715,
      "varietyCoverageMax": 0.6593406593406593,
      "partnerCoverageMean": 0.4219780219780221,
      "partnerCoverageStdDev": 0.01490621974313249,
      "opponentCoverageMean": 0.643956043956044,
      "opponentCoverageStdDev": 0.0337632780126093,
      "courtmateCoverageMean": 0.7978021978021979,
      "courtmateCoverageStdDev": 0.04373571152117013,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0.9571428571428571,
      "completedMixedMatchesMean": 12.2,
      "completedOwnSideMatchesMean": 7.8,
      "first100OwnSideMatchesMean": 42,
      "last100OwnSideMatchesMean": 44.8,
      "relationshipEntropyMean": 0.772086432060118,
      "matchTypeEntropyMean": 0.873874753564934,
      "normalizedEntropyMean": 0.797533512436322,
      "backToBackRateMean": 0.24545454545454545,
      "maxAssignmentRestGapMean": 4.2,
      "maxAssignmentRestGapWorst": 5,
      "meanAssignmentRestGapMean": 1.4666666666666668,
      "p95AssignmentRestGapMean": 3.8,
      "starvationInterventions": 3,
      "decisionsWithOverdue": 19,
      "certifiedCounterfactualDecisions": 19,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 95,
      "backToBackAssignments": 81,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2.4,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.15789473684210525,
      "starvationRateAcrossCompletedDecisions": 0.031578947368421054,
      "starvationRateAmongCertified": 0.15789473684210525
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
      "completedMixedMatchesMean": 226.2,
      "completedOwnSideMatchesMean": 173.8,
      "first100OwnSideMatchesMean": 42,
      "last100OwnSideMatchesMean": 44.8,
      "relationshipEntropyMean": 0.9741402076690104,
      "matchTypeEntropyMean": 0.9872790642791569,
      "normalizedEntropyMean": 0.9774249218215474,
      "backToBackRateMean": 0.24728877679697353,
      "maxAssignmentRestGapMean": 5.8,
      "maxAssignmentRestGapWorst": 7,
      "meanAssignmentRestGapMean": 1.4969735182849937,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 128,
      "decisionsWithOverdue": 556,
      "certifiedCounterfactualDecisions": 556,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1995,
      "backToBackAssignments": 1961,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 4.6,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.2302158273381295,
      "starvationRateAcrossCompletedDecisions": 0.06416040100250626,
      "starvationRateAmongCertified": 0.2302158273381295
    },
    {
      "profile": "narrow",
      "format": "Balanced Rating/Elo",
      "completed": 20,
      "varietyCoverageMean": 0.6205128205128205,
      "varietyCoverageMedian": 0.6227106227106226,
      "varietyCoverageStdDev": 0.028524428328105138,
      "varietyCoverageMin": 0.5787545787545788,
      "varietyCoverageMax": 0.6593406593406593,
      "partnerCoverageMean": 0.4241758241758243,
      "partnerCoverageStdDev": 0.013186813186813178,
      "opponentCoverageMean": 0.643956043956044,
      "opponentCoverageStdDev": 0.03076923076923077,
      "courtmateCoverageMean": 0.7934065934065935,
      "courtmateCoverageStdDev": 0.043625128002811514,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0.9571428571428571,
      "completedMixedMatchesMean": 12.2,
      "completedOwnSideMatchesMean": 7.8,
      "first100OwnSideMatchesMean": 42.4,
      "last100OwnSideMatchesMean": 45.2,
      "relationshipEntropyMean": 0.7722840069829681,
      "matchTypeEntropyMean": 0.8750419559355841,
      "normalizedEntropyMean": 0.7979734942211222,
      "backToBackRateMean": 0.24848484848484848,
      "maxAssignmentRestGapMean": 4.2,
      "maxAssignmentRestGapWorst": 5,
      "meanAssignmentRestGapMean": 1.4666666666666668,
      "p95AssignmentRestGapMean": 3.8,
      "starvationInterventions": 4,
      "decisionsWithOverdue": 20,
      "certifiedCounterfactualDecisions": 20,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 95,
      "backToBackAssignments": 82,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2.4,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.2,
      "starvationRateAcrossCompletedDecisions": 0.042105263157894736,
      "starvationRateAmongCertified": 0.2
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
      "completedMixedMatchesMean": 226.2,
      "completedOwnSideMatchesMean": 173.8,
      "first100OwnSideMatchesMean": 42.4,
      "last100OwnSideMatchesMean": 45.2,
      "relationshipEntropyMean": 0.9742859952639767,
      "matchTypeEntropyMean": 0.9871723540400961,
      "normalizedEntropyMean": 0.9775075849580068,
      "backToBackRateMean": 0.24817150063051704,
      "maxAssignmentRestGapMean": 5.8,
      "maxAssignmentRestGapWorst": 7,
      "meanAssignmentRestGapMean": 1.496595208070618,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 126,
      "decisionsWithOverdue": 562,
      "certifiedCounterfactualDecisions": 562,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1995,
      "backToBackAssignments": 1968,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 4.6,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.22419928825622776,
      "starvationRateAcrossCompletedDecisions": 0.06315789473684211,
      "starvationRateAmongCertified": 0.22419928825622776
    },
    {
      "profile": "wide",
      "format": "Balanced Points",
      "completed": 20,
      "varietyCoverageMean": 0.6117216117216118,
      "varietyCoverageMedian": 0.6263736263736263,
      "varietyCoverageStdDev": 0.023359128778643483,
      "varietyCoverageMin": 0.5787545787545787,
      "varietyCoverageMax": 0.6300366300366301,
      "partnerCoverageMean": 0.402930402930403,
      "partnerCoverageStdDev": 0.005180269459242074,
      "opponentCoverageMean": 0.6373626373626373,
      "opponentCoverageStdDev": 0.031081616755452686,
      "courtmateCoverageMean": 0.794871794871795,
      "courtmateCoverageStdDev": 0.04144215567393686,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 1,
      "completedMixedMatchesMean": 11,
      "completedOwnSideMatchesMean": 9,
      "first100OwnSideMatchesMean": 40,
      "last100OwnSideMatchesMean": 44,
      "relationshipEntropyMean": 0.7632326375297261,
      "matchTypeEntropyMean": 0.9280671902111468,
      "normalizedEntropyMean": 0.8044412757000812,
      "backToBackRateMean": 0.25252525252525254,
      "maxAssignmentRestGapMean": 4.333333333333333,
      "maxAssignmentRestGapWorst": 5,
      "meanAssignmentRestGapMean": 1.3838383838383839,
      "p95AssignmentRestGapMean": 3.6666666666666665,
      "starvationInterventions": 2,
      "decisionsWithOverdue": 10,
      "certifiedCounterfactualDecisions": 10,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 57,
      "backToBackAssignments": 50,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2.3333333333333335,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.2,
      "starvationRateAcrossCompletedDecisions": 0.03508771929824561,
      "starvationRateAmongCertified": 0.2
    },
    {
      "profile": "wide",
      "format": "Balanced Points",
      "completed": 400,
      "varietyCoverageMean": 0.9853479853479854,
      "varietyCoverageMedian": 0.9853479853479854,
      "varietyCoverageStdDev": 0,
      "varietyCoverageMin": 0.9853479853479854,
      "varietyCoverageMax": 0.9853479853479854,
      "partnerCoverageMean": 0.9560439560439562,
      "partnerCoverageStdDev": 0,
      "opponentCoverageMean": 1,
      "opponentCoverageStdDev": 0,
      "courtmateCoverageMean": 1,
      "courtmateCoverageStdDev": 0,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 1,
      "completedMixedMatchesMean": 227.66666666666666,
      "completedOwnSideMatchesMean": 172.33333333333334,
      "first100OwnSideMatchesMean": 40,
      "last100OwnSideMatchesMean": 44,
      "relationshipEntropyMean": 0.959461036862217,
      "matchTypeEntropyMean": 0.9854202875057233,
      "normalizedEntropyMean": 0.965950849523094,
      "backToBackRateMean": 0.2562000840689365,
      "maxAssignmentRestGapMean": 6.666666666666667,
      "maxAssignmentRestGapWorst": 8,
      "meanAssignmentRestGapMean": 1.4991593106347203,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 73,
      "decisionsWithOverdue": 324,
      "certifiedCounterfactualDecisions": 324,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1197,
      "backToBackAssignments": 1219,
      "checkpointFairnessSpreadMean": 1.3333333333333333,
      "maximumFairnessSpreadMean": 5,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.22530864197530864,
      "starvationRateAcrossCompletedDecisions": 0.06098579782790309,
      "starvationRateAmongCertified": 0.22530864197530864
    },
    {
      "profile": "wide",
      "format": "Balanced Rating/Elo",
      "completed": 20,
      "varietyCoverageMean": 0.6031746031746031,
      "varietyCoverageMedian": 0.6043956043956044,
      "varietyCoverageStdDev": 0.01945955732662907,
      "varietyCoverageMin": 0.5787545787545787,
      "varietyCoverageMax": 0.6263736263736263,
      "partnerCoverageMean": 0.37362637362637363,
      "partnerCoverageStdDev": 0.023738976917244928,
      "opponentCoverageMean": 0.6153846153846153,
      "opponentCoverageStdDev": 0.008972489900304696,
      "courtmateCoverageMean": 0.8205128205128206,
      "courtmateCoverageStdDev": 0.03151034896352617,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 1,
      "completedMixedMatchesMean": 13.333333333333334,
      "completedOwnSideMatchesMean": 6.666666666666667,
      "first100OwnSideMatchesMean": 39,
      "last100OwnSideMatchesMean": 42.333333333333336,
      "relationshipEntropyMean": 0.7491854786337201,
      "matchTypeEntropyMean": 0.8575141197658088,
      "normalizedEntropyMean": 0.7762676389167423,
      "backToBackRateMean": 0.2626262626262626,
      "maxAssignmentRestGapMean": 4,
      "maxAssignmentRestGapWorst": 4,
      "meanAssignmentRestGapMean": 1.3686868686868687,
      "p95AssignmentRestGapMean": 3.3333333333333335,
      "starvationInterventions": 3,
      "decisionsWithOverdue": 9,
      "certifiedCounterfactualDecisions": 9,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 57,
      "backToBackAssignments": 52,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2.3333333333333335,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.3333333333333333,
      "starvationRateAcrossCompletedDecisions": 0.05263157894736842,
      "starvationRateAmongCertified": 0.3333333333333333
    },
    {
      "profile": "wide",
      "format": "Balanced Rating/Elo",
      "completed": 400,
      "varietyCoverageMean": 0.9560439560439562,
      "varietyCoverageMedian": 0.9560439560439562,
      "varietyCoverageStdDev": 0,
      "varietyCoverageMin": 0.9560439560439562,
      "varietyCoverageMax": 0.9560439560439562,
      "partnerCoverageMean": 0.8901098901098902,
      "partnerCoverageStdDev": 1.1102230246251565e-16,
      "opponentCoverageMean": 0.9780219780219781,
      "opponentCoverageStdDev": 0,
      "courtmateCoverageMean": 1,
      "courtmateCoverageStdDev": 0,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 1,
      "completedMixedMatchesMean": 229.66666666666666,
      "completedOwnSideMatchesMean": 170.33333333333334,
      "first100OwnSideMatchesMean": 39,
      "last100OwnSideMatchesMean": 42.333333333333336,
      "relationshipEntropyMean": 0.9429751247085664,
      "matchTypeEntropyMean": 0.9829440146837664,
      "normalizedEntropyMean": 0.9529673472023666,
      "backToBackRateMean": 0.2650273224043716,
      "maxAssignmentRestGapMean": 5.666666666666667,
      "maxAssignmentRestGapWorst": 6,
      "meanAssignmentRestGapMean": 1.4991593106347203,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 86,
      "decisionsWithOverdue": 333,
      "certifiedCounterfactualDecisions": 333,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1197,
      "backToBackAssignments": 1261,
      "checkpointFairnessSpreadMean": 1.3333333333333333,
      "maximumFairnessSpreadMean": 5,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.25825825825825827,
      "starvationRateAcrossCompletedDecisions": 0.07184628237259816,
      "starvationRateAmongCertified": 0.25825825825825827
    }
  ]
}
```

## Seed-to-seed coverage variation (population SD)

| Profile | Format | Completed | Relationship VCS mean ± SD | Median | Min–max | Partner SD | Opponent SD | Courtmate SD |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| narrow | Social | 20 | 62.1% ± 3.0% | 62.3% | 57.1%–65.9% | 1.5% | 3.4% | 4.4% |
| narrow | Social | 400 | 100.0% ± 0.0% | 100.0% | 100.0%–100.0% | 0.0% | 0.0% | 0.0% |
| narrow | Balanced Points | 20 | 62.1% ± 3.0% | 62.3% | 57.1%–65.9% | 1.5% | 3.4% | 4.4% |
| narrow | Balanced Points | 400 | 100.0% ± 0.0% | 100.0% | 100.0%–100.0% | 0.0% | 0.0% | 0.0% |
| narrow | Balanced Rating/Elo | 20 | 62.1% ± 2.9% | 62.3% | 57.9%–65.9% | 1.3% | 3.1% | 4.4% |
| narrow | Balanced Rating/Elo | 400 | 100.0% ± 0.0% | 100.0% | 100.0%–100.0% | 0.0% | 0.0% | 0.0% |
| wide | Balanced Points | 20 | 61.2% ± 2.3% | 62.6% | 57.9%–63.0% | 0.5% | 3.1% | 4.1% |
| wide | Balanced Points | 400 | 98.5% ± 0.0% | 98.5% | 98.5%–98.5% | 0.0% | 0.0% | 0.0% |
| wide | Balanced Rating/Elo | 20 | 60.3% ± 1.9% | 60.4% | 57.9%–62.6% | 2.4% | 0.9% | 3.2% |
| wide | Balanced Rating/Elo | 400 | 95.6% ± 0.0% | 95.6% | 95.6%–95.6% | 0.0% | 0.0% | 0.0% |

## Completed ≥5-rest gaps by cohort

| Profile | Format | Count | Fairness / legality | Starvation | Balance envelope | Replay allowance | Combined entropy | Soft cadence | Later tie | Linked prior rest-zero replay |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| narrow | Social | 67 | 61 | 0 | 0 | 0 | 6 | 0 | 0 | 21 |
| narrow | Balanced Points | 75 | 68 | 0 | 0 | 0 | 7 | 0 | 0 | 24 |
| narrow | Balanced Rating/Elo | 77 | 71 | 0 | 0 | 0 | 6 | 0 | 0 | 26 |
| wide | Balanced Points | 41 | 39 | 0 | 0 | 0 | 2 | 0 | 0 | 13 |
| wide | Balanced Rating/Elo | 38 | 33 | 1 | 2 | 0 | 2 | 0 | 0 | 6 |

The wait stage columns identify the first active selection layer that lacked a candidate including the deferred player: fairness/legal availability, starvation, balance envelope, frozen replay allowance, combined entropy, soft cadence, or a later tie. Candidate gains and chosen sets/rest vectors are recorded per refill; these are observed finite-session opportunities, not proof of permanent impossibility.

## Static balance-guardrail dominance for wide skill profile

### Wide Balanced Points: 4 excluded feasible facet-pairs; allowed max gap 1.5.
Exhaustive standard Mixed-legal layout enumeration found minimum single-court gap above that window for every listed pair; these are guardrail-inadmissible for the fixed wide roster and rules.
- P1–P2 partners: minimum gap 2 > 1.5.
- P13–P14 partners: minimum gap 2 > 1.5.
- P6–P7 partners: minimum gap 2 > 1.5.
- P8–P9 partners: minimum gap 2 > 1.5.

### Wide Balanced Rating/Elo: 12 excluded feasible facet-pairs; allowed max gap 30.
Exhaustive standard Mixed-legal layout enumeration found minimum single-court gap above that window for every listed pair; these are guardrail-inadmissible for the fixed wide roster and rules.
- P1–P14 opponents: minimum gap 40 > 30.
- P7–P8 opponents: minimum gap 40 > 30.
- P1–P2 partners: minimum gap 80 > 30.
- P1–P3 partners: minimum gap 40 > 30.
- P1–P8 partners: minimum gap 40 > 30.
- P10–P8 partners: minimum gap 40 > 30.
- P12–P14 partners: minimum gap 40 > 30.
- P13–P14 partners: minimum gap 80 > 30.
- P14–P7 partners: minimum gap 40 > 30.
- P5–P7 partners: minimum gap 40 > 30.
- P6–P7 partners: minimum gap 80 > 30.
- P8–P9 partners: minimum gap 80 > 30.

## Before/after optimizer timing (same narrow cohort)

| Engine | Production decisions | Direct optimizer calls / time | Paired starvation diagnostics | Diagnostic-inclusive time per decision | Search-limit / certification failures |
|---|---:|---:|---:|---:|---:|
| Baseline de0254f84adef7414b512e3d3fd936033d65bef8 | 6000 | 6000 / 149.3 s | none available | 24.88 ms | 0 / 0 |
| Current 7ab071ad0102ff8a2012a267d8cfe796a1f325a8 | 6000 | 4320 / 101.3 s | 1680 wrappers / 64.2 s | 27.58 ms | 0 / 0 |

Both rows cover the same 5 narrow seed(s) × 3 formats × 400 completed matches. On overdue decisions the current wrapper returns the production choice and runs one extra no-starvation search; its total time is included here, so the diagnostic-inclusive current number is a conservative instrumentation cost, not production-only latency. The baseline has no counterfactual API and its intervention count is unknown.
Per-session harness totals including matcher, independent oracle, and report instrumentation were 242.3 s baseline and 241.2 s current; this broader scope is not production-only matcher latency.

## Fixed-wide-profile same-quartet balance proof: Balanced Points

All 4 structurally feasible excluded facet-pairs have a minimum legal Mixed single-court gap above the static envelope window (2 minimum > 1.5); the exhaustive same-quartet layout audit proves these relationships remain guardrail-inadmissible under this fixed profile. Exact pairs: P1–P2 partners (min gap 2), P13–P14 partners (min gap 2), P6–P7 partners (min gap 2), P8–P9 partners (min gap 2). The separate static equal-count two-court audit excludes these same pairs in the opening batch; the same-quartet dominance proof covers subsequent one-court refills. Together this is scoped to the fixed wide strength mapping, standard Mixed legality, a full-roster equal-count class, and no added partition-specific schedule restrictions. It does not extend to changing skills, other availability/history classes, or later multi-court refills.

## Fixed-wide-profile same-quartet balance proof: Balanced Rating/Elo

All 12 structurally feasible excluded facet-pairs have a minimum legal Mixed single-court gap above the static envelope window (40 minimum > 30); the exhaustive same-quartet layout audit proves these relationships remain guardrail-inadmissible under this fixed profile. Exact pairs: P1–P2 partners (min gap 80), P1–P3 partners (min gap 40), P1–P8 partners (min gap 40), P10–P8 partners (min gap 40), P12–P14 partners (min gap 40), P13–P14 partners (min gap 80), P14–P7 partners (min gap 40), P5–P7 partners (min gap 40), P6–P7 partners (min gap 80), P8–P9 partners (min gap 80), P1–P14 opponents (min gap 40), P7–P8 opponents (min gap 40). The separate static equal-count two-court audit excludes these same pairs in the opening batch; the same-quartet dominance proof covers subsequent one-court refills. Together this is scoped to the fixed wide strength mapping, standard Mixed legality, a full-roster equal-count class, and no added partition-specific schedule restrictions. It does not extend to changing skills, other availability/history classes, or later multi-court refills.

## Exact unseen relationship list and traces

### Social narrow seed 1: unseen at 400
All structurally feasible player/facet relationships were observed.

### Balanced Points narrow seed 1: unseen at 400
All structurally feasible player/facet relationships were observed.

### Balanced Rating/Elo narrow seed 1: unseen at 400
All structurally feasible player/facet relationships were observed.

### Social narrow seed 4729: unseen at 400
All structurally feasible player/facet relationships were observed.

### Balanced Points narrow seed 4729: unseen at 400
All structurally feasible player/facet relationships were observed.

### Balanced Rating/Elo narrow seed 4729: unseen at 400
All structurally feasible player/facet relationships were observed.

### Social narrow seed 104729: unseen at 400
All structurally feasible player/facet relationships were observed.

### Balanced Points narrow seed 104729: unseen at 400
All structurally feasible player/facet relationships were observed.

### Balanced Rating/Elo narrow seed 104729: unseen at 400
All structurally feasible player/facet relationships were observed.

### Social narrow seed 130363: unseen at 400
All structurally feasible player/facet relationships were observed.

### Balanced Points narrow seed 130363: unseen at 400
All structurally feasible player/facet relationships were observed.

### Balanced Rating/Elo narrow seed 130363: unseen at 400
All structurally feasible player/facet relationships were observed.

### Social narrow seed 2097593: unseen at 400
All structurally feasible player/facet relationships were observed.

### Balanced Points narrow seed 2097593: unseen at 400
All structurally feasible player/facet relationships were observed.

### Balanced Rating/Elo narrow seed 2097593: unseen at 400
All structurally feasible player/facet relationships were observed.

### Balanced Points narrow: static equal-count, two-court balance exclusions
Static excluded 0 directed entries (0 distinct facet-pairs); Rating ceiling fallback: false.

### Balanced Rating/Elo narrow: static equal-count, two-court balance exclusions
Static excluded 0 directed entries (0 distinct facet-pairs); Rating ceiling fallback: false.

### Balanced Points narrow: static equal-count, two-court balance exclusions
Static excluded 0 directed entries (0 distinct facet-pairs); Rating ceiling fallback: false.

### Balanced Rating/Elo narrow: static equal-count, two-court balance exclusions
Static excluded 0 directed entries (0 distinct facet-pairs); Rating ceiling fallback: false.

### Balanced Points narrow: static equal-count, two-court balance exclusions
Static excluded 0 directed entries (0 distinct facet-pairs); Rating ceiling fallback: false.

### Balanced Rating/Elo narrow: static equal-count, two-court balance exclusions
Static excluded 0 directed entries (0 distinct facet-pairs); Rating ceiling fallback: false.

### Balanced Points narrow: static equal-count, two-court balance exclusions
Static excluded 0 directed entries (0 distinct facet-pairs); Rating ceiling fallback: false.

### Balanced Rating/Elo narrow: static equal-count, two-court balance exclusions
Static excluded 0 directed entries (0 distinct facet-pairs); Rating ceiling fallback: false.

### Balanced Points narrow: static equal-count, two-court balance exclusions
Static excluded 0 directed entries (0 distinct facet-pairs); Rating ceiling fallback: false.

### Balanced Rating/Elo narrow: static equal-count, two-court balance exclusions
Static excluded 0 directed entries (0 distinct facet-pairs); Rating ceiling fallback: false.

### Balanced Points wide: static equal-count, two-court balance exclusions
Static excluded 8 directed entries (4 distinct facet-pairs); Rating ceiling fallback: false.
- P1–P2 partners
- P13–P14 partners
- P6–P7 partners
- P8–P9 partners

### Balanced Rating/Elo wide: static equal-count, two-court balance exclusions
Static excluded 24 directed entries (12 distinct facet-pairs); Rating ceiling fallback: false.
- P1–P2 partners
- P1–P3 partners
- P1–P8 partners
- P10–P8 partners
- P12–P14 partners
- P13–P14 partners
- P14–P7 partners
- P5–P7 partners
- P6–P7 partners
- P8–P9 partners
- P1–P14 opponents
- P7–P8 opponents

### Balanced Points wide: static equal-count, two-court balance exclusions
Static excluded 8 directed entries (4 distinct facet-pairs); Rating ceiling fallback: false.
- P1–P2 partners
- P13–P14 partners
- P6–P7 partners
- P8–P9 partners

### Balanced Rating/Elo wide: static equal-count, two-court balance exclusions
Static excluded 24 directed entries (12 distinct facet-pairs); Rating ceiling fallback: false.
- P1–P2 partners
- P1–P3 partners
- P1–P8 partners
- P10–P8 partners
- P12–P14 partners
- P13–P14 partners
- P14–P7 partners
- P5–P7 partners
- P6–P7 partners
- P8–P9 partners
- P1–P14 opponents
- P7–P8 opponents

### Balanced Points wide: static equal-count, two-court balance exclusions
Static excluded 8 directed entries (4 distinct facet-pairs); Rating ceiling fallback: false.
- P1–P2 partners
- P13–P14 partners
- P6–P7 partners
- P8–P9 partners

### Balanced Rating/Elo wide: static equal-count, two-court balance exclusions
Static excluded 24 directed entries (12 distinct facet-pairs); Rating ceiling fallback: false.
- P1–P2 partners
- P1–P3 partners
- P1–P8 partners
- P10–P8 partners
- P12–P14 partners
- P13–P14 partners
- P14–P7 partners
- P5–P7 partners
- P6–P7 partners
- P8–P9 partners
- P1–P14 opponents
- P7–P8 opponents

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
- wait-narrow-SOCIAL_MIX-4729-P4-37: Social narrow seed 4729, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P12-38: Social narrow seed 4729, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P11-51: Social narrow seed 4729, P11, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-45-court-1, fair alternatives 15, starvation-equivalent 15, balance-admissible 15, smoother 0.
- wait-narrow-SOCIAL_MIX-4729-P13-98: Social narrow seed 4729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P4-107: Social narrow seed 4729, P4, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P1-110: Social narrow seed 4729, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P2-110: Social narrow seed 4729, P2, rest 5, classification starvation_priority, current wait fairness_or_mixed_legality; origin decision-99-court-1, fair alternatives 19, starvation-equivalent 0, balance-admissible 0, smoother 0.
- wait-narrow-SOCIAL_MIX-4729-P10-127: Social narrow seed 4729, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P4-159: Social narrow seed 4729, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P2-166: Social narrow seed 4729, P2, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-155-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-SOCIAL_MIX-4729-P9-166: Social narrow seed 4729, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P13-191: Social narrow seed 4729, P13, rest 5, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P5-212: Social narrow seed 4729, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P13-231: Social narrow seed 4729, P13, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-224-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-SOCIAL_MIX-4729-P4-231: Social narrow seed 4729, P4, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P7-233: Social narrow seed 4729, P7, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P14-233: Social narrow seed 4729, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P5-233: Social narrow seed 4729, P5, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P4-281: Social narrow seed 4729, P4, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-274-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-POINTS-4729-P4-37: Balanced Points narrow seed 4729, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P12-38: Balanced Points narrow seed 4729, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P11-51: Balanced Points narrow seed 4729, P11, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-45-court-1, fair alternatives 15, starvation-equivalent 15, balance-admissible 15, smoother 0.
- wait-narrow-POINTS-4729-P13-98: Balanced Points narrow seed 4729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P4-107: Balanced Points narrow seed 4729, P4, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P1-110: Balanced Points narrow seed 4729, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P2-110: Balanced Points narrow seed 4729, P2, rest 5, classification starvation_priority, current wait fairness_or_mixed_legality; origin decision-99-court-1, fair alternatives 19, starvation-equivalent 0, balance-admissible 0, smoother 0.
- wait-narrow-POINTS-4729-P10-127: Balanced Points narrow seed 4729, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P4-159: Balanced Points narrow seed 4729, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P2-166: Balanced Points narrow seed 4729, P2, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-155-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-POINTS-4729-P9-166: Balanced Points narrow seed 4729, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P13-191: Balanced Points narrow seed 4729, P13, rest 5, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P5-212: Balanced Points narrow seed 4729, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P13-231: Balanced Points narrow seed 4729, P13, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-224-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-POINTS-4729-P4-231: Balanced Points narrow seed 4729, P4, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P7-233: Balanced Points narrow seed 4729, P7, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P14-233: Balanced Points narrow seed 4729, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P5-233: Balanced Points narrow seed 4729, P5, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P4-281: Balanced Points narrow seed 4729, P4, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-274-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-ELO-4729-P7-51: Balanced Rating/Elo narrow seed 4729, P7, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P8-98: Balanced Rating/Elo narrow seed 4729, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P4-107: Balanced Rating/Elo narrow seed 4729, P4, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P1-110: Balanced Rating/Elo narrow seed 4729, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P2-110: Balanced Rating/Elo narrow seed 4729, P2, rest 5, classification starvation_priority, current wait fairness_or_mixed_legality; origin decision-99-court-1, fair alternatives 19, starvation-equivalent 0, balance-admissible 0, smoother 0.
- wait-narrow-ELO-4729-P9-116: Balanced Rating/Elo narrow seed 4729, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P13-127: Balanced Rating/Elo narrow seed 4729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P1-166: Balanced Rating/Elo narrow seed 4729, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P14-166: Balanced Rating/Elo narrow seed 4729, P14, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-155-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-ELO-4729-P8-184: Balanced Rating/Elo narrow seed 4729, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P14-212: Balanced Rating/Elo narrow seed 4729, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P5-231: Balanced Rating/Elo narrow seed 4729, P5, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-224-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-ELO-4729-P8-231: Balanced Rating/Elo narrow seed 4729, P8, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P9-233: Balanced Rating/Elo narrow seed 4729, P9, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P6-233: Balanced Rating/Elo narrow seed 4729, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P4-277: Balanced Rating/Elo narrow seed 4729, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P2-277: Balanced Rating/Elo narrow seed 4729, P2, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-271-court-0, fair alternatives 60, starvation-equivalent 60, balance-admissible 60, smoother 0.
- wait-narrow-ELO-4729-P10-281: Balanced Rating/Elo narrow seed 4729, P10, rest 6, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-274-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-ELO-4729-P4-301: Balanced Rating/Elo narrow seed 4729, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P7-371: Balanced Rating/Elo narrow seed 4729, P7, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-363-court-0, fair alternatives 60, starvation-equivalent 60, balance-admissible 60, smoother 0.
- wait-narrow-ELO-4729-P12-395: Balanced Rating/Elo narrow seed 4729, P12, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-388-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-SOCIAL_MIX-104729-P3-13: Social narrow seed 104729, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P13-54: Social narrow seed 104729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P9-54: Social narrow seed 104729, P9, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-48-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-narrow-SOCIAL_MIX-104729-P6-215: Social narrow seed 104729, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P8-222: Social narrow seed 104729, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P7-227: Social narrow seed 104729, P7, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-218-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-SOCIAL_MIX-104729-P7-257: Social narrow seed 104729, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P2-260: Social narrow seed 104729, P2, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-254-court-1, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-SOCIAL_MIX-104729-P4-294: Social narrow seed 104729, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P13-294: Social narrow seed 104729, P13, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-288-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-POINTS-104729-P3-13: Balanced Points narrow seed 104729, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P13-54: Balanced Points narrow seed 104729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P9-54: Balanced Points narrow seed 104729, P9, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-48-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-narrow-POINTS-104729-P3-215: Balanced Points narrow seed 104729, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P2-215: Balanced Points narrow seed 104729, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P1-222: Balanced Points narrow seed 104729, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P5-222: Balanced Points narrow seed 104729, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P3-227: Balanced Points narrow seed 104729, P3, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-218-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-POINTS-104729-P8-257: Balanced Points narrow seed 104729, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P10-260: Balanced Points narrow seed 104729, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P2-294: Balanced Points narrow seed 104729, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P10-294: Balanced Points narrow seed 104729, P10, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-288-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-POINTS-104729-P7-295: Balanced Points narrow seed 104729, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P4-359: Balanced Points narrow seed 104729, P4, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-353-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-ELO-104729-P3-13: Balanced Rating/Elo narrow seed 104729, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P13-54: Balanced Rating/Elo narrow seed 104729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P9-54: Balanced Rating/Elo narrow seed 104729, P9, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-48-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-narrow-ELO-104729-P3-215: Balanced Rating/Elo narrow seed 104729, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P2-215: Balanced Rating/Elo narrow seed 104729, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P1-222: Balanced Rating/Elo narrow seed 104729, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P5-222: Balanced Rating/Elo narrow seed 104729, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P3-227: Balanced Rating/Elo narrow seed 104729, P3, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-218-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-ELO-104729-P8-257: Balanced Rating/Elo narrow seed 104729, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P10-260: Balanced Rating/Elo narrow seed 104729, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P2-294: Balanced Rating/Elo narrow seed 104729, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P10-294: Balanced Rating/Elo narrow seed 104729, P10, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-288-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-ELO-104729-P7-295: Balanced Rating/Elo narrow seed 104729, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P4-359: Balanced Rating/Elo narrow seed 104729, P4, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-353-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-SOCIAL_MIX-130363-P1-46: Social narrow seed 130363, P1, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-38-court-0, fair alternatives 15, starvation-equivalent 15, balance-admissible 15, smoother 0.
- wait-narrow-SOCIAL_MIX-130363-P3-94: Social narrow seed 130363, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-130363-P1-199: Social narrow seed 130363, P1, rest 5, classification accepted_plus_one_replay_origin, current wait combined_entropy_priority_exclusion; origin decision-189-court-1, fair alternatives 60, starvation-equivalent 60, balance-admissible 60, smoother 0.
- wait-narrow-SOCIAL_MIX-130363-P2-262: Social narrow seed 130363, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-130363-P5-388: Social narrow seed 130363, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-130363-P1-46: Balanced Points narrow seed 130363, P1, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-38-court-0, fair alternatives 15, starvation-equivalent 15, balance-admissible 15, smoother 0.
- wait-narrow-POINTS-130363-P3-94: Balanced Points narrow seed 130363, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-130363-P1-199: Balanced Points narrow seed 130363, P1, rest 5, classification accepted_plus_one_replay_origin, current wait combined_entropy_priority_exclusion; origin decision-189-court-1, fair alternatives 60, starvation-equivalent 60, balance-admissible 60, smoother 0.
- wait-narrow-POINTS-130363-P2-262: Balanced Points narrow seed 130363, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-130363-P5-388: Balanced Points narrow seed 130363, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-130363-P1-46: Balanced Rating/Elo narrow seed 130363, P1, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-38-court-0, fair alternatives 15, starvation-equivalent 15, balance-admissible 15, smoother 0.
- wait-narrow-ELO-130363-P3-94: Balanced Rating/Elo narrow seed 130363, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-130363-P1-199: Balanced Rating/Elo narrow seed 130363, P1, rest 5, classification accepted_plus_one_replay_origin, current wait combined_entropy_priority_exclusion; origin decision-189-court-1, fair alternatives 60, starvation-equivalent 60, balance-admissible 60, smoother 0.
- wait-narrow-ELO-130363-P2-262: Balanced Rating/Elo narrow seed 130363, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-130363-P5-388: Balanced Rating/Elo narrow seed 130363, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P3-65: Social narrow seed 2097593, P3, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-59-court-0, fair alternatives 15, starvation-equivalent 15, balance-admissible 15, smoother 0.
- wait-narrow-SOCIAL_MIX-2097593-P8-73: Social narrow seed 2097593, P8, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-65-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-SOCIAL_MIX-2097593-P1-74: Social narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P2-74: Social narrow seed 2097593, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P6-74: Social narrow seed 2097593, P6, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-68-court-0, fair alternatives 60, starvation-equivalent 60, balance-admissible 60, smoother 0.
- wait-narrow-SOCIAL_MIX-2097593-P2-88: Social narrow seed 2097593, P2, rest 5, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P10-168: Social narrow seed 2097593, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P5-196: Social narrow seed 2097593, P5, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-190-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-SOCIAL_MIX-2097593-P14-203: Social narrow seed 2097593, P14, rest 7, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-193-court-1, fair alternatives 60, starvation-equivalent 60, balance-admissible 60, smoother 0.
- wait-narrow-SOCIAL_MIX-2097593-P10-203: Social narrow seed 2097593, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P3-203: Social narrow seed 2097593, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P4-204: Social narrow seed 2097593, P4, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-196-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-SOCIAL_MIX-2097593-P13-204: Social narrow seed 2097593, P13, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P1-289: Social narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P5-295: Social narrow seed 2097593, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P5-302: Social narrow seed 2097593, P5, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-296-court-1, fair alternatives 15, starvation-equivalent 15, balance-admissible 15, smoother 0.
- wait-narrow-SOCIAL_MIX-2097593-P8-312: Social narrow seed 2097593, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P5-312: Social narrow seed 2097593, P5, rest 6, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-303-court-1, fair alternatives 15, starvation-equivalent 15, balance-admissible 15, smoother 0.
- wait-narrow-SOCIAL_MIX-2097593-P9-317: Social narrow seed 2097593, P9, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P6-317: Social narrow seed 2097593, P6, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P6-374: Social narrow seed 2097593, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P10-397: Social narrow seed 2097593, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P3-65: Balanced Points narrow seed 2097593, P3, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-59-court-0, fair alternatives 15, starvation-equivalent 15, balance-admissible 15, smoother 0.
- wait-narrow-POINTS-2097593-P8-73: Balanced Points narrow seed 2097593, P8, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-65-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-POINTS-2097593-P1-74: Balanced Points narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P2-74: Balanced Points narrow seed 2097593, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P6-74: Balanced Points narrow seed 2097593, P6, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-68-court-0, fair alternatives 60, starvation-equivalent 60, balance-admissible 60, smoother 0.
- wait-narrow-POINTS-2097593-P3-88: Balanced Points narrow seed 2097593, P3, rest 5, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P6-203: Balanced Points narrow seed 2097593, P6, rest 7, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P14-203: Balanced Points narrow seed 2097593, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P3-203: Balanced Points narrow seed 2097593, P3, rest 7, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P10-204: Balanced Points narrow seed 2097593, P10, rest 6, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-196-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-POINTS-2097593-P7-204: Balanced Points narrow seed 2097593, P7, rest 6, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-196-court-1, fair alternatives 10, starvation-equivalent 10, balance-admissible 10, smoother 0.
- wait-narrow-POINTS-2097593-P13-214: Balanced Points narrow seed 2097593, P13, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-207-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-narrow-POINTS-2097593-P12-220: Balanced Points narrow seed 2097593, P12, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-213-court-0, fair alternatives 10, starvation-equivalent 10, balance-admissible 10, smoother 0.
- wait-narrow-POINTS-2097593-P14-312: Balanced Points narrow seed 2097593, P14, rest 7, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P4-312: Balanced Points narrow seed 2097593, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P10-317: Balanced Points narrow seed 2097593, P10, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P8-317: Balanced Points narrow seed 2097593, P8, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P9-317: Balanced Points narrow seed 2097593, P9, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P4-322: Balanced Points narrow seed 2097593, P4, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-315-court-1, fair alternatives 60, starvation-equivalent 60, balance-admissible 60, smoother 0.
- wait-narrow-POINTS-2097593-P7-380: Balanced Points narrow seed 2097593, P7, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-374-court-1, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-POINTS-2097593-P1-395: Balanced Points narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P14-399: Balanced Points narrow seed 2097593, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P3-65: Balanced Rating/Elo narrow seed 2097593, P3, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-59-court-0, fair alternatives 15, starvation-equivalent 15, balance-admissible 15, smoother 0.
- wait-narrow-ELO-2097593-P8-73: Balanced Rating/Elo narrow seed 2097593, P8, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-65-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-ELO-2097593-P1-74: Balanced Rating/Elo narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P2-74: Balanced Rating/Elo narrow seed 2097593, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P6-74: Balanced Rating/Elo narrow seed 2097593, P6, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-68-court-0, fair alternatives 60, starvation-equivalent 60, balance-admissible 60, smoother 0.
- wait-narrow-ELO-2097593-P3-88: Balanced Rating/Elo narrow seed 2097593, P3, rest 5, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P6-203: Balanced Rating/Elo narrow seed 2097593, P6, rest 7, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P14-203: Balanced Rating/Elo narrow seed 2097593, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P3-203: Balanced Rating/Elo narrow seed 2097593, P3, rest 7, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P10-204: Balanced Rating/Elo narrow seed 2097593, P10, rest 6, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-196-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-ELO-2097593-P7-204: Balanced Rating/Elo narrow seed 2097593, P7, rest 6, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-196-court-1, fair alternatives 10, starvation-equivalent 10, balance-admissible 10, smoother 0.
- wait-narrow-ELO-2097593-P13-214: Balanced Rating/Elo narrow seed 2097593, P13, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-207-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-narrow-ELO-2097593-P12-220: Balanced Rating/Elo narrow seed 2097593, P12, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-213-court-0, fair alternatives 10, starvation-equivalent 10, balance-admissible 10, smoother 0.
- wait-narrow-ELO-2097593-P14-312: Balanced Rating/Elo narrow seed 2097593, P14, rest 7, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P4-312: Balanced Rating/Elo narrow seed 2097593, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P10-317: Balanced Rating/Elo narrow seed 2097593, P10, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P8-317: Balanced Rating/Elo narrow seed 2097593, P8, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P9-317: Balanced Rating/Elo narrow seed 2097593, P9, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P4-322: Balanced Rating/Elo narrow seed 2097593, P4, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-315-court-1, fair alternatives 60, starvation-equivalent 60, balance-admissible 60, smoother 0.
- wait-narrow-ELO-2097593-P7-380: Balanced Rating/Elo narrow seed 2097593, P7, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-374-court-1, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-ELO-2097593-P1-395: Balanced Rating/Elo narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P14-399: Balanced Rating/Elo narrow seed 2097593, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P7-23: Balanced Points wide seed 30011, P7, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-17-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-wide-POINTS-30011-P10-108: Balanced Points wide seed 30011, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P14-134: Balanced Points wide seed 30011, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P12-191: Balanced Points wide seed 30011, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P8-198: Balanced Points wide seed 30011, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P11-216: Balanced Points wide seed 30011, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P12-275: Balanced Points wide seed 30011, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P2-275: Balanced Points wide seed 30011, P2, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-268-court-1, fair alternatives 10, starvation-equivalent 10, balance-admissible 9, smoother 0.
- wait-wide-POINTS-30011-P1-279: Balanced Points wide seed 30011, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P6-332: Balanced Points wide seed 30011, P6, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P11-338: Balanced Points wide seed 30011, P11, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-332-court-1, fair alternatives 10, starvation-equivalent 10, balance-admissible 6, smoother 0.
- wait-wide-ELO-30011-P2-101: Balanced Rating/Elo wide seed 30011, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-30011-P5-134: Balanced Rating/Elo wide seed 30011, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-30011-P8-143: Balanced Rating/Elo wide seed 30011, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-30011-P11-216: Balanced Rating/Elo wide seed 30011, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-30011-P2-275: Balanced Rating/Elo wide seed 30011, P2, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-268-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 2, smoother 0.
- wait-wide-ELO-30011-P11-279: Balanced Rating/Elo wide seed 30011, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-30011-P7-298: Balanced Rating/Elo wide seed 30011, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-30011-P8-332: Balanced Rating/Elo wide seed 30011, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P13-42: Balanced Points wide seed 65537, P13, rest 6, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-35-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 11, smoother 0.
- wait-wide-POINTS-65537-P6-45: Balanced Points wide seed 65537, P6, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P14-117: Balanced Points wide seed 65537, P14, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-111-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 62, smoother 0.
- wait-wide-POINTS-65537-P1-117: Balanced Points wide seed 65537, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P6-229: Balanced Points wide seed 65537, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P7-235: Balanced Points wide seed 65537, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P6-279: Balanced Points wide seed 65537, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P5-279: Balanced Points wide seed 65537, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P8-280: Balanced Points wide seed 65537, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P2-280: Balanced Points wide seed 65537, P2, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-274-court-0, fair alternatives 10, starvation-equivalent 10, balance-admissible 8, smoother 0.
- wait-wide-POINTS-65537-P11-304: Balanced Points wide seed 65537, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P8-373: Balanced Points wide seed 65537, P8, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-367-court-0, fair alternatives 19, starvation-equivalent 19, balance-admissible 19, smoother 0.
- wait-wide-POINTS-65537-P4-376: Balanced Points wide seed 65537, P4, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-370-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 64, smoother 0.
- wait-wide-ELO-65537-P5-42: Balanced Rating/Elo wide seed 65537, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P2-42: Balanced Rating/Elo wide seed 65537, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P3-45: Balanced Rating/Elo wide seed 65537, P3, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P8-117: Balanced Rating/Elo wide seed 65537, P8, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-111-court-0, fair alternatives 60, starvation-equivalent 60, balance-admissible 43, smoother 0.
- wait-wide-ELO-65537-P1-156: Balanced Rating/Elo wide seed 65537, P1, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-150-court-0, fair alternatives 10, starvation-equivalent 10, balance-admissible 5, smoother 0.
- wait-wide-ELO-65537-P3-186: Balanced Rating/Elo wide seed 65537, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P8-229: Balanced Rating/Elo wide seed 65537, P8, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-223-court-1, fair alternatives 60, starvation-equivalent 60, balance-admissible 32, smoother 0.
- wait-wide-ELO-65537-P13-235: Balanced Rating/Elo wide seed 65537, P13, rest 5, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P10-248: Balanced Rating/Elo wide seed 65537, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P8-258: Balanced Rating/Elo wide seed 65537, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P10-262: Balanced Rating/Elo wide seed 65537, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P1-279: Balanced Rating/Elo wide seed 65537, P1, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-272-court-0, fair alternatives 56, starvation-equivalent 56, balance-admissible 38, smoother 0.
- wait-wide-ELO-65537-P12-280: Balanced Rating/Elo wide seed 65537, P12, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-274-court-0, fair alternatives 10, starvation-equivalent 10, balance-admissible 3, smoother 0.
- wait-wide-ELO-65537-P2-280: Balanced Rating/Elo wide seed 65537, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P7-366: Balanced Rating/Elo wide seed 65537, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P6-373: Balanced Rating/Elo wide seed 65537, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P4-376: Balanced Rating/Elo wide seed 65537, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P7-19: Balanced Points wide seed 999983, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P5-63: Balanced Points wide seed 999983, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P4-169: Balanced Points wide seed 999983, P4, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P1-169: Balanced Points wide seed 999983, P1, rest 6, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-160-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 58, smoother 0.
- wait-wide-POINTS-999983-P13-171: Balanced Points wide seed 999983, P13, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P3-171: Balanced Points wide seed 999983, P3, rest 8, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P7-185: Balanced Points wide seed 999983, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P1-228: Balanced Points wide seed 999983, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P12-248: Balanced Points wide seed 999983, P12, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-240-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-wide-POINTS-999983-P4-249: Balanced Points wide seed 999983, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P1-290: Balanced Points wide seed 999983, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P9-304: Balanced Points wide seed 999983, P9, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-297-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 4, smoother 0.
- wait-wide-POINTS-999983-P13-352: Balanced Points wide seed 999983, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P5-352: Balanced Points wide seed 999983, P5, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-345-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-wide-POINTS-999983-P14-355: Balanced Points wide seed 999983, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P11-373: Balanced Points wide seed 999983, P11, rest 5, classification accepted_plus_one_replay_origin, current wait fairness_or_mixed_legality; origin decision-367-court-1, fair alternatives 19, starvation-equivalent 19, balance-admissible 17, smoother 0.
- wait-wide-POINTS-999983-P14-395: Balanced Points wide seed 999983, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P12-63: Balanced Rating/Elo wide seed 999983, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P6-91: Balanced Rating/Elo wide seed 999983, P6, rest 5, classification balance_guardrail, current wait balance_guardrail; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P4-97: Balanced Rating/Elo wide seed 999983, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P6-169: Balanced Rating/Elo wide seed 999983, P6, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P12-169: Balanced Rating/Elo wide seed 999983, P12, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P13-169: Balanced Rating/Elo wide seed 999983, P13, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P1-171: Balanced Rating/Elo wide seed 999983, P1, rest 6, classification balance_guardrail, current wait balance_guardrail; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P10-171: Balanced Rating/Elo wide seed 999983, P10, rest 6, classification starvation_priority, current wait starvation_priority; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P7-185: Balanced Rating/Elo wide seed 999983, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P11-248: Balanced Rating/Elo wide seed 999983, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P13-290: Balanced Rating/Elo wide seed 999983, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P4-352: Balanced Rating/Elo wide seed 999983, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P14-353: Balanced Rating/Elo wide seed 999983, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.

### Censored at the 400-match checkpoint
None.

### Search and timing scope

- Social narrow seed 1: ordinary optimizer 8937.44 ms; counterfactual wrapper 5078.91 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 19397 ms.
- Balanced Points narrow seed 1: ordinary optimizer 6520.69 ms; counterfactual wrapper 4074.38 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 1467.77 ms; whole harness 17055 ms.
- Balanced Rating/Elo narrow seed 1: ordinary optimizer 6378.02 ms; counterfactual wrapper 4165.73 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 1534.26 ms; whole harness 17112 ms.
- Social narrow seed 4729: ordinary optimizer 7394.34 ms; counterfactual wrapper 4870.67 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 16741 ms.
- Balanced Points narrow seed 4729: ordinary optimizer 6304.60 ms; counterfactual wrapper 3680.06 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 14464 ms.
- Balanced Rating/Elo narrow seed 4729: ordinary optimizer 6122.49 ms; counterfactual wrapper 3849.80 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 14272 ms.
- Social narrow seed 104729: ordinary optimizer 7428.05 ms; counterfactual wrapper 5160.20 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 17609 ms.
- Balanced Points narrow seed 104729: ordinary optimizer 6655.27 ms; counterfactual wrapper 4250.99 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 16233 ms.
- Balanced Rating/Elo narrow seed 104729: ordinary optimizer 6218.90 ms; counterfactual wrapper 3863.77 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 15024 ms.
- Social narrow seed 130363: ordinary optimizer 7257.23 ms; counterfactual wrapper 4609.22 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 16645 ms.
- Balanced Points narrow seed 130363: ordinary optimizer 6287.52 ms; counterfactual wrapper 3710.47 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 14824 ms.
- Balanced Rating/Elo narrow seed 130363: ordinary optimizer 6218.46 ms; counterfactual wrapper 3704.72 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 14754 ms.
- Social narrow seed 2097593: ordinary optimizer 7114.86 ms; counterfactual wrapper 5243.24 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 17188 ms.
- Balanced Points narrow seed 2097593: ordinary optimizer 6288.30 ms; counterfactual wrapper 3964.11 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 15024 ms.
- Balanced Rating/Elo narrow seed 2097593: ordinary optimizer 6160.63 ms; counterfactual wrapper 3939.59 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 14892 ms.
- Balanced Points wide seed 30011: ordinary optimizer 4770.67 ms; counterfactual wrapper 3371.39 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 1184.65 ms; whole harness 13406 ms.
- Balanced Rating/Elo wide seed 30011: ordinary optimizer 3768.71 ms; counterfactual wrapper 3100.14 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 964.28 ms; whole harness 11459 ms.
- Balanced Points wide seed 65537: ordinary optimizer 4806.03 ms; counterfactual wrapper 3016.05 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 11712 ms.
- Balanced Rating/Elo wide seed 65537: ordinary optimizer 3774.97 ms; counterfactual wrapper 2741.57 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 9965 ms.
- Balanced Points wide seed 999983: ordinary optimizer 4760.53 ms; counterfactual wrapper 3110.78 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 11911 ms.
- Balanced Rating/Elo wide seed 999983: ordinary optimizer 3880.86 ms; counterfactual wrapper 2584.18 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 9874 ms.

## Compact human-readable checkpoint summary

| Profile | Format | Completed | VCS | Partner / opponent / courtmate | MIXED / OWN_SIDE player coverage | Completed MIXED / OWN_SIDE | First100 / last100 OWN_SIDE | Entropy people / type / all | B2B | Worst max / mean of per-seed maxima / mean / p95 assignment rest | Starvation changed / overdue / all completed |
|---|---|---:|---:|---|---|---:|---:|---|---:|---|---|
| narrow | Social | 20 | 62.1% | 42.2% / 64.4% / 79.8% | 100.0% / 95.7% | 12.2 / 7.8 | first100 OWN_SIDE 42.2 / last100 43.8 | 77.2% / 87.4% / 79.8% | 24.5% | 5.00 / 4.20 / 1.47 / 3.80 | 3 / 19 / 95 (15.8% / 3.2%; certified 15.8%; unknown 0) |
| narrow | Social | 400 | 100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 224.8 / 175.2 | first100 OWN_SIDE 42.2 / last100 43.8 | 97.4% / 98.9% / 97.8% | 24.9% | 7.00 / 5.80 / 1.50 / 4.00 | 137 / 558 / 1995 (24.6% / 6.9%; certified 24.6%; unknown 0) |
| narrow | Balanced Points | 20 | 62.1% | 42.2% / 64.4% / 79.8% | 100.0% / 95.7% | 12.2 / 7.8 | first100 OWN_SIDE 42.0 / last100 44.8 | 77.2% / 87.4% / 79.8% | 24.5% | 5.00 / 4.20 / 1.47 / 3.80 | 3 / 19 / 95 (15.8% / 3.2%; certified 15.8%; unknown 0) |
| narrow | Balanced Points | 400 | 100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 226.2 / 173.8 | first100 OWN_SIDE 42.0 / last100 44.8 | 97.4% / 98.7% / 97.7% | 24.7% | 7.00 / 5.80 / 1.50 / 4.00 | 128 / 556 / 1995 (23.0% / 6.4%; certified 23.0%; unknown 0) |
| narrow | Balanced Rating/Elo | 20 | 62.1% | 42.4% / 64.4% / 79.3% | 100.0% / 95.7% | 12.2 / 7.8 | first100 OWN_SIDE 42.4 / last100 45.2 | 77.2% / 87.5% / 79.8% | 24.8% | 5.00 / 4.20 / 1.47 / 3.80 | 4 / 20 / 95 (20.0% / 4.2%; certified 20.0%; unknown 0) |
| narrow | Balanced Rating/Elo | 400 | 100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 226.2 / 173.8 | first100 OWN_SIDE 42.4 / last100 45.2 | 97.4% / 98.7% / 97.8% | 24.8% | 7.00 / 5.80 / 1.50 / 4.00 | 126 / 562 / 1995 (22.4% / 6.3%; certified 22.4%; unknown 0) |
| wide | Balanced Points | 20 | 61.2% | 40.3% / 63.7% / 79.5% | 100.0% / 100.0% | 11.0 / 9.0 | first100 OWN_SIDE 40.0 / last100 44.0 | 76.3% / 92.8% / 80.4% | 25.3% | 5.00 / 4.33 / 1.38 / 3.67 | 2 / 10 / 57 (20.0% / 3.5%; certified 20.0%; unknown 0) |
| wide | Balanced Points | 400 | 98.5% | 95.6% / 100.0% / 100.0% | 100.0% / 100.0% | 227.7 / 172.3 | first100 OWN_SIDE 40.0 / last100 44.0 | 95.9% / 98.5% / 96.6% | 25.6% | 8.00 / 6.67 / 1.50 / 4.00 | 73 / 324 / 1197 (22.5% / 6.1%; certified 22.5%; unknown 0) |
| wide | Balanced Rating/Elo | 20 | 60.3% | 37.4% / 61.5% / 82.1% | 100.0% / 100.0% | 13.3 / 6.7 | first100 OWN_SIDE 39.0 / last100 42.3 | 74.9% / 85.8% / 77.6% | 26.3% | 4.00 / 4.00 / 1.37 / 3.33 | 3 / 9 / 57 (33.3% / 5.3%; certified 33.3%; unknown 0) |
| wide | Balanced Rating/Elo | 400 | 95.6% | 89.0% / 97.8% / 100.0% | 100.0% / 100.0% | 229.7 / 170.3 | first100 OWN_SIDE 39.0 / last100 42.3 | 94.3% / 98.3% / 95.3% | 26.5% | 6.00 / 5.67 / 1.50 / 4.00 | 86 / 333 / 1197 (25.8% / 7.2%; certified 25.8%; unknown 0) |
