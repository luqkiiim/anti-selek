# Matchmaking cadence and relationship coverage benchmark

Generated 2026-10-03T08:47:14.814Z; source revision HEAD de0254f8 + working-tree changes. Primary seeds: 5; wide-profile Balanced seeds: 3.

The roster uses the same P1–P14 identities, gender/preference assignments, latent skill ranks, and independent event-level court-completion schedule for every format at a given seed. The narrow profile maps the same rank vector to Points/Social strengths at 0.1 per rank and Rating strengths at 4 per rank; the wide profile maps it at 1 and 40 respectively. `pointDiff` stays 0 because this benchmark has no match scores. Each run has two active courts; one randomly scheduled court completes per event and is refilled. Coverage counts only completed matches. Rest turns count completed-match events while a player is available; active players do not accrue rest. The +1/+2 threshold counters include available idle events before a player's first match; assignment-rest gaps and back-to-back rates exclude first assignments.

Relationship coverage is the mean of each player’s feasible courtmate, partner, and opponent coverage ratios, excluding only empty opportunity facets. It is distinct from normalized Shannon entropy. Match-type coverage is reported separately. Percentages below are seed-level session averages and then mean/median/min/max across seeds.

## Primary narrow-skill profile

| Format | Completed | Relationship coverage (mean; median; min–max) | Partner / opponent / courtmate | MIXED / OWN_SIDE | Normalized entropy | Back-to-back rate | Max assignment rest gap (mean of per-seed maxima) | Mean / p95 assignment rest | +1 / +2 threshold reaches | Starvation changed set | Checkpoint / max fairness spread |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| Social (before → after) | 20 | 56.3%; 57.9%; 50.5%–59.0% | 37.1% / 58.9% / 73.0% | 100.0% / 11.4% | 55.8% | 30.3% → 11.8% | 4.40; 4.00; 4.00–5.00 → 3.00; 3.00; 2.00–4.00 | 1.48; 1.48; 1.48–1.48 / 3.00; 3.00; 2.00–4.00 | 0.8 / 0.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 2.40; 2.00; 2.00–3.00 |
| Social (before → after) | 400 | 84.9%; 84.6%; 84.6%–86.1% | 54.7% / 100.0% / 100.0% | 100.0% / 11.4% | 68.7% | 29.5% → 12.6% | 5.80; 6.00; 5.00–7.00 → 5.40; 6.00; 4.00–6.00 | 1.50; 1.50; 1.50–1.50 / 3.00; 3.00; 3.00–3.00 | 28.4 / 5.2 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Points (before → after) | 20 | 56.0%; 56.4%; 49.8%–59.0% | 37.6% / 58.0% / 72.3% | 100.0% / 11.4% | 55.8% | 30.3% → 11.8% | 4.40; 4.00; 4.00–5.00 → 3.00; 3.00; 2.00–4.00 | 1.48; 1.48; 1.48–1.48 / 3.00; 3.00; 2.00–4.00 | 0.8 / 0.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Points (before → after) | 400 | 84.9%; 84.6%; 84.6%–86.1% | 54.7% / 100.0% / 100.0% | 100.0% / 11.4% | 68.7% | 29.7% → 12.6% | 5.80; 6.00; 5.00–7.00 → 5.40; 6.00; 4.00–6.00 | 1.50; 1.50; 1.50–1.50 / 3.00; 3.00; 3.00–3.00 | 28.4 / 5.2 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Rating/Elo (before → after) | 20 | 56.6%; 58.6%; 50.5%–59.0% | 37.4% / 59.8% / 72.7% | 100.0% / 0.0% | 54.3% | 30.9% → 11.5% | 4.40; 4.00; 4.00–5.00 → 3.00; 3.00; 2.00–4.00 | 1.48; 1.48; 1.48–1.48 / 3.00; 3.00; 2.00–4.00 | 0.8 / 0.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Rating/Elo (before → after) | 400 | 84.6%; 84.6%; 84.6%–84.6% | 53.8% / 100.0% / 100.0% | 100.0% / 0.0% | 68.5% | 29.8% → 12.6% | 5.80; 6.00; 5.00–7.00 → 5.40; 6.00; 4.00–6.00 | 1.50; 1.50; 1.50–1.50 / 3.00; 3.00; 3.00–3.00 | 28.4 / 5.2 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |

The table reports after-change coverage/entropy and before→after back-to-back rate and maximum assignment rest gap when a baseline report is supplied. Assignment rest is the completed-match rest-turn count sampled when players are selected; elapsed completion-event gaps are retained as a separate diagnostic and can include time spent in a match. `Starvation changed set` gives mean counterfactual set changes and the rate conditional on an overdue player being available. The fairness columns are checkpoint spread and maximum spread seen over the run. Exact per-seed values and missing relationship lists are in the adjacent JSON.

## Wide-skill guardrail sensitivity

| Format | Completed | Relationship coverage | Partner / opponent / courtmate | Normalized entropy | Back-to-back rate | Max assignment rest gap | Starvation set changes | Checkpoint / max fairness spread |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| Balanced Points | 20 | 58.5% | 35.2% / 61.5% / 78.8% | 60.8% | 10.1% | 3.00 | 0.00 | 1.00 / 2.33 |
| Balanced Points | 400 | 85.6% | 56.8% / 100.0% / 100.0% | 68.4% | 13.5% | 5.00 | 0.00 | 1.33 / 5.00 |
| Balanced Rating/Elo | 20 | 54.1% | 31.1% / 58.6% / 72.5% | 58.5% | 10.6% | 3.00 | 0.00 | 1.00 / 2.33 |
| Balanced Rating/Elo | 400 | 84.1% | 54.6% / 97.8% / 100.0% | 67.2% | 14.0% | 5.00 | 1.33 | 1.33 / 5.00 |

The wide profile uses the same skill ranks at 10× the narrow strength spread. It is a sensitivity run for balance-envelope restrictions; the primary relationship denominator remains structural and does not shrink to the guardrail.
Static equal-count two-court enumeration excluded 8 directed opportunity records (4 distinct facet-pairs) for wide Balanced Points; the JSON appendix lists the exact pairs.
Static equal-count two-court enumeration excluded 24 directed opportunity records (12 distinct facet-pairs) for wide Balanced Rating/Elo; the JSON appendix lists the exact pairs.

## 400-match relationship completion

| Format | Seeds reaching 100% | Remaining structurally feasible relationships | Guardrail interpretation |
|---|---:|---|---|
| Social | 0/5 | 206 total facet-pairs across seeds | No balance guardrail. |
| Balanced Points | 0/5 | 206 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |
| Balanced Rating/Elo | 0/5 | 210 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |

The unseen relationship classification is finite-session evidence: `ever admissible but unchosen`, `in the strongest fair/starvation class but excluded by every observed balance envelope`, or `never in the strongest rotation class during observed refills`. The static balance-feasibility audit is reported separately and can show whether a relationship is structurally possible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.

## Long waits

There were 97 completed assignment gaps of at least five available completed-match rest turns in these runs. Deferred-refill classes: fairness_or_mixed_legality: 87; cadence_tie_later_tiebreak: 10. 0 had a linked immediately preceding rest-zero replay. The preserved cadence witnesses show 0 strictly better-cadence inclusion opportunities, 10 equal-cadence inclusion alternatives, and 0 cadence-worse inclusion opportunities; JSON stores the selected and candidate IDs/rest vectors for each witness. A fairness/legality class means no candidate including that player was observed in the stronger fairness class during their deferred decisions; a cadence tie means an equal cadence candidate existed earlier, the witness does not record entropy scores, so the exact later tie-break is not attributed.

## Runtime

Total measured optimizer/oracle time across sessions: 225.6 seconds. Per-run timings are in JSON.

## Machine-readable compact summary

```json
{
  "sourceRevision": "HEAD de0254f8 + working-tree changes",
  "primarySeeds": 5,
  "wideSeeds": 3,
  "groups": [
    {
      "profile": "narrow",
      "format": "Social",
      "completed": 20,
      "varietyCoverageMean": 0.5633699633699634,
      "varietyCoverageMedian": 0.5787545787545788,
      "partnerCoverageMean": 0.3714285714285715,
      "opponentCoverageMean": 0.5890109890109889,
      "courtmateCoverageMean": 0.7296703296703296,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0.11428571428571428,
      "relationshipEntropyMean": 0.7179663114805165,
      "matchTypeEntropyMean": 0.07634272456664072,
      "normalizedEntropyMean": 0.5575604147520475,
      "backToBackRateMean": 0.11818181818181817,
      "maxAssignmentRestGapMean": 3,
      "meanAssignmentRestGapMean": 1.4848484848484849,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 0,
      "decisionsWithOverdue": 2,
      "certifiedCounterfactualDecisions": 2,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 95,
      "backToBackAssignments": 39,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2.4,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0,
      "starvationRateAcrossCompletedDecisions": 0,
      "starvationRateAmongCertified": 0
    },
    {
      "profile": "narrow",
      "format": "Social",
      "completed": 400,
      "varietyCoverageMean": 0.8490842490842491,
      "varietyCoverageMedian": 0.8461538461538461,
      "partnerCoverageMean": 0.5472527472527472,
      "opponentCoverageMean": 1,
      "courtmateCoverageMean": 1,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0.11428571428571428,
      "relationshipEntropyMean": 0.913659070894749,
      "matchTypeEntropyMean": 0.0082602088390994,
      "normalizedEntropyMean": 0.6873093553808364,
      "backToBackRateMean": 0.12648171500630517,
      "maxAssignmentRestGapMean": 5.4,
      "meanAssignmentRestGapMean": 1.4976040353089535,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 0,
      "decisionsWithOverdue": 80,
      "certifiedCounterfactualDecisions": 80,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1995,
      "backToBackAssignments": 1003,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 4.6,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0,
      "starvationRateAcrossCompletedDecisions": 0,
      "starvationRateAmongCertified": 0
    },
    {
      "profile": "narrow",
      "format": "Balanced Points",
      "completed": 20,
      "varietyCoverageMean": 0.5597069597069597,
      "varietyCoverageMedian": 0.5641025641025641,
      "partnerCoverageMean": 0.3758241758241759,
      "opponentCoverageMean": 0.5802197802197802,
      "courtmateCoverageMean": 0.7230769230769231,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0.11428571428571428,
      "relationshipEntropyMean": 0.7183289109231905,
      "matchTypeEntropyMean": 0.07634272456664072,
      "normalizedEntropyMean": 0.557832364334053,
      "backToBackRateMean": 0.11818181818181817,
      "maxAssignmentRestGapMean": 3,
      "meanAssignmentRestGapMean": 1.4848484848484849,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 0,
      "decisionsWithOverdue": 2,
      "certifiedCounterfactualDecisions": 2,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 95,
      "backToBackAssignments": 39,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2.4,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0,
      "starvationRateAcrossCompletedDecisions": 0,
      "starvationRateAmongCertified": 0
    },
    {
      "profile": "narrow",
      "format": "Balanced Points",
      "completed": 400,
      "varietyCoverageMean": 0.8490842490842491,
      "varietyCoverageMedian": 0.8461538461538461,
      "partnerCoverageMean": 0.5472527472527472,
      "opponentCoverageMean": 1,
      "courtmateCoverageMean": 1,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0.11428571428571428,
      "relationshipEntropyMean": 0.9137747553756561,
      "matchTypeEntropyMean": 0.008267647572147886,
      "normalizedEntropyMean": 0.6873979784247789,
      "backToBackRateMean": 0.12648171500630517,
      "maxAssignmentRestGapMean": 5.4,
      "meanAssignmentRestGapMean": 1.4976040353089535,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 0,
      "decisionsWithOverdue": 80,
      "certifiedCounterfactualDecisions": 80,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1995,
      "backToBackAssignments": 1003,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 4.6,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0,
      "starvationRateAcrossCompletedDecisions": 0,
      "starvationRateAmongCertified": 0
    },
    {
      "profile": "narrow",
      "format": "Balanced Rating/Elo",
      "completed": 20,
      "varietyCoverageMean": 0.5663003663003663,
      "varietyCoverageMedian": 0.586080586080586,
      "partnerCoverageMean": 0.3736263736263737,
      "opponentCoverageMean": 0.5978021978021978,
      "courtmateCoverageMean": 0.7274725274725274,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0,
      "relationshipEntropyMean": 0.723965373448365,
      "matchTypeEntropyMean": 0,
      "normalizedEntropyMean": 0.5429740300862737,
      "backToBackRateMean": 0.11515151515151514,
      "maxAssignmentRestGapMean": 3,
      "meanAssignmentRestGapMean": 1.4848484848484849,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 0,
      "decisionsWithOverdue": 2,
      "certifiedCounterfactualDecisions": 2,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 95,
      "backToBackAssignments": 38,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2.4,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0,
      "starvationRateAcrossCompletedDecisions": 0,
      "starvationRateAmongCertified": 0
    },
    {
      "profile": "narrow",
      "format": "Balanced Rating/Elo",
      "completed": 400,
      "varietyCoverageMean": 0.8461538461538461,
      "varietyCoverageMedian": 0.8461538461538461,
      "partnerCoverageMean": 0.5384615384615384,
      "opponentCoverageMean": 1,
      "courtmateCoverageMean": 1,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0,
      "relationshipEntropyMean": 0.9134291404630626,
      "matchTypeEntropyMean": 9.15264715375691e-16,
      "normalizedEntropyMean": 0.685071855347297,
      "backToBackRateMean": 0.12635561160151326,
      "maxAssignmentRestGapMean": 5.4,
      "meanAssignmentRestGapMean": 1.4976040353089535,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 0,
      "decisionsWithOverdue": 80,
      "certifiedCounterfactualDecisions": 80,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1995,
      "backToBackAssignments": 1002,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 4.6,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0,
      "starvationRateAcrossCompletedDecisions": 0,
      "starvationRateAmongCertified": 0
    },
    {
      "profile": "wide",
      "format": "Balanced Points",
      "completed": 20,
      "varietyCoverageMean": 0.5848595848595848,
      "varietyCoverageMedian": 0.5897435897435896,
      "partnerCoverageMean": 0.35164835164835173,
      "opponentCoverageMean": 0.6153846153846153,
      "courtmateCoverageMean": 0.7875457875457875,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0.38095238095238093,
      "relationshipEntropyMean": 0.7258166441624773,
      "matchTypeEntropyMean": 0.25447574855546906,
      "normalizedEntropyMean": 0.6079814202607251,
      "backToBackRateMean": 0.10101010101010101,
      "maxAssignmentRestGapMean": 3,
      "meanAssignmentRestGapMean": 1.4191919191919193,
      "p95AssignmentRestGapMean": 2.6666666666666665,
      "starvationInterventions": 0,
      "decisionsWithOverdue": 0,
      "certifiedCounterfactualDecisions": 0,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 57,
      "backToBackAssignments": 20,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2.3333333333333335,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": null,
      "starvationRateAcrossCompletedDecisions": 0,
      "starvationRateAmongCertified": null
    },
    {
      "profile": "wide",
      "format": "Balanced Points",
      "completed": 400,
      "varietyCoverageMean": 0.8559218559218561,
      "varietyCoverageMedian": 0.8608058608058611,
      "partnerCoverageMean": 0.5677655677655676,
      "opponentCoverageMean": 1,
      "courtmateCoverageMean": 1,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0.38095238095238093,
      "relationshipEntropyMean": 0.9024222169254248,
      "matchTypeEntropyMean": 0.027559021073863054,
      "normalizedEntropyMean": 0.6837064179625343,
      "backToBackRateMean": 0.1353509878100042,
      "maxAssignmentRestGapMean": 5,
      "meanAssignmentRestGapMean": 1.50021017234132,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 0,
      "decisionsWithOverdue": 50,
      "certifiedCounterfactualDecisions": 50,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1197,
      "backToBackAssignments": 644,
      "checkpointFairnessSpreadMean": 1.3333333333333333,
      "maximumFairnessSpreadMean": 5,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0,
      "starvationRateAcrossCompletedDecisions": 0,
      "starvationRateAmongCertified": 0
    },
    {
      "profile": "wide",
      "format": "Balanced Rating/Elo",
      "completed": 20,
      "varietyCoverageMean": 0.5409035409035409,
      "varietyCoverageMedian": 0.5347985347985348,
      "partnerCoverageMean": 0.3113553113553114,
      "opponentCoverageMean": 0.5860805860805861,
      "courtmateCoverageMean": 0.7252747252747254,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0.38095238095238093,
      "relationshipEntropyMean": 0.6948537312358932,
      "matchTypeEntropyMean": 0.25447574855546906,
      "normalizedEntropyMean": 0.5847592355657872,
      "backToBackRateMean": 0.10606060606060606,
      "maxAssignmentRestGapMean": 3,
      "meanAssignmentRestGapMean": 1.409090909090909,
      "p95AssignmentRestGapMean": 2.6666666666666665,
      "starvationInterventions": 0,
      "decisionsWithOverdue": 0,
      "certifiedCounterfactualDecisions": 0,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 57,
      "backToBackAssignments": 21,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 2.3333333333333335,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": null,
      "starvationRateAcrossCompletedDecisions": 0,
      "starvationRateAmongCertified": null
    },
    {
      "profile": "wide",
      "format": "Balanced Rating/Elo",
      "completed": 400,
      "varietyCoverageMean": 0.8412698412698414,
      "varietyCoverageMedian": 0.8461538461538464,
      "partnerCoverageMean": 0.5457875457875456,
      "opponentCoverageMean": 0.9780219780219781,
      "courtmateCoverageMean": 1,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0.38095238095238093,
      "relationshipEntropyMean": 0.8869552648036994,
      "matchTypeEntropyMean": 0.02754662318544891,
      "normalizedEntropyMean": 0.6721031043991367,
      "backToBackRateMean": 0.1403951240016814,
      "maxAssignmentRestGapMean": 5,
      "meanAssignmentRestGapMean": 1.50021017234132,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 4,
      "decisionsWithOverdue": 71,
      "certifiedCounterfactualDecisions": 71,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1197,
      "backToBackAssignments": 668,
      "checkpointFairnessSpreadMean": 1.3333333333333333,
      "maximumFairnessSpreadMean": 5,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.056338028169014086,
      "starvationRateAcrossCompletedDecisions": 0.003341687552213868,
      "starvationRateAmongCertified": 0.056338028169014086
    }
  ]
}
```

## Exact unseen relationship list and traces

### Social narrow seed 1: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 140, balance-envelope 140, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 120, balance-envelope 120, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 136, balance-envelope 136, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 131, balance-envelope 131, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 105, balance-envelope 105, cadence-frontier 0.
- P1–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 136, balance-envelope 136, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 128, balance-envelope 128, cadence-frontier 0.
- P10–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 150, balance-envelope 150, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 121, balance-envelope 121, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 154, balance-envelope 154, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 134, balance-envelope 134, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 132, balance-envelope 132, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 154, balance-envelope 154, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 137, balance-envelope 137, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 160, balance-envelope 160, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 133, balance-envelope 133, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 154, balance-envelope 154, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 185, balance-envelope 185, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 163, balance-envelope 163, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 154, balance-envelope 154, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 172, balance-envelope 172, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 131, balance-envelope 131, cadence-frontier 0.
- P14–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 173, balance-envelope 173, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 163, balance-envelope 163, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 177, balance-envelope 177, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 164, balance-envelope 164, cadence-frontier 0.
- P2–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 180, balance-envelope 180, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 156, balance-envelope 156, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 145, balance-envelope 145, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 136, balance-envelope 136, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 152, balance-envelope 152, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 173, balance-envelope 173, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 174, balance-envelope 174, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 165, balance-envelope 165, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 162, balance-envelope 162, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 142, balance-envelope 142, cadence-frontier 0.

### Balanced Points narrow seed 1: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 146, balance-envelope 146, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 167, balance-envelope 167, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 152, balance-envelope 152, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P1–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 146, balance-envelope 146, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P10–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 165, balance-envelope 165, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 173, balance-envelope 173, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 156, balance-envelope 156, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 163, balance-envelope 163, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 165, balance-envelope 165, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 134, balance-envelope 134, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 146, balance-envelope 146, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 109, balance-envelope 109, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 135, balance-envelope 135, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 145, balance-envelope 145, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 138, balance-envelope 138, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 162, balance-envelope 162, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 160, balance-envelope 160, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 134, balance-envelope 134, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 164, balance-envelope 164, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 163, balance-envelope 163, cadence-frontier 0.
- P14–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 141, balance-envelope 141, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 138, balance-envelope 138, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 116, balance-envelope 116, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 165, balance-envelope 165, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P2–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 165, balance-envelope 165, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 146, balance-envelope 146, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 139, balance-envelope 139, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 132, balance-envelope 132, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 143, balance-envelope 143, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 122, balance-envelope 122, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 170, balance-envelope 170, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 155, balance-envelope 155, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 165, balance-envelope 165, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 154, balance-envelope 154, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 159, balance-envelope 159, cadence-frontier 0.

### Balanced Rating/Elo narrow seed 1: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 125, balance-envelope 125, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 136, balance-envelope 136, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 131, balance-envelope 131, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 139, balance-envelope 139, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 146, balance-envelope 146, cadence-frontier 0.
- P1–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 115, balance-envelope 115, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 129, balance-envelope 129, cadence-frontier 0.
- P10–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 144, balance-envelope 144, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 179, balance-envelope 179, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 120, balance-envelope 120, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 158, balance-envelope 158, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 127, balance-envelope 127, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 154, balance-envelope 154, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 159, balance-envelope 159, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 126, balance-envelope 126, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 139, balance-envelope 139, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 158, balance-envelope 158, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 121, balance-envelope 121, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 162, balance-envelope 162, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 190, balance-envelope 190, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 146, balance-envelope 146, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 166, balance-envelope 166, cadence-frontier 0.
- P14–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 148, balance-envelope 148, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 174, balance-envelope 174, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 139, balance-envelope 139, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 137, balance-envelope 137, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 152, balance-envelope 152, cadence-frontier 0.
- P2–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 162, balance-envelope 162, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 140, balance-envelope 140, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 155, balance-envelope 155, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 168, balance-envelope 168, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 180, balance-envelope 180, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 163, balance-envelope 163, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 168, balance-envelope 168, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 146, balance-envelope 146, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 179, balance-envelope 179, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 173, balance-envelope 173, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 128, balance-envelope 128, cadence-frontier 0.

### Social narrow seed 4729: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 135, balance-envelope 135, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 140, balance-envelope 140, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 98, balance-envelope 98, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 152, balance-envelope 152, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 138, balance-envelope 138, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 119, balance-envelope 119, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 131, balance-envelope 131, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 123, balance-envelope 123, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 99, balance-envelope 99, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 116, balance-envelope 116, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 132, balance-envelope 132, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 133, balance-envelope 133, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 129, balance-envelope 129, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 120, balance-envelope 120, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 111, balance-envelope 111, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 120, balance-envelope 120, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 117, balance-envelope 117, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 119, balance-envelope 119, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 121, balance-envelope 121, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 120, balance-envelope 120, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 90, balance-envelope 90, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 102, balance-envelope 102, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 131, balance-envelope 131, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 123, balance-envelope 123, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 74, balance-envelope 74, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 110, balance-envelope 110, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 138, balance-envelope 138, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 84, balance-envelope 84, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 125, balance-envelope 125, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 75, balance-envelope 75, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 141, balance-envelope 141, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 121, balance-envelope 121, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 102, balance-envelope 102, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 80, balance-envelope 80, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 133, balance-envelope 133, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 124, balance-envelope 124, cadence-frontier 0.

### Balanced Points narrow seed 4729: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 137, balance-envelope 137, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 133, balance-envelope 133, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 113, balance-envelope 113, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 150, balance-envelope 150, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 130, balance-envelope 130, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 120, balance-envelope 120, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 109, balance-envelope 109, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 145, balance-envelope 145, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 128, balance-envelope 128, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 100, balance-envelope 100, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 121, balance-envelope 121, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 119, balance-envelope 119, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 144, balance-envelope 144, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 127, balance-envelope 127, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 120, balance-envelope 120, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 89, balance-envelope 89, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 120, balance-envelope 120, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 107, balance-envelope 107, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 107, balance-envelope 107, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 140, balance-envelope 140, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 124, balance-envelope 124, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 103, balance-envelope 103, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 112, balance-envelope 112, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 134, balance-envelope 134, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 103, balance-envelope 103, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 110, balance-envelope 110, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 118, balance-envelope 118, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 89, balance-envelope 89, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 127, balance-envelope 127, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 117, balance-envelope 117, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 103, balance-envelope 103, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 138, balance-envelope 138, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 125, balance-envelope 125, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 102, balance-envelope 102, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 87, balance-envelope 87, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 124, balance-envelope 124, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 146, balance-envelope 146, cadence-frontier 0.

### Balanced Rating/Elo narrow seed 4729: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 141, balance-envelope 141, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 131, balance-envelope 131, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 140, balance-envelope 140, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 127, balance-envelope 127, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 123, balance-envelope 123, cadence-frontier 0.
- P1–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 109, balance-envelope 109, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 111, balance-envelope 111, cadence-frontier 0.
- P10–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 148, balance-envelope 148, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 107, balance-envelope 107, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 137, balance-envelope 137, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 99, balance-envelope 99, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 118, balance-envelope 118, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 116, balance-envelope 116, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 126, balance-envelope 126, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 104, balance-envelope 104, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 92, balance-envelope 92, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 141, balance-envelope 141, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 130, balance-envelope 130, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 142, balance-envelope 142, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 120, balance-envelope 120, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 109, balance-envelope 109, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 103, balance-envelope 103, cadence-frontier 0.
- P14–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 115, balance-envelope 115, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 102, balance-envelope 102, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 135, balance-envelope 135, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 128, balance-envelope 128, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 125, balance-envelope 125, cadence-frontier 0.
- P2–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 115, balance-envelope 115, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 109, balance-envelope 109, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 130, balance-envelope 130, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 130, balance-envelope 130, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 114, balance-envelope 114, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 107, balance-envelope 107, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 135, balance-envelope 135, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 116, balance-envelope 116, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 107, balance-envelope 107, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 115, balance-envelope 115, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 97, balance-envelope 97, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 92, balance-envelope 92, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 100, balance-envelope 100, cadence-frontier 0.

### Social narrow seed 104729: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 142, balance-envelope 142, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 178, balance-envelope 178, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 150, balance-envelope 150, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 151, balance-envelope 151, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 148, balance-envelope 148, cadence-frontier 0.
- P1–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 152, balance-envelope 152, cadence-frontier 0.
- P10–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 162, balance-envelope 162, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 184, balance-envelope 184, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 164, balance-envelope 164, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 165, balance-envelope 165, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 154, balance-envelope 154, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 145, balance-envelope 145, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 159, balance-envelope 159, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 167, balance-envelope 167, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 148, balance-envelope 148, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 174, balance-envelope 174, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 151, balance-envelope 151, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 162, balance-envelope 162, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 145, balance-envelope 145, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 170, balance-envelope 170, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 172, balance-envelope 172, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 167, balance-envelope 167, cadence-frontier 0.
- P14–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 159, balance-envelope 159, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 160, balance-envelope 160, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 183, balance-envelope 183, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 154, balance-envelope 154, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 150, balance-envelope 150, cadence-frontier 0.
- P2–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 148, balance-envelope 148, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 150, balance-envelope 150, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 183, balance-envelope 183, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 199, balance-envelope 199, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 170, balance-envelope 170, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 179, balance-envelope 179, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 160, balance-envelope 160, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 144, balance-envelope 144, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 157, balance-envelope 157, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 152, balance-envelope 152, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 163, balance-envelope 163, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 150, balance-envelope 150, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.

### Balanced Points narrow seed 104729: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 201, balance-envelope 201, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 163, balance-envelope 163, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 163, balance-envelope 163, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 171, balance-envelope 171, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 181, balance-envelope 181, cadence-frontier 0.
- P1–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 177, balance-envelope 177, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 159, balance-envelope 159, cadence-frontier 0.
- P10–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 169, balance-envelope 169, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 120, balance-envelope 120, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 162, balance-envelope 162, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 185, balance-envelope 185, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 196, balance-envelope 196, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 169, balance-envelope 169, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 133, balance-envelope 133, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 199, balance-envelope 199, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 177, balance-envelope 177, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 119, balance-envelope 119, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 171, balance-envelope 171, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 189, balance-envelope 189, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 134, balance-envelope 134, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 200, balance-envelope 200, cadence-frontier 0.
- P14–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 124, balance-envelope 124, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 171, balance-envelope 171, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 159, balance-envelope 159, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 160, balance-envelope 160, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 176, balance-envelope 176, cadence-frontier 0.
- P2–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 168, balance-envelope 168, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 146, balance-envelope 146, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 157, balance-envelope 157, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 155, balance-envelope 155, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 146, balance-envelope 146, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 142, balance-envelope 142, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 137, balance-envelope 137, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 156, balance-envelope 156, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 145, balance-envelope 145, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 151, balance-envelope 151, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 126, balance-envelope 126, cadence-frontier 0.

### Balanced Rating/Elo narrow seed 104729: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 184, balance-envelope 184, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 163, balance-envelope 163, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 179, balance-envelope 179, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 192, balance-envelope 192, cadence-frontier 0.
- P1–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 150, balance-envelope 150, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 133, balance-envelope 133, cadence-frontier 0.
- P10–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 151, balance-envelope 151, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 132, balance-envelope 132, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 143, balance-envelope 143, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 135, balance-envelope 135, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 125, balance-envelope 125, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 185, balance-envelope 185, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 164, balance-envelope 164, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 178, balance-envelope 178, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 186, balance-envelope 186, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 171, balance-envelope 171, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 195, balance-envelope 195, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 194, balance-envelope 194, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 157, balance-envelope 157, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 167, balance-envelope 167, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 169, balance-envelope 169, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 139, balance-envelope 139, cadence-frontier 0.
- P14–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 187, balance-envelope 187, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 150, balance-envelope 150, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 138, balance-envelope 138, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 162, balance-envelope 162, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 167, balance-envelope 167, cadence-frontier 0.
- P2–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 192, balance-envelope 192, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 126, balance-envelope 126, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 145, balance-envelope 145, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 154, balance-envelope 154, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 131, balance-envelope 131, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 159, balance-envelope 159, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 171, balance-envelope 171, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 143, balance-envelope 143, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 191, balance-envelope 191, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 155, balance-envelope 155, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 162, balance-envelope 162, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 152, balance-envelope 152, cadence-frontier 0.

### Social narrow seed 130363: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 154, balance-envelope 154, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 172, balance-envelope 172, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 167, balance-envelope 167, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 171, balance-envelope 171, cadence-frontier 0.
- P1–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 130, balance-envelope 130, cadence-frontier 0.
- P10–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 177, balance-envelope 177, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 166, balance-envelope 166, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 168, balance-envelope 168, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 184, balance-envelope 184, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 142, balance-envelope 142, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 142, balance-envelope 142, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 122, balance-envelope 122, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 145, balance-envelope 145, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 123, balance-envelope 123, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 173, balance-envelope 173, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 168, balance-envelope 168, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 183, balance-envelope 183, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 171, balance-envelope 171, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 141, balance-envelope 141, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 171, balance-envelope 171, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.
- P14–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 164, balance-envelope 164, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 137, balance-envelope 137, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 133, balance-envelope 133, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 183, balance-envelope 183, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.
- P2–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 175, balance-envelope 175, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 142, balance-envelope 142, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 143, balance-envelope 143, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 143, balance-envelope 143, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 126, balance-envelope 126, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 173, balance-envelope 173, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 184, balance-envelope 184, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 150, balance-envelope 150, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 176, balance-envelope 176, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 143, balance-envelope 143, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 173, balance-envelope 173, cadence-frontier 0.

### Balanced Points narrow seed 130363: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 154, balance-envelope 154, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 172, balance-envelope 172, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 167, balance-envelope 167, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 171, balance-envelope 171, cadence-frontier 0.
- P1–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 130, balance-envelope 130, cadence-frontier 0.
- P10–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 177, balance-envelope 177, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 166, balance-envelope 166, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 168, balance-envelope 168, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 184, balance-envelope 184, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 142, balance-envelope 142, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 142, balance-envelope 142, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 122, balance-envelope 122, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 145, balance-envelope 145, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 123, balance-envelope 123, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 173, balance-envelope 173, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 168, balance-envelope 168, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 183, balance-envelope 183, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 171, balance-envelope 171, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 141, balance-envelope 141, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 171, balance-envelope 171, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.
- P14–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 164, balance-envelope 164, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 137, balance-envelope 137, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 133, balance-envelope 133, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 183, balance-envelope 183, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.
- P2–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 175, balance-envelope 175, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 142, balance-envelope 142, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 143, balance-envelope 143, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 143, balance-envelope 143, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 126, balance-envelope 126, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 173, balance-envelope 173, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 184, balance-envelope 184, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 150, balance-envelope 150, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 176, balance-envelope 176, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 143, balance-envelope 143, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 173, balance-envelope 173, cadence-frontier 0.

### Balanced Rating/Elo narrow seed 130363: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 154, balance-envelope 154, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 172, balance-envelope 172, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 167, balance-envelope 167, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 171, balance-envelope 171, cadence-frontier 0.
- P1–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 130, balance-envelope 130, cadence-frontier 0.
- P10–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 177, balance-envelope 177, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 166, balance-envelope 166, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 168, balance-envelope 168, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 184, balance-envelope 184, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 142, balance-envelope 142, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 142, balance-envelope 142, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 122, balance-envelope 122, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 145, balance-envelope 145, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 123, balance-envelope 123, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 173, balance-envelope 173, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 168, balance-envelope 168, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 183, balance-envelope 183, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 171, balance-envelope 171, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 141, balance-envelope 141, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 171, balance-envelope 171, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.
- P14–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 164, balance-envelope 164, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 137, balance-envelope 137, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 133, balance-envelope 133, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 183, balance-envelope 183, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.
- P2–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 175, balance-envelope 175, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 142, balance-envelope 142, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 143, balance-envelope 143, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 143, balance-envelope 143, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 126, balance-envelope 126, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 173, balance-envelope 173, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 184, balance-envelope 184, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 150, balance-envelope 150, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 176, balance-envelope 176, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 143, balance-envelope 143, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 173, balance-envelope 173, cadence-frontier 0.

### Social narrow seed 2097593: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 166, balance-envelope 166, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 168, balance-envelope 168, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 155, balance-envelope 155, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 135, balance-envelope 135, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 151, balance-envelope 151, cadence-frontier 0.
- P1–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 173, balance-envelope 173, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 163, balance-envelope 163, cadence-frontier 0.
- P10–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 126, balance-envelope 126, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 138, balance-envelope 138, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 131, balance-envelope 131, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 160, balance-envelope 160, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 155, balance-envelope 155, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 129, balance-envelope 129, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 166, balance-envelope 166, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 165, balance-envelope 165, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 184, balance-envelope 184, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 174, balance-envelope 174, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 122, balance-envelope 122, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 123, balance-envelope 123, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 122, balance-envelope 122, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 137, balance-envelope 137, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 167, balance-envelope 167, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 165, balance-envelope 165, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 157, balance-envelope 157, cadence-frontier 0.
- P14–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 152, balance-envelope 152, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 160, balance-envelope 160, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 151, balance-envelope 151, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 138, balance-envelope 138, cadence-frontier 0.
- P2–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 162, balance-envelope 162, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 162, balance-envelope 162, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 134, balance-envelope 134, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 142, balance-envelope 142, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 167, balance-envelope 167, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 124, balance-envelope 124, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 129, balance-envelope 129, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 152, balance-envelope 152, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 131, balance-envelope 131, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 154, balance-envelope 154, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 149, balance-envelope 149, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.

### Balanced Points narrow seed 2097593: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 144, balance-envelope 144, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 168, balance-envelope 168, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 167, balance-envelope 167, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 175, balance-envelope 175, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 160, balance-envelope 160, cadence-frontier 0.
- P1–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 146, balance-envelope 146, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 170, balance-envelope 170, cadence-frontier 0.
- P10–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 151, balance-envelope 151, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 175, balance-envelope 175, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 166, balance-envelope 166, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 158, balance-envelope 158, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 148, balance-envelope 148, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 136, balance-envelope 136, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 137, balance-envelope 137, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 155, balance-envelope 155, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 124, balance-envelope 124, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 129, balance-envelope 129, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 135, balance-envelope 135, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 158, balance-envelope 158, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 131, balance-envelope 131, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 157, balance-envelope 157, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 157, balance-envelope 157, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 152, balance-envelope 152, cadence-frontier 0.
- P14–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 151, balance-envelope 151, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 148, balance-envelope 148, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 152, balance-envelope 152, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 136, balance-envelope 136, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 145, balance-envelope 145, cadence-frontier 0.
- P2–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 129, balance-envelope 129, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 131, balance-envelope 131, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 176, balance-envelope 176, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 157, balance-envelope 157, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 148, balance-envelope 148, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 144, balance-envelope 144, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 120, balance-envelope 120, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 148, balance-envelope 148, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 151, balance-envelope 151, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 151, balance-envelope 151, cadence-frontier 0.

### Balanced Rating/Elo narrow seed 2097593: unseen at 400
- P1–P2 partners: cadence_priority_excluded_in_observed_opportunities; strongest 144, balance-envelope 144, cadence-frontier 0.
- P1–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 168, balance-envelope 168, cadence-frontier 0.
- P1–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 167, balance-envelope 167, cadence-frontier 0.
- P1–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 175, balance-envelope 175, cadence-frontier 0.
- P1–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 160, balance-envelope 160, cadence-frontier 0.
- P1–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 146, balance-envelope 146, cadence-frontier 0.
- P10–P11 partners: cadence_priority_excluded_in_observed_opportunities; strongest 170, balance-envelope 170, cadence-frontier 0.
- P10–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 151, balance-envelope 151, cadence-frontier 0.
- P10–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 175, balance-envelope 175, cadence-frontier 0.
- P10–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 166, balance-envelope 166, cadence-frontier 0.
- P10–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 161, balance-envelope 161, cadence-frontier 0.
- P10–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 158, balance-envelope 158, cadence-frontier 0.
- P11–P12 partners: cadence_priority_excluded_in_observed_opportunities; strongest 148, balance-envelope 148, cadence-frontier 0.
- P11–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 136, balance-envelope 136, cadence-frontier 0.
- P11–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 137, balance-envelope 137, cadence-frontier 0.
- P11–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 155, balance-envelope 155, cadence-frontier 0.
- P11–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 124, balance-envelope 124, cadence-frontier 0.
- P12–P13 partners: cadence_priority_excluded_in_observed_opportunities; strongest 129, balance-envelope 129, cadence-frontier 0.
- P12–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 135, balance-envelope 135, cadence-frontier 0.
- P12–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 158, balance-envelope 158, cadence-frontier 0.
- P12–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 131, balance-envelope 131, cadence-frontier 0.
- P13–P14 partners: cadence_priority_excluded_in_observed_opportunities; strongest 157, balance-envelope 157, cadence-frontier 0.
- P13–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 157, balance-envelope 157, cadence-frontier 0.
- P13–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 152, balance-envelope 152, cadence-frontier 0.
- P14–P8 partners: cadence_priority_excluded_in_observed_opportunities; strongest 151, balance-envelope 151, cadence-frontier 0.
- P14–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 148, balance-envelope 148, cadence-frontier 0.
- P2–P3 partners: cadence_priority_excluded_in_observed_opportunities; strongest 152, balance-envelope 152, cadence-frontier 0.
- P2–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 136, balance-envelope 136, cadence-frontier 0.
- P2–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 145, balance-envelope 145, cadence-frontier 0.
- P2–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 129, balance-envelope 129, cadence-frontier 0.
- P2–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 131, balance-envelope 131, cadence-frontier 0.
- P3–P4 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P3–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 176, balance-envelope 176, cadence-frontier 0.
- P3–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 157, balance-envelope 157, cadence-frontier 0.
- P3–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 148, balance-envelope 148, cadence-frontier 0.
- P4–P5 partners: cadence_priority_excluded_in_observed_opportunities; strongest 147, balance-envelope 147, cadence-frontier 0.
- P4–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 144, balance-envelope 144, cadence-frontier 0.
- P4–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 120, balance-envelope 120, cadence-frontier 0.
- P5–P6 partners: cadence_priority_excluded_in_observed_opportunities; strongest 148, balance-envelope 148, cadence-frontier 0.
- P5–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 151, balance-envelope 151, cadence-frontier 0.
- P6–P7 partners: cadence_priority_excluded_in_observed_opportunities; strongest 153, balance-envelope 153, cadence-frontier 0.
- P8–P9 partners: cadence_priority_excluded_in_observed_opportunities; strongest 151, balance-envelope 151, cadence-frontier 0.

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
- wait-narrow-SOCIAL_MIX-1-P8-89: Social narrow seed 1, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P5-89: Social narrow seed 1, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P1-92: Social narrow seed 1, P1, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P13-92: Social narrow seed 1, P13, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P4-109: Social narrow seed 1, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P13-109: Social narrow seed 1, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P10-89: Balanced Points narrow seed 1, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P7-89: Balanced Points narrow seed 1, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P13-92: Balanced Points narrow seed 1, P13, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P4-92: Balanced Points narrow seed 1, P4, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P8-109: Balanced Points narrow seed 1, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P7-109: Balanced Points narrow seed 1, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P9-89: Balanced Rating/Elo narrow seed 1, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P4-89: Balanced Rating/Elo narrow seed 1, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P1-92: Balanced Rating/Elo narrow seed 1, P1, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P10-92: Balanced Rating/Elo narrow seed 1, P10, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P10-109: Balanced Rating/Elo narrow seed 1, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P5-109: Balanced Rating/Elo narrow seed 1, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P11-110: Social narrow seed 4729, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P7-110: Social narrow seed 4729, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P3-166: Social narrow seed 4729, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P8-166: Social narrow seed 4729, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P11-231: Social narrow seed 4729, P11, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P4-231: Social narrow seed 4729, P4, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P3-233: Social narrow seed 4729, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P9-233: Social narrow seed 4729, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P11-110: Balanced Points narrow seed 4729, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P7-110: Balanced Points narrow seed 4729, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P2-166: Balanced Points narrow seed 4729, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P9-166: Balanced Points narrow seed 4729, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P4-231: Balanced Points narrow seed 4729, P4, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P8-231: Balanced Points narrow seed 4729, P8, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P1-233: Balanced Points narrow seed 4729, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P10-233: Balanced Points narrow seed 4729, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P4-110: Balanced Rating/Elo narrow seed 4729, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P12-110: Balanced Rating/Elo narrow seed 4729, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P5-166: Balanced Rating/Elo narrow seed 4729, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P9-166: Balanced Rating/Elo narrow seed 4729, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P11-231: Balanced Rating/Elo narrow seed 4729, P11, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P5-231: Balanced Rating/Elo narrow seed 4729, P5, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P13-233: Balanced Rating/Elo narrow seed 4729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P6-233: Balanced Rating/Elo narrow seed 4729, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P14-294: Social narrow seed 104729, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P1-294: Social narrow seed 104729, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P7-294: Balanced Points narrow seed 104729, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P11-294: Balanced Points narrow seed 104729, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P7-294: Balanced Rating/Elo narrow seed 104729, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P11-294: Balanced Rating/Elo narrow seed 104729, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P9-74: Social narrow seed 2097593, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P5-74: Social narrow seed 2097593, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P12-203: Social narrow seed 2097593, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P1-203: Social narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P9-204: Social narrow seed 2097593, P9, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P6-204: Social narrow seed 2097593, P6, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P4-312: Social narrow seed 2097593, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P11-312: Social narrow seed 2097593, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P2-317: Social narrow seed 2097593, P2, rest 6, classification cadence_tie_later_tiebreak, current wait cadence_tie_later_tiebreak; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P13-317: Social narrow seed 2097593, P13, rest 6, classification cadence_tie_later_tiebreak, current wait cadence_tie_later_tiebreak; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P11-74: Balanced Points narrow seed 2097593, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P3-74: Balanced Points narrow seed 2097593, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P9-203: Balanced Points narrow seed 2097593, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P5-203: Balanced Points narrow seed 2097593, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P1-204: Balanced Points narrow seed 2097593, P1, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P14-204: Balanced Points narrow seed 2097593, P14, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P3-312: Balanced Points narrow seed 2097593, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P14-312: Balanced Points narrow seed 2097593, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P9-317: Balanced Points narrow seed 2097593, P9, rest 6, classification cadence_tie_later_tiebreak, current wait cadence_tie_later_tiebreak; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P7-317: Balanced Points narrow seed 2097593, P7, rest 6, classification cadence_tie_later_tiebreak, current wait cadence_tie_later_tiebreak; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P11-74: Balanced Rating/Elo narrow seed 2097593, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P3-74: Balanced Rating/Elo narrow seed 2097593, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P9-203: Balanced Rating/Elo narrow seed 2097593, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P5-203: Balanced Rating/Elo narrow seed 2097593, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P1-204: Balanced Rating/Elo narrow seed 2097593, P1, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P14-204: Balanced Rating/Elo narrow seed 2097593, P14, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P3-312: Balanced Rating/Elo narrow seed 2097593, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P14-312: Balanced Rating/Elo narrow seed 2097593, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P9-317: Balanced Rating/Elo narrow seed 2097593, P9, rest 6, classification cadence_tie_later_tiebreak, current wait cadence_tie_later_tiebreak; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P7-317: Balanced Rating/Elo narrow seed 2097593, P7, rest 6, classification cadence_tie_later_tiebreak, current wait cadence_tie_later_tiebreak; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P14-42: Balanced Points wide seed 65537, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P4-42: Balanced Points wide seed 65537, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P6-280: Balanced Points wide seed 65537, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P12-280: Balanced Points wide seed 65537, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P8-42: Balanced Rating/Elo wide seed 65537, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P2-42: Balanced Rating/Elo wide seed 65537, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P1-117: Balanced Rating/Elo wide seed 65537, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P5-280: Balanced Rating/Elo wide seed 65537, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P12-280: Balanced Rating/Elo wide seed 65537, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P9-373: Balanced Rating/Elo wide seed 65537, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P6-376: Balanced Rating/Elo wide seed 65537, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P3-169: Balanced Points wide seed 999983, P3, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P11-169: Balanced Points wide seed 999983, P11, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P13-171: Balanced Points wide seed 999983, P13, rest 6, classification cadence_tie_later_tiebreak, current wait cadence_tie_later_tiebreak; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P1-171: Balanced Points wide seed 999983, P1, rest 6, classification cadence_tie_later_tiebreak, current wait cadence_tie_later_tiebreak; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P12-169: Balanced Rating/Elo wide seed 999983, P12, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P7-169: Balanced Rating/Elo wide seed 999983, P7, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P13-171: Balanced Rating/Elo wide seed 999983, P13, rest 6, classification cadence_tie_later_tiebreak, current wait cadence_tie_later_tiebreak; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P5-171: Balanced Rating/Elo wide seed 999983, P5, rest 6, classification cadence_tie_later_tiebreak, current wait cadence_tie_later_tiebreak; no linked immediately preceding rest-zero replay.

### Censored at the 400-match checkpoint
None.

### Search and timing scope

- Social narrow seed 1: ordinary optimizer 10627.46 ms; counterfactual wrapper 609.15 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 14664 ms.
- Balanced Points narrow seed 1: ordinary optimizer 7883.66 ms; counterfactual wrapper 435.57 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 1738.83 ms; whole harness 13153 ms.
- Balanced Rating/Elo narrow seed 1: ordinary optimizer 7373.20 ms; counterfactual wrapper 438.56 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 1675.74 ms; whole harness 12514 ms.
- Social narrow seed 4729: ordinary optimizer 8801.49 ms; counterfactual wrapper 1379.38 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 12794 ms.
- Balanced Points narrow seed 4729: ordinary optimizer 6830.37 ms; counterfactual wrapper 940.42 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 10393 ms.
- Balanced Rating/Elo narrow seed 4729: ordinary optimizer 6571.53 ms; counterfactual wrapper 980.65 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 10119 ms.
- Social narrow seed 104729: ordinary optimizer 8817.60 ms; counterfactual wrapper 497.98 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 12149 ms.
- Balanced Points narrow seed 104729: ordinary optimizer 7016.54 ms; counterfactual wrapper 375.72 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 10231 ms.
- Balanced Rating/Elo narrow seed 104729: ordinary optimizer 7592.66 ms; counterfactual wrapper 343.61 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 10809 ms.
- Social narrow seed 130363: ordinary optimizer 9492.07 ms; counterfactual wrapper 322.60 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 12790 ms.
- Balanced Points narrow seed 130363: ordinary optimizer 7892.14 ms; counterfactual wrapper 257.67 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 11345 ms.
- Balanced Rating/Elo narrow seed 130363: ordinary optimizer 7233.98 ms; counterfactual wrapper 245.88 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 10392 ms.
- Social narrow seed 2097593: ordinary optimizer 8825.17 ms; counterfactual wrapper 900.80 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 12508 ms.
- Balanced Points narrow seed 2097593: ordinary optimizer 7322.79 ms; counterfactual wrapper 681.53 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 10945 ms.
- Balanced Rating/Elo narrow seed 2097593: ordinary optimizer 6643.27 ms; counterfactual wrapper 626.74 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 10030 ms.
- Balanced Points wide seed 30011: ordinary optimizer 6043.92 ms; counterfactual wrapper 280.20 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 1318.90 ms; whole harness 10213 ms.
- Balanced Rating/Elo wide seed 30011: ordinary optimizer 4836.69 ms; counterfactual wrapper 362.62 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 1112.03 ms; whole harness 8659 ms.
- Balanced Points wide seed 65537: ordinary optimizer 5481.64 ms; counterfactual wrapper 531.53 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 8336 ms.
- Balanced Rating/Elo wide seed 65537: ordinary optimizer 4518.23 ms; counterfactual wrapper 682.29 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 7327 ms.
- Balanced Points wide seed 999983: ordinary optimizer 5698.04 ms; counterfactual wrapper 548.32 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 8782 ms.
- Balanced Rating/Elo wide seed 999983: ordinary optimizer 4534.37 ms; counterfactual wrapper 663.45 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 7403 ms.

## Compact human-readable checkpoint summary

| Profile | Format | Completed | VCS | Partner / opponent / courtmate | MIXED / OWN_SIDE | Entropy people / type / all | B2B | Max / mean / p95 assignment rest | Starvation changed / overdue / all completed |
|---|---|---:|---:|---|---|---|---:|---|---|
| narrow | Social | 20 | 56.3% | 37.1% / 58.9% / 73.0% | 100.0% / 11.4% | 71.8% / 7.6% / 55.8% | 11.8% | 3.00 / 1.48 / 3.00 | 0 / 2 / 95 (0.0% / 0.0%; certified 0.0%; unknown 0) |
| narrow | Social | 400 | 84.9% | 54.7% / 100.0% / 100.0% | 100.0% / 11.4% | 91.4% / 0.8% / 68.7% | 12.6% | 5.40 / 1.50 / 3.00 | 0 / 80 / 1995 (0.0% / 0.0%; certified 0.0%; unknown 0) |
| narrow | Balanced Points | 20 | 56.0% | 37.6% / 58.0% / 72.3% | 100.0% / 11.4% | 71.8% / 7.6% / 55.8% | 11.8% | 3.00 / 1.48 / 3.00 | 0 / 2 / 95 (0.0% / 0.0%; certified 0.0%; unknown 0) |
| narrow | Balanced Points | 400 | 84.9% | 54.7% / 100.0% / 100.0% | 100.0% / 11.4% | 91.4% / 0.8% / 68.7% | 12.6% | 5.40 / 1.50 / 3.00 | 0 / 80 / 1995 (0.0% / 0.0%; certified 0.0%; unknown 0) |
| narrow | Balanced Rating/Elo | 20 | 56.6% | 37.4% / 59.8% / 72.7% | 100.0% / 0.0% | 72.4% / 0.0% / 54.3% | 11.5% | 3.00 / 1.48 / 3.00 | 0 / 2 / 95 (0.0% / 0.0%; certified 0.0%; unknown 0) |
| narrow | Balanced Rating/Elo | 400 | 84.6% | 53.8% / 100.0% / 100.0% | 100.0% / 0.0% | 91.3% / 0.0% / 68.5% | 12.6% | 5.40 / 1.50 / 3.00 | 0 / 80 / 1995 (0.0% / 0.0%; certified 0.0%; unknown 0) |
| wide | Balanced Points | 20 | 58.5% | 35.2% / 61.5% / 78.8% | 100.0% / 38.1% | 72.6% / 25.4% / 60.8% | 10.1% | 3.00 / 1.42 / 2.67 | 0 / 0 / 57 (n/a / 0.0%; certified n/a; unknown 0) |
| wide | Balanced Points | 400 | 85.6% | 56.8% / 100.0% / 100.0% | 100.0% / 38.1% | 90.2% / 2.8% / 68.4% | 13.5% | 5.00 / 1.50 / 3.00 | 0 / 50 / 1197 (0.0% / 0.0%; certified 0.0%; unknown 0) |
| wide | Balanced Rating/Elo | 20 | 54.1% | 31.1% / 58.6% / 72.5% | 100.0% / 38.1% | 69.5% / 25.4% / 58.5% | 10.6% | 3.00 / 1.41 / 2.67 | 0 / 0 / 57 (n/a / 0.0%; certified n/a; unknown 0) |
| wide | Balanced Rating/Elo | 400 | 84.1% | 54.6% / 97.8% / 100.0% | 100.0% / 38.1% | 88.7% / 2.8% / 67.2% | 14.0% | 5.00 / 1.50 / 3.00 | 4 / 71 / 1197 (5.6% / 0.3%; certified 5.6%; unknown 0) |

## Supplemental seed statistics and causal evidence

Population standard deviations below are computed across deterministic seeds.

| Profile | Format | Matches | VCS mean ± SD | Median | Min–max | Partner / opponent / courtmate mean | Relationship / match-type / normalized entropy |
|---|---|---:|---:|---:|---:|---|---|
| narrow | Social | 20 | 56.3% ± 3.1% | 57.9% | 50.5%–59.0% | 37.1% / 58.9% / 73.0% | 71.8% / 7.6% / 55.8% |
| narrow | Social | 400 | 84.9% ± 0.6% | 84.6% | 84.6%–86.1% | 54.7% / 100.0% / 100.0% | 91.4% / 0.8% / 68.7% |
| narrow | Balanced Points | 20 | 56.0% ± 3.3% | 56.4% | 49.8%–59.0% | 37.6% / 58.0% / 72.3% | 71.8% / 7.6% / 55.8% |
| narrow | Balanced Points | 400 | 84.9% ± 0.6% | 84.6% | 84.6%–86.1% | 54.7% / 100.0% / 100.0% | 91.4% / 0.8% / 68.7% |
| narrow | Balanced Rating/Elo | 20 | 56.6% ± 3.2% | 58.6% | 50.5%–59.0% | 37.4% / 59.8% / 72.7% | 72.4% / 0.0% / 54.3% |
| narrow | Balanced Rating/Elo | 400 | 84.6% ± 0.0% | 84.6% | 84.6%–84.6% | 53.8% / 100.0% / 100.0% | 91.3% / 0.0% / 68.5% |
| wide | Balanced Points | 20 | 58.5% ± 1.2% | 59.0% | 56.8%–59.7% | 35.2% / 61.5% / 78.8% | 72.6% / 25.4% / 60.8% |
| wide | Balanced Points | 400 | 85.6% ± 0.7% | 86.1% | 84.6%–86.1% | 56.8% / 100.0% / 100.0% | 90.2% / 2.8% / 68.4% |
| wide | Balanced Rating/Elo | 20 | 54.1% ± 1.1% | 53.5% | 53.1%–55.7% | 31.1% / 58.6% / 72.5% | 69.5% / 25.4% / 58.5% |
| wide | Balanced Rating/Elo | 400 | 84.1% ± 0.7% | 84.6% | 83.2%–84.6% | 54.6% / 97.8% / 100.0% | 88.7% / 2.8% / 67.2% |

### Long waits by cohort

| Profile | Format | Completed ≥5-rest episodes | No fair-class inclusion | Equal-cadence inclusion alternative | Strictly smoother | Cadence-worse | Prior immediate replay linked |
|---|---|---:|---:|---:|---:|---:|---:|
| narrow | Social | 26 | 24 | 2 | 0 | 0 | 0 |
| narrow | Balanced Points | 26 | 24 | 2 | 0 | 0 | 0 |
| narrow | Balanced Rating/Elo | 26 | 24 | 2 | 0 | 0 | 0 |
| wide | Balanced Points | 8 | 6 | 2 | 0 | 0 | 0 |
| wide | Balanced Rating/Elo | 11 | 9 | 2 | 0 | 0 | 0 |

These are completed assignments sampled at selection. The 24/26 narrow cases per format had no candidate containing the waiting player in the fair rotation class during observed deferrals. The two remaining cases had an equal-cadence candidate with the same stronger fairness, starvation, and balance classes; the oracle records both sets and vectors but does not capture entropy values, so the later tie-break is not attributed. None of the current ≥5-rest episodes linked to an immediately preceding rest-zero replay.

### Wide-profile balance-guardrail proof

The exhaustive static Mixed-layout enumeration finds these structurally feasible relationships excluded by the guardrail under the fixed wide skill profile:

**Balanced Points:** allowed max gap 1.5.
- P1–P2 partners: best gap among legal Mixed layouts 2, above the 1.5 window.
- P13–P14 partners: best gap among legal Mixed layouts 2, above the 1.5 window.
- P6–P7 partners: best gap among legal Mixed layouts 2, above the 1.5 window.
- P8–P9 partners: best gap among legal Mixed layouts 2, above the 1.5 window.

**Balanced Rating/Elo:** allowed max gap 30.
- P1–P2 partners: best gap among legal Mixed layouts 80, above the 30 window.
- P1–P3 partners: best gap among legal Mixed layouts 40, above the 30 window.
- P1–P8 partners: best gap among legal Mixed layouts 40, above the 30 window.
- P10–P8 partners: best gap among legal Mixed layouts 40, above the 30 window.
- P12–P14 partners: best gap among legal Mixed layouts 40, above the 30 window.
- P13–P14 partners: best gap among legal Mixed layouts 80, above the 30 window.
- P14–P7 partners: best gap among legal Mixed layouts 40, above the 30 window.
- P5–P7 partners: best gap among legal Mixed layouts 40, above the 30 window.
- P6–P7 partners: best gap among legal Mixed layouts 80, above the 30 window.
- P8–P9 partners: best gap among legal Mixed layouts 80, above the 30 window.
- P1–P14 opponents: best gap among legal Mixed layouts 40, above the 30 window.
- P7–P8 opponents: best gap among legal Mixed layouts 40, above the 30 window.

For these fixed strengths, every legal one-court Mixed partition exposing a listed relationship is worse than the best legal same-quartet layout by more than the guardrail window: at least 2 Points (>1.5) for Balanced Points and at least 40 rating units (>30) for Balanced Rating/Elo. The separate static equal-count two-court audit excludes these same pairs in the opening batch; the same-quartet dominance proof covers subsequent one-court refills. Together this supports guardrail inadmissibility under the fixed 14-player wide strength mapping, standard Mixed legality, full-roster equal-count class, and no added partition-specific constraints. It does not extend to changing skills, other availability/history classes, or later multi-court refills.

### Before/after optimizer timing

| Engine / cohort | Production decisions | Direct optimizer time | Paired diagnostics | Total measured time per production decision | Search limit / certification failures |
|---|---:|---:|---:|---:|---:|
| Baseline de0254f8, narrow 5×3 formats | 6000 | 6000 calls / 115.6 s | none available | 19.26 ms | 0 / 0 |
| Current strict cadence, same cohort | 6000 | 5760 calls / 118.9 s | 240 wrappers / 9.0 s | 21.33 ms | 0 / 0 |

Both rows use the same five narrow seeds × three formats × 400 completed matches. The current no-starvation counterfactual wrapper adds a second search on overdue decisions and includes both runs in its time; the current per-decision total is therefore diagnostic-inclusive and is not production-only latency. Baseline intervention counts remain unknown because that engine has no counterfactual API.

```json
{
  "sourceRevision": "HEAD de0254f8 + working-tree changes",
  "baselineRevision": "HEAD de0254f8 (original engine; benchmark coverage instrumentation added)",
  "coverage": [
    {
      "profile": "narrow",
      "format": "Social",
      "completed": "20",
      "n": 5,
      "relationshipCoverage": {
        "mean": 0.5633699633699634,
        "median": 0.5787545787545788,
        "min": 0.5054945054945056,
        "max": 0.5897435897435896,
        "populationStdDev": 0.03050646566103588
      },
      "partnerCoverage": {
        "mean": 0.3714285714285715,
        "median": 0.3736263736263737,
        "min": 0.3406593406593406,
        "max": 0.40659340659340665,
        "populationStdDev": 0.023466106048420497
      },
      "opponentCoverage": {
        "mean": 0.5890109890109889,
        "median": 0.6043956043956042,
        "min": 0.5384615384615385,
        "max": 0.6483516483516484,
        "populationStdDev": 0.0402863797358755
      },
      "courtmateCoverage": {
        "mean": 0.7296703296703296,
        "median": 0.7472527472527474,
        "min": 0.6373626373626372,
        "max": 0.7692307692307692,
        "populationStdDev": 0.04744402888994051
      },
      "relationshipEntropy": {
        "mean": 0.7179663114805165,
        "median": 0.7250607562445316,
        "min": 0.6760686167992735,
        "max": 0.7469164309782367,
        "populationStdDev": 0.02395824677250281
      },
      "matchTypeEntropy": {
        "mean": 0.07634272456664072,
        "median": 0,
        "min": 0,
        "max": 0.3817136228332036,
        "populationStdDev": 0.15268544913328147
      },
      "normalizedEntropy": {
        "mean": 0.5575604147520475,
        "median": 0.548336568773344,
        "min": 0.5070514625994551,
        "max": 0.6284311519703624,
        "populationStdDev": 0.03963651511628677
      },
      "backToBackRate": {
        "mean": 0.11818181818181817,
        "median": 0.12121212121212122,
        "min": 0.06060606060606061,
        "max": 0.18181818181818182,
        "populationStdDev": 0.0411050302007592
      },
      "assignmentRestMax": {
        "mean": 3,
        "median": 3,
        "min": 2,
        "max": 4,
        "populationStdDev": 0.6324555320336759
      },
      "assignmentRestMean": {
        "mean": 1.4848484848484849,
        "median": 1.4848484848484849,
        "min": 1.4848484848484849,
        "max": 1.4848484848484849,
        "populationStdDev": 0
      },
      "assignmentRestP95": {
        "mean": 3,
        "median": 3,
        "min": 2,
        "max": 4,
        "populationStdDev": 0.6324555320336759
      }
    },
    {
      "profile": "narrow",
      "format": "Social",
      "completed": "400",
      "n": 5,
      "relationshipCoverage": {
        "mean": 0.8490842490842491,
        "median": 0.8461538461538461,
        "min": 0.8461538461538461,
        "max": 0.860805860805861,
        "populationStdDev": 0.005860805860805928
      },
      "partnerCoverage": {
        "mean": 0.5472527472527472,
        "median": 0.5384615384615384,
        "min": 0.5384615384615384,
        "max": 0.5824175824175822,
        "populationStdDev": 0.017582417582417523
      },
      "opponentCoverage": {
        "mean": 1,
        "median": 1,
        "min": 1,
        "max": 1,
        "populationStdDev": 0
      },
      "courtmateCoverage": {
        "mean": 1,
        "median": 1,
        "min": 1,
        "max": 1,
        "populationStdDev": 0
      },
      "relationshipEntropy": {
        "mean": 0.913659070894749,
        "median": 0.9136448414122343,
        "min": 0.9127222725970282,
        "max": 0.9148114596195679,
        "populationStdDev": 0.0006710732190773926
      },
      "matchTypeEntropy": {
        "mean": 0.0082602088390994,
        "median": 9.15264715375691e-16,
        "min": 9.15264715375691e-16,
        "max": 0.04130104419549334,
        "populationStdDev": 0.01652041767819697
      },
      "normalizedEntropy": {
        "mean": 0.6873093553808364,
        "median": 0.6852336310591758,
        "min": 0.6845417044477712,
        "max": 0.696433855763549,
        "populationStdDev": 0.0045695396570340175
      },
      "backToBackRate": {
        "mean": 0.12648171500630517,
        "median": 0.1235813366960908,
        "min": 0.10592686002522068,
        "max": 0.16204287515762925,
        "populationStdDev": 0.019992858696198143
      },
      "assignmentRestMax": {
        "mean": 5.4,
        "median": 6,
        "min": 4,
        "max": 6,
        "populationStdDev": 0.8
      },
      "assignmentRestMean": {
        "mean": 1.4976040353089535,
        "median": 1.4981084489281211,
        "min": 1.4955863808322825,
        "max": 1.4993694829760404,
        "populationStdDev": 0.0012860074435291117
      },
      "assignmentRestP95": {
        "mean": 3,
        "median": 3,
        "min": 3,
        "max": 3,
        "populationStdDev": 0
      }
    },
    {
      "profile": "narrow",
      "format": "Balanced Points",
      "completed": "20",
      "n": 5,
      "relationshipCoverage": {
        "mean": 0.5597069597069597,
        "median": 0.5641025641025641,
        "min": 0.4981684981684982,
        "max": 0.5897435897435896,
        "populationStdDev": 0.0328773709484496
      },
      "partnerCoverage": {
        "mean": 0.3758241758241759,
        "median": 0.38461538461538464,
        "min": 0.3296703296703297,
        "max": 0.40659340659340665,
        "populationStdDev": 0.025441399786352143
      },
      "opponentCoverage": {
        "mean": 0.5802197802197802,
        "median": 0.6043956043956042,
        "min": 0.5274725274725276,
        "max": 0.6153846153846153,
        "populationStdDev": 0.0350272031879323
      },
      "courtmateCoverage": {
        "mean": 0.7230769230769231,
        "median": 0.7472527472527474,
        "min": 0.6373626373626374,
        "max": 0.7582417582417583,
        "populationStdDev": 0.045786080562636625
      },
      "relationshipEntropy": {
        "mean": 0.7183289109231905,
        "median": 0.7236944841076157,
        "min": 0.6695011755031072,
        "max": 0.7469164309782367,
        "populationStdDev": 0.027555701876815938
      },
      "matchTypeEntropy": {
        "mean": 0.07634272456664072,
        "median": 0,
        "min": 0,
        "max": 0.3817136228332036,
        "populationStdDev": 0.15268544913328147
      },
      "normalizedEntropy": {
        "mean": 0.557832364334053,
        "median": 0.5556466017581829,
        "min": 0.5021258816273304,
        "max": 0.6284311519703624,
        "populationStdDev": 0.040803365647290625
      },
      "backToBackRate": {
        "mean": 0.11818181818181817,
        "median": 0.12121212121212122,
        "min": 0.06060606060606061,
        "max": 0.18181818181818182,
        "populationStdDev": 0.0411050302007592
      },
      "assignmentRestMax": {
        "mean": 3,
        "median": 3,
        "min": 2,
        "max": 4,
        "populationStdDev": 0.6324555320336759
      },
      "assignmentRestMean": {
        "mean": 1.4848484848484849,
        "median": 1.4848484848484849,
        "min": 1.4848484848484849,
        "max": 1.4848484848484849,
        "populationStdDev": 0
      },
      "assignmentRestP95": {
        "mean": 3,
        "median": 3,
        "min": 2,
        "max": 4,
        "populationStdDev": 0.6324555320336759
      }
    },
    {
      "profile": "narrow",
      "format": "Balanced Points",
      "completed": "400",
      "n": 5,
      "relationshipCoverage": {
        "mean": 0.8490842490842491,
        "median": 0.8461538461538461,
        "min": 0.8461538461538461,
        "max": 0.860805860805861,
        "populationStdDev": 0.005860805860805928
      },
      "partnerCoverage": {
        "mean": 0.5472527472527472,
        "median": 0.5384615384615384,
        "min": 0.5384615384615384,
        "max": 0.5824175824175822,
        "populationStdDev": 0.017582417582417523
      },
      "opponentCoverage": {
        "mean": 1,
        "median": 1,
        "min": 1,
        "max": 1,
        "populationStdDev": 0
      },
      "courtmateCoverage": {
        "mean": 1,
        "median": 1,
        "min": 1,
        "max": 1,
        "populationStdDev": 0
      },
      "relationshipEntropy": {
        "mean": 0.9137747553756561,
        "median": 0.9135928620268453,
        "min": 0.9132016254360563,
        "max": 0.9148920221388421,
        "populationStdDev": 0.0005809670921474231
      },
      "matchTypeEntropy": {
        "mean": 0.008267647572147886,
        "median": 9.15264715375691e-16,
        "min": 9.15264715375691e-16,
        "max": 0.04133823786073577,
        "populationStdDev": 0.01653529514429394
      },
      "normalizedEntropy": {
        "mean": 0.6873979784247789,
        "median": 0.6851946465201341,
        "min": 0.6849012190770422,
        "max": 0.6965035760693153,
        "populationStdDev": 0.004554370822496403
      },
      "backToBackRate": {
        "mean": 0.12648171500630517,
        "median": 0.1235813366960908,
        "min": 0.10592686002522068,
        "max": 0.16204287515762925,
        "populationStdDev": 0.019992858696198143
      },
      "assignmentRestMax": {
        "mean": 5.4,
        "median": 6,
        "min": 4,
        "max": 6,
        "populationStdDev": 0.8
      },
      "assignmentRestMean": {
        "mean": 1.4976040353089535,
        "median": 1.4981084489281211,
        "min": 1.4955863808322825,
        "max": 1.4993694829760404,
        "populationStdDev": 0.0012860074435291117
      },
      "assignmentRestP95": {
        "mean": 3,
        "median": 3,
        "min": 3,
        "max": 3,
        "populationStdDev": 0
      }
    },
    {
      "profile": "narrow",
      "format": "Balanced Rating/Elo",
      "completed": "20",
      "n": 5,
      "relationshipCoverage": {
        "mean": 0.5663003663003663,
        "median": 0.586080586080586,
        "min": 0.5054945054945056,
        "max": 0.5897435897435896,
        "populationStdDev": 0.031731000480157756
      },
      "partnerCoverage": {
        "mean": 0.3736263736263737,
        "median": 0.38461538461538464,
        "min": 0.3406593406593406,
        "max": 0.40659340659340665,
        "populationStdDev": 0.024075716813413917
      },
      "opponentCoverage": {
        "mean": 0.5978021978021978,
        "median": 0.6043956043956042,
        "min": 0.5384615384615385,
        "max": 0.6593406593406594,
        "populationStdDev": 0.04088148403898523
      },
      "courtmateCoverage": {
        "mean": 0.7274725274725274,
        "median": 0.7472527472527473,
        "min": 0.6373626373626374,
        "max": 0.7582417582417583,
        "populationStdDev": 0.04578608056263661
      },
      "relationshipEntropy": {
        "mean": 0.723965373448365,
        "median": 0.7318844097388005,
        "min": 0.6760686167992735,
        "max": 0.7469164309782367,
        "populationStdDev": 0.02517569829421739
      },
      "matchTypeEntropy": {
        "mean": 0,
        "median": 0,
        "min": 0,
        "max": 0,
        "populationStdDev": 0
      },
      "normalizedEntropy": {
        "mean": 0.5429740300862737,
        "median": 0.5489133073041004,
        "min": 0.5070514625994551,
        "max": 0.5601873232336775,
        "populationStdDev": 0.018881773720663058
      },
      "backToBackRate": {
        "mean": 0.11515151515151514,
        "median": 0.12121212121212122,
        "min": 0.06060606060606061,
        "max": 0.18181818181818182,
        "populationStdDev": 0.04020151261036848
      },
      "assignmentRestMax": {
        "mean": 3,
        "median": 3,
        "min": 2,
        "max": 4,
        "populationStdDev": 0.6324555320336759
      },
      "assignmentRestMean": {
        "mean": 1.4848484848484849,
        "median": 1.4848484848484849,
        "min": 1.4848484848484849,
        "max": 1.4848484848484849,
        "populationStdDev": 0
      },
      "assignmentRestP95": {
        "mean": 3,
        "median": 3,
        "min": 2,
        "max": 4,
        "populationStdDev": 0.6324555320336759
      }
    },
    {
      "profile": "narrow",
      "format": "Balanced Rating/Elo",
      "completed": "400",
      "n": 5,
      "relationshipCoverage": {
        "mean": 0.8461538461538461,
        "median": 0.8461538461538461,
        "min": 0.8461538461538461,
        "max": 0.8461538461538461,
        "populationStdDev": 0
      },
      "partnerCoverage": {
        "mean": 0.5384615384615384,
        "median": 0.5384615384615384,
        "min": 0.5384615384615384,
        "max": 0.5384615384615384,
        "populationStdDev": 0
      },
      "opponentCoverage": {
        "mean": 1,
        "median": 1,
        "min": 1,
        "max": 1,
        "populationStdDev": 0
      },
      "courtmateCoverage": {
        "mean": 1,
        "median": 1,
        "min": 1,
        "max": 1,
        "populationStdDev": 0
      },
      "relationshipEntropy": {
        "mean": 0.9134291404630626,
        "median": 0.9133928054011908,
        "min": 0.9129526194422478,
        "max": 0.913927058455415,
        "populationStdDev": 0.00034259639482326785
      },
      "matchTypeEntropy": {
        "mean": 9.15264715375691e-16,
        "median": 9.15264715375691e-16,
        "min": 9.15264715375691e-16,
        "max": 9.15264715375691e-16,
        "populationStdDev": 0
      },
      "normalizedEntropy": {
        "mean": 0.685071855347297,
        "median": 0.6850446040508932,
        "min": 0.6847144645816858,
        "max": 0.6854452938415613,
        "populationStdDev": 0.0002569472961174883
      },
      "backToBackRate": {
        "mean": 0.12635561160151326,
        "median": 0.1235813366960908,
        "min": 0.10592686002522068,
        "max": 0.1614123581336696,
        "populationStdDev": 0.01976889578034343
      },
      "assignmentRestMax": {
        "mean": 5.4,
        "median": 6,
        "min": 4,
        "max": 6,
        "populationStdDev": 0.8
      },
      "assignmentRestMean": {
        "mean": 1.4976040353089535,
        "median": 1.4981084489281211,
        "min": 1.4955863808322825,
        "max": 1.4993694829760404,
        "populationStdDev": 0.0012860074435291117
      },
      "assignmentRestP95": {
        "mean": 3,
        "median": 3,
        "min": 3,
        "max": 3,
        "populationStdDev": 0
      }
    },
    {
      "profile": "wide",
      "format": "Balanced Points",
      "completed": "20",
      "n": 3,
      "relationshipCoverage": {
        "mean": 0.5848595848595848,
        "median": 0.5897435897435896,
        "min": 0.5677655677655677,
        "max": 0.597069597069597,
        "populationStdDev": 0.012451818104011641
      },
      "partnerCoverage": {
        "mean": 0.35164835164835173,
        "median": 0.3626373626373627,
        "min": 0.30769230769230765,
        "max": 0.3846153846153847,
        "populationStdDev": 0.03235077240413135
      },
      "opponentCoverage": {
        "mean": 0.6153846153846153,
        "median": 0.6153846153846152,
        "min": 0.6043956043956042,
        "max": 0.6263736263736265,
        "populationStdDev": 0.008972489900304786
      },
      "courtmateCoverage": {
        "mean": 0.7875457875457875,
        "median": 0.7802197802197802,
        "min": 0.7692307692307692,
        "max": 0.8131868131868133,
        "populationStdDev": 0.0186777271560176
      },
      "relationshipEntropy": {
        "mean": 0.7258166441624773,
        "median": 0.7266862375132143,
        "min": 0.7073898889122836,
        "max": 0.7433738060619342,
        "populationStdDev": 0.014703235875252383
      },
      "matchTypeEntropy": {
        "mean": 0.25447574855546906,
        "median": 0.3765775033161316,
        "min": 0,
        "max": 0.3868497423502756,
        "populationStdDev": 0.17999038803196016
      },
      "normalizedEntropy": {
        "mean": 0.6079814202607251,
        "median": 0.6417271137224795,
        "min": 0.5305424166842126,
        "max": 0.6516747303754833,
        "populationStdDev": 0.054908033568025455
      },
      "backToBackRate": {
        "mean": 0.10101010101010101,
        "median": 0.10606060606060606,
        "min": 0.030303030303030304,
        "max": 0.16666666666666666,
        "populationStdDev": 0.055784651601955865
      },
      "assignmentRestMax": {
        "mean": 3,
        "median": 3,
        "min": 3,
        "max": 3,
        "populationStdDev": 0
      },
      "assignmentRestMean": {
        "mean": 1.4191919191919193,
        "median": 1.4696969696969697,
        "min": 1.303030303030303,
        "max": 1.4848484848484849,
        "populationStdDev": 0.08237124459747523
      },
      "assignmentRestP95": {
        "mean": 2.6666666666666665,
        "median": 3,
        "min": 2,
        "max": 3,
        "populationStdDev": 0.4714045207910317
      }
    },
    {
      "profile": "wide",
      "format": "Balanced Points",
      "completed": "400",
      "n": 3,
      "relationshipCoverage": {
        "mean": 0.8559218559218561,
        "median": 0.8608058608058611,
        "min": 0.8461538461538461,
        "max": 0.8608058608058611,
        "populationStdDev": 0.0069070259456562744
      },
      "partnerCoverage": {
        "mean": 0.5677655677655676,
        "median": 0.5824175824175822,
        "min": 0.5384615384615384,
        "max": 0.5824175824175822,
        "populationStdDev": 0.02072107783696835
      },
      "opponentCoverage": {
        "mean": 1,
        "median": 1,
        "min": 1,
        "max": 1,
        "populationStdDev": 0
      },
      "courtmateCoverage": {
        "mean": 1,
        "median": 1,
        "min": 1,
        "max": 1,
        "populationStdDev": 0
      },
      "relationshipEntropy": {
        "mean": 0.9024222169254248,
        "median": 0.9021534929740134,
        "min": 0.8999866444848653,
        "max": 0.9051265133173958,
        "populationStdDev": 0.0021069286217068363
      },
      "matchTypeEntropy": {
        "mean": 0.027559021073863054,
        "median": 0.04130163169561003,
        "min": 9.15264715375691e-16,
        "max": 0.0413754315259782,
        "populationStdDev": 0.019487193974777786
      },
      "normalizedEntropy": {
        "mean": 0.6837064179625343,
        "median": 0.6869405276544126,
        "min": 0.674989983363649,
        "max": 0.689188742869541,
        "populationStdDev": 0.006231414606698649
      },
      "backToBackRate": {
        "mean": 0.1353509878100042,
        "median": 0.13808322824716268,
        "min": 0.12799495586380832,
        "max": 0.13997477931904162,
        "populationStdDev": 0.005258510299788487
      },
      "assignmentRestMax": {
        "mean": 5,
        "median": 5,
        "min": 4,
        "max": 6,
        "populationStdDev": 0.816496580927726
      },
      "assignmentRestMean": {
        "mean": 1.50021017234132,
        "median": 1.4993694829760404,
        "min": 1.4993694829760404,
        "max": 1.5018915510718789,
        "populationStdDev": 0.001188914302121068
      },
      "assignmentRestP95": {
        "mean": 3,
        "median": 3,
        "min": 3,
        "max": 3,
        "populationStdDev": 0
      }
    },
    {
      "profile": "wide",
      "format": "Balanced Rating/Elo",
      "completed": "20",
      "n": 3,
      "relationshipCoverage": {
        "mean": 0.5409035409035409,
        "median": 0.5347985347985348,
        "min": 0.5311355311355311,
        "max": 0.5567765567765568,
        "populationStdDev": 0.011323099506099773
      },
      "partnerCoverage": {
        "mean": 0.3113553113553114,
        "median": 0.30769230769230776,
        "min": 0.2857142857142857,
        "max": 0.3406593406593407,
        "populationStdDev": 0.022580271073146464
      },
      "opponentCoverage": {
        "mean": 0.5860805860805861,
        "median": 0.5714285714285714,
        "min": 0.5494505494505494,
        "max": 0.6373626373626374,
        "populationStdDev": 0.03735545431203511
      },
      "courtmateCoverage": {
        "mean": 0.7252747252747254,
        "median": 0.7252747252747254,
        "min": 0.7032967032967035,
        "max": 0.7472527472527474,
        "populationStdDev": 0.017944979800609346
      },
      "relationshipEntropy": {
        "mean": 0.6948537312358932,
        "median": 0.6968218109017461,
        "min": 0.687352872945862,
        "max": 0.7003865098600716,
        "populationStdDev": 0.005499934907567495
      },
      "matchTypeEntropy": {
        "mean": 0.25447574855546906,
        "median": 0.3817136228332036,
        "min": 0,
        "max": 0.3817136228332036,
        "populationStdDev": 0.17994152745109493
      },
      "normalizedEntropy": {
        "mean": 0.5847592355657872,
        "median": 0.6109430604176973,
        "min": 0.5226163581763096,
        "max": 0.6207182881033545,
        "populationStdDev": 0.04412249370981759
      },
      "backToBackRate": {
        "mean": 0.10606060606060606,
        "median": 0.10606060606060606,
        "min": 0.045454545454545456,
        "max": 0.16666666666666666,
        "populationStdDev": 0.04948464126834703
      },
      "assignmentRestMax": {
        "mean": 3,
        "median": 3,
        "min": 3,
        "max": 3,
        "populationStdDev": 0
      },
      "assignmentRestMean": {
        "mean": 1.409090909090909,
        "median": 1.4545454545454546,
        "min": 1.303030303030303,
        "max": 1.4696969696969697,
        "populationStdDev": 0.07525083043308761
      },
      "assignmentRestP95": {
        "mean": 2.6666666666666665,
        "median": 3,
        "min": 2,
        "max": 3,
        "populationStdDev": 0.4714045207910317
      }
    },
    {
      "profile": "wide",
      "format": "Balanced Rating/Elo",
      "completed": "400",
      "n": 3,
      "relationshipCoverage": {
        "mean": 0.8412698412698414,
        "median": 0.8461538461538464,
        "min": 0.8315018315018315,
        "max": 0.8461538461538464,
        "populationStdDev": 0.0069070259456562215
      },
      "partnerCoverage": {
        "mean": 0.5457875457875456,
        "median": 0.5604395604395603,
        "min": 0.5164835164835164,
        "max": 0.5604395604395603,
        "populationStdDev": 0.020721077836968405
      },
      "opponentCoverage": {
        "mean": 0.9780219780219781,
        "median": 0.9780219780219781,
        "min": 0.9780219780219781,
        "max": 0.9780219780219781,
        "populationStdDev": 0
      },
      "courtmateCoverage": {
        "mean": 1,
        "median": 1,
        "min": 1,
        "max": 1,
        "populationStdDev": 0
      },
      "relationshipEntropy": {
        "mean": 0.8869552648036994,
        "median": 0.8882849814778828,
        "min": 0.8839608090839126,
        "max": 0.8886200038493028,
        "populationStdDev": 0.0021218127141135615
      },
      "matchTypeEntropy": {
        "mean": 0.02754662318544891,
        "median": 0.0412644380303676,
        "min": 9.15264715375691e-16,
        "max": 0.0413754315259782,
        "populationStdDev": 0.019478456759196173
      },
      "normalizedEntropy": {
        "mean": 0.6721031043991367,
        "median": 0.6765575939899063,
        "min": 0.6629706068129345,
        "max": 0.6767811123945692,
        "populationStdDev": 0.006458295659630177
      },
      "backToBackRate": {
        "mean": 0.1403951240016814,
        "median": 0.1424968474148802,
        "min": 0.1317780580075662,
        "max": 0.14691046658259774,
        "populationStdDev": 0.006354021209680951
      },
      "assignmentRestMax": {
        "mean": 5,
        "median": 5,
        "min": 4,
        "max": 6,
        "populationStdDev": 0.816496580927726
      },
      "assignmentRestMean": {
        "mean": 1.50021017234132,
        "median": 1.4993694829760404,
        "min": 1.4993694829760404,
        "max": 1.5018915510718789,
        "populationStdDev": 0.001188914302121068
      },
      "assignmentRestP95": {
        "mean": 3,
        "median": 3,
        "min": 3,
        "max": 3,
        "populationStdDev": 0
      }
    }
  ],
  "narrowTiming": {
    "baseline": {
      "decisions": 6000,
      "direct": 115574.21000000002,
      "directCalls": 6000,
      "wrapper": 0,
      "wrapperCalls": 0,
      "limit": 0,
      "fails": 0
    },
    "current": {
      "decisions": 6000,
      "direct": 118923.92999999998,
      "directCalls": 5760,
      "wrapper": 9036.26,
      "wrapperCalls": 240,
      "limit": 0,
      "fails": 0
    }
  }
}
```

Per-session harness totals for this same narrow cohort, including optimizer, independent oracle, and report instrumentation: 161.5 s baseline; 174.8 s current. This broad timing is not production-only matcher latency.
