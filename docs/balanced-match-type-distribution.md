# Balanced match-type distribution

This is a default-off candidate for review. Set `BALANCED_MATCH_TYPE_DISTRIBUTION_ENABLED=1` on the server to opt in. No production setting is changed by this patch. The existing `BALANCED_RECURRENCE_CANDIDATE_ENABLED=0` rollback still restores the production-only matcher.

The primary acceptance case is **14 players, seven Higher and seven Lower, two courts, and 21 completed matches**. Other rosters and longer sessions are secondary checks. The policy applies to Balanced Club rating and Balanced Session points with Mixed pairs. Social, Open pairing and Level Match retain their existing selection policies.

## Roster policy

Classification uses effective Higher/Lower pairing levels, including overrides. Four Higher players are `UPPER`, four Lower are `LOWER`, and conventional mixed requires one of each on both teams. A Higher pair against a Lower pair is not classified as mixed. Existing Social `OWN_SIDE` history and public format definitions stay intact.

For Higher fraction `p = Higher / (Higher + Lower)`, the unconstrained target is:

```text
Mixed = (sqrt(1 + 12*p*(1-p)) - 1) / 3
Higher-only = p - Mixed/2
Lower-only = 1 - p - Mixed/2
```

This maximizes the entropy of the three categories subject to proportional playing slots. It selects equal thirds for an equal roster without fixing the minority's mixed participation to one third. The shares satisfy `4*Higher-only + 2*Mixed = 4*p`, with the symmetric Lower equation.

| Higher / Lower | Higher-only | Mixed | Lower-only |
| --- | ---: | ---: | ---: |
| 7 / 7 | 33.33% | 33.33% | 33.33% |
| 8 / 6 | 40.73% | 32.82% | 26.45% |
| 10 / 5 | 51.42% | 30.50% | 18.09% |
| 12 / 4 | 61.62% | 26.76% | 11.62% |
| 16 / 4 | 68.19% | 23.63% | 8.19% |
| 5 / 10 | 18.09% | 30.50% | 51.42% |
| 11 / 3 | 57.14% | 42.86% | 0% |
| 12 / 2 | 71.43% | 28.57% | 0% |

Small-side and eligibility constraints project the target onto feasible legal quartet patterns. Competitive, Social, crossover and overflow scopes have separate ledgers. Interclub feasibility includes each represented club's level cohorts and its team restrictions. A busy or queued player remains in the structural roster; pauses, departures, joins and level/group changes affect future assignments.

If no equal-opportunity distribution exists, diagnostics report `NO_FAIR_STRUCTURAL_DISTRIBUTION` and the existing fair matcher remains authoritative. For example, 13 Higher plus one Lower cannot give that Lower player a legal Mixed-pairs match. The policy does not manufacture an attainable distribution or relax eligibility to hide this.

## Selection and accounting

The existing fairness/arrival class, group schedule, starvation protections, fixed native balance envelope and replay maximum remain stronger than category distribution. Within the admitted class, selection minimizes cumulative category error, then individual mixed-exposure error, before the existing recurrence/relationship criteria and tie-breaks. The category error is the sum of squared normalized actual-minus-expected counts by scope. Individual expectations accrue only on that player's appearances; first-appearance ranking is neutral, while its expectation is still recorded.

Each new assignment stores its category, target contribution, individual targets and source fingerprint in the existing reason JSON. Current completed, pending, playing, approval and queued rows supply the reversible ledger. Queue activation preserves the stored commitment; undo, cancellation and replacement remove or replace the corresponding contribution. Batch assignments share one source check and account for one another during selection.

Historical rows without adaptive metadata retain their existing relationship/rest information. They are not backfilled using today's roster. Distribution accounting begins with adaptive commitments, so activation is best reviewed on a fresh session. The policy does not rewrite completed history.

Automatic acceptance independently rebuilds targets and scores. The writer rechecks the roster, committed ledger and relevant settings, including crossover frequency, in its transaction. A stale proposal returns 409. Manual and certified fallback assignments also record a current target without claiming an adaptive optimum. No schema migration is needed.

## Targeted replay exception

The review candidate includes the user-approved additional admission reason: at most the **existing `Rmin + 1` replay maximum**, and only when category error strictly improves on the best admitted `Rmin` category error. First exposure and mature recurrence retain their existing exceptions. Reasons never stack into two extra replays.

The existing frontier pass proves the mature-T maximum and category-error minimum independently. T-only shortcuts cannot certify the category frontier. Scope/category alternatives survive dominance pruning, and count-equivalent bound states are deduplicated exactly. Acceptance independently checks the minimum-replay witness's eligibility, schedule, locks, disjointness, fair/arrival/starvation class, balance envelope, replay count and category arithmetic. Missing, incomplete or falsified proof falls back through the existing certification boundary. Search caps are unchanged.

## Optional queue safeguard

A nearly full session can reserve an entire level into fixed own-side and mixed cohorts. A correct session-wide split can then conceal poor individual variety and unequal eventual game counts.

The adaptive policy can defer a **new automatic reservation** when the sole currently possible category would consume every available member of a level and overrepresent that category in its scope. It also avoids an overrepresented reservation that would keep an owed own-side category unavailable, using a half-match deficit to ignore ordinary rounding. That second rule requires a spare participant on the affected level; synchronizing all four members of a level into an own-side court can otherwise create a starvation lock. It applies to whole-session and own-pool scopes, with a conservative availability check.

This gives the next open court a larger available pool. Existing queued commitments, explicit queue requests and actual court-selection rules remain unchanged. Single-category rosters and ordinary 7/7 queues with a spare player on each level do not trigger these safeguards.

The diagnostic reasons are `OVERREPRESENTED_COHORT_RESERVATION` and `UNDERREPRESENTED_TYPE_BLOCKED`. Deferrals and actual play-start cadence are reported separately in the benchmark. These safeguards can trade some queue-assisted rest for better fairness and individual variety; that cost remains part of the activation review.

## Verification method

`scripts/run-balanced-distribution-benchmark.mjs` drives the actual Balanced gate with fixed seeds and records source/runner hashes. It supports sequential or joint openings, asynchronous refill, joint refill and queued commitments. Cadence follows actual play starts, including queue activation, rather than treating a reservation as a played game. Dedicated 21-match runs drain their assignments at exactly 21 completions.

Every returned selection must retain the existing hard certificates, legal disjoint available players, and independently recomputed native balance inside its frozen envelope. Checkpoints report actual/target category counts and percentages, total-variation distribution error, individual mixed counts/expectations, game counts, courtmate/partner/opponent coverage, Social Coverage 321, back-to-back participation, waiting gaps, fallback reasons, optional-queue feasibility/deferrals and wrapper execution time. Fairness certificates refer to the existing eligible selection class; completed game counts are reported separately.

Fixed-strength fixtures cover narrow and wide sample ratings/points. Evolving fixtures use seeded synthetic results and the existing standing-point formula or Elo-style updates; they are matcher simulations, not score-entry HTTP benchmarks. Lifecycle fixtures use the existing no-catch-up credit calculation for a Lower arrival after six completions, followed by an available Higher departure after fourteen. Group/interclub and editing behavior is also exercised through actual POST routes against isolated SQLite fixtures.

The agreed primary tolerance is at least eight of ten seeds per standard configuration in `{7/7/7, 6/9/6, 8/5/8}` Higher/Mixed/Lower, with six games each when feasible. A five-percentage-point coverage loss triggers review. Other review thresholds are +2 points back-to-back participation, +1 waiting completion, +1 point fallback frequency, and p95 latency growth exceeding the greater of 20% or 25 ms. These are review thresholds, not runtime quotas.

Coverage and category diversity have a structural trade-off. With seven players on each level, at most `4 * Mixed` distinct cross-level courtmate pairs can be covered. At 7/7/7, total courtmate coverage is bounded above by `(21 + 21 + 28) / 91 = 76.92%`; at 6/9/6 the upper bound is 85.71%. A high-mixed baseline can exceed these limits. Exceeding a review threshold must be reported, not solved by silently changing the category target or weakening a guard.

## Reproduction

Run from the feature checkout. Supply an unchanged baseline checkout at the recorded revision with its installed dependencies:

```powershell
node scripts/run-balanced-distribution-benchmark.mjs --root=<baseline-checkout> --policy=baseline --cases=14 --matches=21 --schedule=queue --seeds=1,2,3,4,5,4729,104729,7,8,9 --out=benchmarks/generated/balanced-distribution/primary-baseline
node scripts/run-balanced-distribution-benchmark.mjs --policy=candidate --cases=14 --matches=21 --schedule=queue --seeds=1,2,3,4,5,4729,104729,7,8,9 --out=benchmarks/generated/balanced-distribution/primary-candidate
```

Defaults cover both balance metrics, both rest settings, and narrow/wide profiles. `--schedule=async` disables queue reservation; `--schedule=joint` refills courts together. `--opening=joint` tests a batch opening; otherwise asynchronous/queued sessions open courts sequentially. Add `--evolving=true` or `--lifecycle=true` for those secondary fixtures. Raw generated traces remain ignored; reviewed results accompany this report.

## Reviewed results — 17 November 2026

**Recommendation: ship the disabled candidate for review; hold production activation.** The main queued 21-match/two-court result succeeds, while coverage, individual exposure under wide strengths, and immediate-refill cases still need a policy review. The patch does not claim that every acceptance criterion passed.

The [reviewed benchmark artifact](../benchmarks/balanced-match-type-distribution.summary.json) contains all nine paired families: 418 sessions and 9,015 completed matches **per arm**, with 438 paired checkpoints. Baseline revision is `6ef088d0a39335e0a9accc5639daf6c17f2d6f78`. All final candidate runs used engine hash `44a7c9dcbdbaac2705bff05ad6bf5c006503ad4340858ab1eca6a350cbcb8cf3` and runner hash `d7c4b98dab0f9569f202c16df98e02638e4cf4a024c0ebd2720887f07e6fa68c`; each run verified its source stayed unchanged. Earlier development experiments are excluded.

### Primary: seven Higher, seven Lower, two courts, 21 completed matches

Each full asynchronous family covers ten seeds × two metrics × two rest settings × two strength profiles. Joint refill covers rest enabled, ten seeds, both metrics and both profiles. Counts below are Higher-only / Mixed / Lower-only.

| Scheduling | Strengths | Sessions | Candidate result | Within agreed tolerance | Everyone six games |
| --- | --- | ---: | --- | ---: | ---: |
| Automatic queue | Fixed | 80 | 80 × **7/7/7** | 80/80 | 80/80 |
| Automatic queue | Evolving | 80 | 80 × **7/7/7** | 80/80 | 80/80 |
| Immediate asynchronous refill | Fixed | 80 | 75 × 6/9/6; 5 × 5/11/5 | 75/80 | 80/80 |
| Immediate asynchronous refill | Evolving | 80 | 75 × 6/9/6; 4 × 5/11/5; 1 × 4/13/4 | 75/80 | 80/80 |
| Joint opening/refill | Fixed | 40 | 37 × 7/7/7; 3 × 6/9/6 | 40/40 | 40/40 |

Queued baseline fixtures produced 0/21/0 throughout these fixed/evolving families. The candidate produces 33.33% in each category, with zero total-variation error. Immediate refill at 6/9/6 produces 28.57% / 42.86% / 28.57%, a 9.52% total-variation error. These are outcomes from the actual scheduler, not just target-function values.

The immediate-refill wide Club-rating case with rest enabled passes only **5/10 fixed** and **6/10 evolving** seeds, below the agreed 8/10 gate. Wide Club rating with rest disabled passes 9/10 evolving seeds. Other immediate configurations pass 10/10. Rating envelopes, availability and replay admission remain authoritative; the implementation does not widen them to force thirds.

Individual exposure is strongest in fixed narrow queued fixtures: every player plays exactly **two Mixed and four own-side games**. Wide queued Club-rating fixtures range from **zero to six Mixed games per person**, despite perfect session counts and equal total appearances. Evolving narrow fixtures also have some individual variation. The individual-error objective helps within admitted candidates; it cannot guarantee each player a third Mixed when balance and availability constrain the choices. This is an unresolved activation limitation.

### Primary trade-offs

The following are paired ten-seed **fixed, narrow Club-rating, rest-enabled** results at 21 matches. Coverage and cadence values are mean percentages; waiting is the maximum observed completion gap. p95 is the median of each session's measured wrapper p95, in milliseconds.

| Metric | Queue baseline → candidate | Immediate baseline → candidate | Joint baseline → candidate |
| --- | ---: | ---: | ---: |
| Courtmate coverage | 82.53 → **69.23** | 90.44 → **78.02** | 91.32 → **74.84** |
| Partner coverage | 39.34 → 45.82 | 45.27 → 45.38 | 45.71 → 44.84 |
| Opponent coverage | 65.05 → 56.04 | 73.19 → 62.42 | 73.41 → 60.77 |
| Social Coverage 321 | 78.96 → 71.40 | 88.00 → 77.94 | 88.68 → 75.55 |
| Back-to-back participation | 0 → 0 | 15.86 → 14.29 | 10.00 → 8.00 |
| Maximum waiting gap | 3 → 4 | 4 → 4 | 5 → 5 |
| Median session p95 ms | 15.00 → 23.71 | 35.73 → 46.10 | 269.16 → 441.47 |

Courtmate/opponent coverage losses exceed the five-point review gate. Some loss follows directly from fewer Mixed encounters: the ideal 7/7/7 split cannot cover more than 76.92% of all courtmate pairs at this checkpoint. The observed queued 69.23% is below that upper bound; the experiment does not prove globally optimal coverage under the other constraints.

Across primary queued configurations, fixed mean wrapper time is approximately 5.2–11.6 ms and median session p95 is 13.2–28.1 ms. Evolving queued mean time is approximately 6.2–12.6 ms. Joint candidate median p95 ranges from 177–492 ms and exceeds the latency review threshold in all 40 paired seeds. These are local measurements rather than production latency guarantees. Immediate rest-disabled cases also show back-to-back increases that trigger review. The artifact retains each threshold breach rather than averaging it away.

All 360 primary candidate sessions retain hard fairness/schedule/starvation/balance certificates; independently checked native envelopes and legal assignments have zero violations. Candidate fallback frequency is zero in those fixtures. Rest-disabled baseline fallback is the intentional existing route, so its frequency is not evidence of failed certification. Equal completed game counts above are separately checked and do not follow merely from a fairness certificate.

### Secondary checks

These checks support the primary result and do not expand the release target beyond the user's 21-match/two-court priority.

| Roster | Fixed narrow Club rating, queued, 21 matches | Completed game range | Longer sample |
| --- | --- | --- | --- |
| 8 Higher / 6 Lower | 8/8/5 in all three seeds | 6–6 | — |
| 10 Higher / 5 Lower | 12/5/4 in all three seeds | 5–6 | 53/29/18 at 100 |
| 12 Higher / 4 Lower | 11/10/0 in all three seeds | 5–6 | 63/24/13 at 100; 25 games each |
| 5 Higher / 10 Lower | 4/5/12 in all three seeds | 5–6 | — |
| 7 Higher / 7 Lower | 7/7/7 | 6–6 | 33/34/33 at 100 |

The four-person minority can remain in Mixed games early: the 12/4 fixture has no Lower-only game at 21 or 50 matches, then approaches the roster target later. The 10/5 sample has games ranging 11–13 at 45 completions despite an arithmetic equal-games checkpoint; category counts are 24/13/8. These secondary misses are recorded, not treated as proof of an exact endpoint guarantee. Small-side 11/3 fixtures also finish with a 4–7 game range despite structurally proportional targets. Existing selection-class fairness is preserved, but it does not promise equal final counts for every constrained roster.

The 12/2 fixture gives 15/6/0 and six games each, with no snapshot mismatch/fallback. Three-player minority fixtures never invent an impossible own-side category. All-Higher and all-Lower fixtures give 21 legal own-side games and six games each. A one-player minority is explicitly infeasible for Mixed pairs; that participant gets no legal game under the existing format, and the diagnostic remains visible.

The late-arrival/departure sample finishes 7/7/7, with active effective counts 6–7. It defers eight optional reservations; back-to-back participation rises from 0 to 5.71%, while maximum waiting remains three. Secondary 10/5 cases also trigger cadence/latency review flags. No final benchmark session fails to obtain its requested number of matches, and there are zero hard-certificate or native-envelope violations across all 418 candidate sessions. This statement does not erase the completed-count and diversity limitations above.

### Automated verification and changed areas

- Focused Balanced regression: **183 tests passed across 16 files**, including 32 actual generate/queue POST integration tests, immutable default-off comparisons, independent small-roster exhaustive checks, and replay-proof tampering.
- Final affected boundary checks: **11 tests passed**, including eight target/round-trip tests and three queue-deferral tests. Together with the focused run, **187 unique tests** were validated; these totals overlap and are not added together.
- Broader matcher/generate/queue run: 1,017 passed, 11 failed, 18 skipped. All eleven failures reproduce on unchanged main in the same existing Social/group capacity or timing tests. Search caps and assertions were not relaxed.
- Global lint: zero errors, 58 existing warnings. Changed-file lint is clean. Normal production build, including TypeScript, passes in a checkout with physical dependencies; all 21 affected source/test files match the feature checkout by SHA-256. The separate build checkout avoids an existing external dependency-junction restriction without changing build configuration.

The new `v3/balancedMatchTypes.ts` owns targets, feasibility, scoped ledgers, snapshots, scores and lower bounds. `v3/balancedRecurrence.ts` integrates those scores and the certified replay frontier; `v3/balancedCandidateAcceptance.ts` independently checks the proof. New persistence and queue helpers connect current rows and optional reservations. Generate-match selection/assignment/interclub and queue writers forward metadata and reject stale sources. Existing Social history helpers preserve legacy parsing and expose the optional ledger. New tests cover these boundaries, and the standalone benchmark script records the reviewed evidence.

The environment flag remains absent in production and is false by default. No schema migration, database cutover or production writer is part of this change. Activation requires review of the measured coverage loss, wide-strength individual variety, immediate-refill misses and latency/cadence costs above.
