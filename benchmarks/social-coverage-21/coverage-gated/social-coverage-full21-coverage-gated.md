# Matchmaking cadence and relationship coverage benchmark

Generated 2026-10-04T05:29:23.845Z; source commit 71927c6cbc70e13e6ec28b4a534fcdf8481a95c1; policy coverage-gated-best-plus-one; dirty worktree true. Primary seeds: 5; wide-profile Balanced seeds: 3.
Rendered from saved measurement data on 2026-10-04T05:32:39.718Z; measurement source hashes below identify the code used for the benchmark run.
Worktree note: Current checkout includes the strongest-class, Balanced-envelope, certified first-exposure coverage gate and best-plus-one replay admission; hashes identify the exact sources used.
Tracked source changes from commit: core engine clean; shared variety clean; measurement harness clean. Generated untracked artifacts can make the overall worktree dirty without changing these tracked source statuses.
Engine source SHA-256 2c79a82de96d13f020d2ba06089c88757a5aafbbc9f63f4755b8be2c144ee3ce; measurement harness SHA-256 f5ab332d4aafdd73020991612df3bf7d683daafb562a35a27546d8e0d61234fd.

The roster uses the same P1–P14 identities, gender/preference assignments, latent skill ranks, and independent event-level court-completion schedule for every format at a given seed. The narrow profile maps the same rank vector to Points/Social strengths at 0.1 per rank and Rating strengths at 4 per rank; the wide profile maps it at 1 and 40 respectively. `pointDiff` stays 0 because this benchmark has no match scores. Each run has two active courts; one randomly scheduled court completes per event and is refilled. Coverage counts only completed matches. Rest turns count completed-match events while a player is available; active players do not accrue rest. The +1/+2 threshold counters include available idle events before a player's first match; assignment-rest gaps and back-to-back rates exclude first assignments.

Relationship coverage is the mean of each player’s feasible courtmate, partner, and opponent coverage ratios, excluding only empty opportunity facets. It is distinct from normalized Shannon entropy. Match-type coverage is reported separately. Percentages below are seed-level session averages and then mean/median/min/max across seeds.

## Primary narrow-skill profile

| Format | Completed | Relationship coverage (mean; median; min–max) | Partner / opponent / courtmate | MIXED / OWN_SIDE | Normalized entropy | Back-to-back rate | Max assignment rest gap (mean of per-seed maxima) | Mean / p95 assignment rest | +1 / +2 threshold reaches | Starvation changes / overdue (certified, unknown; rates) | Checkpoint / max fairness spread |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| Social | 21 | 64.5%; 65.2%; 57.9%–69.2% | 44.6% / 67.3% / 81.8% | 100.0% / 95.7% | 79.4% | n/a → 23.1% | 4.20; 4.00; 4.00–5.00 | 1.46; 1.46; 1.43–1.49 / 4.00; 4.00; 4.00–4.00 | 4.8 / 0.2 | 0.6 changes (19 overdue; 19 certified, 0 unknown; overdue 19.0%, certified-only 19.0%) | 0.40; 0.00; 0.00–2.00 / 2.40; 2.00; 2.00–3.00 |
| Social | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 83.3% | n/a → 14.7% | 5.80; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 3.40; 3.00; 3.00–4.00 | 79.6 / 10.8 | 9.8 changes (325 overdue; 325 certified, 0 unknown; overdue 15.3%, certified-only 15.3%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Points | 21 | 64.5%; 65.2%; 57.9%–69.2% | 44.6% / 67.3% / 81.8% | 100.0% / 95.7% | 79.4% | n/a → 23.1% | 4.20; 4.00; 4.00–5.00 | 1.46; 1.46; 1.43–1.49 / 4.00; 4.00; 4.00–4.00 | 4.8 / 0.2 | 0.6 changes (19 overdue; 19 certified, 0 unknown; overdue 19.0%, certified-only 19.0%) | 0.40; 0.00; 0.00–2.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Points | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 83.3% | n/a → 14.7% | 5.60; 6.00; 5.00–6.00 | 1.50; 1.50; 1.49–1.50 / 3.40; 3.00; 3.00–4.00 | 79.8 / 9.6 | 9.2 changes (320 overdue; 320 certified, 0 unknown; overdue 14.8%, certified-only 14.8%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Rating/Elo | 21 | 64.9%; 65.2%; 58.6%–69.2% | 44.4% / 67.7% / 82.6% | 100.0% / 95.7% | 79.5% | n/a → 23.4% | 4.20; 4.00; 4.00–5.00 | 1.46; 1.46; 1.40–1.49 / 4.00; 4.00; 4.00–4.00 | 5.4 / 0.2 | 0.8 changes (20 overdue; 20 certified, 0 unknown; overdue 22.3%, certified-only 22.3%) | 0.40; 0.00; 0.00–2.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Rating/Elo | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 83.6% | n/a → 14.6% | 5.60; 6.00; 5.00–6.00 | 1.50; 1.50; 1.50–1.50 / 3.40; 3.00; 3.00–4.00 | 80.6 / 11.0 | 9.8 changes (332 overdue; 332 certified, 0 unknown; overdue 14.9%, certified-only 14.9%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |

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
| Social | 399 / 399 / 399 | 0.0 | 21.0 / 5.3% | 131.2 / 2691.8 | 0.0 / 0.4 / 10.4 of 10.8 | 399.0 / 0.0 |
| Balanced Points | 399 / 399 / 399 | 0.0 | 21.0 / 5.3% | 128.6 / 2657.4 | 0.0 / 0.4 / 9.2 of 9.6 | 399.0 / 0.0 |
| Balanced Rating/Elo | 399 / 399 / 399 | 0.0 | 20.4 / 5.1% | 127.0 / 2620.8 | 0.0 / 0.4 / 10.6 of 11.0 | 399.0 / 0.0 |

A replay-origin long-wait count is decision-level evidence: it means the episode involved a rest-zero player selected by a certified decision using the +1 allowance; it does not claim that this player was uniquely the marginal extra. Counterfactual certification separately reruns the strongest class, Balanced envelope, and replay allowance without starvation. Refill decisions are counted after completed events 1 through N−1 at checkpoint N; the last refill may still be active, and the opening two-court decision is excluded.

## Completed match-type counts by session window

These are actual completed matches, not player-level match-type coverage. Early and late refer to the first and last 100 completed matches of each 400-match run.

| Format | At 21 completed: MIXED / OWN_SIDE | At 400 completed: MIXED / OWN_SIDE | First 100 OWN_SIDE | Last 100 OWN_SIDE |
|---|---:|---:|---:|---:|
| Social | 13.8 / 7.2 | 359.6 / 40.4 | 38.2 | 0.0 |
| Balanced Points | 13.8 / 7.2 | 359.6 / 40.4 | 38.2 | 0.0 |
| Balanced Rating/Elo | 13.8 / 7.2 | 358.4 / 41.6 | 39.4 | 0.0 |

Checkpoint-21 exact player match counts (each row is one seed; IDs are roster identities). The four aggregate columns show min/max/spread and whether all fourteen players have exactly six completed matches.

| Format | Seed | Completed counts by player ID | Min | Max | Spread | All exactly 6 |
|---|---:|---|---:|---:|---:|---|
| Social | 1 | P1=5,P10=6,P11=5,P12=6,P13=6,P14=5,P2=5,P3=6,P4=7,P5=7,P6=6,P7=6,P8=7,P9=7 | 5 | 7 | 2 | no |
| Social | 4729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Social | 104729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Social | 130363 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Social | 2097593 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Points | 1 | P1=5,P10=6,P11=5,P12=6,P13=6,P14=5,P2=5,P3=6,P4=7,P5=7,P6=6,P7=6,P8=7,P9=7 | 5 | 7 | 2 | no |
| Balanced Points | 4729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Points | 104729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Points | 130363 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Points | 2097593 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 1 | P1=7,P10=5,P11=5,P12=6,P13=7,P14=6,P2=5,P3=6,P4=6,P5=6,P6=7,P7=5,P8=6,P9=7 | 5 | 7 | 2 | no |
| Balanced Rating/Elo | 4729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 104729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 130363 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 2097593 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |

## Wide-skill guardrail sensitivity

| Format | Completed | Relationship coverage | Partner / opponent / courtmate | Normalized entropy | Back-to-back rate | Max assignment rest gap | Starvation changes / certified / unknown (rate) | Checkpoint / max fairness spread |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| Balanced Points | 21 | 63.7% | 42.9% / 64.1% / 84.2% | 80.7% | 22.4% | 4.00 | 0.00 / 7 / 0 (0.0%) | 1.33 / 2.33 |
| Balanced Points | 400 | 98.5% | 95.6% / 100.0% / 100.0% | 81.1% | 15.6% | 5.67 | 15.33 / 212 / 0 (22.1%) | 1.33 / 5.00 |
| Balanced Rating/Elo | 21 | 62.0% | 39.2% / 63.4% / 83.5% | 78.3% | 21.9% | 4.00 | 0.33 / 9 / 0 (16.7%) | 1.33 / 2.33 |
| Balanced Rating/Elo | 400 | 95.6% | 89.0% / 97.8% / 100.0% | 80.1% | 16.5% | 5.33 | 16.33 / 222 / 0 (21.8%) | 1.33 / 5.00 |

The wide profile uses the same skill ranks at 10× the narrow strength spread. It is a sensitivity run for balance-envelope restrictions; the primary relationship denominator remains structural and does not shrink to the guardrail.
Static equal-count two-court enumeration excluded 8 directed opportunity records (4 distinct facet-pairs) for wide Balanced Points; the JSON appendix lists the exact pairs.
Static equal-count two-court enumeration excluded 24 directed opportunity records (12 distinct facet-pairs) for wide Balanced Rating/Elo; the JSON appendix lists the exact pairs.

## 400-match relationship completion

| Format | Seeds reaching 100% | Remaining structurally feasible relationships | Guardrail interpretation |
|---|---:|---|---|
| Social | 5/5 | 0 total facet-pairs across seeds | No balance guardrail. |
| Balanced Points | 5/5 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |
| Balanced Rating/Elo | 5/5 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |

The unseen relationship classification is finite-session evidence across the balance envelope and the policy's entropy and late-selection frontiers. The static balance-feasibility audit is reported separately and can show whether a relationship is structurally feasible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.

## Long waits

There were 192 completed assignment gaps of at least five available completed-match rest turns in these runs. Deferred-refill classes: fairness_or_mixed_legality: 179; combined_entropy_priority_exclusion: 13. 7 had a linked immediately preceding rest-zero replay; 0 episodes involved a rest-zero player from a certified decision using the frozen +1 allowance. This is decision-level attribution; it does not identify a uniquely marginal player. Episode records include the strongest-class, balance-envelope, replay allowance, combined entropy, and soft-cadence evidence.

## Runtime

Total measured optimizer/oracle time across sessions: 426.0 seconds. Per-run timings are in JSON.


### Artifact recovery note

The simulation and all benchmark assertions completed. Vitest then failed only while rewriting the completed-status JSON artifact (UNKNOWN on the final file open). The original validationStatus: pending capture is preserved as social-coverage-full21-coverage-gated.pending.json; the canonical report preserves its measurements and provenance exactly, with only validationStatus and recovery metadata added after confirming the completed assertions.

## Machine-readable compact summary

```json
{
  "sourceRevision": "71927c6cbc70e13e6ec28b4a534fcdf8481a95c1",
  "sourceProvenance": {
    "commitSha": "71927c6cbc70e13e6ec28b4a534fcdf8481a95c1",
    "workingTreeDirty": true,
    "workingTreeNote": "Current checkout includes the strongest-class, Balanced-envelope, certified first-exposure coverage gate and best-plus-one replay admission; hashes identify the exact sources used.",
    "policyLabel": "coverage-gated-best-plus-one",
    "coreEngineTrackedDiffPaths": [],
    "sharedVarietyTrackedDiffPaths": [],
    "measurementHarnessTrackedDiffPaths": [],
    "engineSourceSha256": "2c79a82de96d13f020d2ba06089c88757a5aafbbc9f63f4755b8be2c144ee3ce",
    "measurementHarnessSha256": "f5ab332d4aafdd73020991612df3bf7d683daafb562a35a27546d8e0d61234fd"
  },
  "primarySeeds": 5,
  "wideSeeds": 3,
  "groups": [
    {
      "profile": "narrow",
      "format": "Social",
      "completed": 21,
      "varietyCoverageMean": 0.6454212454212453,
      "varietyCoverageMedian": 0.652014652014652,
      "varietyCoverageStdDev": 0.03858518412384961,
      "varietyCoverageMin": 0.5787545787545788,
      "varietyCoverageMax": 0.6923076923076923,
      "partnerCoverageMean": 0.44615384615384623,
      "partnerCoverageStdDev": 0.011206636293610526,
      "opponentCoverageMean": 0.6725274725274726,
      "opponentCoverageStdDev": 0.05311228999382232,
      "courtmateCoverageMean": 0.8175824175824177,
      "courtmateCoverageStdDev": 0.055860505613797115,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0.9571428571428571,
      "completedMixedMatchesMean": 13.8,
      "completedOwnSideMatchesMean": 7.2,
      "first100OwnSideMatchesMean": 38.2,
      "last100OwnSideMatchesMean": 0,
      "relationshipEntropyMean": 0.7881272358441195,
      "matchTypeEntropyMean": 0.8114544384215279,
      "normalizedEntropyMean": 0.7939590364884714,
      "backToBackRateMean": 0.23142857142857146,
      "maxAssignmentRestGapMean": 4.2,
      "maxAssignmentRestGapWorst": 5,
      "meanAssignmentRestGapMean": 1.462857142857143,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 3,
      "decisionsWithOverdue": 19,
      "certifiedCounterfactualDecisions": 19,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 100,
      "backToBackAssignments": 81,
      "checkpointFairnessSpreadMean": 0.4,
      "maximumFairnessSpreadMean": 2.4,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.15789473684210525,
      "starvationRateAcrossCompletedDecisions": 0.03,
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
      "completedMixedMatchesMean": 359.6,
      "completedOwnSideMatchesMean": 40.4,
      "first100OwnSideMatchesMean": 38.2,
      "last100OwnSideMatchesMean": 0,
      "relationshipEntropyMean": 0.9545103234007495,
      "matchTypeEntropyMean": 0.4667476219291225,
      "normalizedEntropyMean": 0.8325696480328426,
      "backToBackRateMean": 0.1467843631778058,
      "maxAssignmentRestGapMean": 5.8,
      "maxAssignmentRestGapWorst": 7,
      "meanAssignmentRestGapMean": 1.4973518284993694,
      "p95AssignmentRestGapMean": 3.4,
      "starvationInterventions": 49,
      "decisionsWithOverdue": 325,
      "certifiedCounterfactualDecisions": 325,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1995,
      "backToBackAssignments": 1164,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 4.6,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.15076923076923077,
      "starvationRateAcrossCompletedDecisions": 0.02456140350877193,
      "starvationRateAmongCertified": 0.15076923076923077
    },
    {
      "profile": "narrow",
      "format": "Balanced Points",
      "completed": 21,
      "varietyCoverageMean": 0.6454212454212453,
      "varietyCoverageMedian": 0.652014652014652,
      "varietyCoverageStdDev": 0.03858518412384961,
      "varietyCoverageMin": 0.5787545787545788,
      "varietyCoverageMax": 0.6923076923076923,
      "partnerCoverageMean": 0.44615384615384623,
      "partnerCoverageStdDev": 0.011206636293610526,
      "opponentCoverageMean": 0.6725274725274726,
      "opponentCoverageStdDev": 0.05311228999382232,
      "courtmateCoverageMean": 0.8175824175824177,
      "courtmateCoverageStdDev": 0.055860505613797115,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0.9571428571428571,
      "completedMixedMatchesMean": 13.8,
      "completedOwnSideMatchesMean": 7.2,
      "first100OwnSideMatchesMean": 38.2,
      "last100OwnSideMatchesMean": 0,
      "relationshipEntropyMean": 0.7881272358441195,
      "matchTypeEntropyMean": 0.8114544384215279,
      "normalizedEntropyMean": 0.7939590364884714,
      "backToBackRateMean": 0.23142857142857146,
      "maxAssignmentRestGapMean": 4.2,
      "maxAssignmentRestGapWorst": 5,
      "meanAssignmentRestGapMean": 1.462857142857143,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 3,
      "decisionsWithOverdue": 19,
      "certifiedCounterfactualDecisions": 19,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 100,
      "backToBackAssignments": 81,
      "checkpointFairnessSpreadMean": 0.4,
      "maximumFairnessSpreadMean": 2.4,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.15789473684210525,
      "starvationRateAcrossCompletedDecisions": 0.03,
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
      "completedMixedMatchesMean": 359.6,
      "completedOwnSideMatchesMean": 40.4,
      "first100OwnSideMatchesMean": 38.2,
      "last100OwnSideMatchesMean": 0,
      "relationshipEntropyMean": 0.9546253192693269,
      "matchTypeEntropyMean": 0.466673513840041,
      "normalizedEntropyMean": 0.8326373679120055,
      "backToBackRateMean": 0.1467843631778058,
      "maxAssignmentRestGapMean": 5.6,
      "maxAssignmentRestGapWorst": 6,
      "meanAssignmentRestGapMean": 1.4974779319041613,
      "p95AssignmentRestGapMean": 3.4,
      "starvationInterventions": 46,
      "decisionsWithOverdue": 320,
      "certifiedCounterfactualDecisions": 320,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1995,
      "backToBackAssignments": 1164,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 4.6,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.14375,
      "starvationRateAcrossCompletedDecisions": 0.02305764411027569,
      "starvationRateAmongCertified": 0.14375
    },
    {
      "profile": "narrow",
      "format": "Balanced Rating/Elo",
      "completed": 21,
      "varietyCoverageMean": 0.649084249084249,
      "varietyCoverageMedian": 0.652014652014652,
      "varietyCoverageStdDev": 0.0355443500973134,
      "varietyCoverageMin": 0.5860805860805861,
      "varietyCoverageMax": 0.6923076923076923,
      "partnerCoverageMean": 0.44395604395604404,
      "partnerCoverageStdDev": 0.013186813186813204,
      "opponentCoverageMean": 0.676923076923077,
      "opponentCoverageStdDev": 0.04943833793055822,
      "courtmateCoverageMean": 0.8263736263736264,
      "courtmateCoverageStdDev": 0.050309991834108204,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 0.9571428571428571,
      "completedMixedMatchesMean": 13.8,
      "completedOwnSideMatchesMean": 7.2,
      "first100OwnSideMatchesMean": 39.4,
      "last100OwnSideMatchesMean": 0,
      "relationshipEntropyMean": 0.7891662397087317,
      "matchTypeEntropyMean": 0.8117294514620825,
      "normalizedEntropyMean": 0.7948070426470693,
      "backToBackRateMean": 0.2342857142857143,
      "maxAssignmentRestGapMean": 4.2,
      "maxAssignmentRestGapWorst": 5,
      "meanAssignmentRestGapMean": 1.457142857142857,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 4,
      "decisionsWithOverdue": 20,
      "certifiedCounterfactualDecisions": 20,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 100,
      "backToBackAssignments": 82,
      "checkpointFairnessSpreadMean": 0.4,
      "maximumFairnessSpreadMean": 2.4,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.2,
      "starvationRateAcrossCompletedDecisions": 0.04,
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
      "completedMixedMatchesMean": 358.4,
      "completedOwnSideMatchesMean": 41.6,
      "first100OwnSideMatchesMean": 39.4,
      "last100OwnSideMatchesMean": 0,
      "relationshipEntropyMean": 0.9557532279821418,
      "matchTypeEntropyMean": 0.4786254286867429,
      "normalizedEntropyMean": 0.8364712781582918,
      "backToBackRateMean": 0.1462799495586381,
      "maxAssignmentRestGapMean": 5.6,
      "maxAssignmentRestGapWorst": 6,
      "meanAssignmentRestGapMean": 1.4981084489281211,
      "p95AssignmentRestGapMean": 3.4,
      "starvationInterventions": 49,
      "decisionsWithOverdue": 332,
      "certifiedCounterfactualDecisions": 332,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1995,
      "backToBackAssignments": 1160,
      "checkpointFairnessSpreadMean": 1,
      "maximumFairnessSpreadMean": 4.6,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.14759036144578314,
      "starvationRateAcrossCompletedDecisions": 0.02456140350877193,
      "starvationRateAmongCertified": 0.14759036144578314
    },
    {
      "profile": "wide",
      "format": "Balanced Points",
      "completed": 21,
      "varietyCoverageMean": 0.6373626373626374,
      "varietyCoverageMedian": 0.6373626373626374,
      "varietyCoverageStdDev": 0.014954149833841218,
      "varietyCoverageMin": 0.619047619047619,
      "varietyCoverageMax": 0.6556776556776558,
      "partnerCoverageMean": 0.42857142857142866,
      "partnerCoverageStdDev": 0.015540808377726265,
      "opponentCoverageMean": 0.6410256410256411,
      "opponentCoverageStdDev": 0.020721077836968457,
      "courtmateCoverageMean": 0.8424908424908426,
      "courtmateCoverageStdDev": 0.01370570471345771,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 1,
      "completedMixedMatchesMean": 13.333333333333334,
      "completedOwnSideMatchesMean": 7.666666666666667,
      "first100OwnSideMatchesMean": 33.666666666666664,
      "last100OwnSideMatchesMean": 0,
      "relationshipEntropyMean": 0.7777096196634622,
      "matchTypeEntropyMean": 0.8929246791273622,
      "normalizedEntropyMean": 0.8065133845294371,
      "backToBackRateMean": 0.2238095238095238,
      "maxAssignmentRestGapMean": 4,
      "maxAssignmentRestGapWorst": 4,
      "meanAssignmentRestGapMean": 1.4000000000000001,
      "p95AssignmentRestGapMean": 3,
      "starvationInterventions": 0,
      "decisionsWithOverdue": 7,
      "certifiedCounterfactualDecisions": 7,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 60,
      "backToBackAssignments": 47,
      "checkpointFairnessSpreadMean": 1.3333333333333333,
      "maximumFairnessSpreadMean": 2.3333333333333335,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0,
      "starvationRateAcrossCompletedDecisions": 0,
      "starvationRateAmongCertified": 0
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
      "completedMixedMatchesMean": 364.6666666666667,
      "completedOwnSideMatchesMean": 35.333333333333336,
      "first100OwnSideMatchesMean": 33.666666666666664,
      "last100OwnSideMatchesMean": 0,
      "relationshipEntropyMean": 0.938419745070138,
      "matchTypeEntropyMean": 0.4281117216488011,
      "normalizedEntropyMean": 0.8108427392148038,
      "backToBackRateMean": 0.15615804960067256,
      "maxAssignmentRestGapMean": 5.666666666666667,
      "maxAssignmentRestGapWorst": 6,
      "meanAssignmentRestGapMean": 1.50021017234132,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 46,
      "decisionsWithOverdue": 212,
      "certifiedCounterfactualDecisions": 212,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1197,
      "backToBackAssignments": 743,
      "checkpointFairnessSpreadMean": 1.3333333333333333,
      "maximumFairnessSpreadMean": 5,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.2169811320754717,
      "starvationRateAcrossCompletedDecisions": 0.03842940685045948,
      "starvationRateAmongCertified": 0.2169811320754717
    },
    {
      "profile": "wide",
      "format": "Balanced Rating/Elo",
      "completed": 21,
      "varietyCoverageMean": 0.6202686202686203,
      "varietyCoverageMedian": 0.6153846153846153,
      "varietyCoverageStdDev": 0.021218738946254975,
      "varietyCoverageMin": 0.5970695970695971,
      "varietyCoverageMax": 0.6483516483516485,
      "partnerCoverageMean": 0.39194139194139205,
      "partnerCoverageStdDev": 0.013705704713457681,
      "opponentCoverageMean": 0.6336996336996336,
      "opponentCoverageStdDev": 0.027411409426915223,
      "courtmateCoverageMean": 0.8351648351648352,
      "courtmateCoverageStdDev": 0.031081616755452686,
      "mixedCoverageMean": 1,
      "ownSideCoverageMean": 1,
      "completedMixedMatchesMean": 13.666666666666666,
      "completedOwnSideMatchesMean": 7.333333333333333,
      "first100OwnSideMatchesMean": 31.666666666666668,
      "last100OwnSideMatchesMean": 0,
      "relationshipEntropyMean": 0.7597577289137094,
      "matchTypeEntropyMean": 0.8544879889124334,
      "normalizedEntropyMean": 0.7834402939133902,
      "backToBackRateMean": 0.21904761904761905,
      "maxAssignmentRestGapMean": 4,
      "maxAssignmentRestGapWorst": 4,
      "meanAssignmentRestGapMean": 1.4095238095238096,
      "p95AssignmentRestGapMean": 3.3333333333333335,
      "starvationInterventions": 1,
      "decisionsWithOverdue": 9,
      "certifiedCounterfactualDecisions": 9,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 60,
      "backToBackAssignments": 46,
      "checkpointFairnessSpreadMean": 1.3333333333333333,
      "maximumFairnessSpreadMean": 2.3333333333333335,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.1111111111111111,
      "starvationRateAcrossCompletedDecisions": 0.016666666666666666,
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
      "completedMixedMatchesMean": 364.6666666666667,
      "completedOwnSideMatchesMean": 35.333333333333336,
      "first100OwnSideMatchesMean": 31.666666666666668,
      "last100OwnSideMatchesMean": 0,
      "relationshipEntropyMean": 0.925247635024995,
      "matchTypeEntropyMean": 0.4291379355188106,
      "normalizedEntropyMean": 0.801220210148449,
      "backToBackRateMean": 0.16477511559478772,
      "maxAssignmentRestGapMean": 5.333333333333333,
      "maxAssignmentRestGapWorst": 6,
      "meanAssignmentRestGapMean": 1.5,
      "p95AssignmentRestGapMean": 4,
      "starvationInterventions": 49,
      "decisionsWithOverdue": 222,
      "certifiedCounterfactualDecisions": 222,
      "uncertifiedCounterfactualDecisions": 0,
      "completedRotationDecisions": 1197,
      "backToBackAssignments": 784,
      "checkpointFairnessSpreadMean": 1.3333333333333333,
      "maximumFairnessSpreadMean": 5,
      "pendingFiveTurnWaits": 0,
      "starvationRateWhenOverdue": 0.22072072072072071,
      "starvationRateAcrossCompletedDecisions": 0.04093567251461988,
      "starvationRateAmongCertified": 0.22072072072072071
    }
  ]
}
```

## Seed-to-seed coverage variation (population SD)

| Profile | Format | Completed | Relationship VCS mean ± SD | Median | Min–max | Partner SD | Opponent SD | Courtmate SD |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| narrow | Social | 21 | 64.5% ± 3.9% | 65.2% | 57.9%–69.2% | 1.1% | 5.3% | 5.6% |
| narrow | Social | 400 | 100.0% ± 0.0% | 100.0% | 100.0%–100.0% | 0.0% | 0.0% | 0.0% |
| narrow | Balanced Points | 21 | 64.5% ± 3.9% | 65.2% | 57.9%–69.2% | 1.1% | 5.3% | 5.6% |
| narrow | Balanced Points | 400 | 100.0% ± 0.0% | 100.0% | 100.0%–100.0% | 0.0% | 0.0% | 0.0% |
| narrow | Balanced Rating/Elo | 21 | 64.9% ± 3.6% | 65.2% | 58.6%–69.2% | 1.3% | 4.9% | 5.0% |
| narrow | Balanced Rating/Elo | 400 | 100.0% ± 0.0% | 100.0% | 100.0%–100.0% | 0.0% | 0.0% | 0.0% |
| wide | Balanced Points | 21 | 63.7% ± 1.5% | 63.7% | 61.9%–65.6% | 1.6% | 2.1% | 1.4% |
| wide | Balanced Points | 400 | 98.5% ± 0.0% | 98.5% | 98.5%–98.5% | 0.0% | 0.0% | 0.0% |
| wide | Balanced Rating/Elo | 21 | 62.0% ± 2.1% | 61.5% | 59.7%–64.8% | 1.4% | 2.7% | 3.1% |
| wide | Balanced Rating/Elo | 400 | 95.6% ± 0.0% | 95.6% | 95.6%–95.6% | 0.0% | 0.0% | 0.0% |

## Completed ≥5-rest gaps by cohort

| Profile | Format | Count | Fairness / legality | Starvation | Balance envelope | First-exposure gate | Replay allowance | Combined entropy | Soft cadence | Later tie | Linked prior rest-zero replay |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| narrow | Social | 54 | 51 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 2 |
| narrow | Balanced Points | 48 | 45 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 2 |
| narrow | Balanced Rating/Elo | 55 | 52 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 2 |
| wide | Balanced Points | 17 | 15 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 1 |
| wide | Balanced Rating/Elo | 18 | 16 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 |

The wait stage columns identify the first active selection layer that lacked a candidate including the deferred player: fairness/legal availability, starvation, balance envelope, first-exposure coverage gate, frozen replay allowance, combined entropy, soft cadence, or a later tie. Candidate gains and chosen sets/rest vectors are recorded per refill; these are observed finite-session opportunities, not proof of permanent impossibility.

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
| Baseline de0254f84adef7414b512e3d3fd936033d65bef8 | 6000 | 6000 / 145.4 s | none available | 24.24 ms | 0 / 0 |
| Current 71927c6cbc70e13e6ec28b4a534fcdf8481a95c1 | 6000 | 5021 / 147.2 s | 979 wrappers / 47.8 s | 32.49 ms | 0 / 0 |

Both rows cover the same 5 narrow seed(s) × 3 formats × 400 completed matches. On overdue decisions the current wrapper returns the production choice and runs one extra no-starvation search; its total time is included here, so the diagnostic-inclusive current number is a conservative instrumentation cost, not production-only latency. The baseline has no counterfactual API and its intervention count is unknown.
Per-session harness totals including matcher, independent oracle, and report instrumentation were 298.0 s baseline and 326.2 s current; this broader scope is not production-only matcher latency.

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
- wait-narrow-SOCIAL_MIX-1-P6-51: Social narrow seed 1, P6, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-44-court-1, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-SOCIAL_MIX-1-P11-89: Social narrow seed 1, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P7-89: Social narrow seed 1, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P1-92: Social narrow seed 1, P1, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P13-92: Social narrow seed 1, P13, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-84-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-SOCIAL_MIX-1-P6-109: Social narrow seed 1, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P2-109: Social narrow seed 1, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P7-109: Social narrow seed 1, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-1-P5-112: Social narrow seed 1, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P6-51: Balanced Points narrow seed 1, P6, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-44-court-1, fair alternatives 12, starvation-equivalent 12, balance-admissible 12, smoother 0.
- wait-narrow-POINTS-1-P11-89: Balanced Points narrow seed 1, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P7-89: Balanced Points narrow seed 1, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P1-92: Balanced Points narrow seed 1, P1, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P13-92: Balanced Points narrow seed 1, P13, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-84-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-POINTS-1-P6-109: Balanced Points narrow seed 1, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P2-109: Balanced Points narrow seed 1, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P7-109: Balanced Points narrow seed 1, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-1-P5-112: Balanced Points narrow seed 1, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P11-51: Balanced Rating/Elo narrow seed 1, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P4-53: Balanced Rating/Elo narrow seed 1, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P4-89: Balanced Rating/Elo narrow seed 1, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P14-89: Balanced Rating/Elo narrow seed 1, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P7-92: Balanced Rating/Elo narrow seed 1, P7, rest 6, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-84-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-ELO-1-P13-92: Balanced Rating/Elo narrow seed 1, P13, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P8-109: Balanced Rating/Elo narrow seed 1, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P11-109: Balanced Rating/Elo narrow seed 1, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P14-109: Balanced Rating/Elo narrow seed 1, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P6-111: Balanced Rating/Elo narrow seed 1, P6, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-100-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-narrow-ELO-1-P9-112: Balanced Rating/Elo narrow seed 1, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-1-P2-301: Balanced Rating/Elo narrow seed 1, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P14-51: Social narrow seed 4729, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P9-110: Social narrow seed 4729, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P6-110: Social narrow seed 4729, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P12-127: Social narrow seed 4729, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P5-166: Social narrow seed 4729, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P10-166: Social narrow seed 4729, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P10-184: Social narrow seed 4729, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P9-231: Social narrow seed 4729, P9, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P3-231: Social narrow seed 4729, P3, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P12-233: Social narrow seed 4729, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P2-233: Social narrow seed 4729, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P8-277: Social narrow seed 4729, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P3-281: Social narrow seed 4729, P3, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-4729-P11-281: Social narrow seed 4729, P11, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P14-51: Balanced Points narrow seed 4729, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P9-110: Balanced Points narrow seed 4729, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P6-110: Balanced Points narrow seed 4729, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P12-127: Balanced Points narrow seed 4729, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P5-166: Balanced Points narrow seed 4729, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P10-166: Balanced Points narrow seed 4729, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P10-184: Balanced Points narrow seed 4729, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P9-231: Balanced Points narrow seed 4729, P9, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P3-231: Balanced Points narrow seed 4729, P3, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P12-233: Balanced Points narrow seed 4729, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-4729-P2-233: Balanced Points narrow seed 4729, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P12-52: Balanced Rating/Elo narrow seed 4729, P12, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P4-110: Balanced Rating/Elo narrow seed 4729, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P13-110: Balanced Rating/Elo narrow seed 4729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P3-127: Balanced Rating/Elo narrow seed 4729, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P13-159: Balanced Rating/Elo narrow seed 4729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P1-159: Balanced Rating/Elo narrow seed 4729, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P3-166: Balanced Rating/Elo narrow seed 4729, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P10-166: Balanced Rating/Elo narrow seed 4729, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P11-184: Balanced Rating/Elo narrow seed 4729, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P12-231: Balanced Rating/Elo narrow seed 4729, P12, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P1-231: Balanced Rating/Elo narrow seed 4729, P1, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P2-233: Balanced Rating/Elo narrow seed 4729, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P11-233: Balanced Rating/Elo narrow seed 4729, P11, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P4-281: Balanced Rating/Elo narrow seed 4729, P4, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-4729-P10-281: Balanced Rating/Elo narrow seed 4729, P10, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P3-13: Social narrow seed 104729, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P13-51: Social narrow seed 104729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P2-54: Social narrow seed 104729, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P1-90: Social narrow seed 104729, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P5-215: Social narrow seed 104729, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P6-227: Social narrow seed 104729, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P12-227: Social narrow seed 104729, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P3-260: Social narrow seed 104729, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P10-260: Social narrow seed 104729, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P2-294: Social narrow seed 104729, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-104729-P13-294: Social narrow seed 104729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P3-13: Balanced Points narrow seed 104729, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P13-51: Balanced Points narrow seed 104729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P2-54: Balanced Points narrow seed 104729, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P1-90: Balanced Points narrow seed 104729, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P8-222: Balanced Points narrow seed 104729, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P13-227: Balanced Points narrow seed 104729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P11-260: Balanced Points narrow seed 104729, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P12-294: Balanced Points narrow seed 104729, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P2-294: Balanced Points narrow seed 104729, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-104729-P8-295: Balanced Points narrow seed 104729, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P3-13: Balanced Rating/Elo narrow seed 104729, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P13-51: Balanced Rating/Elo narrow seed 104729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P2-54: Balanced Rating/Elo narrow seed 104729, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P1-90: Balanced Rating/Elo narrow seed 104729, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P8-222: Balanced Rating/Elo narrow seed 104729, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P13-227: Balanced Rating/Elo narrow seed 104729, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P11-260: Balanced Rating/Elo narrow seed 104729, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P12-294: Balanced Rating/Elo narrow seed 104729, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P2-294: Balanced Rating/Elo narrow seed 104729, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-104729-P8-295: Balanced Rating/Elo narrow seed 104729, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-130363-P3-46: Social narrow seed 130363, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-130363-P1-63: Social narrow seed 130363, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-130363-P3-46: Balanced Points narrow seed 130363, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-130363-P1-63: Balanced Points narrow seed 130363, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-130363-P3-46: Balanced Rating/Elo narrow seed 130363, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-130363-P1-63: Balanced Rating/Elo narrow seed 130363, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P13-65: Social narrow seed 2097593, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P14-74: Social narrow seed 2097593, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P10-74: Social narrow seed 2097593, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P9-74: Social narrow seed 2097593, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P8-88: Social narrow seed 2097593, P8, rest 5, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P13-196: Social narrow seed 2097593, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P5-203: Social narrow seed 2097593, P5, rest 7, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P8-203: Social narrow seed 2097593, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P1-204: Social narrow seed 2097593, P1, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P12-204: Social narrow seed 2097593, P12, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P7-301: Social narrow seed 2097593, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P2-312: Social narrow seed 2097593, P2, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P10-312: Social narrow seed 2097593, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P8-317: Social narrow seed 2097593, P8, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P5-317: Social narrow seed 2097593, P5, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P12-387: Social narrow seed 2097593, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P1-395: Social narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-SOCIAL_MIX-2097593-P11-395: Social narrow seed 2097593, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P13-65: Balanced Points narrow seed 2097593, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P14-74: Balanced Points narrow seed 2097593, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P10-74: Balanced Points narrow seed 2097593, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P9-74: Balanced Points narrow seed 2097593, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P10-88: Balanced Points narrow seed 2097593, P10, rest 5, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P14-203: Balanced Points narrow seed 2097593, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P5-203: Balanced Points narrow seed 2097593, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P7-204: Balanced Points narrow seed 2097593, P7, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P11-204: Balanced Points narrow seed 2097593, P11, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P3-301: Balanced Points narrow seed 2097593, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P9-301: Balanced Points narrow seed 2097593, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P1-312: Balanced Points narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P13-312: Balanced Points narrow seed 2097593, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P3-317: Balanced Points narrow seed 2097593, P3, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P12-317: Balanced Points narrow seed 2097593, P12, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-POINTS-2097593-P11-395: Balanced Points narrow seed 2097593, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P13-65: Balanced Rating/Elo narrow seed 2097593, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P14-74: Balanced Rating/Elo narrow seed 2097593, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P10-74: Balanced Rating/Elo narrow seed 2097593, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P9-74: Balanced Rating/Elo narrow seed 2097593, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P10-88: Balanced Rating/Elo narrow seed 2097593, P10, rest 5, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P14-203: Balanced Rating/Elo narrow seed 2097593, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P5-203: Balanced Rating/Elo narrow seed 2097593, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P7-204: Balanced Rating/Elo narrow seed 2097593, P7, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P11-204: Balanced Rating/Elo narrow seed 2097593, P11, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P3-301: Balanced Rating/Elo narrow seed 2097593, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P9-301: Balanced Rating/Elo narrow seed 2097593, P9, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P1-312: Balanced Rating/Elo narrow seed 2097593, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P13-312: Balanced Rating/Elo narrow seed 2097593, P13, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P3-317: Balanced Rating/Elo narrow seed 2097593, P3, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P12-317: Balanced Rating/Elo narrow seed 2097593, P12, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-narrow-ELO-2097593-P11-395: Balanced Rating/Elo narrow seed 2097593, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P2-23: Balanced Points wide seed 30011, P2, rest 5, classification no_equal_priority_smoother_replay_witness, current wait fairness_or_mixed_legality; origin decision-17-court-1, fair alternatives 6, starvation-equivalent 6, balance-admissible 6, smoother 0.
- wait-wide-POINTS-30011-P11-62: Balanced Points wide seed 30011, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P3-101: Balanced Points wide seed 30011, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P12-134: Balanced Points wide seed 30011, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P11-275: Balanced Points wide seed 30011, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-30011-P4-297: Balanced Points wide seed 30011, P4, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-30011-P5-198: Balanced Rating/Elo wide seed 30011, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P2-42: Balanced Points wide seed 65537, P2, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P14-45: Balanced Points wide seed 65537, P14, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P1-156: Balanced Points wide seed 65537, P1, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P6-280: Balanced Points wide seed 65537, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-65537-P11-280: Balanced Points wide seed 65537, P11, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P6-42: Balanced Rating/Elo wide seed 65537, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P14-42: Balanced Rating/Elo wide seed 65537, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P5-117: Balanced Rating/Elo wide seed 65537, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P6-258: Balanced Rating/Elo wide seed 65537, P6, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P14-258: Balanced Rating/Elo wide seed 65537, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P7-279: Balanced Rating/Elo wide seed 65537, P7, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P8-279: Balanced Rating/Elo wide seed 65537, P8, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P5-280: Balanced Rating/Elo wide seed 65537, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P10-280: Balanced Rating/Elo wide seed 65537, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P14-366: Balanced Rating/Elo wide seed 65537, P14, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-65537-P12-373: Balanced Rating/Elo wide seed 65537, P12, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P5-63: Balanced Points wide seed 999983, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P3-169: Balanced Points wide seed 999983, P3, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P8-169: Balanced Points wide seed 999983, P8, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P14-171: Balanced Points wide seed 999983, P14, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P5-171: Balanced Points wide seed 999983, P5, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-POINTS-999983-P3-352: Balanced Points wide seed 999983, P3, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P10-119: Balanced Rating/Elo wide seed 999983, P10, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P4-169: Balanced Rating/Elo wide seed 999983, P4, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P10-169: Balanced Rating/Elo wide seed 999983, P10, rest 6, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P9-171: Balanced Rating/Elo wide seed 999983, P9, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P5-171: Balanced Rating/Elo wide seed 999983, P5, rest 6, classification combined_entropy_priority_exclusion, current wait combined_entropy_priority_exclusion; no linked immediately preceding rest-zero replay.
- wait-wide-ELO-999983-P5-352: Balanced Rating/Elo wide seed 999983, P5, rest 5, classification fairness_or_mixed_legality, current wait fairness_or_mixed_legality; no linked immediately preceding rest-zero replay.

### Censored at the 400-match checkpoint
None.

### Search and timing scope

- Social narrow seed 1: ordinary optimizer 10737.96 ms; counterfactual wrapper 3361.69 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 22969 ms.
- Balanced Points narrow seed 1: ordinary optimizer 9990.02 ms; counterfactual wrapper 3169.40 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 2481.18 ms; whole harness 24571 ms.
- Balanced Rating/Elo narrow seed 1: ordinary optimizer 9329.45 ms; counterfactual wrapper 3019.10 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 2001.92 ms; whole harness 22881 ms.
- Social narrow seed 4729: ordinary optimizer 10481.41 ms; counterfactual wrapper 4076.09 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 22372 ms.
- Balanced Points narrow seed 4729: ordinary optimizer 8932.98 ms; counterfactual wrapper 3246.00 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 20118 ms.
- Balanced Rating/Elo narrow seed 4729: ordinary optimizer 8648.06 ms; counterfactual wrapper 3574.23 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 19909 ms.
- Social narrow seed 104729: ordinary optimizer 10994.94 ms; counterfactual wrapper 2890.35 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 22361 ms.
- Balanced Points narrow seed 104729: ordinary optimizer 10457.97 ms; counterfactual wrapper 2533.65 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 22259 ms.
- Balanced Rating/Elo narrow seed 104729: ordinary optimizer 9152.95 ms; counterfactual wrapper 2362.70 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 19850 ms.
- Social narrow seed 130363: ordinary optimizer 11056.18 ms; counterfactual wrapper 3343.89 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 22849 ms.
- Balanced Points narrow seed 130363: ordinary optimizer 9498.99 ms; counterfactual wrapper 2708.52 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 20837 ms.
- Balanced Rating/Elo narrow seed 130363: ordinary optimizer 9019.25 ms; counterfactual wrapper 2654.25 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 19951 ms.
- Social narrow seed 2097593: ordinary optimizer 10519.91 ms; counterfactual wrapper 4294.39 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 23368 ms.
- Balanced Points narrow seed 2097593: ordinary optimizer 9104.69 ms; counterfactual wrapper 3191.53 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 20817 ms.
- Balanced Rating/Elo narrow seed 2097593: ordinary optimizer 9232.85 ms; counterfactual wrapper 3335.07 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 21084 ms.
- Balanced Points wide seed 30011: ordinary optimizer 7892.51 ms; counterfactual wrapper 3432.23 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 1593.61 ms; whole harness 19131 ms.
- Balanced Rating/Elo wide seed 30011: ordinary optimizer 7084.57 ms; counterfactual wrapper 2664.19 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 1467.72 ms; whole harness 16035 ms.
- Balanced Points wide seed 65537: ordinary optimizer 7940.14 ms; counterfactual wrapper 3310.06 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 17405 ms.
- Balanced Rating/Elo wide seed 65537: ordinary optimizer 7035.32 ms; counterfactual wrapper 3152.15 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 15220 ms.
- Balanced Points wide seed 999983: ordinary optimizer 8328.47 ms; counterfactual wrapper 2851.01 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 17474 ms.
- Balanced Rating/Elo wide seed 999983: ordinary optimizer 6736.33 ms; counterfactual wrapper 3008.62 ms (two searches); search-limit runs 0; fairness/starvation/balance certification failures 0/0/0; static-feasibility cache miss 0.00 ms; whole harness 14498 ms.

## Compact human-readable checkpoint summary

| Profile | Format | Completed | VCS | Partner / opponent / courtmate | MIXED / OWN_SIDE player coverage | Completed MIXED / OWN_SIDE | First100 / last100 OWN_SIDE | Entropy people / type / all | B2B | Worst max / mean of per-seed maxima / mean / p95 assignment rest | Starvation changed / overdue / all completed |
|---|---|---:|---:|---|---|---:|---:|---|---:|---|---|
| narrow | Social | 21 | 64.5% | 44.6% / 67.3% / 81.8% | 100.0% / 95.7% | 13.8 / 7.2 | first100 OWN_SIDE 38.2 / last100 0.0 | 78.8% / 81.1% / 79.4% | 23.1% | 5.00 / 4.20 / 1.46 / 4.00 | 3 / 19 / 100 (15.8% / 3.0%; certified 15.8%; unknown 0) |
| narrow | Social | 400 | 100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 359.6 / 40.4 | first100 OWN_SIDE 38.2 / last100 0.0 | 95.5% / 46.7% / 83.3% | 14.7% | 7.00 / 5.80 / 1.50 / 3.40 | 49 / 325 / 1995 (15.1% / 2.5%; certified 15.1%; unknown 0) |
| narrow | Balanced Points | 21 | 64.5% | 44.6% / 67.3% / 81.8% | 100.0% / 95.7% | 13.8 / 7.2 | first100 OWN_SIDE 38.2 / last100 0.0 | 78.8% / 81.1% / 79.4% | 23.1% | 5.00 / 4.20 / 1.46 / 4.00 | 3 / 19 / 100 (15.8% / 3.0%; certified 15.8%; unknown 0) |
| narrow | Balanced Points | 400 | 100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 359.6 / 40.4 | first100 OWN_SIDE 38.2 / last100 0.0 | 95.5% / 46.7% / 83.3% | 14.7% | 6.00 / 5.60 / 1.50 / 3.40 | 46 / 320 / 1995 (14.4% / 2.3%; certified 14.4%; unknown 0) |
| narrow | Balanced Rating/Elo | 21 | 64.9% | 44.4% / 67.7% / 82.6% | 100.0% / 95.7% | 13.8 / 7.2 | first100 OWN_SIDE 39.4 / last100 0.0 | 78.9% / 81.2% / 79.5% | 23.4% | 5.00 / 4.20 / 1.46 / 4.00 | 4 / 20 / 100 (20.0% / 4.0%; certified 20.0%; unknown 0) |
| narrow | Balanced Rating/Elo | 400 | 100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 358.4 / 41.6 | first100 OWN_SIDE 39.4 / last100 0.0 | 95.6% / 47.9% / 83.6% | 14.6% | 6.00 / 5.60 / 1.50 / 3.40 | 49 / 332 / 1995 (14.8% / 2.5%; certified 14.8%; unknown 0) |
| wide | Balanced Points | 21 | 63.7% | 42.9% / 64.1% / 84.2% | 100.0% / 100.0% | 13.3 / 7.7 | first100 OWN_SIDE 33.7 / last100 0.0 | 77.8% / 89.3% / 80.7% | 22.4% | 4.00 / 4.00 / 1.40 / 3.00 | 0 / 7 / 60 (0.0% / 0.0%; certified 0.0%; unknown 0) |
| wide | Balanced Points | 400 | 98.5% | 95.6% / 100.0% / 100.0% | 100.0% / 100.0% | 364.7 / 35.3 | first100 OWN_SIDE 33.7 / last100 0.0 | 93.8% / 42.8% / 81.1% | 15.6% | 6.00 / 5.67 / 1.50 / 4.00 | 46 / 212 / 1197 (21.7% / 3.8%; certified 21.7%; unknown 0) |
| wide | Balanced Rating/Elo | 21 | 62.0% | 39.2% / 63.4% / 83.5% | 100.0% / 100.0% | 13.7 / 7.3 | first100 OWN_SIDE 31.7 / last100 0.0 | 76.0% / 85.4% / 78.3% | 21.9% | 4.00 / 4.00 / 1.41 / 3.33 | 1 / 9 / 60 (11.1% / 1.7%; certified 11.1%; unknown 0) |
| wide | Balanced Rating/Elo | 400 | 95.6% | 89.0% / 97.8% / 100.0% | 100.0% / 100.0% | 364.7 / 35.3 | first100 OWN_SIDE 31.7 / last100 0.0 | 92.5% / 42.9% / 80.1% | 16.5% | 6.00 / 5.33 / 1.50 / 4.00 | 49 / 222 / 1197 (22.1% / 4.1%; certified 22.1%; unknown 0) |
