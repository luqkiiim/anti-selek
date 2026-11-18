# Level Match 3.1 refill forecast

This benchmark compares the approved one-court forecast with the refined selector at `2c1a3fc30329a0de53516616ca22414e761021e1`. The goal is to reduce severe games while keeping each replay's mixed count at or below the refined result.

## What the forecast tests

For an ordinary single-court refill in a two- or three-court Rating Mixed Pairs session without groups or automatic queueing, the benchmark keeps the refined selector's original lineup and considers at most three other quartets of the same type. Alternatives must stay in the certified fair class and inside the original quality envelope. They can add at most 0.10 skill compatibility units and five points of team-average Rating gap.

The forecast evaluates every occupied court finishing next, including the proposed court. It releases just that court, updates completed appearances and matchmaking credits, and preserves waiting-player arrival priority. It freezes Ratings and keeps the original mixed-side mapping. The probe reuses legal partition checks, the Rating balance guardrail, the skill scorer, and the same effective match count, arrival, and starvation ordering. The proposed assignment enters the projected distribution ledger once.

A switch requires fewer projected severe finish cases, with every finish order retaining its safe same-side choices and no new severe finish cases. The benchmark keeps the original result if its forecast is incomplete or uses the 40 ms allowance. Batch starts, queued selection, Session Points, Player Groups and Open are controls. The forecast makes no commitments.

## Results and decision

**Keep the forecast benchmark-only.** In the key 90-game comparison the mixed counts held, but severe games stayed at 18 against the agreed maximum of 11. Everyone still played six games.

| Wide-rating single-court replay | Mixed, refined → forecast | Severe, refined → forecast | Main constraint |
| --- | ---: | ---: | --- |
| Seed 1 | 16 → 16 | 6 → 6 | Four refills with predicted risk had no same-type alternative inside the allowed current envelope. |
| Seed 4729 | 14 → 14 | 8 → 8 | Four shortlisted alternatives left the projected severe risk unchanged. |
| Seed 104729 | 12 → 12 | 4 → 4 | Six shortlisted alternatives left the projected severe risk unchanged. |
| Holdout seed 17 | 14 → 14 | 6 → 6 | One refill had no alternative and four shortlisted alternatives left the risk unchanged. |
| Holdout seed 9973 | 14 → 14 | 6 → 6 | Four refills with predicted risk had no same-type alternative inside the allowed current envelope. |

These replays used the original staggered timing. With varied court lengths, newer courts finished ahead of earlier live courts 10–13 times per wide single-court replay. The five mixed counts remained **14, 14, 12, 14 and 14** in both versions. The five severe counts remained **6, 11, 4, 6 and 7**. No forecast timed out in the three original staggered wide single-court runs, so the lack of progress in those runs came from the restricted alternatives and their projected quality.

There were useful switches elsewhere. For example, the moderate holdout seed 17 with varied finish orders kept 14 mixed games and dropped from six severe games to three. The tiered roster at seed 104729 with varied finish orders and asynchronous batch starts went from eight severe games to six, while its mixed count rose from 12 to 14. Preserving the immediate match type did not preserve the full-session count in that replay. This independently blocks the rollout under the agreed per-seed gate.

Across 124 paired replays, the forecast switched 21 individual lineups and fell back on timeout 19 times. All 30 control pairs with zero forecast calls reproduced the exact refined lineup sequence. Across the matrix there were zero legality, fairness, or balance violations, zero avoidable severe games under the existing metric, and no increase in any replay's maximum wait.

The forecast's wall-clock allowance stayed at 40 ms within the current selector deadline. Local p95 remained within 25 ms of baseline for the three original wide single-court seeds. Some other runs crossed the 25 ms review threshold, including the varied wide holdout seed 17 in the broader matrix. The severe-game and match-type gates already rule out app integration.

## Reproduce

Use clean worktrees at frozen 3.0 (`fb040f8a586b0adeb09cc5dfbe40ff73dcf21414`) and refined 3.1 (`2c1a3fc30329a0de53516616ca22414e761021e1`). The command below reproduces the original three wide-rating seeds and two holdouts.

```powershell
node scripts/run-level-match-3-benchmark.mjs --comparison=31 --baseline-worktree=PATH_30 --refined-worktree=PATH_REFINED --policies=refined,forecast --cases=12-8-wide --schedules=single --horizons=30 --seeds=1,4729,104729,17,9973
```

Add `--finish-order=varied` to allow newer assignments to finish before older live courts. The JSON results include match-type counts, per-player matches, severe games, legality and guardrail checks, documented reasons for rejecting forecast alternatives, waiting and back-to-backs, and matcher latency. The simulation uses synthetic ratings and finish times.

The 73 focused tests passed, including forecast projection, a valid same-type switch, timeout fallback, and the existing Level selection and distribution tests. TypeScript and focused ESLint passed. The forecast stays in the benchmark scripts.
