# Matchmaking v3 Implementation Plan

This document translates the `v3` spec into the implementation sequence that
built the current live matcher.

## Goal

Build `v3` as a pure library engine first, validate it in tests and simulation,
then wire it into the session generate-match route.

## Scope Of First Milestone

Supported:

- Single-court auto match generation
- Multi-court batch generation
- Reshuffle through the same selection path
- Debug reasoning as structured data

Not changed in the first milestone:

- Manual match creation
- Route wiring
- Session UI
- Ladder / Swiss-style mode

## Folder Layout

Create these modules under `src/lib/matchmaking/v3/`:

- `types.ts`
  - shared types for engine input, player state, quartet candidates, batch
    candidates, debug output
- `fairness.ts`
  - match-count banding
  - widening rules
  - waiting-time tie-zone helpers
- `entry.ts`
  - neutral baseline helpers for resumed and late-joined players
  - pure helpers only, no route/database access
- `balance.ts`
  - team-vs-team balance scoring
  - session-type-specific balance inputs
- `rematch.ts`
  - exact-partition history keys
  - recent-history extraction
  - exponential decay scoring
  - "reasonably close" rematch threshold helpers
- `candidatePool.ts`
  - build the allowed fairness pool
  - expand by one band at a time when needed
  - apply waiting-time tie-zone expansion
- `singleCourt.ts`
  - enumerate quartets from the current candidate pool
  - score quartets
  - choose best quartet
- `batch.ts`
  - build candidate quartets
  - branch-and-bound search for best disjoint batch
  - emit debug reasoning
- `scoring.ts`
  - combine waiting-time ranking, balance, rematch avoidance, and random tie
    behavior
- `engine.ts`
  - public entry points for single-court and batch selection
- `index.ts`
  - exports

## Data Model For The Pure Engine

The pure engine input should not know about Prisma or routes.

Proposed player input:

- `userId`
- `matchesPlayed`
- `matchmakingBaseline`
- `availableSince`
- `isPaused`
- `isBusy`
- `strength`
- `gender`
- `partnerPreference`
- `lastPartnerId` if still needed by partition constraints

Proposed match history input:

- completed matches only
- enough fields to reconstruct exact partitions
- timestamp for decay ordering

Derived fairness state:

- `effectiveMatchCount = max(matchesPlayed, matchmakingBaseline)` or the agreed
  equivalent explicit form used by the engine
- waiting time from `availableSince`
- current lowest eligible band

## Selection Flow

### 1. Build eligible players

- Exclude paused players
- Exclude busy players
- Keep only players valid for the current mode constraints

### 2. Build strict fairness band

- Find the lowest `matchesPlayed` band among eligible players
- If that band is enough to fill the requested courts, stop there
- If not enough, widen one band at a time
- If widening occurs:
  - lock in all lower-band players first
  - fill only the remaining slots from the next band

### 3. Apply waiting-time tie zone

- Within the currently allowed band(s), sort by waiting time
- Treat near-equal waiting times within roughly one match duration as tied
- Allow a small randomness factor only among these near-equal candidates

### 4. Generate quartet candidates

- Enumerate quartets only from the allowed pool
- Reject quartets that violate hard constraints
- Do not search the entire session roster

### 5. Score quartets

For each valid quartet:

- compute waiting-time summary
- compute team-vs-team balance
- compute exact-rematch penalty from recent completed matches
- compute a small random tie score

Important:

- exact-rematch avoidance should only beat balance when the alternative is still
  reasonably close

### 6. Solve selection

Single-court:

- pick the best quartet by rule order

Batch:

- search the best disjoint set of quartets globally
- do not greedily assign courts one by one

## Scoring Approach

Use lexicographic comparison, not one blended score soup.

Suggested comparison order inside the allowed fairness pool:

1. waiting-time preference
2. balance score
3. exact-rematch avoidance
4. random tie score

Special rematch rule:

- a non-rematch can beat a rematch when its balance is only modestly worse
- starting tolerance:
  - `Ratings`: about `25-30 Elo`
  - `Points`: about `1 point`

## Branch-And-Bound Plan

Initial solver approach:

- generate scored quartet candidates
- sort them by strong early quality heuristics
- backtrack over disjoint quartets
- prune branches when:
  - remaining unused players cannot fill remaining courts
  - current partial batch is already worse than the best known batch on the
    lexicographic objective

Do not over-engineer the first pass.

The first branch-and-bound version only needs to be:

- correct
- debuggable
- good enough for expected court counts

## Debug Output

Return structured debug data from the pure engine in development/test mode.

Suggested fields:

- `eligiblePlayerIds`
- `lowestBand`
- `widenedBands`
- `waitingTimeTieZone`
- `lockedLowerBandPlayerIds`
- `candidateQuartetCount`
- `chosenQuartetIds` or `chosenBatch`
- `chosenBalance`
- `chosenExactRematchPenalty`
- `rejectedReasonSummary` for the most obvious losers

This should stay out of the live UI in milestone 1.

## Testing Plan

### Unit tests

- fairness band construction
- widening one band at a time
- lower-band lock-in behavior
- waiting-time tie-zone behavior
- exact-rematch detection
- exponential decay scoring
- rematch tolerance threshold behavior
- balance scoring for `Ratings`
- balance scoring for `Points`

### Scenario tests

- 1 court / odd player counts
- 3 courts / 16 players
- late join neutral entry
- resumed player neutral entry
- reshuffle chooses a fresh best result from normal selection
- exact rematch loses to a reasonably close alternative

### Comparison tests

Add simulator comparisons against agreed product scenarios, not against the
previous matcher output.

The acceptance criteria should come from the spec, not from legacy behavior.

## Rollout Plan

1. Build the pure library engine only
2. Add tests and scenario harness
3. Review debug output against real examples
4. Review behavior on real session snapshots
5. Keep tuning from live scenarios and regression cases

## First Build Task

The first coding task should be:

- implement `types.ts`
- implement `fairness.ts`
- implement `candidatePool.ts`
- add focused tests for fairness-band and widening behavior

Reason:

- the fairness model is the foundation of every later solver decision
- if the fairness pool is wrong, every later scoring improvement is noise
