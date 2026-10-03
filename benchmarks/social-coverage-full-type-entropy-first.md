# Matchmaking cadence and relationship coverage benchmark

Generated 2026-10-03T13:25:18.800Z; source commit bcf07fb22cded580c7e2c0c72d6a5a58bc4eb49d; policy type-entropy-first; dirty worktree true. Primary seeds: 5; wide-profile Balanced seeds: 3.
Worktree note: Current checkout includes the Mixed type-entropy-first engine and benchmark instrumentation; hashes identify the exact sources used.
Tracked source changes from commit: core engine clean; shared variety clean; measurement harness clean. Generated untracked artifacts can make the overall worktree dirty without changing these tracked source statuses.
Engine source SHA-256 21c2b52a97ec90d86ac60148a3c5443e7074bd44d81f2a9358b13644d92ea643; measurement harness SHA-256 27e22fd7eb48ca8e2d96638583de3c75aa7f064e5c3e3aea136667d44a0599b0.

The roster uses the same P1–P14 identities, gender/preference assignments, latent skill ranks, and independent event-level court-completion schedule for every format at a given seed. The narrow profile maps the same rank vector to Points/Social strengths at 0.1 per rank and Rating strengths at 4 per rank; the wide profile maps it at 1 and 40 respectively. `pointDiff` stays 0 because this benchmark has no match scores. Each run has two active courts; one randomly scheduled court completes per event and is refilled. Coverage counts only completed matches. Rest turns count completed-match events while a player is available; active players do not accrue rest. The +1/+2 threshold counters include available idle events before a player's first match; assignment-rest gaps and back-to-back rates exclude first assignments.

Relationship coverage is the mean of each player’s feasible courtmate, partner, and opponent coverage ratios, excluding only empty opportunity facets. It is distinct from normalized Shannon entropy. Match-type coverage is reported separately. Percentages below are seed-level session averages and then mean/median/min/max across seeds.

## Primary narrow-skill profile

| Format | Completed | Relationship coverage (mean; median; min–max) | Partner / opponent / courtmate | MIXED / OWN_SIDE | Normalized entropy | Back-to-back rate | Max assignment rest gap (mean of per-seed maxima) | Mean / p95 assignment rest | +1 / +2 threshold reaches | Starvation changes / overdue (certified, unknown; rates) | Checkpoint / max fairness spread |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| Social (before → after) | 20 | 58.2%; 57.5%; 54.9%–61.5% | 42.0% / 59.6% / 73.0% | 100.0% / 100.0% | 79.8% | 30.3% → 26.1% | 4.40; 4.00; 4.00–5.00 → 4.20; 4.00; 4.00–5.00 | 1.45; 1.45; 1.41–1.47 / 4.00; 4.00; 4.00–4.00 | 6.0 / 0.2 | 1.6 changes (22 overdue; 22 certified, 0 unknown; overdue 39.0%, certified-only 39.0%) | 1.00; 1.00; 1.00–1.00 / 2.40; 2.00; 2.00–3.00 |
| Social (before → after) | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.3% | 29.5% → 26.3% | 5.80; 6.00; 5.00–7.00 → 5.80; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 150.8 / 15.2 | 32.0 changes (578 overdue; 578 certified, 0 unknown; overdue 27.8%, certified-only 27.8%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Points (before → after) | 20 | 58.2%; 57.5%; 54.9%–61.5% | 42.0% / 59.6% / 73.0% | 100.0% / 100.0% | 79.8% | 30.3% → 26.1% | 4.40; 4.00; 4.00–5.00 → 4.20; 4.00; 4.00–5.00 | 1.45; 1.45; 1.41–1.47 / 4.00; 4.00; 4.00–4.00 | 6.0 / 0.2 | 1.6 changes (22 overdue; 22 certified, 0 unknown; overdue 39.0%, certified-only 39.0%) | 1.00; 1.00; 1.00–1.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Points (before → after) | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.3% | 29.7% → 26.3% | 5.80; 6.00; 5.00–7.00 → 6.00; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 150.8 / 15.2 | 32.0 changes (575 overdue; 575 certified, 0 unknown; overdue 28.0%, certified-only 28.0%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Rating/Elo (before → after) | 20 | 58.4%; 57.5%; 55.7%–61.5% | 42.4% / 59.6% / 73.2% | 100.0% / 100.0% | 80.0% | 30.9% → 25.8% | 4.40; 4.00; 4.00–5.00 → 4.20; 4.00; 4.00–5.00 | 1.45; 1.45; 1.39–1.47 / 4.00; 4.00; 4.00–4.00 | 5.8 / 0.2 | 1.4 changes (21 overdue; 21 certified, 0 unknown; overdue 37.3%, certified-only 37.3%) | 1.00; 1.00; 1.00–1.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Rating/Elo (before → after) | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.3% | 29.8% → 26.6% | 5.80; 6.00; 5.00–7.00 → 6.00; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 151.2 / 15.0 | 33.6 changes (572 overdue; 572 certified, 0 unknown; overdue 29.4%, certified-only 29.4%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |

The table reports after-change coverage/entropy and before→after back-to-back rate and maximum assignment rest gap when a baseline report is supplied. Assignment rest is the completed-match rest-turn count sampled when players are selected; elapsed completion-event gaps are retained as a separate diagnostic and can include time spent in a match. `Starvation changed set` gives mean counterfactual set changes and the rate conditional on an overdue player being available. The fairness columns are checkpoint spread and maximum spread seen over the run. Exact per-seed values and missing relationship lists are in the adjacent JSON.

Decision cohorts: coverage, rest, and match-type checkpoints use completed matches only. Starvation's completed-decision count increments when every assignment in that optimizer decision has completed. Refill/type-override counts at checkpoint N include decisions assigned after completion events 1 through N−1; the latest refill can still be active. The opening two-court decision is excluded from type-override counts.
## Match-type priority overrides

Each override is one certified one-court refill where the chosen set has more immediate replays but higher match-type entropy gain than a legal candidate in the same strongest fairness/starvation class and Balanced envelope. The denominator is certified one-court refills; the opening two-court decision is excluded. Relationship gain is courtmates + partners + opponents, scored independently from match-type gain.

| Format | Overrides / certified refills | Rate | Mean selected match-type gain | Mean selected relationship gain |
|---|---:|---:|---:|---:|
| Social | 577 / 1995 | 28.9% | 0.035080 | 0.087427 |
| Balanced Points | 578 / 1995 | 29.0% | 0.035080 | 0.087437 |
| Balanced Rating/Elo | 589 / 1995 | 29.5% | 0.035080 | 0.087413 |

## Completed match-type counts by session window

These are actual completed matches, not player-level match-type coverage. Early and late refer to the first and last 100 completed matches of each 400-match run.

| Format | At 20 completed: MIXED / OWN_SIDE | At 400 completed: MIXED / OWN_SIDE | First 100 OWN_SIDE | Last 100 OWN_SIDE |
|---|---:|---:|---:|---:|
| Social | 10.8 / 9.2 | 200.8 / 199.2 | 47.4 | 50.2 |
| Balanced Points | 10.8 / 9.2 | 200.8 / 199.2 | 47.4 | 50.2 |
| Balanced Rating/Elo | 10.8 / 9.2 | 200.8 / 199.2 | 47.4 | 51.0 |

## Wide-skill guardrail sensitivity

| Format | Completed | Relationship coverage | Partner / opponent / courtmate | Normalized entropy | Back-to-back rate | Max assignment rest gap | Starvation changes / certified / unknown (rate) | Checkpoint / max fairness spread |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| Balanced Points | 20 | 58.7% | 40.3% / 60.1% / 75.8% | 79.6% | 23.7% | 4.67 | 0.33 / 12 / 0 (6.7%) | 1.00 / 2.33 |
| Balanced Points | 400 | 98.5% | 95.6% / 100.0% / 100.0% | 95.8% | 26.9% | 7.00 | 31.67 / 371 / 0 (25.6%) | 1.33 / 5.00 |
| Balanced Rating/Elo | 20 | 55.3% | 37.0% / 54.6% / 74.4% | 77.3% | 23.2% | 4.33 | 0.33 / 9 / 0 (8.3%) | 1.00 / 2.33 |
| Balanced Rating/Elo | 400 | 95.6% | 89.0% / 97.8% / 100.0% | 94.3% | 28.1% | 6.67 | 31.33 / 361 / 0 (26.0%) | 1.33 / 5.00 |

The wide profile uses the same skill ranks at 10× the narrow strength spread. It is a sensitivity run for balance-envelope restrictions; the primary relationship denominator remains structural and does not shrink to the guardrail.
Static equal-count two-court enumeration excluded 8 directed opportunity records (4 distinct facet-pairs) for wide Balanced Points; the JSON appendix lists the exact pairs.
Static equal-count two-court enumeration excluded 24 directed opportunity records (12 distinct facet-pairs) for wide Balanced Rating/Elo; the JSON appendix lists the exact pairs.

## 400-match relationship completion

| Format | Seeds reaching 100% | Remaining structurally feasible relationships | Guardrail interpretation |
|---|---:|---|---|
| Social | 5/5 | 0 total facet-pairs across seeds | No balance guardrail. |
| Balanced Points | 5/5 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |
| Balanced Rating/Elo | 5/5 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |

The unseen relationship classification is finite-session evidence across successive opportunity layers: balance envelope, match-type entropy frontier, zero-rest frontier, relationship entropy frontier, and soft cadence frontier. The static balance-feasibility audit is reported separately and can show whether a relationship is structurally feasible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.

## Long waits

There were 336 completed assignment gaps of at least five available completed-match rest turns in these runs. Deferred-refill classes: fairness_or_mixed_legality: 290; match_type_entropy_priority_exclusion: 8; relationship_entropy_priority_exclusion: 37; balance_guardrail: 1. 89 had a linked immediately preceding rest-zero replay; 45 linked replay origins had a lower-zero alternative with lower match-type gain, so the chosen replay was an observed type-priority tradeoff. 0 long-wait episodes had no candidate in the minimum-zero frontier after the best type gain. Each wait record stores the type, zero-rest, relationship, and soft-rest frontier evidence and candidate gains.

## Runtime

Total measured optimizer/oracle time across sessions: 271.2 seconds. Per-run timings are in JSON.

## Machine-readable compact summary

```json
{
  "sourceRevision": "bcf07fb22cded580c7e2c0c72d6a5a58bc4eb49d",
  "sourceProvenance": {
    "commitSha": "bcf07fb22cded580c7e2c0c72d6a5a58bc4eb49d",
    "workingTreeDirty": true,
    "workingTreeNote": "Current checkout includes the Mixed type-entropy-first engine and benchmark instrumentation; hashes identify the exact sources used.",
    "policyLabel": "type-entropy-first",
    "coreEngineTrackedDiffPaths": [],
    "sharedVarietyTrackedDiffPaths": [],
    "measurementHarnessTrackedDiffPaths": [],
    "engineSourceSha256": "21c2b52a97ec90d86ac60148a3c5443e7074bd44d81f2a9358b13644d92ea643",
    "measurementHarnessSha256": "27e22fd7eb48ca8e2d96638583de3c75aa7f064e5c3e3aea136667d44a0599b0"
  },
  "primarySeeds": 5,
  "wideSeeds": 3,
  "groups": [
    {
      "profile": "narrow",
      "format": "Social",
      "completed": 20,
      "varietyCoverageMean": 0.5816849816849816,
      "varietyCoverageMedian": 0.575091575091575,
      "varietyCoverageStdDev": 0.02887971185996633,
      "varietyCoverageMin": 0.5494505494505494,
      "varietyCoverageMax": 0.6153846153846153,
      "partnerCoverageMean": 0.4197802197802199,
      "partnerCoverageStdDev": 0.021308482889742124,
      "opponentCoverageMean": 0.5956043956043955,
      "opponentCoverageStdDev": 0.0234661060484204,
      "courtmateCoverageMean": 0.7296703296703297,
      "courtmateCoverageStdDev": 0.05088279957270427,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 1,
      "completedMixedMatchesMean": 10.8,
      "completedOwnSideMatchesMean": 9.2,
      "first100OwnSideMatchesMean": 47.4,
      "last100OwnSideMatchesMean": 50.2,
      "relationshipEntropyMean": 0.7471422135545608,
      "matchTypeEntropyMean": 0.9511301201554817,
      "normalizedEntropyMean": 0.7981391902047911,
      "backToBackRateMean": 0.2606060606060606,
      "maxAssignmentRestGapMean": 4.2,
      "maxAssignmentRestGapWorst": 5,
      "meanAssignmentRestGapMean": 1.4484848484848485,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 8,
      "decisionsWithOverdue": 22,
      "certifiedCounterfactualDecisions": 22,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 95,
      "backToBackAssignments": 86,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2.4,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.36363636363636365,
      "starvationRateAcrossCompletedDecisions": 0.08421052631578947,
      "starvationRateAmongCertified": 0.36363636363636365
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
      "completedMixedMatchesMean": 200.8,
      "completedOwnSideMatchesMean": 199.2,
      "first100OwnSideMatchesMean": 47.4,
      "last100OwnSideMatchesMean": 50.2,
      "relationshipEntropyMean": 0.9636358515629683,
      "matchTypeEntropyMean": 0.9997696277423709,
      "normalizedEntropyMean": 0.9726692956078189,
      "backToBackRateMean": 0.2626733921815889,
      "maxAssignmentRestGapMean": 5.8,
      "maxAssignmentRestGapWorst": 7,
      "meanAssignmentRestGapMean": 1.496595208070618,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 160,
      "decisionsWithOverdue": 578,
      "certifiedCounterfactualDecisions": 578,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1995,
      "backToBackAssignments": 2083,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 4.6,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.2768166089965398,
      "starvationRateAcrossCompletedDecisions": 0.08020050125313283,
      "starvationRateAmongCertified": 0.2768166089965398
    },
    {
      "profile": "narrow",
      "format": "Balanced Points",
      "completed": 20,
      "varietyCoverageMean": 0.5816849816849816,
      "varietyCoverageMedian": 0.575091575091575,
      "varietyCoverageStdDev": 0.02887971185996633,
      "varietyCoverageMin": 0.5494505494505494,
      "varietyCoverageMax": 0.6153846153846153,
      "partnerCoverageMean": 0.4197802197802199,
      "partnerCoverageStdDev": 0.021308482889742124,
      "opponentCoverageMean": 0.5956043956043955,
      "opponentCoverageStdDev": 0.0234661060484204,
      "courtmateCoverageMean": 0.7296703296703297,
      "courtmateCoverageStdDev": 0.05088279957270427,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 1,
      "completedMixedMatchesMean": 10.8,
      "completedOwnSideMatchesMean": 9.2,
      "first100OwnSideMatchesMean": 47.4,
      "last100OwnSideMatchesMean": 50.2,
      "relationshipEntropyMean": 0.7471422135545608,
      "matchTypeEntropyMean": 0.9511301201554817,
      "normalizedEntropyMean": 0.7981391902047911,
      "backToBackRateMean": 0.2606060606060606,
      "maxAssignmentRestGapMean": 4.2,
      "maxAssignmentRestGapWorst": 5,
      "meanAssignmentRestGapMean": 1.4484848484848485,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 8,
      "decisionsWithOverdue": 22,
      "certifiedCounterfactualDecisions": 22,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 95,
      "backToBackAssignments": 86,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2.4,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.36363636363636365,
      "starvationRateAcrossCompletedDecisions": 0.08421052631578947,
      "starvationRateAmongCertified": 0.36363636363636365
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
      "completedMixedMatchesMean": 200.8,
      "completedOwnSideMatchesMean": 199.2,
      "first100OwnSideMatchesMean": 47.4,
      "last100OwnSideMatchesMean": 50.2,
      "relationshipEntropyMean": 0.9637225685075401,
      "matchTypeEntropyMean": 0.999769627742371,
      "normalizedEntropyMean": 0.972734333316248,
      "backToBackRateMean": 0.2630517023959647,
      "maxAssignmentRestGapMean": 6,
      "maxAssignmentRestGapWorst": 7,
      "meanAssignmentRestGapMean": 1.496595208070618,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 160,
      "decisionsWithOverdue": 575,
      "certifiedCounterfactualDecisions": 575,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1995,
      "backToBackAssignments": 2086,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 4.6,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.2782608695652174,
      "starvationRateAcrossCompletedDecisions": 0.08020050125313283,
      "starvationRateAmongCertified": 0.2782608695652174
    },
    {
      "profile": "narrow",
      "format": "Balanced Rating/Elo",
      "completed": 20,
      "varietyCoverageMean": 0.5838827838827838,
      "varietyCoverageMedian": 0.575091575091575,
      "varietyCoverageStdDev": 0.026576347468449852,
      "varietyCoverageMin": 0.5567765567765568,
      "varietyCoverageMax": 0.6153846153846153,
      "partnerCoverageMean": 0.4241758241758243,
      "partnerCoverageStdDev": 0.01644684565614921,
      "opponentCoverageMean": 0.5956043956043955,
      "opponentCoverageStdDev": 0.02346610604842043,
      "courtmateCoverageMean": 0.7318681318681319,
      "courtmateCoverageStdDev": 0.04894737901389031,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 1,
      "completedMixedMatchesMean": 10.8,
      "completedOwnSideMatchesMean": 9.2,
      "first100OwnSideMatchesMean": 47.4,
      "last100OwnSideMatchesMean": 51,
      "relationshipEntropyMean": 0.7496363324265536,
      "matchTypeEntropyMean": 0.9511301201554817,
      "normalizedEntropyMean": 0.8000097793587857,
      "backToBackRateMean": 0.25757575757575757,
      "maxAssignmentRestGapMean": 4.2,
      "maxAssignmentRestGapWorst": 5,
      "meanAssignmentRestGapMean": 1.4454545454545458,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 7,
      "decisionsWithOverdue": 21,
      "certifiedCounterfactualDecisions": 21,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 95,
      "backToBackAssignments": 85,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2.4,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.3333333333333333,
      "starvationRateAcrossCompletedDecisions": 0.07368421052631578,
      "starvationRateAmongCertified": 0.3333333333333333
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
      "completedMixedMatchesMean": 200.8,
      "completedOwnSideMatchesMean": 199.2,
      "first100OwnSideMatchesMean": 47.4,
      "last100OwnSideMatchesMean": 51,
      "relationshipEntropyMean": 0.9635033185882873,
      "matchTypeEntropyMean": 0.9997696277423709,
      "normalizedEntropyMean": 0.9725698958768083,
      "backToBackRateMean": 0.26582597730138713,
      "maxAssignmentRestGapMean": 6,
      "maxAssignmentRestGapWorst": 7,
      "meanAssignmentRestGapMean": 1.496595208070618,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 168,
      "decisionsWithOverdue": 572,
      "certifiedCounterfactualDecisions": 572,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1995,
      "backToBackAssignments": 2108,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 4.6,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.2937062937062937,
      "starvationRateAcrossCompletedDecisions": 0.08421052631578947,
      "starvationRateAmongCertified": 0.2937062937062937
    },
    {
      "profile": "wide",
      "format": "Balanced Points",
      "completed": 20,
      "varietyCoverageMean": 0.5873015873015873,
      "varietyCoverageMedian": 0.586080586080586,
      "varietyCoverageStdDev": 0.013486399288384975,
      "varietyCoverageMin": 0.5714285714285713,
      "varietyCoverageMax": 0.6043956043956044,
      "partnerCoverageMean": 0.402930402930403,
      "partnerCoverageStdDev": 0.013705704713457676,
      "opponentCoverageMean": 0.6007326007326006,
      "opponentCoverageStdDev": 0.018677727156017447,
      "courtmateCoverageMean": 0.7582417582417582,
      "courtmateCoverageStdDev": 0.023738976917244928,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 1,
      "completedMixedMatchesMean": 11.333333333333334,
      "completedOwnSideMatchesMean": 8.666666666666666,
      "first100OwnSideMatchesMean": 48,
      "last100OwnSideMatchesMean": 49.666666666666664,
      "relationshipEntropyMean": 0.7467382542813108,
      "matchTypeEntropyMean": 0.9446585156357165,
      "normalizedEntropyMean": 0.7962183196199124,
      "backToBackRateMean": 0.23737373737373738,
      "maxAssignmentRestGapMean": 4.666666666666667,
      "maxAssignmentRestGapWorst": 5,
      "meanAssignmentRestGapMean": 1.383838383838384,
      "p95AssignmentRestGapMean": 3.6666666666666665,
      "starvationInterventions": 1,
      "decisionsWithOverdue": 12,
      "certifiedCounterfactualDecisions": 12,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 57,
      "backToBackAssignments": 47,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2.3333333333333335,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.08333333333333333,
      "starvationRateAcrossCompletedDecisions": 0.017543859649122806,
      "starvationRateAmongCertified": 0.08333333333333333
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
      "completedMixedMatchesMean": 202.33333333333334,
      "completedOwnSideMatchesMean": 197.66666666666666,
      "first100OwnSideMatchesMean": 48,
      "last100OwnSideMatchesMean": 49.666666666666664,
      "relationshipEntropyMean": 0.9447178990236273,
      "matchTypeEntropyMean": 0.9996895844277157,
      "normalizedEntropyMean": 0.9584608203746496,
      "backToBackRateMean": 0.2688104245481295,
      "maxAssignmentRestGapMean": 7,
      "maxAssignmentRestGapWorst": 8,
      "meanAssignmentRestGapMean": 1.4995796553173601,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 95,
      "decisionsWithOverdue": 371,
      "certifiedCounterfactualDecisions": 371,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1197,
      "backToBackAssignments": 1279,
      "checkpointFairnessSpreadMean": 1.3333333333333333,
      "maximumFairnessSpreadMean": 5,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.2560646900269542,
      "starvationRateAcrossCompletedDecisions": 0.07936507936507936,
      "starvationRateAmongCertified": 0.2560646900269542
    },
    {
      "profile": "wide",
      "format": "Balanced Rating/Elo",
      "completed": 20,
      "varietyCoverageMean": 0.5531135531135531,
      "varietyCoverageMedian": 0.5494505494505495,
      "varietyCoverageStdDev": 0.00791299230574831,
      "varietyCoverageMin": 0.5457875457875457,
      "varietyCoverageMax": 0.5641025641025641,
      "partnerCoverageMean": 0.36996336996337,
      "partnerCoverageStdDev": 0.02884251968502495,
      "opponentCoverageMean": 0.5457875457875457,
      "opponentCoverageStdDev": 0.018677727156017513,
      "courtmateCoverageMean": 0.7435897435897436,
      "courtmateCoverageStdDev": 0.01867772715601756,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 1,
      "completedMixedMatchesMean": 11.333333333333334,
      "completedOwnSideMatchesMean": 8.666666666666666,
      "first100OwnSideMatchesMean": 47.333333333333336,
      "last100OwnSideMatchesMean": 51,
      "relationshipEntropyMean": 0.7162500111393104,
      "matchTypeEntropyMean": 0.9427131783512998,
      "normalizedEntropyMean": 0.7728658029423078,
      "backToBackRateMean": 0.23232323232323235,
      "maxAssignmentRestGapMean": 4.333333333333333,
      "maxAssignmentRestGapWorst": 5,
      "meanAssignmentRestGapMean": 1.3939393939393938,
      "p95AssignmentRestGapMean": 3.6666666666666665,
      "starvationInterventions": 1,
      "decisionsWithOverdue": 9,
      "certifiedCounterfactualDecisions": 9,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 57,
      "backToBackAssignments": 46,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2.3333333333333335,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.1111111111111111,
      "starvationRateAcrossCompletedDecisions": 0.017543859649122806,
      "starvationRateAmongCertified": 0.1111111111111111
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
      "completedMixedMatchesMean": 201.33333333333334,
      "completedOwnSideMatchesMean": 198.66666666666666,
      "first100OwnSideMatchesMean": 47.333333333333336,
      "last100OwnSideMatchesMean": 51,
      "relationshipEntropyMean": 0.9235126420986166,
      "matchTypeEntropyMean": 0.9997422801122838,
      "normalizedEntropyMean": 0.9425700516020337,
      "backToBackRateMean": 0.28100042034468264,
      "maxAssignmentRestGapMean": 6.666666666666667,
      "maxAssignmentRestGapWorst": 8,
      "meanAssignmentRestGapMean": 1.4989491382934006,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 94,
      "decisionsWithOverdue": 361,
      "certifiedCounterfactualDecisions": 361,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1197,
      "backToBackAssignments": 1337,
      "checkpointFairnessSpreadMean": 1.3333333333333333,
      "maximumFairnessSpreadMean": 5,
      "pendingFiveTurnWaits": 1,
      "starvationRateWhenOverdue": 0.26038781163434904,
      "starvationRateAcrossCompletedDecisions": 0.0785296574770259,
      "starvationRateAmongCertified": 0.26038781163434904
    }
  ]
}
```

## Seed-to-seed coverage variation (population SD)

| Profile | Format | Completed | Relationship VCS mean ± SD | Median | Min–max | Partner SD | Opponent SD | Courtmate SD |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| narrow | Social | 20 | 58.2% ± 2.9% | 57.5% | 54.9%–61.5% | 2.1% | 2.3% | 5.1% |
| narrow | Social | 400 | 100.0% ± 0.0% | 100.0% | 100.0%–100.0% | 0.0% | 0.0% | 0.0% |
| narrow | Balanced Points | 20 | 58.2% ± 2.9% | 57.5% | 54.9%–61.5% | 2.1% | 2.3% | 5.1% |
| narrow | Balanced Points | 400 | 100.0% ± 0.0% | 100.0% | 100.0%–100.0% | 0.0% | 0.0% | 0.0% |
| narrow | Balanced Rating/Elo | 20 | 58.4% ± 2.7% | 57.5% | 55.7%–61.5% | 1.6% | 2.3% | 4.9% |
| narrow | Balanced Rating/Elo | 400 | 100.0% ± 0.0% | 100.0% | 100.0%–100.0% | 0.0% | 0.0% | 0.0% |
| wide | Balanced Points | 20 | 58.7% ± 1.3% | 58.6% | 57.1%–60.4% | 1.4% | 1.9% | 2.4% |
| wide | Balanced Points | 400 | 98.5% ± 0.0% | 98.5% | 98.5%–98.5% | 0.0% | 0.0% | 0.0% |
| wide | Balanced Rating/Elo | 20 | 55.3% ± 0.8% | 54.9% | 54.6%–56.4% | 2.9% | 1.9% | 1.9% |
| wide | Balanced Rating/Elo | 400 | 95.6% ± 0.0% | 95.6% | 95.6%–95.6% | 0.0% | 0.0% | 0.0% |

## Completed ≥5-rest gaps by cohort

| Profile | Format | Count | No stronger fair/rotation candidate | Match-type priority | Zero-rest priority | Relationship priority | Soft-rest priority | Linked prior rest-zero replay |
|---|---|---:|---:|---:|---:|---:|---:|---:|
## Exact unseen relationship list and traces

| narrow | Social | 76 | 66 | 2 | 0 | 8 | 0 | 18 |
| narrow | Balanced Points | 76 | 66 | 2 | 0 | 8 | 0 | 18 |
| narrow | Balanced Rating/Elo | 75 | 64 | 2 | 0 | 9 | 0 | 17 |
| wide | Balanced Points | 53 | 46 | 0 | 0 | 7 | 0 | 16 |
| wide | Balanced Rating/Elo | 56 | 48 | 2 | 0 | 5 | 0 | 20 |

The wait stage columns identify the first active selection layer that lacked a candidate including the deferred player: type entropy, zero-rest count, relationship entropy, or soft cadence. Candidate gains and chosen sets/rest vectors are recorded per refill; these are observed finite-session opportunities, not proof of permanent impossibility.

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
| Current bcf07fb22cded580c7e2c0c72d6a5a58bc4eb49d | 6000 | 4269 / 90.7 s | 1731 wrappers / 61.0 s | 25.27 ms | 0 / 0 |

Both rows cover the same five narrow seeds × three formats × 400 completed matches. On overdue decisions the current wrapper returns the production choice and runs one extra no-starvation search; its total time is included here, so the diagnostic-inclusive current number is a conservative instrumentation cost, not production-only latency. The baseline has no counterfactual API and its intervention count is unknown.
Per-session harness totals including matcher, independent oracle, and report instrumentation were 242.3 s baseline and 213.2 s current; this broader scope is not production-only matcher latency.

## Fixed-wide-profile same-quartet balance proof: Balanced Points

All 4 structurally feasible excluded facet-pairs have a minimum legal Mixed single-court gap above the static envelope window (2 minimum > 1.5); the exhaustive same-quartet layout audit proves these relationships remain guardrail-inadmissible under this fixed profile. Exact pairs: P1–P2 partners (min gap 2), P13–P14 partners (min gap 2), P6–P7 partners (min gap 2), P8–P9 partners (min gap 2). The separate static equal-count two-court audit excludes these same pairs in the opening batch; the same-quartet dominance proof covers subsequent one-court refills. Together this is scoped to the fixed wide strength mapping, standard Mixed legality, a full-roster equal-count class, and no added partition-specific schedule restrictions. It does not extend to changing skills, other availability/history classes, or later multi-court refills.

## Fixed-wide-profile same-quartet balance proof: Balanced Rating/Elo

All 12 structurally feasible excluded facet-pairs have a minimum legal Mixed single-court gap above the static envelope window (40 minimum > 30); the exhaustive same-quartet layout audit proves these relationships remain guardrail-inadmissible under this fixed profile. Exact pairs: P1–P2 partners (min gap 80), P1–P3 partners (min gap 40), P1–P8 partners (min gap 40), P10–P8 partners (min gap 40), P12–P14 partners (min gap 40), P13–P14 partners (min gap 80), P14–P7 partners (min gap 40), P5–P7 partners (min gap 40), P6–P7 partners (min gap 80), P8–P9 partners (min gap 80), P1–P14 opponents (min gap 40), P7–P8 opponents (min gap 40). The separate static equal-count two-court audit excludes these same pairs in the opening batch; the same-quartet dominance proof covers subsequent one-court refills. Together this is scoped to the fixed wide strength mapping, standard Mixed legality, a full-roster equal-count class, and no added partition-specific schedule restrictions. It does not extend to changing skills, other availability/history classes, or later multi-court refills.

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
- wait-narrow-SOCIAL_MIX-1-P5-16: Social narrow seed 1, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P1-51: Social narrow seed 1, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P10-53: Social narrow seed 1, P10, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-45-court-1, fair alternatives 19, starvation-equivalent 19, balance-admissible 19, smoother 0.
- wait-narrow-SOCIAL_MIX-1-P11-89: Social narrow seed 1, P11, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P2-89: Social narrow seed 1, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P10-89: Social narrow seed 1, P10, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P14-92: Social narrow seed 1, P14, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P5-92: Social narrow seed 1, P5, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-84-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-SOCIAL_MIX-1-P3-109: Social narrow seed 1, P3, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-103-court-1, fair alternatives 56, starvation-equivalent 56, balance-admissible 56, smoother 0.
- wait-narrow-SOCIAL_MIX-1-P12-109: Social narrow seed 1, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P13-109: Social narrow seed 1, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P10-111: Social narrow seed 1, P10, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-100-court-1, fair alternatives 10, starvation-equivalent 10, balance-admissible 10, smoother 0.
- wait-narrow-SOCIAL_MIX-1-P9-112: Social narrow seed 1, P9, rest 5, classification match_type_entropy_priority_exclusion, current wait match_type_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P6-192: Social narrow seed 1, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P14-216: Social narrow seed 1, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P3-262: Social narrow seed 1, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P12-301: Social narrow seed 1, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P5-16: Balanced Points narrow seed 1, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P1-51: Balanced Points narrow seed 1, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P10-53: Balanced Points narrow seed 1, P10, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-45-court-1, fair alternatives 19, starvation-equivalent 19, balance-admissible 19, smoother 0.
- wait-narrow-POINTS-1-P11-89: Balanced Points narrow seed 1, P11, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P2-89: Balanced Points narrow seed 1, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P10-89: Balanced Points narrow seed 1, P10, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P14-92: Balanced Points narrow seed 1, P14, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P5-92: Balanced Points narrow seed 1, P5, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-84-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-POINTS-1-P3-109: Balanced Points narrow seed 1, P3, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-103-court-1, fair alternatives 56, starvation-equivalent 56, balance-admissible 56, smoother 0.
- wait-narrow-POINTS-1-P12-109: Balanced Points narrow seed 1, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P13-109: Balanced Points narrow seed 1, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P10-111: Balanced Points narrow seed 1, P10, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-100-court-1, fair alternatives 10, starvation-equivalent 10, balance-admissible 10, smoother 0.
- wait-narrow-POINTS-1-P9-112: Balanced Points narrow seed 1, P9, rest 5, classification match_type_entropy_priority_exclusion, current wait match_type_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P6-192: Balanced Points narrow seed 1, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P14-216: Balanced Points narrow seed 1, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P3-262: Balanced Points narrow seed 1, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P12-301: Balanced Points narrow seed 1, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P7-16: Balanced Rating/Elo narrow seed 1, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P12-51: Balanced Rating/Elo narrow seed 1, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P6-53: Balanced Rating/Elo narrow seed 1, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P1-89: Balanced Rating/Elo narrow seed 1, P1, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P5-89: Balanced Rating/Elo narrow seed 1, P5, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P14-89: Balanced Rating/Elo narrow seed 1, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P4-92: Balanced Rating/Elo narrow seed 1, P4, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P12-92: Balanced Rating/Elo narrow seed 1, P12, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-84-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-ELO-1-P3-109: Balanced Rating/Elo narrow seed 1, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P11-109: Balanced Rating/Elo narrow seed 1, P11, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-103-court-1, fair alternatives 56, starvation-equivalent 56, balance-admissible 56, smoother 0.
- wait-narrow-ELO-1-P5-109: Balanced Rating/Elo narrow seed 1, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P6-111: Balanced Rating/Elo narrow seed 1, P6, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-100-court-1, fair alternatives 10, starvation-equivalent 10, balance-admissible 10, smoother 0.
- wait-narrow-ELO-1-P2-112: Balanced Rating/Elo narrow seed 1, P2, rest 5, classification match_type_entropy_priority_exclusion, current wait match_type_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P9-234: Balanced Rating/Elo narrow seed 1, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P10-259: Balanced Rating/Elo narrow seed 1, P10, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P8-301: Balanced Rating/Elo narrow seed 1, P8, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-289-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-SOCIAL_MIX-4729-P2-52: Social narrow seed 4729, P2, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P6-98: Social narrow seed 4729, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P14-98: Social narrow seed 4729, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P5-107: Social narrow seed 4729, P5, rest 6, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P1-110: Social narrow seed 4729, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P6-110: Social narrow seed 4729, P6, rest 5, classification starvation_priority, current wait fairness_or_mixed_legality; origin decision-99-court-1, fair alternatives 19, starvation-equivalent 0, balance-admissible 0, smoother 0.
- wait-narrow-SOCIAL_MIX-4729-P13-116: Social narrow seed 4729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P3-127: Social narrow seed 4729, P3, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-121-court-1, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-SOCIAL_MIX-4729-P2-166: Social narrow seed 4729, P2, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-155-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-SOCIAL_MIX-4729-P12-166: Social narrow seed 4729, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P3-174: Social narrow seed 4729, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P2-191: Social narrow seed 4729, P2, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P11-212: Social narrow seed 4729, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P8-218: Social narrow seed 4729, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P8-231: Social narrow seed 4729, P8, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P2-231: Social narrow seed 4729, P2, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P5-233: Social narrow seed 4729, P5, rest 6, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-222-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-narrow-SOCIAL_MIX-4729-P7-233: Social narrow seed 4729, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P4-233: Social narrow seed 4729, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P5-277: Social narrow seed 4729, P5, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-271-court-0, fair alternatives 60, starvation-equivalent 60, balance-admissible 60, smoother 0.
- wait-narrow-SOCIAL_MIX-4729-P9-281: Social narrow seed 4729, P9, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-274-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-SOCIAL_MIX-4729-P13-360: Social narrow seed 4729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P2-52: Balanced Points narrow seed 4729, P2, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P6-98: Balanced Points narrow seed 4729, P6, rest 7, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P10-98: Balanced Points narrow seed 4729, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P2-107: Balanced Points narrow seed 4729, P2, rest 6, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P5-110: Balanced Points narrow seed 4729, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P6-110: Balanced Points narrow seed 4729, P6, rest 5, classification starvation_priority, current wait fairness_or_mixed_legality; origin decision-99-court-1, fair alternatives 19, starvation-equivalent 0, balance-admissible 0, smoother 0.
- wait-narrow-POINTS-4729-P13-116: Balanced Points narrow seed 4729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P4-127: Balanced Points narrow seed 4729, P4, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-121-court-1, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-POINTS-4729-P12-166: Balanced Points narrow seed 4729, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P4-166: Balanced Points narrow seed 4729, P4, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-155-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-POINTS-4729-P6-174: Balanced Points narrow seed 4729, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P6-184: Balanced Points narrow seed 4729, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P1-191: Balanced Points narrow seed 4729, P1, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P14-212: Balanced Points narrow seed 4729, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P13-218: Balanced Points narrow seed 4729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P12-231: Balanced Points narrow seed 4729, P12, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P2-231: Balanced Points narrow seed 4729, P2, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P1-233: Balanced Points narrow seed 4729, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P7-233: Balanced Points narrow seed 4729, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P6-233: Balanced Points narrow seed 4729, P6, rest 6, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-222-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-narrow-POINTS-4729-P6-277: Balanced Points narrow seed 4729, P6, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-271-court-0, fair alternatives 60, starvation-equivalent 60, balance-admissible 60, smoother 0.
- wait-narrow-POINTS-4729-P8-281: Balanced Points narrow seed 4729, P8, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-274-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-ELO-4729-P14-52: Balanced Rating/Elo narrow seed 4729, P14, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P4-98: Balanced Rating/Elo narrow seed 4729, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P9-98: Balanced Rating/Elo narrow seed 4729, P9, rest 7, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P10-107: Balanced Rating/Elo narrow seed 4729, P10, rest 6, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P13-110: Balanced Rating/Elo narrow seed 4729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P9-110: Balanced Rating/Elo narrow seed 4729, P9, rest 5, classification starvation_priority, current wait fairness_or_mixed_legality; origin decision-99-court-1, fair alternatives 19, starvation-equivalent 0, balance-admissible 0, smoother 0.
- wait-narrow-ELO-4729-P7-116: Balanced Rating/Elo narrow seed 4729, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P8-127: Balanced Rating/Elo narrow seed 4729, P8, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-121-court-1, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-ELO-4729-P5-166: Balanced Rating/Elo narrow seed 4729, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P10-166: Balanced Rating/Elo narrow seed 4729, P10, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-155-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-ELO-4729-P8-174: Balanced Rating/Elo narrow seed 4729, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P9-184: Balanced Rating/Elo narrow seed 4729, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P12-191: Balanced Rating/Elo narrow seed 4729, P12, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P4-212: Balanced Rating/Elo narrow seed 4729, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P7-218: Balanced Rating/Elo narrow seed 4729, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P13-231: Balanced Rating/Elo narrow seed 4729, P13, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P5-231: Balanced Rating/Elo narrow seed 4729, P5, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P12-233: Balanced Rating/Elo narrow seed 4729, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P14-233: Balanced Rating/Elo narrow seed 4729, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P11-233: Balanced Rating/Elo narrow seed 4729, P11, rest 6, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-222-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-narrow-ELO-4729-P13-277: Balanced Rating/Elo narrow seed 4729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P1-281: Balanced Rating/Elo narrow seed 4729, P1, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-274-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-SOCIAL_MIX-104729-P9-165: Social narrow seed 104729, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P8-215: Social narrow seed 104729, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P2-222: Social narrow seed 104729, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P4-227: Social narrow seed 104729, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P1-241: Social narrow seed 104729, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P14-294: Social narrow seed 104729, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P3-294: Social narrow seed 104729, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P8-295: Social narrow seed 104729, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P7-313: Social narrow seed 104729, P7, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-305-court-1, fair alternatives 19, starvation-equivalent 19, balance-admissible 19, smoother 0.
- wait-narrow-SOCIAL_MIX-104729-P9-333: Social narrow seed 104729, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P14-165: Balanced Points narrow seed 104729, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P9-215: Balanced Points narrow seed 104729, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P5-222: Balanced Points narrow seed 104729, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P2-227: Balanced Points narrow seed 104729, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P4-241: Balanced Points narrow seed 104729, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P13-294: Balanced Points narrow seed 104729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P6-294: Balanced Points narrow seed 104729, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P8-295: Balanced Points narrow seed 104729, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P1-313: Balanced Points narrow seed 104729, P1, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-305-court-1, fair alternatives 19, starvation-equivalent 19, balance-admissible 19, smoother 0.
- wait-narrow-POINTS-104729-P14-333: Balanced Points narrow seed 104729, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P14-165: Balanced Rating/Elo narrow seed 104729, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P9-215: Balanced Rating/Elo narrow seed 104729, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P5-222: Balanced Rating/Elo narrow seed 104729, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P2-227: Balanced Rating/Elo narrow seed 104729, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P4-241: Balanced Rating/Elo narrow seed 104729, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P13-294: Balanced Rating/Elo narrow seed 104729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P6-294: Balanced Rating/Elo narrow seed 104729, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P8-295: Balanced Rating/Elo narrow seed 104729, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P1-313: Balanced Rating/Elo narrow seed 104729, P1, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-305-court-1, fair alternatives 19, starvation-equivalent 19, balance-admissible 19, smoother 0.
- wait-narrow-ELO-104729-P14-333: Balanced Rating/Elo narrow seed 104729, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-130363-P4-63: Social narrow seed 130363, P4, rest 5, classification type_entropy_priority_override, current wait match_type_entropy_priority_exclusion; origin decision-56-court-1, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-narrow-SOCIAL_MIX-130363-P3-262: Social narrow seed 130363, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-130363-P8-291: Social narrow seed 130363, P8, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-130363-P14-350: Social narrow seed 130363, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-130363-P3-394: Social narrow seed 130363, P3, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-388-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-POINTS-130363-P4-63: Balanced Points narrow seed 130363, P4, rest 5, classification type_entropy_priority_override, current wait match_type_entropy_priority_exclusion; origin decision-56-court-1, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-narrow-POINTS-130363-P3-262: Balanced Points narrow seed 130363, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-130363-P8-291: Balanced Points narrow seed 130363, P8, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-130363-P14-350: Balanced Points narrow seed 130363, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-130363-P3-394: Balanced Points narrow seed 130363, P3, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-388-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-ELO-130363-P4-63: Balanced Rating/Elo narrow seed 130363, P4, rest 5, classification type_entropy_priority_override, current wait match_type_entropy_priority_exclusion; origin decision-56-court-1, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-narrow-ELO-130363-P3-262: Balanced Rating/Elo narrow seed 130363, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-130363-P8-291: Balanced Rating/Elo narrow seed 130363, P8, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-130363-P14-350: Balanced Rating/Elo narrow seed 130363, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-130363-P3-394: Balanced Rating/Elo narrow seed 130363, P3, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-388-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-SOCIAL_MIX-2097593-P4-45: Social narrow seed 2097593, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P13-65: Social narrow seed 2097593, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P1-65: Social narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P2-74: Social narrow seed 2097593, P2, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-68-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-narrow-SOCIAL_MIX-2097593-P9-74: Social narrow seed 2097593, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P7-203: Social narrow seed 2097593, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P13-203: Social narrow seed 2097593, P13, rest 7, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P8-203: Social narrow seed 2097593, P8, rest 7, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P11-204: Social narrow seed 2097593, P11, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P4-204: Social narrow seed 2097593, P4, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-196-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-SOCIAL_MIX-2097593-P8-295: Social narrow seed 2097593, P8, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-289-court-1, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-SOCIAL_MIX-2097593-P4-301: Social narrow seed 2097593, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P7-302: Social narrow seed 2097593, P7, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P1-312: Social narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P8-312: Social narrow seed 2097593, P8, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P9-317: Social narrow seed 2097593, P9, rest 6, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P14-317: Social narrow seed 2097593, P14, rest 6, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P13-317: Social narrow seed 2097593, P13, rest 6, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P1-322: Social narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P13-394: Social narrow seed 2097593, P13, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P2-395: Social narrow seed 2097593, P2, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-386-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-SOCIAL_MIX-2097593-P6-399: Social narrow seed 2097593, P6, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-390-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-narrow-POINTS-2097593-P4-45: Balanced Points narrow seed 2097593, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P13-65: Balanced Points narrow seed 2097593, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P1-65: Balanced Points narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P2-74: Balanced Points narrow seed 2097593, P2, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-68-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-narrow-POINTS-2097593-P9-74: Balanced Points narrow seed 2097593, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P7-203: Balanced Points narrow seed 2097593, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P13-203: Balanced Points narrow seed 2097593, P13, rest 7, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P8-203: Balanced Points narrow seed 2097593, P8, rest 7, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P11-204: Balanced Points narrow seed 2097593, P11, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P4-204: Balanced Points narrow seed 2097593, P4, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-196-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-POINTS-2097593-P8-295: Balanced Points narrow seed 2097593, P8, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-289-court-1, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-POINTS-2097593-P4-301: Balanced Points narrow seed 2097593, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P7-302: Balanced Points narrow seed 2097593, P7, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P1-312: Balanced Points narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P8-312: Balanced Points narrow seed 2097593, P8, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P9-317: Balanced Points narrow seed 2097593, P9, rest 6, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P14-317: Balanced Points narrow seed 2097593, P14, rest 6, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P13-317: Balanced Points narrow seed 2097593, P13, rest 6, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P1-322: Balanced Points narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P13-394: Balanced Points narrow seed 2097593, P13, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P2-395: Balanced Points narrow seed 2097593, P2, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-386-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-POINTS-2097593-P6-399: Balanced Points narrow seed 2097593, P6, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-390-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-narrow-ELO-2097593-P4-45: Balanced Rating/Elo narrow seed 2097593, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P13-65: Balanced Rating/Elo narrow seed 2097593, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P1-65: Balanced Rating/Elo narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P2-74: Balanced Rating/Elo narrow seed 2097593, P2, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-68-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-narrow-ELO-2097593-P9-74: Balanced Rating/Elo narrow seed 2097593, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P7-203: Balanced Rating/Elo narrow seed 2097593, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P13-203: Balanced Rating/Elo narrow seed 2097593, P13, rest 7, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P8-203: Balanced Rating/Elo narrow seed 2097593, P8, rest 7, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P11-204: Balanced Rating/Elo narrow seed 2097593, P11, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P4-204: Balanced Rating/Elo narrow seed 2097593, P4, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-196-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-ELO-2097593-P8-295: Balanced Rating/Elo narrow seed 2097593, P8, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-289-court-1, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-ELO-2097593-P4-301: Balanced Rating/Elo narrow seed 2097593, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P7-302: Balanced Rating/Elo narrow seed 2097593, P7, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P1-312: Balanced Rating/Elo narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P8-312: Balanced Rating/Elo narrow seed 2097593, P8, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P9-317: Balanced Rating/Elo narrow seed 2097593, P9, rest 6, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P14-317: Balanced Rating/Elo narrow seed 2097593, P14, rest 6, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P13-317: Balanced Rating/Elo narrow seed 2097593, P13, rest 6, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P1-322: Balanced Rating/Elo narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P13-394: Balanced Rating/Elo narrow seed 2097593, P13, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P2-395: Balanced Rating/Elo narrow seed 2097593, P2, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-386-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-ELO-2097593-P6-399: Balanced Rating/Elo narrow seed 2097593, P6, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-390-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-wide-POINTS-30011-P3-17: Balanced Points wide seed 30011, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P1-134: Balanced Points wide seed 30011, P1, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-128-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 11, smoother 0.
- wait-wide-POINTS-30011-P9-135: Balanced Points wide seed 30011, P9, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P5-143: Balanced Points wide seed 30011, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P12-198: Balanced Points wide seed 30011, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P4-198: Balanced Points wide seed 30011, P4, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P4-218: Balanced Points wide seed 30011, P4, rest 6, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P4-275: Balanced Points wide seed 30011, P4, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-268-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-wide-POINTS-30011-P12-279: Balanced Points wide seed 30011, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P8-339: Balanced Points wide seed 30011, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P1-369: Balanced Points wide seed 30011, P1, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-361-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 66, smoother 0.
- wait-wide-POINTS-30011-P12-384: Balanced Points wide seed 30011, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-30011-P1-44: Balanced Rating/Elo wide seed 30011, P1, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-34-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 47, smoother 0.
- wait-wide-ELO-30011-P1-62: Balanced Rating/Elo wide seed 30011, P1, rest 5, classification balance_guardrail, current wait balance_guardrail; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-30011-P4-134: Balanced Rating/Elo wide seed 30011, P4, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-128-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 5, smoother 0.
- wait-wide-ELO-30011-P6-143: Balanced Rating/Elo wide seed 30011, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-30011-P7-165: Balanced Rating/Elo wide seed 30011, P7, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-30011-P2-198: Balanced Rating/Elo wide seed 30011, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-30011-P10-198: Balanced Rating/Elo wide seed 30011, P10, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-30011-P5-218: Balanced Rating/Elo wide seed 30011, P5, rest 6, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-30011-P13-275: Balanced Rating/Elo wide seed 30011, P13, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-268-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 4, smoother 0.
- wait-wide-ELO-30011-P1-279: Balanced Rating/Elo wide seed 30011, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-30011-P14-304: Balanced Rating/Elo wide seed 30011, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-30011-P12-331: Balanced Rating/Elo wide seed 30011, P12, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-325-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 6, smoother 0.
- wait-wide-ELO-30011-P1-384: Balanced Rating/Elo wide seed 30011, P1, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-378-court-0, fair alternatives 60, starvation-equivalent 60, balance-admissible 37, smoother 0.
- wait-wide-POINTS-65537-P4-42: Balanced Points wide seed 65537, P4, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-35-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 11, smoother 0.
- wait-wide-POINTS-65537-P2-42: Balanced Points wide seed 65537, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P3-42: Balanced Points wide seed 65537, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P10-45: Balanced Points wide seed 65537, P10, rest 7, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P2-114: Balanced Points wide seed 65537, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P1-185: Balanced Points wide seed 65537, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P3-229: Balanced Points wide seed 65537, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P7-229: Balanced Points wide seed 65537, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P12-248: Balanced Points wide seed 65537, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P10-258: Balanced Points wide seed 65537, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P14-262: Balanced Points wide seed 65537, P14, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-255-court-0, fair alternatives 15, starvation-equivalent 15, balance-admissible 15, smoother 0.
- wait-wide-POINTS-65537-P7-279: Balanced Points wide seed 65537, P7, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-272-court-0, fair alternatives 56, starvation-equivalent 56, balance-admissible 56, smoother 0.
- wait-wide-POINTS-65537-P14-280: Balanced Points wide seed 65537, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P2-280: Balanced Points wide seed 65537, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P1-304: Balanced Points wide seed 65537, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P1-366: Balanced Points wide seed 65537, P1, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-360-court-0, fair alternatives 19, starvation-equivalent 19, balance-admissible 17, smoother 0.
- wait-wide-POINTS-65537-P14-373: Balanced Points wide seed 65537, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P7-373: Balanced Points wide seed 65537, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P1-376: Balanced Points wide seed 65537, P1, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-370-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 60, smoother 0.
- wait-wide-POINTS-65537-P8-388: Balanced Points wide seed 65537, P8, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P3-42: Balanced Rating/Elo wide seed 65537, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P4-42: Balanced Rating/Elo wide seed 65537, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P5-42: Balanced Rating/Elo wide seed 65537, P5, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-35-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 7, smoother 0.
- wait-wide-ELO-65537-P2-74: Balanced Rating/Elo wide seed 65537, P2, rest 5, classification match_type_entropy_priority_exclusion, current wait match_type_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P8-114: Balanced Rating/Elo wide seed 65537, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P9-117: Balanced Rating/Elo wide seed 65537, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P1-229: Balanced Rating/Elo wide seed 65537, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P4-229: Balanced Rating/Elo wide seed 65537, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P14-253: Balanced Rating/Elo wide seed 65537, P14, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-241-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 5, smoother 0.
- wait-wide-ELO-65537-P7-258: Balanced Rating/Elo wide seed 65537, P7, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-251-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 33, smoother 0.
- wait-wide-ELO-65537-P5-258: Balanced Rating/Elo wide seed 65537, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P2-279: Balanced Rating/Elo wide seed 65537, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P3-279: Balanced Rating/Elo wide seed 65537, P3, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-272-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 31, smoother 0.
- wait-wide-ELO-65537-P7-279: Balanced Rating/Elo wide seed 65537, P7, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-272-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 34, smoother 0.
- wait-wide-ELO-65537-P5-280: Balanced Rating/Elo wide seed 65537, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P8-280: Balanced Rating/Elo wide seed 65537, P8, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-274-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 5, smoother 0.
- wait-wide-ELO-65537-P13-359: Balanced Rating/Elo wide seed 65537, P13, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-353-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 5, smoother 0.
- wait-wide-ELO-65537-P12-366: Balanced Rating/Elo wide seed 65537, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P7-373: Balanced Rating/Elo wide seed 65537, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P12-376: Balanced Rating/Elo wide seed 65537, P12, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-370-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 37, smoother 0.
- wait-wide-POINTS-999983-P3-19: Balanced Points wide seed 999983, P3, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P14-32: Balanced Points wide seed 999983, P14, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-24-court-1, fair alternatives 15, starvation-equivalent 15, balance-admissible 15, smoother 0.
- wait-wide-POINTS-999983-P11-63: Balanced Points wide seed 999983, P11, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-56-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 53, smoother 0.
- wait-wide-POINTS-999983-P9-119: Balanced Points wide seed 999983, P9, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-112-court-1, fair alternatives 60, starvation-equivalent 60, balance-admissible 57, smoother 0.
- wait-wide-POINTS-999983-P3-137: Balanced Points wide seed 999983, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P10-166: Balanced Points wide seed 999983, P10, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-157-court-0, fair alternatives 12, starvation-equivalent 12, balance-admissible 7, smoother 0.
- wait-wide-POINTS-999983-P1-169: Balanced Points wide seed 999983, P1, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P5-169: Balanced Points wide seed 999983, P5, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P9-171: Balanced Points wide seed 999983, P9, rest 6, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P4-171: Balanced Points wide seed 999983, P4, rest 8, classification type_entropy_priority_override, current wait relationship_entropy_priority_exclusion; origin decision-160-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 58, smoother 0.
- wait-wide-POINTS-999983-P5-185: Balanced Points wide seed 999983, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P1-209: Balanced Points wide seed 999983, P1, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-203-court-1, fair alternatives 60, starvation-equivalent 60, balance-admissible 54, smoother 0.
- wait-wide-POINTS-999983-P8-248: Balanced Points wide seed 999983, P8, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-240-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-wide-POINTS-999983-P2-249: Balanced Points wide seed 999983, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P6-263: Balanced Points wide seed 999983, P6, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P12-273: Balanced Points wide seed 999983, P12, rest 5, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P3-319: Balanced Points wide seed 999983, P3, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-310-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 4, smoother 0.
- wait-wide-POINTS-999983-P10-345: Balanced Points wide seed 999983, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P11-352: Balanced Points wide seed 999983, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P1-355: Balanced Points wide seed 999983, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P10-373: Balanced Points wide seed 999983, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P13-19: Balanced Rating/Elo wide seed 999983, P13, rest 5, classification type_entropy_priority_override, current wait relationship_entropy_priority_exclusion; origin decision-11-court-1, fair alternatives 19, starvation-equivalent 19, balance-admissible 8, smoother 0.
- wait-wide-ELO-999983-P14-32: Balanced Rating/Elo wide seed 999983, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P3-49: Balanced Rating/Elo wide seed 999983, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P7-119: Balanced Rating/Elo wide seed 999983, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P6-129: Balanced Rating/Elo wide seed 999983, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P8-169: Balanced Rating/Elo wide seed 999983, P8, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P12-169: Balanced Rating/Elo wide seed 999983, P12, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P1-171: Balanced Rating/Elo wide seed 999983, P1, rest 6, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P11-171: Balanced Rating/Elo wide seed 999983, P11, rest 8, classification type_entropy_priority_override, current wait match_type_entropy_priority_exclusion; origin decision-160-court-0, fair alternatives 66, starvation-equivalent 66, balance-admissible 31, smoother 0.
- wait-wide-ELO-999983-P2-185: Balanced Rating/Elo wide seed 999983, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P8-209: Balanced Rating/Elo wide seed 999983, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P6-248: Balanced Rating/Elo wide seed 999983, P6, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-240-court-0, fair alternatives 6, starvation-equivalent 6, balance-admissible 2, smoother 0.
- wait-wide-ELO-999983-P13-248: Balanced Rating/Elo wide seed 999983, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P12-249: Balanced Rating/Elo wide seed 999983, P12, rest 6, classification relationship_entropy_priority_exclusion, current wait relationship_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P14-273: Balanced Rating/Elo wide seed 999983, P14, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-266-court-1, fair alternatives 66, starvation-equivalent 66, balance-admissible 40, smoother 0.
- wait-wide-ELO-999983-P4-286: Balanced Rating/Elo wide seed 999983, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P4-297: Balanced Rating/Elo wide seed 999983, P4, rest 5, classification type_entropy_priority_override, current wait fairness_or_mixed_legality; origin decision-291-court-1, fair alternatives 15, starvation-equivalent 15, balance-admissible 9, smoother 0.
- wait-wide-ELO-999983-P13-319: Balanced Rating/Elo wide seed 999983, P13, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-310-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 4, smoother 0.
- wait-wide-ELO-999983-P3-352: Balanced Rating/Elo wide seed 999983, P3, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-345-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 2, smoother 0.
- wait-wide-ELO-999983-P8-355: Balanced Rating/Elo wide seed 999983, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P6-373: Balanced Rating/Elo wide seed 999983, P6, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P1-381: Balanced Rating/Elo wide seed 999983, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P13-395: Balanced Rating/Elo wide seed 999983, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.

### Censored at the 400-match checkpoint
- Balanced Rating/Elo wide seed 999983: P3 still available at rest 5, origin decision-395-court-0.

### Search and timing scope

- Social narrow seed 1: ordinary optimizer 7497.47 ms; counterfactual wrapper 5273.98 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 17165 ms.
- Balanced Points narrow seed 1: ordinary optimizer 5655.90 ms; counterfactual wrapper 4049.04 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 1442.09 ms; whole harness 15121 ms.
- Balanced Rating/Elo narrow seed 1: ordinary optimizer 6071.59 ms; counterfactual wrapper 4181.30 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 1524.78 ms; whole harness 16068 ms.
- Social narrow seed 4729: ordinary optimizer 7798.38 ms; counterfactual wrapper 5765.26 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 18016 ms.
- Balanced Points narrow seed 4729: ordinary optimizer 6022.77 ms; counterfactual wrapper 4018.93 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 13935 ms.
- Balanced Rating/Elo narrow seed 4729: ordinary optimizer 5298.69 ms; counterfactual wrapper 3512.67 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 12197 ms.
- Social narrow seed 104729: ordinary optimizer 6266.02 ms; counterfactual wrapper 4524.57 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 14615 ms.
- Balanced Points narrow seed 104729: ordinary optimizer 5382.97 ms; counterfactual wrapper 3420.16 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 12531 ms.
- Balanced Rating/Elo narrow seed 104729: ordinary optimizer 5485.86 ms; counterfactual wrapper 3744.68 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 13317 ms.
- Social narrow seed 130363: ordinary optimizer 6353.33 ms; counterfactual wrapper 4021.60 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 14041 ms.
- Balanced Points narrow seed 130363: ordinary optimizer 5575.53 ms; counterfactual wrapper 3288.76 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 12628 ms.
- Balanced Rating/Elo narrow seed 130363: ordinary optimizer 5490.53 ms; counterfactual wrapper 3236.13 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 12456 ms.
- Social narrow seed 2097593: ordinary optimizer 6850.80 ms; counterfactual wrapper 4895.98 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 15699 ms.
- Balanced Points narrow seed 2097593: ordinary optimizer 5533.86 ms; counterfactual wrapper 3618.51 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 12947 ms.
- Balanced Rating/Elo narrow seed 2097593: ordinary optimizer 5371.03 ms; counterfactual wrapper 3406.57 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 12436 ms.
- Balanced Points wide seed 30011: ordinary optimizer 4070.31 ms; counterfactual wrapper 3379.46 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 1190.78 ms; whole harness 11768 ms.
- Balanced Rating/Elo wide seed 30011: ordinary optimizer 3109.72 ms; counterfactual wrapper 2584.51 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 1007.11 ms; whole harness 9372 ms.
- Balanced Points wide seed 65537: ordinary optimizer 3806.82 ms; counterfactual wrapper 3092.45 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 9904 ms.
- Balanced Rating/Elo wide seed 65537: ordinary optimizer 3160.77 ms; counterfactual wrapper 2584.17 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 8410 ms.
- Balanced Points wide seed 999983: ordinary optimizer 3927.03 ms; counterfactual wrapper 3025.54 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 10137 ms.
- Balanced Rating/Elo wide seed 999983: ordinary optimizer 3220.48 ms; counterfactual wrapper 2529.46 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 8468 ms.

## Compact human-readable checkpoint summary

| Profile | Format | Completed | VCS | Partner / opponent / courtmate | MIXED / OWN_SIDE player coverage | Completed MIXED / OWN_SIDE | First100 / last100 OWN_SIDE | Entropy people / type / all | B2B | Worst max / mean of per-seed maxima / mean / p95 assignment rest | Starvation changed / overdue / all completed |
|---|---|---:|---:|---|---|---:|---:|---|---:|---|---|
| narrow | Social | 20 | 58.2% | 42.0% / 59.6% / 73.0% | 100.0% / 100.0% | 10.8 / 9.2 | first100 OWN_SIDE 47.4 / last100 50.2 | 74.7% / 95.1% / 79.8% | 26.1% | 5.00 / 4.20 / 1.45 / 4.00 | 8 / 22 / 95 (36.4% / 8.4%; certified 36.4%; unknown 0) |
| narrow | Social | 400 | 100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 200.8 / 199.2 | first100 OWN_SIDE 47.4 / last100 50.2 | 96.4% / 100.0% / 97.3% | 26.3% | 7.00 / 5.80 / 1.50 / 4.00 | 160 / 578 / 1995 (27.7% / 8.0%; certified 27.7%; unknown 0) |
| narrow | Balanced Points | 20 | 58.2% | 42.0% / 59.6% / 73.0% | 100.0% / 100.0% | 10.8 / 9.2 | first100 OWN_SIDE 47.4 / last100 50.2 | 74.7% / 95.1% / 79.8% | 26.1% | 5.00 / 4.20 / 1.45 / 4.00 | 8 / 22 / 95 (36.4% / 8.4%; certified 36.4%; unknown 0) |
| narrow | Balanced Points | 400 | 100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 200.8 / 199.2 | first100 OWN_SIDE 47.4 / last100 50.2 | 96.4% / 100.0% / 97.3% | 26.3% | 7.00 / 6.00 / 1.50 / 4.00 | 160 / 575 / 1995 (27.8% / 8.0%; certified 27.8%; unknown 0) |
| narrow | Balanced Rating/Elo | 20 | 58.4% | 42.4% / 59.6% / 73.2% | 100.0% / 100.0% | 10.8 / 9.2 | first100 OWN_SIDE 47.4 / last100 51.0 | 75.0% / 95.1% / 80.0% | 25.8% | 5.00 / 4.20 / 1.45 / 4.00 | 7 / 21 / 95 (33.3% / 7.4%; certified 33.3%; unknown 0) |
| narrow | Balanced Rating/Elo | 400 | 100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 200.8 / 199.2 | first100 OWN_SIDE 47.4 / last100 51.0 | 96.4% / 100.0% / 97.3% | 26.6% | 7.00 / 6.00 / 1.50 / 4.00 | 168 / 572 / 1995 (29.4% / 8.4%; certified 29.4%; unknown 0) |
| wide | Balanced Points | 20 | 58.7% | 40.3% / 60.1% / 75.8% | 100.0% / 100.0% | 11.3 / 8.7 | first100 OWN_SIDE 48.0 / last100 49.7 | 74.7% / 94.5% / 79.6% | 23.7% | 5.00 / 4.67 / 1.38 / 3.67 | 1 / 12 / 57 (8.3% / 1.8%; certified 8.3%; unknown 0) |
| wide | Balanced Points | 400 | 98.5% | 95.6% / 100.0% / 100.0% | 100.0% / 100.0% | 202.3 / 197.7 | first100 OWN_SIDE 48.0 / last100 49.7 | 94.5% / 100.0% / 95.8% | 26.9% | 8.00 / 7.00 / 1.50 / 4.00 | 95 / 371 / 1197 (25.6% / 7.9%; certified 25.6%; unknown 0) |
| wide | Balanced Rating/Elo | 20 | 55.3% | 37.0% / 54.6% / 74.4% | 100.0% / 100.0% | 11.3 / 8.7 | first100 OWN_SIDE 47.3 / last100 51.0 | 71.6% / 94.3% / 77.3% | 23.2% | 5.00 / 4.33 / 1.39 / 3.67 | 1 / 9 / 57 (11.1% / 1.8%; certified 11.1%; unknown 0) |
| wide | Balanced Rating/Elo | 400 | 95.6% | 89.0% / 97.8% / 100.0% | 100.0% / 100.0% | 201.3 / 198.7 | first100 OWN_SIDE 47.3 / last100 51.0 | 92.4% / 100.0% / 94.3% | 28.1% | 8.00 / 6.67 / 1.50 / 4.00 | 94 / 361 / 1197 (26.0% / 7.9%; certified 26.0%; unknown 0) |
