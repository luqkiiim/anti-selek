# Matchmaking v3 Spec

This document defines the intended behavior of the live `v3` matcher.

## Status

- Live matcher reference
- Wired into session match generation
- Used as the behavior target for ongoing tuning and regression tests

## Goals

- Fair court time is the top priority
- No catch-up for late joiners or resumed players
- Prefer fresh partners when balance is still close
- Balanced matches within the fair pool
- Allow small controlled randomness among near-equal good options

## Non-goals

- Ladder / Swiss behavior
- Strong skill-band grouping inside a quartet
- Hard anti-clustering rules for resumed or late-joined groups
- Full-session history optimization

## Rule Order

Global priority order:

1. Fairness of court time
2. Fresh partners when balance is still close
3. Match balance
4. Controlled randomness

Inside an already allowed fairness pool:

1. Waiting time
2. Fresh partners when balance is still close
3. Match balance
4. Controlled randomness

## Definitions

`Active player`
- A player who is available for selection right now
- Busy players are not active
- Paused players are not active

`Fairness band`
- The lowest current `matchesPlayed` band among active players

`Waiting time`
- Time since the player most recently became available

`Near-equal waiting time`
- Waiting times within about one match duration of each other

`Repeated partner`
- A player is paired with the same teammate again
- This is the only variety signal the default matcher actively penalizes

## Hard Constraints

The matcher must reject any candidate that violates these constraints:

- Busy players cannot be selected
- Paused players cannot be selected
- A player cannot appear twice in the same match or batch
- Mixed-mode validity must be satisfied before scoring

## Fairness

### Primary fairness signal

Primary fairness is `matchesPlayed`.

Rules:

- Lower `matchesPlayed` always beats higher `matchesPlayed`
- The matcher should fill from the lowest `matchesPlayed` band first
- The matcher may only widen to the next higher band when the lowest band alone
  cannot fill the open courts

### Why fairness is strict

This avoids creating easy 2-match gaps in the active rotation.

Example:

- Need `12` players for `3` courts
- `12` players have played `4` matches
- `8` players have played `5` matches

Required behavior:

- Use only the `4-match` group
- Do not pull from the `5-match` group just to get prettier balance

### Fairness cap intent

For active players, the matcher should avoid creating a situation where one
active player ends up 2 matches ahead of another active player when enough
players exist to avoid that.

This is a design intent, not a separate hard rule layered on top of selection.

## Waiting Time

Waiting time is the secondary fairness signal.

Rules:

- Waiting time starts when the player becomes available
- For late joiners, waiting time starts when they join
- For resumed players, waiting time starts when they unpause
- Near-equal waiting times should be treated as tied enough for controlled
  randomness

## Late Join and Resume Behavior

Late joiners and resumed players are treated the same.

Rules:

- No catch-up
- No penalty
- Enter at a neutral baseline
- Neutral baseline = the current lowest eligible `matchesPlayed` band

What this means:

- They do not re-enter with a priority to erase the visible match gap
- They do not re-enter artificially behind the rotation either
- After entry, the gap may drift naturally, but the matcher must not actively
  pull them back toward the rest of the pool

Paused players are completely ignored while paused.

## Balance

Balance is only about the two teams being reasonably balanced against each
other.

Session-type inputs:

- `Ratings` sessions use player rating / Elo
- `Points` sessions use current session performance

Important:

- The default matcher may freely create mixed-strength quartets if the two teams
  are balanced
- Quartet coherence by skill band is not part of the default matcher
- That idea is reserved for a future ladder / Swiss mode

Acceptable default behavior:

- `1 + 24 vs 12 + 13`

if it is fair and the teams are balanced enough.

## Variety

Variety is intentionally narrow in the default matcher.

Main rule:

- Softly penalize repeated partners

Not primary rules:

- repeated same-court pod
- repeated opponents

These are not the main optimization target in the default matcher.

### History window

Partner-repeat avoidance should use recent history only, not full-session
memory.

Rules:

- Look at the last `8` relevant completed matches
- Apply exponential decay so the most recent rematches matter the most
- Old partner pairings should fade out naturally

### Rematch tradeoff

Repeated partners should lose to a reasonably close alternative.

But:

- a clearly worse match should not win only because it gives a new partner

So partner freshness is a soft preference, not a hard block.

Starting tolerance:

- `Ratings` sessions: only prefer the fresh partner option when the rating
  balance difference stays very close
- `Points` sessions: only prefer the fresh partner option when the points-based
  balance difference stays very close

## Randomness

Randomness is controlled, not dominant.

Rules:

- If one option is clearly better, it should win consistently
- If several options are near-equal, the matcher may pick different good
  answers across runs
- Randomness should mainly break ties among near-equal waiting-time and scoring
  options

## Batch Selection

When multiple courts are open, the matcher must optimize globally across the
whole batch.

Rules:

- Do not fill courts greedily one by one
- Build candidate quartets from the allowed fairness pool
- Solve the best disjoint set of quartets for the whole batch

Planned implementation direction:

- Branch-and-bound over candidate quartets

Candidate generation should not search the whole session.

Rules:

- Build candidates from the strict fairness pool
- Add only a small waiting-time tie zone if needed
- Do not search the full available roster
- If widening is required, include all players from the lower band first
- Then fill only the remaining slots from the next band
- Never skip bands while widening
- Widen only as much as needed to satisfy player count or hard-constraint
  feasibility

## Reshuffle

Reshuffle should rerun normal selection.

Rules:

- Do not try to preserve the same 4 players
- Some of the original 4 may be selected again if the normal matcher chooses
  them

## Single-Court vs Batch

Single-court and multi-court selection should share:

- the same fairness rules
- the same waiting-time behavior
- the same balance model
- the same partner-repeat logic

Only the search strategy differs:

- single-court: best quartet
- multi-court: best disjoint batch

## Examples

### Example A: Fairness over prettier balance

State:

- Need `12` players
- `12` active players at `4` matches
- `8` active players at `5` matches

Required behavior:

- Use only the `4-match` players

Not allowed:

- Pulling in `5-match` players just because the resulting batch looks nicer

### Example B: Neutral late join

State:

- Active rotation front is at `5` matches
- A new player joins

Required behavior:

- New player enters with a neutral matchmaking baseline at the current lowest
  eligible band
- They do not get catch-up priority
- Their waiting time starts from join time

### Example C: Neutral resume

State:

- A paused player returns
- Current active fairness band is `6`

Required behavior:

- The resumed player re-enters at the neutral baseline for the current lowest
  eligible band
- Waiting time starts from unpause
- They rotate normally from there

### Example D: Repeated partner penalty

Recent match:

- `A & B vs X & Y`

Current options:

- Option 1: `A & B vs C & D`
- Option 2: `A & C vs B & D`

Preferred behavior:

- Option 2 should usually win if it is reasonably close on fairness and balance

### Example E: Default mode allows mixed quartets

If fairness is satisfied and team balance is acceptable, this is allowed:

- `1 + 24 vs 12 + 13`

The default matcher does not try to keep similar-strength players clustered.

## Debug Requirements

The implementation should produce structured debug output in development.

Debug output should be able to explain:

- the active fairness band
- whether widening was needed
- waiting-time tie zone used
- which players were eligible
- chosen quartet or batch
- balance score
- partner-repeat penalty

Initial debug output should be structured data, not UI.

## Remaining Open Questions

- Exact branch-and-bound pruning strategy
- Exact data shape for debug output objects
- What additional real-session scenarios should be added to the validation
  harness
