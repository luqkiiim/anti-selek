# Grouped Balanced Points matcher: work-in-progress handoff

Prepared 17 October 2026 at the user's request to stop this account's work and transfer it to another account. This branch is **not release-ready**. No feature deployment or database migration has occurred. The original controller automation has been paused; do not restart it from another account without the user's instruction.

Repository: `luqkiiim/anti-selek`. Branch: `codex/grouped-matcher-capacity`. Starting commit: `c6f49043`. Read [NEXT_AGENT_PROMPT.md](NEXT_AGENT_PROMPT.md) to continue.

## Actual scope and user preferences

Make Balanced Points with player groups and Mixed reliably handle 22–24 eligible players on three courts, considering all eligible players and preserving fairness, rest, group/Mixed legality, balance and certification. Race is a retired format and is not this task.

Keep the shared five-second computation budget. Primary search plus independent acceptance has a three-second cutoff; fallback plus acceptance has a 4.5-second cutoff. Engine cutoffs reserve 100 ms for acceptance (2.9/4.4 seconds). Existing two-second phase and 200,000-branch limits remain. Do not raise caps, silently shortlist players, accept an interrupted proof, or weaken assertions to make a case pass.

The user objected to excessive testing orchestration and usage. The 62-case matrix was an assistant-selected validation design, not 62 separate requested features. Focus on saved failures and relevant regression tests, then a varied smoke and one unattended local batch on stable code. Avoid repeated full-matrix restarts and agent analysis of each passing case. Broader tests must not become additional product scope.

Never use the retired `tournament-feature-flow` skill or require a separate ChatGPT planner. If delegating, use Sol 6.1 high/xhigh, Sol 6 high/medium and Luna max according to complexity; Astra high/xhigh is review/feedback only. The original chat was orchestrator-only. Routine tests, commits, pushes, PRs, merges and compatible deployments were authorized, but production database cutover requires separate explicit approval. No database change is expected here.

## Implemented changes

### Matcher and budget

- Added optional monotonic request budget and phase diagnostics in `src/lib/matchmaking/v3/searchBudget.ts`. Child cutoffs retain the original start; retries and fallback do not refresh the deadline.
- Propagated budget through grouped preparation, candidate enumeration, both engines and independent acceptance. Candidate/frontier/compatibility/bound scans periodically check deadlines. Interrupted work is not published as a complete cache or certificate.
- Cached complete immutable RNG-independent structural opportunities only. Mutable sets/maps, scores, candidates, salts and certificates are rebuilt or kept local.
- Added exact baseline/replay pruning and compatible-list reuse. Prunes retain hard objective order and existing admission/certification gates, rather than changing match quality.
- Proved global fairness now enables necessary count filtering even when the selected group schedule is not the relaxed lowest rank. Full early-certification conditions remain stronger and unchanged.
- Latest patch adds necessary count-band membership pruning and reuses complete node-compatible lists for the coverage bound/cache. This latest patch is the immediate verification priority.

### API, queue and UI

- A shared root budget starts before state preparation for grouped Points + Mixed requests with three courts and 12–24 eligible players. The original accidental exact-22-or-24 predicate was corrected. This is not a new rejection of 25-player requests; other paths keep their prior policy.
- Commit the full court batch before optional queue work. Queue work uses the same deadline and requires at least 250 ms before its applicable cutoff. Post-commit queue errors do not turn persisted court creation into a failed response.
- A genuinely deferred absent autoqueue produces an optional `deferredQueueRecovery` response marker. An explicit authenticated recovery GET uses `recoverDeferredQueue=1`. Ordinary GET remains read-only, so Clear does not recreate the queue.
- Recovery preserves intent through cooldown/429 Retry-After. Clear cancels pending recovery and waits for an already-dispatched response before deleting. Stale successful responses cannot overwrite newer local state; a local update does not discard 429 retry intent.
- Mutation actors and automatic-queue eligibility are rechecked inside the writer. Explicit operator queue creation retains its existing behavior.
- Committed courts patch the UI urgently before the refresh completes.
- Limits: response ordering is guaranteed for the same mounted client after a completed recovery response. Network rejection does not prove the server stopped; a stale explicit request from another authorized client is still an authorized queue action. No global cancellation or exactly-once guarantee is claimed.

## Latest failing case and current repair

Before the latest engine changes, fingerprint `9a57f92bb99e57659ed7fb796a787c56046ab91717a8459d8020fdb40ee35b7a` had **14/62 matrix cases pass**. The next case, 22 players split 12/10, balanced profile, seed 4729, joint refill, failed after nine completed matches (selection step 3). Primary search reached the variety cutoff; fallback could not finish coverage by its cutoff. Root elapsed was about 4.402 seconds; no batch was certified.

The exact synthetic state is now committed in `src/lib/matchmaking/v3/__tests__/fixtures/groupedTwentyTwoNineMatches.json`, with regression `groupedTwentyTwoNineMatchesCapacity.test.ts`. Earlier failure fixtures/tests are preserved too.

The latest isolated reproduction **passed in 4.414 seconds**, through the existing production fallback contract. Its scope was **core-only**: fairness, schedule, starvation, balance, replay and coverage were certified; recurrence and late variety were not. The fallback still had `searchLimitReached=true` for interrupted late ranking. This acceptance mode existed before this work and was checked by Astra; do not describe it as full recurrence/late-variety certification.

Changes responsible: implied mandatory count bands after a globally fair witness; reuse of complete `compatibleByCourt` lists in the optimistic coverage bound; extension of the existing complete identity-scoped compatibility cache to Balanced coverage. No cap or acceptance relaxation was added.

**Still unverified for this latest patch:** focused differential/deadline tests, fresh TypeScript/lint/build, complete target trajectory and current-fingerprint matrix. The last focused batch was not run because quota expired. Do not transfer earlier passing suites to this revision by assumption.

Latest engine evidence manifest reported combined SHA256 `5d8d7fb2953c93ab4cecf25e01eec79d6648f2c2d7a77a92cd8139de51a1a5c5`. The last runner dry-run reported fingerprint `89dc0d632ce40191bacd98f5cb8658ffbc76e5e3604c6d37924eeb58e627761e`; recompute locally rather than assuming it survives checkout/line endings. Earlier 14 passing results are historical after source changes.

## Verification already performed (revision-specific)

- Before the latest mandatory-band/coverage-cache patch: full TypeScript and the three earlier saved capacity regressions passed. A counted-roster suite exercised 96 seeded optimized-versus-frozen comparisons across two/three courts, locks, differing counts, arrivals, fractional gaps, nonzero replay minima, rank fallback and unreachable relaxed bounds; deadline tests passed at that revision.
- API recovery: 19 writer/outcome mock tests passed, including settings changing after selection, explicit versus implicit queue behavior and timeout propagation. Eight hook tests passed, including local-update/429 retry and Clear cancellation. Full TypeScript passed at that API revision.
- Real SQLite tests passed for Clear followed by ordinary GET, access revocation between court commit and queue writer, post-commit queue error handling and three persisted courts from 23 eligible players. These are correctness tests, not preview latency measurements.
- Latest runner: `node --check` and its static pairwise coverage check passed. Targeted ESLint was interrupted without a result; lint is unverified.
- `git diff --check` passed during handoff packaging. No substantive tests were run during this handoff; the user explicitly asked to stop feature work and conserve usage.

## Benchmark fidelity and invalidated evidence

Do not resurrect old performance claims. Earlier fixtures incorrectly mapped ELO into Points, omitted the shared root budget, used backward simulated timestamps, or compared a Crossover result with an illegal same-group alternative. Those issues were corrected; old artifacts are not acceptance evidence.

Current harness:

- Uses production state preparation/selection and Points standings; completed winners gain three points.
- Starts the conditional root before preparation and uses the production budget predicate per step. One-court refills use `selectSingleCourtMatchRespectingSkips`; multi-court refills use the route batch wrapper. Single-court RNG replacement is synchronous and restored in `finally`.
- Advances a monotonic simulated event clock and checks match/availability chronology.
- Independently checks group court topology and Mixed legality when comparing point gaps. Crossover requires one A and one B per team; 2+2 Open Overflow instead requires AA versus BB. The balance tolerance was not relaxed.
- Saves selected output before assertions, exact failure state and phase diagnostics.
- Requires matching source fingerprint, exact case identity, 100 completions, full requested courts, no selection error and independently derived per-step budget eligibility. Targeted root elapsed must be finite and at most 5,100 ms. Untargeted one/two-court steps retain production policy.

Matrix: five splits (11/11, 12/10, 12/12, 14/10, 16/8), three seeds (1, 4729, 104729), two profiles and two refill patterns = 60, plus 8/1 and 16/2 regressions. The 17-case smoke has 15 deterministic pairwise cases plus those two regressions. It covers all 51 factor-level pairs but cannot prove every full combination. Matrix results are algorithm/route-selector evidence, not complete HTTP/UI/preview evidence.

## Efficient continuation order

1. Read the final review notes linked below, inspect current diff and run targeted verification for the latest engine patch. Preserve all exact synthetic fixtures. Fix only concrete failures.
2. Reproduce the seed-4729 case, then run the targeted 100-match trajectory. Use the 17-case smoke to find different shapes of failure early; do not restart every old passing case after every small change.
3. Once source is stable, run the 62-case batch locally with no agent reasoning per passing case. It stops on the first failure and checkpoints each case. Resume matching-fingerprint results. Investigate only the saved failing input.
4. Finish separate lifecycle coverage (pauses, late arrivals, skips, busy/queued players, preferences/crossover, physical court persistence), complete API/browser flow, preview p95 <=5 seconds, final required lint/type/build/tests and Astra patch/evidence review. No hidden scope reduction or fake success.
5. Only then create/merge the PR and perform an authorized compatible deployment with runtime verification. No schema/migration was changed; do not assume build/push applies migrations.

Use Node 24 and install dependencies with `npm ci` if needed. Read repo `AGENTS.md` and relevant local Next.js docs before editing framework code. Do not copy credentials or production data from the original account; ignored `private/` files are not in this handoff. Tests create synthetic/local data; inspect their setup before running DB-related tests.

```powershell
# Focused latest-patch validation, serial to avoid distorted timings
npx tsc --noEmit --pretty false
npx vitest run src/lib/matchmaking/v3/groupedTwentyTwoNineMatchesCapacity.test.ts src/lib/matchmaking/v3/balancedCountedRosterDifferential.test.ts src/lib/matchmaking/v3/searchBudget.test.ts src/lib/matchmaking/v3/balancedCandidateAcceptance.test.ts --maxWorkers=1 --fileParallelism=false

# Saved failing trajectory, then smoke inspection/execution
node scripts/run-grouped-capacity-matrix.mjs --run --case=12-10-balanced-4729-joint
node scripts/run-grouped-capacity-matrix.mjs --smoke --max-cases=17
node scripts/run-grouped-capacity-matrix.mjs --run --smoke --max-cases=17

# One unattended final batch after source is stable
node scripts/run-grouped-capacity-matrix.mjs --run --max-cases=62
```

## Portable review/checkpoint archive

`evidence/` contains selected textual implementation checkpoints and Astra reviews. They are historical, sometimes describe already-resolved findings, and contain old local paths. This report takes precedence for current status. The actual synthetic failure fixtures and runnable tests are in `src/`; private credentials, controller/account configuration and raw private directories were deliberately not committed.

Most relevant reviews: `astra-patch-review-5.md`, `astra-fairness-only-pruning-advice.md`, `astra-mandatory-count-band-pruning-advice.md`, and `astra-coverage-cache-fallback-advice.md`. None is full release approval.
