# Ladder Format Implementation Plan

This document translates the `Ladder` spec into an implementation sequence.

## Goal

Build `Ladder` as a pure library engine first, validate it in tests and
simulation, then wire it into session creation, live match generation, and
standings.

## Scope Of First Milestone

Supported:

- single-court ladder match generation
- multi-court ladder batch generation
- reshuffle through the same ladder selection path
- ladder standings derivation for completed matches
- structured debug reasoning

Not changed in the first milestone:

- manual match creation flow
- live court-card UI beyond existing data needs
- any new public debug UI

## Product Surfaces Affected

Implementation will eventually touch these areas:

- session creation form
  - add `Ladder` as a format option
- generate-match route
  - route `Ladder` sessions into the ladder engine
- standings/session page
  - show `W-L` and point difference
- leaderboard/session summary logic
  - sort by ladder standings rules
- score approval/finalization
  - update ladder standings only after approved/completed results

The pure engine milestone should avoid touching these route/UI surfaces yet.

## Folder Layout

Create these modules under `src/lib/matchmaking/ladder/`:

- `types.ts`
  - shared types for ladder players, ladder records, quartet candidates, batch
    candidates, and debug output
- `records.ts`
  - derive `wins`, `losses`, `pointDiff`, and `ladderScore`
  - completed-matches only
- `fairness.ts`
  - reuse the current fairness model shape:
    - strict match-count bands
    - widening rules
    - waiting-time tie-zone helpers
- `entry.ts`
  - neutral baseline helpers for resumed and late-joined players
  - initialize ladder standing at `0-0`
- `ladderGrouping.ts`
  - score proximity by ladder score
  - refine by point difference
  - no hard float-up / float-down bias
- `balance.ts`
  - team-vs-team balance scoring for the chosen quartet
  - reuse `Mixed` validity rules
- `candidatePool.ts`
  - build the eligible fairness pool
  - widen only as needed
- `singleCourt.ts`
  - enumerate quartets from the current candidate pool
  - score by ladder grouping + team balance
  - choose best quartet
- `batch.ts`
  - build candidate quartets
  - choose best disjoint batch globally
- `scoring.ts`
  - lexicographic comparison helpers
  - lower randomness than default matcher
- `simulation.ts`
  - ladder-specific scenario harness
- `index.ts`
  - exports

## Data Model For The Pure Engine

The pure engine input should not know about Prisma or routes.

### Proposed player input

- `userId`
- `matchesPlayed`
- `matchmakingBaseline`
- `availableSince`
- `isPaused`
- `isBusy`
- `strength`
- `gender`
- `partnerPreference`
- `lastPartnerId` if still needed by existing mode constraints
- `wins`
- `losses`
- `pointDiff`

### Derived ladder state

- `ladderScore = wins - losses`
- `effectiveMatchCount = max(matchesPlayed, matchmakingBaseline)`
- `waitMs` from `availableSince`

### Proposed match history input

- completed matches only
- enough fields to:
  - derive ladder records
  - derive point difference
  - support batch/simulation replay

## Selection Flow

### 1. Build eligible players

- exclude paused players
- exclude busy players
- keep only players valid for the current mode constraints

### 2. Build strict fairness pool

- find the lowest `matchesPlayed` band among eligible players
- if that band is enough to fill the requested courts, stop there
- if not enough, widen one band at a time
- if widening occurs:
  - lock in all lower-band players first
  - fill only remaining slots from the next band

### 3. Apply waiting-time tie zone

- within the currently allowed band(s), sort by waiting time
- treat near-equal waiting times within roughly one match duration as tied
- allow only small controlled variation among those near-equal players

### 4. Generate quartet candidates

- enumerate quartets only from the allowed pool
- reject quartets that violate hard constraints
- do not search the whole session roster

### 5. Score quartets

For each valid quartet:

- compute waiting-time summary
- compute ladder grouping quality
  - closest `wins - losses` first
  - point difference as a lighter refinement
- compute team-vs-team balance
- compute small random tie score

Important:

- there is no rematch penalty in `Ladder`
- ladder grouping must stay inside the fairness pool

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
2. ladder grouping quality
3. team balance
4. random tie score

Notes:

- ladder grouping should be medium-strict, not hard-bracketed
- point difference should refine grouping inside or near the same ladder score
- randomness should be lower than in the default matcher

## Ladder Grouping Model

Start simple.

### Proposed first-pass grouping signal

- primary distance: absolute difference in `wins - losses`
- secondary distance: absolute difference in `pointDiff`

For a quartet, score:

- max ladder-score spread
- total ladder-score spread
- then point-difference spread

This should be enough to get:

- winners tending to meet winners
- losers tending to meet losers
- nearby floats when exact grouping is not possible

without pretending to be strict Swiss.

## Standings Plan

Add a ladder standings derivation helper that returns, for each session player:

- `wins`
- `losses`
- `pointDiff`
- `ladderScore`

Sort order:

1. better `wins - losses`
2. higher point difference
3. player name

Only completed/approved matches count.

## Reshuffle Plan

Reshuffle should rerun normal ladder selection.

Rules for implementation:

- do not preserve the same 4 by default
- allow the exact same match to return if it still wins
- do not add rematch-avoidance branches

This keeps Ladder reshuffle simpler than the default matcher.

## Debug Output

Return structured debug data from the pure engine in development/test mode.

Suggested fields:

- `eligiblePlayerIds`
- `lowestBand`
- `includedBandValues`
- `widened`
- `tieZonePlayerIds`
- `candidateQuartetCount`
- `chosenQuartetIds` or `chosenBatch`
- `chosenLadderSpread`
- `chosenPointDiffSpread`
- `chosenBalanceGap`
- `rejectedReasonSummary`

## Testing Plan

### Unit tests

- ladder record derivation from completed matches
- guests included in ladder records
- pending results ignored
- fairness band construction
- widening one band at a time
- neutral resume and late-join baseline
- ladder-score grouping behavior
- point-difference refinement inside same ladder score
- team balance scoring in ladder quartets
- `Mixed` validity under Ladder

### Scenario tests

- 1 court / odd player counts
- 3 courts / 16 players
- resumed player enters at `0-0` ladder standing
- late joiner enters at `0-0` ladder standing
- nearby score groups mix when needed
- exact rematches are allowed
- batch generation clusters nearby ladder scores across courts

### Acceptance tests

Examples that should be demonstrably true:

- `2-0` ranks above `3-1`
- a fairer player is selected over a slightly better ladder-fit player
- `+2` may float with `+1` or `+3` depending on the better fair/balanced batch
- the same match may repeat if that is what the ladder system chooses

## Route Integration Plan

After the pure engine is accepted:

1. add `Ladder` to the session format enum and creation flow
2. map real session state into ladder engine input
3. route ladder sessions through the ladder selector in generate-match
4. derive and expose ladder standings in the session data surface
5. update the session page to render `W-L` and point difference

## Rollout Plan

1. build the pure library engine only
2. add tests and simulation harness
3. review debug output against agreed scenarios
4. wire ladder into session creation and route selection
5. validate live behavior locally
6. then ship

## First Build Task

The first coding task should be:

- implement `types.ts`
- implement `records.ts`
- implement `fairness.ts`
- implement `entry.ts`
- add focused tests for:
  - ladder record derivation
  - fairness bands
  - neutral entry behavior

Reason:

- ladder record derivation and fairness eligibility are the foundation of every
  later solver decision
- if those are wrong, every later grouping tweak will be noise
