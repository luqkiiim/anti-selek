# Matchmaking cadence and relationship coverage benchmark

Generated 2026-10-03T11:30:37.987Z; source commit 93262f36336b9533ba96b4e4bec5d7e8061eef6e; policy split-cadence; dirty worktree true. Primary seeds: 1; wide-profile Balanced seeds: 0.
Engine source SHA-256 735b8b7e01f3c3d0c58466b36b315cc6f39ba7a9f7da4c96f242d093f1ca3c21; measurement harness SHA-256 259891ee058ff0ec0bb490e5e2360ec597237af2b63567db19674506808d80ce.

The roster uses the same P1–P14 identities, gender/preference assignments, latent skill ranks, and independent event-level court-completion schedule for every format at a given seed. The narrow profile maps the same rank vector to Points/Social strengths at 0.1 per rank and Rating strengths at 4 per rank; the wide profile maps it at 1 and 40 respectively. `pointDiff` stays 0 because this benchmark has no match scores. Each run has two active courts; one randomly scheduled court completes per event and is refilled. Coverage counts only completed matches. Rest turns count completed-match events while a player is available; active players do not accrue rest. The +1/+2 threshold counters include available idle events before a player's first match; assignment-rest gaps and back-to-back rates exclude first assignments.

Relationship coverage is the mean of each player’s feasible courtmate, partner, and opponent coverage ratios, excluding only empty opportunity facets. It is distinct from normalized Shannon entropy. Match-type coverage is reported separately. Percentages below are seed-level session averages and then mean/median/min/max across seeds.

## Primary narrow-skill profile

| Format | Completed | Relationship coverage (mean; median; min–max) | Partner / opponent / courtmate | MIXED / OWN_SIDE | Normalized entropy | Back-to-back rate | Max assignment rest gap (mean of per-seed maxima) | Mean / p95 assignment rest | +1 / +2 threshold reaches | Starvation changed set | Checkpoint / max fairness spread |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| Social (before → after) | 20 | 58.2%; 58.2%; 58.2%–58.2% | 40.7% / 59.3% / 74.7% | 100.0% / 0.0% | 55.7% | 30.3% → 18.2% | 5.00; 5.00; 5.00–5.00 → 3.00; 3.00; 3.00–3.00 | 1.48; 1.48; 1.48–1.48 / 3.00; 3.00; 3.00–3.00 | 0.0 / 0.0 | 0.0 (n/a) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Social (before → after) | 400 | 84.6%; 84.6%; 84.6%–84.6% | 53.8% / 100.0% / 100.0% | 100.0% / 0.0% | 68.6% | 29.9% → 12.4% | 6.00; 6.00; 6.00–6.00 → 6.00; 6.00; 6.00–6.00 | 1.49; 1.49; 1.49–1.49 / 3.00; 3.00; 3.00–3.00 | 56.0 / 7.0 | 4.0 (9.1%) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |
| Balanced Points (before → after) | 20 | 57.9%; 57.9%; 57.9%–57.9% | 39.6% / 60.4% / 73.6% | 100.0% / 0.0% | 55.2% | 30.3% → 18.2% | 5.00; 5.00; 5.00–5.00 → 4.00; 4.00; 4.00–4.00 | 1.48; 1.48; 1.48–1.48 / 3.00; 3.00; 3.00–3.00 | 1.0 / 0.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Balanced Points (before → after) | 400 | 84.6%; 84.6%; 84.6%–84.6% | 53.8% / 100.0% / 100.0% | 100.0% / 0.0% | 68.6% | 29.9% → 12.4% | 6.00; 6.00; 6.00–6.00 → 6.00; 6.00; 6.00–6.00 | 1.50; 1.50; 1.50–1.50 / 3.00; 3.00; 3.00–3.00 | 67.0 / 6.0 | 7.0 (13.5%) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |
| Balanced Rating/Elo (before → after) | 20 | 58.2%; 58.2%; 58.2%–58.2% | 40.7% / 59.3% / 74.7% | 100.0% / 0.0% | 55.7% | 33.3% → 18.2% | 5.00; 5.00; 5.00–5.00 → 3.00; 3.00; 3.00–3.00 | 1.48; 1.48; 1.48–1.48 / 3.00; 3.00; 3.00–3.00 | 0.0 / 0.0 | 0.0 (n/a) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Balanced Rating/Elo (before → after) | 400 | 84.6%; 84.6%; 84.6%–84.6% | 53.8% / 100.0% / 100.0% | 100.0% / 0.0% | 68.5% | 30.9% → 12.4% | 6.00; 6.00; 6.00–6.00 → 6.00; 6.00; 6.00–6.00 | 1.50; 1.50; 1.50–1.50 / 3.00; 3.00; 3.00–3.00 | 57.0 / 8.0 | 5.0 (11.1%) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |

The table reports after-change coverage/entropy and before→after back-to-back rate and maximum assignment rest gap when a baseline report is supplied. Assignment rest is the completed-match rest-turn count sampled when players are selected; elapsed completion-event gaps are retained as a separate diagnostic and can include time spent in a match. `Starvation changed set` gives mean counterfactual set changes and the rate conditional on an overdue player being available. The fairness columns are checkpoint spread and maximum spread seen over the run. Exact per-seed values and missing relationship lists are in the adjacent JSON.

## Completed match-type counts by session window

These are actual completed matches, not player-level match-type coverage. Early and late refer to the first and last 100 completed matches of each 400-match run.

| Format | At 20 completed: MIXED / OWN_SIDE | At 400 completed: MIXED / OWN_SIDE | First 100 OWN_SIDE | Last 100 OWN_SIDE |
|---|---:|---:|---:|---:|
| Social | 20.0 / 0.0 | 400.0 / 0.0 | 0.0 | 0.0 |
| Balanced Points | 20.0 / 0.0 | 400.0 / 0.0 | 0.0 | 0.0 |
| Balanced Rating/Elo | 20.0 / 0.0 | 400.0 / 0.0 | 0.0 | 0.0 |

## 400-match relationship completion

| Format | Seeds reaching 100% | Remaining structurally feasible relationships | Guardrail interpretation |
|---|---:|---|---|
| Social | 0/1 | 42 total facet-pairs across seeds | No balance guardrail. |
| Balanced Points | 0/1 | 42 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |
| Balanced Rating/Elo | 0/1 | 42 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |

The unseen relationship classification is finite-session evidence: `ever admissible but unchosen`, `in the strongest fair/starvation class but excluded by every observed balance envelope`, or `never in the strongest rotation class during observed refills`. The static balance-feasibility audit is reported separately and can show whether a relationship is structurally possible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.

## Long waits

There were 21 completed assignment gaps of at least five available completed-match rest turns in these runs. Deferred-refill classes: fairness_or_mixed_legality: 21. 0 had a linked immediately preceding rest-zero replay; 0 linked replay origins had a fair/starvation/balance-equivalent set with fewer zero-rest players. 0 later waits had an inclusion candidate on the zero-rest frontier; 0 had inclusion candidates only at a worse zero-rest count. A zero-rest-frontier candidate could still lose on entropy, and this independent oracle does not score entropy; those records indicate an available candidate class, not a matcher mistake. JSON stores selected and candidate IDs plus zero/soft-rest vectors.

## Runtime

Total measured optimizer/oracle time across sessions: 55.5 seconds. Per-run timings are in JSON.

## Machine-readable compact summary

```json
{
  "sourceRevision": "93262f36336b9533ba96b4e4bec5d7e8061eef6e",
  "sourceProvenance": {
    "commitSha": "93262f36336b9533ba96b4e4bec5d7e8061eef6e",
    "workingTreeDirty": true,
    "policyLabel": "split-cadence",
    "engineSourceSha256": "735b8b7e01f3c3d0c58466b36b315cc6f39ba7a9f7da4c96f242d093f1ca3c21",
    "measurementHarnessSha256": "259891ee058ff0ec0bb490e5e2360ec597237af2b63567db19674506808d80ce"
  },
  "primarySeeds": 1,
  "wideSeeds": 0,
  "groups": [
    {
      "profile": "narrow",
      "format": "Social",
      "completed": 20,
      "varietyCoverageMean": 0.5824175824175825,
      "varietyCoverageMedian": 0.5824175824175825,
      "varietyCoverageStdDev": 0,
      "varietyCoverageMin": 0.5824175824175825,
      "varietyCoverageMax": 0.5824175824175825,
      "partnerCoverageMean": 0.40659340659340665,
      "partnerCoverageStdDev": 0,
      "opponentCoverageMean": 0.5934065934065934,
      "opponentCoverageStdDev": 0,
      "courtmateCoverageMean": 0.7472527472527473,
      "courtmateCoverageStdDev": 0,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0,
      "completedMixedMatchesMean": 20,
      "completedOwnSideMatchesMean": 0,
      "first100OwnSideMatchesMean": 0,
      "last100OwnSideMatchesMean": 0,
      "relationshipEntropyMean": 0.7420414763296191,
      "matchTypeEntropyMean": 0,
      "normalizedEntropyMean": 0.5565311072472143,
      "backToBackRateMean": 0.18181818181818182,
      "maxAssignmentRestGapMean": 3,
      "meanAssignmentRestGapMean": 1.4848484848484849,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 0,
      "decisionsWithOverdue": 0,
      "certifiedCounterfactualDecisions": 0,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 19,
      "backToBackAssignments": 12,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": null,
      "starvationRateAcrossCompletedDecisions": 0,
      "starvationRateAmongCertified": null
    },
    {
      "profile": "narrow",
      "format": "Social",
      "completed": 400,
      "varietyCoverageMean": 0.8461538461538461,
      "varietyCoverageMedian": 0.8461538461538461,
      "varietyCoverageStdDev": 0,
      "varietyCoverageMin": 0.8461538461538461,
      "varietyCoverageMax": 0.8461538461538461,
      "partnerCoverageMean": 0.5384615384615384,
      "partnerCoverageStdDev": 0,
      "opponentCoverageMean": 1,
      "opponentCoverageStdDev": 0,
      "courtmateCoverageMean": 1,
      "courtmateCoverageStdDev": 0,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0,
      "completedMixedMatchesMean": 400,
      "completedOwnSideMatchesMean": 0,
      "first100OwnSideMatchesMean": 0,
      "last100OwnSideMatchesMean": 0,
      "relationshipEntropyMean": 0.9140187554091815,
      "matchTypeEntropyMean": 9.15264715375691e-16,
      "normalizedEntropyMean": 0.6855140665568861,
      "backToBackRateMean": 0.1235813366960908,
      "maxAssignmentRestGapMean": 6,
      "meanAssignmentRestGapMean": 1.4943253467843631,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 4,
      "decisionsWithOverdue": 44,
      "certifiedCounterfactualDecisions": 44,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 399,
      "backToBackAssignments": 196,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 5,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.09090909090909091,
      "starvationRateAcrossCompletedDecisions": 0.010025062656641603,
      "starvationRateAmongCertified": 0.09090909090909091
    },
    {
      "profile": "narrow",
      "format": "Balanced Points",
      "completed": 20,
      "varietyCoverageMean": 0.5787545787545787,
      "varietyCoverageMedian": 0.5787545787545787,
      "varietyCoverageStdDev": 0,
      "varietyCoverageMin": 0.5787545787545787,
      "varietyCoverageMax": 0.5787545787545787,
      "partnerCoverageMean": 0.39560439560439564,
      "partnerCoverageStdDev": 0,
      "opponentCoverageMean": 0.6043956043956044,
      "opponentCoverageStdDev": 0,
      "courtmateCoverageMean": 0.7362637362637362,
      "courtmateCoverageStdDev": 0,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0,
      "completedMixedMatchesMean": 20,
      "completedOwnSideMatchesMean": 0,
      "first100OwnSideMatchesMean": 0,
      "last100OwnSideMatchesMean": 0,
      "relationshipEntropyMean": 0.7356042123565938,
      "matchTypeEntropyMean": 0,
      "normalizedEntropyMean": 0.5517031592674454,
      "backToBackRateMean": 0.18181818181818182,
      "maxAssignmentRestGapMean": 4,
      "meanAssignmentRestGapMean": 1.4848484848484849,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 0,
      "decisionsWithOverdue": 1,
      "certifiedCounterfactualDecisions": 1,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 19,
      "backToBackAssignments": 12,
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
      "varietyCoverageMean": 0.8461538461538461,
      "varietyCoverageMedian": 0.8461538461538461,
      "varietyCoverageStdDev": 0,
      "varietyCoverageMin": 0.8461538461538461,
      "varietyCoverageMax": 0.8461538461538461,
      "partnerCoverageMean": 0.5384615384615384,
      "partnerCoverageStdDev": 0,
      "opponentCoverageMean": 1,
      "opponentCoverageStdDev": 0,
      "courtmateCoverageMean": 1,
      "courtmateCoverageStdDev": 0,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0,
      "completedMixedMatchesMean": 400,
      "completedOwnSideMatchesMean": 0,
      "first100OwnSideMatchesMean": 0,
      "last100OwnSideMatchesMean": 0,
      "relationshipEntropyMean": 0.9140458228493988,
      "matchTypeEntropyMean": 9.15264715375691e-16,
      "normalizedEntropyMean": 0.6855343671370492,
      "backToBackRateMean": 0.1235813366960908,
      "maxAssignmentRestGapMean": 6,
      "meanAssignmentRestGapMean": 1.4955863808322825,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 7,
      "decisionsWithOverdue": 52,
      "certifiedCounterfactualDecisions": 52,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 399,
      "backToBackAssignments": 196,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 5,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.1346153846153846,
      "starvationRateAcrossCompletedDecisions": 0.017543859649122806,
      "starvationRateAmongCertified": 0.1346153846153846
    },
    {
      "profile": "narrow",
      "format": "Balanced Rating/Elo",
      "completed": 20,
      "varietyCoverageMean": 0.5824175824175825,
      "varietyCoverageMedian": 0.5824175824175825,
      "varietyCoverageStdDev": 0,
      "varietyCoverageMin": 0.5824175824175825,
      "varietyCoverageMax": 0.5824175824175825,
      "partnerCoverageMean": 0.40659340659340665,
      "partnerCoverageStdDev": 0,
      "opponentCoverageMean": 0.5934065934065934,
      "opponentCoverageStdDev": 0,
      "courtmateCoverageMean": 0.7472527472527472,
      "courtmateCoverageStdDev": 0,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0,
      "completedMixedMatchesMean": 20,
      "completedOwnSideMatchesMean": 0,
      "first100OwnSideMatchesMean": 0,
      "last100OwnSideMatchesMean": 0,
      "relationshipEntropyMean": 0.742041476329619,
      "matchTypeEntropyMean": 0,
      "normalizedEntropyMean": 0.5565311072472142,
      "backToBackRateMean": 0.18181818181818182,
      "maxAssignmentRestGapMean": 3,
      "meanAssignmentRestGapMean": 1.4848484848484849,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 0,
      "decisionsWithOverdue": 0,
      "certifiedCounterfactualDecisions": 0,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 19,
      "backToBackAssignments": 12,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": null,
      "starvationRateAcrossCompletedDecisions": 0,
      "starvationRateAmongCertified": null
    },
    {
      "profile": "narrow",
      "format": "Balanced Rating/Elo",
      "completed": 400,
      "varietyCoverageMean": 0.8461538461538461,
      "varietyCoverageMedian": 0.8461538461538461,
      "varietyCoverageStdDev": 0,
      "varietyCoverageMin": 0.8461538461538461,
      "varietyCoverageMax": 0.8461538461538461,
      "partnerCoverageMean": 0.5384615384615384,
      "partnerCoverageStdDev": 0,
      "opponentCoverageMean": 1,
      "opponentCoverageStdDev": 0,
      "courtmateCoverageMean": 1,
      "courtmateCoverageStdDev": 0,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0,
      "completedMixedMatchesMean": 400,
      "completedOwnSideMatchesMean": 0,
      "first100OwnSideMatchesMean": 0,
      "last100OwnSideMatchesMean": 0,
      "relationshipEntropyMean": 0.9138234954821234,
      "matchTypeEntropyMean": 9.15264715375691e-16,
      "normalizedEntropyMean": 0.6853676216115926,
      "backToBackRateMean": 0.1235813366960908,
      "maxAssignmentRestGapMean": 6,
      "meanAssignmentRestGapMean": 1.4955863808322825,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 5,
      "decisionsWithOverdue": 45,
      "certifiedCounterfactualDecisions": 45,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 399,
      "backToBackAssignments": 196,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 5,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.1111111111111111,
      "starvationRateAcrossCompletedDecisions": 0.012531328320802004,
      "starvationRateAmongCertified": 0.1111111111111111
    }
  ]
}
```

## Seed-to-seed coverage variation (population SD)

| Profile | Format | Completed | Relationship VCS mean ± SD | Median | Min–max | Partner SD | Opponent SD | Courtmate SD |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| narrow | Social | 20 | 58.2% ± 0.0% | 58.2% | 58.2%–58.2% | 0.0% | 0.0% | 0.0% |
| narrow | Social | 400 | 84.6% ± 0.0% | 84.6% | 84.6%–84.6% | 0.0% | 0.0% | 0.0% |
| narrow | Balanced Points | 20 | 57.9% ± 0.0% | 57.9% | 57.9%–57.9% | 0.0% | 0.0% | 0.0% |
| narrow | Balanced Points | 400 | 84.6% ± 0.0% | 84.6% | 84.6%–84.6% | 0.0% | 0.0% | 0.0% |
| narrow | Balanced Rating/Elo | 20 | 58.2% ± 0.0% | 58.2% | 58.2%–58.2% | 0.0% | 0.0% | 0.0% |
| narrow | Balanced Rating/Elo | 400 | 84.6% ± 0.0% | 84.6% | 84.6%–84.6% | 0.0% | 0.0% | 0.0% |

## Completed ≥5-rest gaps by cohort

| Profile | Format | Count | No stronger fair/rotation candidate | Equal-cadence later tie-break | Strictly smoother alternative | Cadence-worse alternative | Linked prior rest-zero replay |
|---|---|---:|---:|---:|---:|---:|---:|
## Exact unseen relationship list and traces

| narrow | Social | 7 | 7 | 0 | 0 | 0 | 0 |
| narrow | Balanced Points | 6 | 6 | 0 | 0 | 0 | 0 |
| narrow | Balanced Rating/Elo | 8 | 8 | 0 | 0 | 0 | 0 |

The fair/rotation column counts episodes with no observed candidate including the player in the stronger fairness class while deferred. Equal-cadence rows have an independently verified fair/starvation/balance-equivalent inclusion candidate with the same cadence vector; the audit does not capture entropy scores, so it does not claim entropy caused the final choice. The exact candidate and chosen sets/rest vectors are in each episode record.

## Static balance-guardrail dominance for wide skill profile

## Before/after optimizer timing (same narrow cohort)

| Engine | Production decisions | Direct optimizer calls / time | Paired starvation diagnostics | Diagnostic-inclusive time per decision | Search-limit / certification failures |
|---|---:|---:|---:|---:|---:|
| Baseline de0254f84adef7414b512e3d3fd936033d65bef8 | 1200 | 1200 / 24.2 s | none available | 20.14 ms | 0 / 0 |
| Current 93262f36336b9533ba96b4e4bec5d7e8061eef6e | 1200 | 1058 / 30.8 s | 142 wrappers / 7.4 s | 31.90 ms | 0 / 0 |

Both rows cover the same five narrow seeds × three formats × 400 completed matches. On overdue decisions the current wrapper returns the production choice and runs one extra no-starvation search; its total time is included here, so the diagnostic-inclusive current number is a conservative instrumentation cost, not production-only latency. The baseline has no counterfactual API and its intervention count is unknown.
Per-session harness totals including matcher, independent oracle, and report instrumentation were 36.6 s baseline and 55.5 s current; this broader scope is not production-only matcher latency.

### Social narrow seed 1: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 138, balance-envelope 138, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 129, balance-envelope 129, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 136, balance-envelope 136, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 130, balance-envelope 130, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 134, balance-envelope 134, cadence-frontier 0.
- P1–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 125, balance-envelope 125, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 138, balance-envelope 138, cadence-frontier 0.
- P10–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 156, balance-envelope 156, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 140, balance-envelope 140, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 146, balance-envelope 146, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 158, balance-envelope 158, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 123, balance-envelope 123, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 160, balance-envelope 160, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 143, balance-envelope 143, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 140, balance-envelope 140, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 154, balance-envelope 154, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 132, balance-envelope 132, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 164, balance-envelope 164, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 169, balance-envelope 169, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 143, balance-envelope 143, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 159, balance-envelope 159, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 121, balance-envelope 121, cadence-frontier 0.
- P14–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 151, balance-envelope 151, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 122, balance-envelope 122, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 157, balance-envelope 157, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 157, balance-envelope 157, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P2–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 157, balance-envelope 157, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 157, balance-envelope 157, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 137, balance-envelope 137, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 134, balance-envelope 134, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 139, balance-envelope 139, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 143, balance-envelope 143, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 154, balance-envelope 154, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 140, balance-envelope 140, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 140, balance-envelope 140, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 136, balance-envelope 136, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 151, balance-envelope 151, cadence-frontier 0.

### Balanced Points narrow seed 1: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 140, balance-envelope 140, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 125, balance-envelope 125, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 155, balance-envelope 155, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.
- P1–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 154, balance-envelope 154, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 150, balance-envelope 150, cadence-frontier 0.
- P10–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 162, balance-envelope 162, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 138, balance-envelope 138, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 122, balance-envelope 122, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 139, balance-envelope 139, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 146, balance-envelope 146, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 164, balance-envelope 164, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 139, balance-envelope 139, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 127, balance-envelope 127, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 129, balance-envelope 129, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 154, balance-envelope 154, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 135, balance-envelope 135, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 133, balance-envelope 133, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 140, balance-envelope 140, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 140, balance-envelope 140, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 130, balance-envelope 130, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P14–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 113, balance-envelope 113, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 136, balance-envelope 136, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 139, balance-envelope 139, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 139, balance-envelope 139, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 167, balance-envelope 167, cadence-frontier 0.
- P2–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 141, balance-envelope 141, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 121, balance-envelope 121, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 146, balance-envelope 146, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 125, balance-envelope 125, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 133, balance-envelope 133, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 131, balance-envelope 131, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 127, balance-envelope 127, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 125, balance-envelope 125, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 158, balance-envelope 158, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 152, balance-envelope 152, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 141, balance-envelope 141, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 119, balance-envelope 119, cadence-frontier 0.

### Balanced Rating/Elo narrow seed 1: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 140, balance-envelope 140, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 140, balance-envelope 140, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 108, balance-envelope 108, cadence-frontier 0.
- P1–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 146, balance-envelope 146, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 137, balance-envelope 137, cadence-frontier 0.
- P10–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 148, balance-envelope 148, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 169, balance-envelope 169, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 144, balance-envelope 144, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 136, balance-envelope 136, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 157, balance-envelope 157, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 122, balance-envelope 122, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 157, balance-envelope 157, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 126, balance-envelope 126, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 138, balance-envelope 138, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 148, balance-envelope 148, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 148, balance-envelope 148, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 125, balance-envelope 125, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 121, balance-envelope 121, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 125, balance-envelope 125, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 163, balance-envelope 163, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 165, balance-envelope 165, cadence-frontier 0.
- P14–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 135, balance-envelope 135, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 141, balance-envelope 141, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 157, balance-envelope 157, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 150, balance-envelope 150, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P2–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 116, balance-envelope 116, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 132, balance-envelope 132, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 151, balance-envelope 151, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 145, balance-envelope 145, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 160, balance-envelope 160, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 144, balance-envelope 144, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 119, balance-envelope 119, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 134, balance-envelope 134, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 133, balance-envelope 133, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 172, balance-envelope 172, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 129, balance-envelope 129, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 146, balance-envelope 146, cadence-frontier 0.

### Balanced Points narrow: static equal-count, two-court balance exclusions
Static excluded 0 directed entries (0 distinct facet-pairs); Rating ceiling fallback: false.

### Balanced Rating/Elo narrow: static equal-count, two-court balance exclusions
Static excluded 0 directed entries (0 distinct facet-pairs); Rating ceiling fallback: false.

### Completed ≥5-rest assignments
- wait-narrow-SOCIAL_MIX-1-P6-51: Social narrow seed 1, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P5-89: Social narrow seed 1, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P10-89: Social narrow seed 1, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P8-92: Social narrow seed 1, P8, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P7-92: Social narrow seed 1, P7, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P9-109: Social narrow seed 1, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P5-109: Social narrow seed 1, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P8-89: Balanced Points narrow seed 1, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P1-89: Balanced Points narrow seed 1, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P11-92: Balanced Points narrow seed 1, P11, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P7-92: Balanced Points narrow seed 1, P7, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P4-109: Balanced Points narrow seed 1, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P13-109: Balanced Points narrow seed 1, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P7-51: Balanced Rating/Elo narrow seed 1, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P8-89: Balanced Rating/Elo narrow seed 1, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P4-89: Balanced Rating/Elo narrow seed 1, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P9-92: Balanced Rating/Elo narrow seed 1, P9, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P6-92: Balanced Rating/Elo narrow seed 1, P6, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P4-109: Balanced Rating/Elo narrow seed 1, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P11-109: Balanced Rating/Elo narrow seed 1, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P5-301: Balanced Rating/Elo narrow seed 1, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.

### Censored at the 400-match checkpoint
None.

### Search and timing scope

- Social narrow seed 1: ordinary optimizer 12256.48 ms; counterfactual wrapper 2856.96 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 19583 ms.
- Balanced Points narrow seed 1: ordinary optimizer 9882.29 ms; counterfactual wrapper 2652.92 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 2395.12 ms; whole harness 19083 ms.
- Balanced Rating/Elo narrow seed 1: ordinary optimizer 8706.75 ms; counterfactual wrapper 1930.16 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 2453.58 ms; whole harness 16794 ms.

## Compact human-readable checkpoint summary

| Profile | Format | Completed | VCS | Partner / opponent / courtmate | MIXED / OWN_SIDE | Entropy people / type / all | B2B | Max / mean / p95 assignment rest | Starvation changed / overdue / all completed |
|---|---|---:|---:|---|---|---|---:|---|---|
| narrow | Social | 20 | 58.2% | 40.7% / 59.3% / 74.7% | 100.0% / 0.0% | 20.0 / 0.0 | first100 OWN_SIDE 0.0 / last100 0.0 | 74.2% / 0.0% / 55.7% | 18.2% | 3.00 / 1.48 / 3.00 | 0 / 0 / 19 (n/a / 0.0%; certified n/a; unknown 0) |
| narrow | Social | 400 | 84.6% | 53.8% / 100.0% / 100.0% | 100.0% / 0.0% | 400.0 / 0.0 | first100 OWN_SIDE 0.0 / last100 0.0 | 91.4% / 0.0% / 68.6% | 12.4% | 6.00 / 1.49 / 3.00 | 4 / 44 / 399 (9.1% / 1.0%; certified 9.1%; unknown 0) |
| narrow | Balanced Points | 20 | 57.9% | 39.6% / 60.4% / 73.6% | 100.0% / 0.0% | 20.0 / 0.0 | first100 OWN_SIDE 0.0 / last100 0.0 | 73.6% / 0.0% / 55.2% | 18.2% | 4.00 / 1.48 / 3.00 | 0 / 1 / 19 (0.0% / 0.0%; certified 0.0%; unknown 0) |
| narrow | Balanced Points | 400 | 84.6% | 53.8% / 100.0% / 100.0% | 100.0% / 0.0% | 400.0 / 0.0 | first100 OWN_SIDE 0.0 / last100 0.0 | 91.4% / 0.0% / 68.6% | 12.4% | 6.00 / 1.50 / 3.00 | 7 / 52 / 399 (13.5% / 1.8%; certified 13.5%; unknown 0) |
| narrow | Balanced Rating/Elo | 20 | 58.2% | 40.7% / 59.3% / 74.7% | 100.0% / 0.0% | 20.0 / 0.0 | first100 OWN_SIDE 0.0 / last100 0.0 | 74.2% / 0.0% / 55.7% | 18.2% | 3.00 / 1.48 / 3.00 | 0 / 0 / 19 (n/a / 0.0%; certified n/a; unknown 0) |
| narrow | Balanced Rating/Elo | 400 | 84.6% | 53.8% / 100.0% / 100.0% | 100.0% / 0.0% | 400.0 / 0.0 | first100 OWN_SIDE 0.0 / last100 0.0 | 91.4% / 0.0% / 68.5% | 12.4% | 6.00 / 1.50 / 3.00 | 5 / 45 / 399 (11.1% / 1.3%; certified 11.1%; unknown 0) |
