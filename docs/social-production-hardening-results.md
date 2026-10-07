# Social beneficial-rescue production hardening

This pass preserves the `courtmate-beneficial-rescue` objective and the production default. Conditional joint refill remains an experimental simulator policy. No production switch, push, deployment, or database change is part of this work.

## Reachability audit

The generate route accepts multiple `courtIds` and routes the number of empty requested courts to `selectBatchMatchesRespectingSkips`. It does not require an experimental scheduler to fill several already-empty courts. The ordinary queue builder uses `selectSingleCourtMatchRespectingSkips`; active and queued players are reserved by `buildMatchmakingState`.

| State | Production reachability | Interpretation |
| --- | --- | --- |
| 16/2 and 18/3 opening | Initial generation can request all empty courts | Required ordinary generation case |
| One court finishes while others remain active | Normal immediate refill or automatic next-match queue | Smaller available set; ordinary refill case |
| 20 players, 10+10, three-court opening | Initial generation can request three courts | Reachable production boundary, not a joint-refill-only concern |
| Isolated 18/3 prefix-20/50 drain | Host can allow all outstanding matches to finish, then request three open courts | Outside the continuous one-court loop, but the resulting state family is production-reachable |
| Future joint preview while another court is still active | Preview only; those busy players cannot be assigned yet | Experimental forecasting/coordination; never an authorization to assign busy players |
| Availability/history state after a future preview's predicted completions actually occur | May also arise through a manual multi-court request | A preview failure cannot be called inherently unreachable merely because it was discovered by joint-refill simulation |

The isolated drain harness does more than mark busy players available: it appends the outstanding completed matches and updates match counts, baselines, rest, and busy flags. Its exact random salt is diagnostic, but the availability/history configuration can occur without enabling conditional waiting. Conversely, a forecast alone does not establish that a state has occurred: live callers must use current reservations and completed history.

Relevant sources: `generate-match/request.ts`, `generate-match/route.ts`, `generate-match/selection.ts`, `queue-match/shared.ts`, and `socialFrontierScalabilityBenchmark.ts::runIsolatedJointProbe`.

## Acceptance contract

The internal opt-in runs through a shared API acceptance adapter before callers can consume a beneficial-rescue selection. HTTP payloads do not expose the opt-in and the production default remains policy-omitted.

Acceptance requires the requested policy echo; fairness, explicit schedule, starvation, Gmax/Tmax frontier, full-priority, and variety certificates; no search limit or failure; and a valid selected schedule index. The schedule certificate exports the existing internal schedule-rank proof rather than introducing a new objective.

The gate checks finite integer G/deficit values, `chosenG <= Gmax <= 6 * courtCount`, exact deficit arithmetic, and deficit in `{0,1}`. At full Gmax, chosen signed T must equal Tmax-at-Gmax. A one-pair concession must have signed T strictly greater than Tmax-at-Gmax. It independently recomputes selected G/T from the actual returned partitions and completed-only structural context. It also checks legal disjoint quartets, current eligibility, locks, exclusions, and schedule/partition constraints.

If candidate acceptance fails, its layout is discarded. The original production matcher is rerun with policy omitted, original production inputs, and replayed initial random draws. That fallback must still prove the existing hard fairness/schedule/starvation contract and enabled replay/coverage admission gates. Its ordinary soft variety limit can remain acceptable under the existing production contract; it is never labelled an exact beneficial-rescue result. If the fallback cannot establish its hard contract either, no selection is returned.

Persisted `socialPolicyDecision` metadata distinguishes an exact candidate, an explicitly applied production fallback, and no certified selection. Server fallback telemetry records failed proof/invariant reasons, including attempts with no persisted assignment. Rejected candidates cannot supply the accepted layout or candidate-exact label.

Social interclub candidate inputs require the full structural club roster and immutable completed match-type snapshots. Busy/paused members contribute the scoring vocabulary while remaining ineligible. Candidate-only input correction leaves the current available-only production inputs intact for the default and fallback.

Standard single-court generation/refill, pooled single-court selection, reshuffle, replacement with retained players, multi-court generation, and Social Interclub single/replacement/batch selectors share this boundary. Skip handling consumes those same selectors. Automatic queue creation/rebuild currently passes no candidate policy option and remains production-only; its shared selection path is prepared for an explicit future opt-in, but this patch does not enable the candidate there or through HTTP requests. A future default switch must wire that path explicitly and retain the gate.

## Validation record

Implementation and final measurements are recorded below after the source set is frozen. The pre-change engine/API source snapshot is saved under ignored `benchmarks/generated/social-production-hardening/pre-change-2026-10-07-v1/`, with a SHA-256 manifest. Previous readiness results and their raw reports are preserved for exact layout/checkpoint comparisons.

The focused API acceptance suite passes 27/27 tests. It exercises initial generation, refill/reshuffle, retained-player replacement, multi-court generation, Interclub structural inputs and team legality, each missing certificate, a diagnostic search-limit result, a non-beneficial concession, a deficit greater than one, a reserved player, a candidate exception, and a fallback whose own fairness proof fails. Accepted assignments preserve explicit candidate/fallback metadata in `matchmakingReasonJson`; when both attempts lack hard proof, the selector returns no assignment and logs `appliedPolicy: "none"`. Existing Social route integration passes 20/20 tests; the existing queue-history regression also passes. TypeScript and scoped ESLint pass.

The first broad regression run exposed four existing service-test failures because the default batch caller bypassed its original `findBestBatchSelectionV3` wrapper. The no-policy call path was restored rather than changing the tests; all 58 service tests then passed. The candidate adapter remains restricted to the explicit opt-in branch. The search engine and frozen benchmark sources did not change during this repair.

The final broad sequential suite passes **627 tests in 50 files**, with **13 opt-in benchmark tests in six files skipped** and no failures. It covers the matchmaking v3 regressions, independent oracles/controls, Social history, all generate-match tests, and queue-match tests, including Balanced Points and Elo. The new controlled benchmark runs remain capped at 100 completed matches; existing regression fixtures are exercised as authored.

Validation commands:

```sh
npx vitest run src/lib/matchmaking/v3 src/lib/matchmaking/socialSessionHistory.test.ts 'src/app/api/sessions/[code]/generate-match' 'src/app/api/sessions/[code]/queue-match' --no-file-parallelism --maxWorkers=1 --reporter=verbose
npx tsc --noEmit --pretty false
npx eslint 'src/app/api/sessions/[code]/generate-match/selection.ts' 'src/app/api/sessions/[code]/generate-match/interclub.ts' 'src/app/api/sessions/[code]/generate-match/socialCandidateAcceptance.ts' 'src/app/api/sessions/[code]/generate-match/socialCandidateAcceptance.integration.test.ts' src/lib/matchmaking/v3/socialBatch.ts src/lib/matchmaking/v3/socialFrontierSearchBounds.ts src/lib/matchmaking/v3/socialFrontierSearchBounds.test.ts src/lib/matchmaking/v3/socialFrontier18ThreeCourtExactness.test.ts src/lib/matchmaking/v3/singleCourt.ts src/lib/matchmaking/v3/types.ts
npm run build
git diff --check
```

All checks pass on the final source. The local build runs on Node 24.21.0 and Next 16.2.7; it does not migrate or deploy. Final suite/build logs and `source-and-validation-manifest.json` are saved under `benchmarks/generated/social-production-hardening/final-2026-10-07-v1/`. The initial failing suite log is preserved separately, along with the final zero-failure run.

The normal-budget API smoke fixtures use deterministic seed 1 and the real selector/matcher boundary:

| Players / split / courts | Accepted policy |
| --- | --- |
| 10 / 5+5 / 2 | Exact beneficial rescue |
| 12 / 6+6 / 2 | Exact beneficial rescue |
| 14 / 7+7 / 2 | Exact beneficial rescue |
| 14 / 8+6 / 2 | Exact beneficial rescue |
| 15 / 8+7 / 3 | Exact beneficial rescue |
| 16 / 8+8 / 2 | Exact beneficial rescue |
| 16 / 8+8 / 3 | Exact beneficial rescue |
| 18 / 9+9 / 3 | Exact beneficial rescue |
| 20 / 10+10 / 3 | Explicit certified production fallback |

The 20/3 API fixture consistently rejects incomplete priority/variety proof after a search limit. Whether the candidate finishes its G/T frontier before the wall-clock cap is runtime-sensitive: one run had no selection/frontier, another reached `Gmax=18, Tmax=6` and returned a diagnostic selection. The test deliberately asserts the stable safety outcome rather than assuming an incomplete frontier is always available. The fallback proves the production hard contract; it does not claim beneficial-rescue exactness.

## Independent exactness evidence

The new 18/3 oracle constructs legal courts from side counts and the three pairings of each quartet, independently of the matcher's search or pruning. At the fresh 9+9 opening, every legal three-court batch has equal stronger-class values, `G=18`, `T=6`, courtmate-equity profile, replay/cadence, new-P/new-O, relationship entropy and repeat penalties. A literal zero balance gap is attainable and is the absolute lower bound. The oracle enumerates all 3,348 legal courts, all 206 exact-zero court layouts, and all 32,107 unordered disjoint triples on that remaining frontier. It independently reproduces Park–Miller draws and the salted FNV-1a batch hash and obtains the same unique unordered winner as the optimized matcher for seeds `1`, `4729`, and `104729`.

For each seed's first ordinary refill history, a separate enumeration covers all 18 legal layouts among the six never-played available players. It reconstructs the fairness class, `Gmax=6`, `Tmax=2`, admission and final winner, matching the frozen history fixture. These are six scoped tests, not repeated calls to the optimized search pretending to be an oracle. The first-refill fixture's provenance is pinned to SHA-256 `45f18d29d64fec9d8245b274f4f665b09a38b30de5cf02157051bfeeb453555f`; full current-history parity is reported with the final session runs below.

This evidence establishes combined-score unordered opening winners and the specified first-refill family. It does not universally prove arbitrary histories, side-balanced tie-break salts, or every physical-court ordering. Existing independent admission oracles and frozen full-projection controls cover positive, tied and negative T, fairness/arrival, locked players, starvation, schedule order and side-balanced zero/nonzero salts. The earlier 90-second old-engine timeout remains inconclusive as a direct differential comparison; it has not been relabelled as a pass or rerun indefinitely.

A separate production-import-free 20/3 diagnostic finds 5,310 legal court partitions, including 305 exact-zero partitions and 188,074 unordered disjoint zero-gap three-court layouts. This explains why strict partition dominance still leaves a large late tie frontier. It is not a proof that every exact algorithm must visit each layout. The count script, JSON and SHA-256 manifest are saved under `benchmarks/generated/social-production-hardening/diagnostics/20-10-10-3-zero-gap-count/`.

## Exact search changes and frozen measurements

The additional improvements are strict same-quartet/same-T partition dominance, compatible remaining-court G/T upper bounds with cached legal suffixes, and deferred entropy scoring/full sorting in the G/T frontier pass. The compatible bounds run in both recursive beneficial-rescue passes; dominance filtering runs only in the final selection pass. Numerically ambiguous strict float improvements and all complete ties remain available to the unchanged comparator. Details and admissibility arguments are in [social-frontier-search-proof.md](social-frontier-search-proof.md).

The objective, signed T definition, strict one-pair admission rule, random draw consumption, and existing budget definitions remain unchanged. Larger searches retain the normal 50,000-branch / 2,000-ms **per-phase** cap; smaller exact searches retain their existing unbounded setting. No final run uses a budget override. `elapsedMs` below measures the whole matcher call across its internal phases, so a fully certified call can exceed 2,000 ms in total. Pruned counts include removed dominated partitions and cut search branches; they are not counts of enumerated complete layouts or a pruning percentage.

All runs use seeds `1`, `4729`, and `104729`. Each full-horizon row represents three sessions of 100 completed matches, with 300 actual matcher calls. Joint previews/drained probes are separate and never executed in those sessions.

| Players / split / courts | Sessions completed | Certified calls | Explored / pruned | Search limits | Median / p95 / maximum call ms | One-pair rescues |
| --- | --- | --- | --- | --- | --- | --- |
| 14 / 7+7 / 2 | 3/3 | 300/300 | 81,871 / 30,299 | 0 | 8.440 / 10.523 / 131.599 | 13 |
| 16 / 8+8 / 2 | 3/3 | 300/300 | 175,988 / 86,242 | 0 | 18.532 / 21.744 / 234.415 | 12 |
| 18 / 9+9 / 3 | 3/3 | 300/300 | 198,217 / 65,207 | 0 | 8.659 / 11.238 / 2,079.019 | 24 |
| 14 / 8+6 / 2 | 3/3 | 300/300 | 81,582 / 31,359 | 0 | 8.441 / 10.337 / 131.244 | 7 |
| 14 / 10+4 / 2 | 3/3 | 300/300 | 88,816 / 39,393 | 0 | 9.035 / 20.370 / 123.980 | 6 |

`p95` is the nearest-rank value at `ceil(0.95*n)`. Across all 1,500 actual calls there are zero fairness failures, starvation failures, full-priority failures, search limits, nonpositive conditional rescue benefits, or deficits greater than one. All 62 concessions have `chosenT > TmaxAtGmax`; the maximum deficit is exactly one.

All six 16/18 sessions retain the exact completed histories and per-decision normalized court layouts of the saved readiness runs. Their chronology and stable certificate/G/T fields match exactly; all 12 checkpoint comparisons for scores, variety, fairness and rest agree within `1e-9`. This covers 600 actual decisions. The 14-player balanced/unequal runs also pass the runner's frozen reference comparisons. Search counters and timings are intentionally allowed to change.

The fresh 18/3 opening explores 43,222–43,254 combined branches, fewer than the earlier 45,736–45,777. Its whole-call time is higher than the earlier readiness timing in this run; fewer branches do not guarantee less CPU work because compatibility bounds add work per node. Both search phases nevertheless certify within their unchanged limits. Running opening proofs concurrently with other test files exceeded the wall budget in an earlier test invocation; the isolated/sequential rerun passed. Resource-sensitive limits are handled by the acceptance gate rather than turned into exact claims.

Frozen engine-set SHA-256: `29796f62c251f29fbd471ba9368470456dc8feeed0dbf7603f8e21ded8610dd9`.

Frozen measurement-harness SHA-256: `ce0752a3c85e5bacf553241bd4620b53a153c37c8ad6f40f742fa766112a8498`.

Evidence is under `benchmarks/generated/social-production-hardening/final-2026-10-07-v1/{primary,regressions,opening}/`. Each profile has a `social-frontier-scalability-run-manifest.json`, validates the raw reports, and checks source hashes before/after every scenario. The separate `parity/compare-16-18-legacy.mjs` / `parity/legacy-parity.json` preserves the six-session comparison, source/reference hashes and tolerance. The parity result SHA-256 is `f73736b0d2809e5f7d21090b96778303e9c17a0f6f050c926f120ba991809b69`.

## Remaining reachable boundaries

The fresh larger-roster probes are diagnostic only. No uncertified batch executes.

| Players / split / courts | Seed | Selection | Full certification | Gmax / Tmax | Explored / pruned | Whole-call ms | Limit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 20 / 10+10 / 3 | 1 | Diagnostic | No | 18 / 6, certified | 53,609 / 12,941 | 2,634.900 | Yes, final priority |
| 20 / 10+10 / 3 | 4729 | Diagnostic | No | 18 / 6, certified | 53,609 / 13,009 | 2,475.090 | Yes, final priority |
| 20 / 10+10 / 3 | 104729 | Diagnostic | No | 18 / 6, certified | 53,601 / 12,938 | 2,452.202 | Yes, final priority |
| 24 / 12+12 / 3 | 1 | None | No | Uncertified | 3,828 / 2,925 | 2,001.720 | Yes, before proof |
| 24 / 12+12 / 3 | 4729 | None | No | Uncertified | 3,786 / 2,883 | 2,003.259 | Yes, before proof |
| 24 / 12+12 / 3 | 104729 | None | No | Uncertified | 3,741 / 2,838 | 2,002.440 | Yes, before proof |

For the isolated 18/3 probes, requesting prefix 20 drains the remaining two active matches and produces a 22-completion history; prefix 50 similarly produces 52. The probe random stream is separate. These batches are never executed in the ordinary 100-match runs, but hosts can reach their history/availability family by allowing courts to empty before generating another batch.

| Seed | Requested prefix → drained history | Result | Gmax / Tmax | Chosen G / T | Explored / pruned | Whole-call ms | Limit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 20 → 22 | Fully certified | 17 / 0 | 17 / 0 | 36,665 / 39,969 | 2,396.483 | No |
| 4729 | 20 → 22 | Diagnostic selection, final priority incomplete | 14 / 0.5, certified | 14 / 0.5 | 64,068 / 64,333 | 3,252.526 | Yes |
| 104729 | 20 → 22 | Diagnostic selection, final priority incomplete | 13 / 0, certified | 13 / 0 | 91,319 / 72,397 | 895.954 | Yes |
| 1 | 50 → 52 | Diagnostic selection, final priority incomplete | 5 / −1.5, certified | 4 / 0 | 70,774 / 49,451 | 1,958.831 | Yes |
| 4729 | 50 → 52 | No selection/frontier proof | Uncertified | — | 50,000 / 43,443 | 1,690.401 | Yes |
| 104729 | 50 → 52 | No selection/frontier proof | Uncertified | — | 50,000 / 39,778 | 1,452.278 | Yes |

The new bounds improve one of the six previously failing drained probes to full certification. Five remain limited. Combined explored counts can exceed 50,000 because the budget applies separately to the frontier and final-selection phases. The seed-1 prefix-50 diagnostic satisfies the strict one-pair arithmetic (`0 > −1.5`) but is still rejected because ranking is incomplete. Passing rescue arithmetic alone does not establish the winner.

These reachable manual batches and 20/24 openings still require an explicitly labelled fallback if opted into the candidate. Current ordinary immediate-refill sessions have no such failure in the tested horizons. Live joint-refill forecasting remains experimental and disabled, and its unresolved preview limits have not been turned into assignment permission. The earlier 81 limited future previews were not rerun in this pass; their current-source certification status is unmeasured, and their post-completion states cannot be declared universally unreachable.

## Readiness answers

| Question | Answer |
| --- | --- |
| Can every realistic immediate-refill Social candidate path safely use beneficial rescue? | The audited generation/refill, reshuffle, replacement, grouped/pool, multi-court and Interclub opt-in selectors have the shared acceptance boundary. Automatic queue creation/rebuild remains production-only; a future switch must explicitly route its opt-in through that boundary. Safety requires retaining the hard-proof production fallback and no-assignment outcome. |
| Can an uncertified beneficial-rescue layout be silently accepted? | The audited opt-in paths reject it. Required certificates, search-limit state, admission arithmetic, selected G/T and legal eligibility are checked before consumption. A fallback has a separate applied-policy label and server telemetry; it never becomes `candidate-exact`. A future caller must use this boundary rather than switching the low-level matcher default underneath an ungated caller. |
| Are 16/2 and 18/3 fully certified under normal budgets? | Yes: all 600 actual decisions in six 100-match sessions certify with zero limits; complete histories/layouts remain unchanged. This is evidence for the tested seeds and state families, not an unconditional runtime guarantee under every server load. |
| Which remaining limits are production-reachable? | Five of six drained 18/3 manual-batch probes, all three 20/3 opening probes, and all three 24/3 opening probes remain limited. These history/availability families can occur with empty courts and manual batch requests. Forecasts that still rely on busy players are experimental-only at preview time; their eventual post-completion states can also be reachable. |
| Is independent 18/3 evidence sufficient? | Strong enough for the represented realistic opening/first-refill family: complete independent legal/zero-balance frontier and salt enumeration for all three seeds, plus independent admission controls and six-session current-history parity. Arbitrary future histories, side-balanced salts and every physical ordering are not universally proven. |
| Did integration/regression tests pass? | Yes: final broad suite 627 passed / 13 opt-in benchmark skips / zero failures; acceptance 27/27; service 58/58; existing Social route integration 20/20. TypeScript, scoped ESLint, local production build and diff checks pass. Balanced Points/Elo and no-policy paths are covered. |
| What blocks a default switch? | No unresolved policy-objective, acceptance, strict-rescue, or tested ordinary-16/18 certification issue requires another redesign. A separate switch task must explicitly wire all Social callers, including queue creation/rebuild, through the gate, keep fallback telemetry, and validate the changed defaults while preserving Points/Elo. Exact beneficial-rescue certification for every reachable larger manual batch is still incomplete; making an exact-only guarantee would require further search work. |

The evidence supports considering a separate default-switch task **with the certified production fallback retained**. It does not support silently accepting limited candidates or promising that every reachable multi-court state uses beneficial rescue. Joint refill remains outside that change, disabled by default. This pass does not switch defaults, push, deploy, migrate, or begin a production cutover.
