# Matchmaking v3

`v3` is the live matcher used by session match generation.

## Purpose

Build a cleaner matcher from explicit product rules instead of layering more
heuristics onto the previous engine.

## Agreed priorities

1. Fairness of court time
2. Fresh partners when balance is still close
3. Balanced match strength
4. Small controlled randomness among near-equal options

## Core rules

1. Hard constraints come first.
   - Busy players are excluded.
   - Paused players are excluded while paused.
   - Mixed-mode validity is enforced before scoring.

2. Fairness is strict on match-count bands.
   - Fewer matches played matters more than waiting time.
   - If the current lowest eligible match-count band can fill the full batch,
     do not widen to the next band just for prettier balance.
   - This is intended to avoid easy 2-match gaps in the active rotation.

3. Waiting time is the secondary fairness signal.
   - Waiting time starts when the player becomes available.
   - Late joiners start waiting time from the moment they join.
   - Resumed players start waiting time from the moment they unpause.
   - Near-equal waiting times are treated as tied within roughly one match
     duration.

4. Late joiners and resumed players re-enter neutrally.
   - No catch-up.
   - No penalty.
   - Their matchmaking baseline should be the current lowest eligible
     match-count band.
   - After re-entry, the gap is allowed to drift naturally, but the matcher
     must not actively force catch-up.

5. Balance is team-vs-team balance only.
   - `Ratings` sessions use rating / Elo for strength balance.
   - `Points` sessions use current session performance for strength balance.
   - Very mixed quartets are acceptable if the two teams are balanced.

6. Variety is intentionally narrow.
   - Softly penalize repeated partners using recent history.
   - Recent history matters, with decay.
   - Same pods and same opponents are acceptable by themselves.
   - Exact rematches are discouraged only because they repeat both partner
     pairings.

7. Batch selection must be global.
   - When multiple courts are open, choose the best batch across all open
     courts together.
   - Do not fill courts greedily one by one.

8. Reshuffle should rerun normal selection.
   - Do not preserve the same 4 players by default.
   - Some of the previous 4 may still be selected again if the normal matcher
     chooses them.

## Decision order

Inside the allowed fairness pool:

1. Waiting time
2. Prefer fresh partners when balance stays reasonably close
3. Team-vs-team balance
4. Small randomness among near-equal options

Global rule ordering:

1. Fairness beats partner freshness
2. Partner freshness beats balance only inside the tolerance window
3. Balance beats randomness

## Design intent

- The matcher should feel fair first.
- It should not create catch-up pressure for late joiners or resumed players.
- It should not become rigid from tiny waiting-time differences.
- It should allow multiple good answers when several options are effectively
  tied.

## Not part of the default matcher

The following ideas are intentionally reserved for a future separate mode:

- Ladder / Swiss-style strength clustering
- Strong preference for quartet coherence by skill band
- Strong anti-pod spreading rules for re-entry groups

## Current notes

- The matcher is now wired into the live generate-match route.
- Debug-oriented simulator and focused `v3` tests live alongside the engine.
- Future work should tune behavior from real session snapshots rather than
  reintroducing versioned route switching.
