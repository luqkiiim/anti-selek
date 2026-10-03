# Matchmaking v3

`v3` is the live matcher used by session match generation.

## Purpose

Build a cleaner matcher from explicit product rules instead of layering more
heuristics onto the previous engine.

## Balanced matchmaking priorities

1. Fairness of court time
2. Fresh partners when balance is still close
3. Balanced match strength
4. Small controlled randomness among near-equal options

## Social matchmaking

Social uses one whole-batch optimizer for ordinary, player-group, and interclub
matches. It gives fair turns first, then arrival priority when turn counts tie,
then applicable player-group rules. A derived rest-turn guardrail protects
players who have missed more than their expected rotation gap before ongoing
variety is scored. Ordinary rest turns then break equally varied choices,
followed by team balance, recent repeats, and seeded pairing tie-breaks. The
guardrail uses the full unpaused session roster, including busy players; only
available overdue players can be protected in the current batch. Balanced modes
keep their own rules.

Variety combines four equally scaled per-player experience distributions:
shared-court contacts, partners, opponents, and (in Mixed pairing) mixed-side
versus own-side games. Each distribution uses lifetime encounter counts and
Shannon entropy divided by the logarithm of its legal opportunity count. A
candidate batch is scored by its change in the combined entropy. Parts with
fewer than two opportunities contribute zero; the other parts are not rescaled.
Negative gains remain valid. There are no match-type quotas, target percentages,
or every-N-games rules, and an early own-side game does not discharge variety.

Opportunities use the full unpaused roster, including busy and queued players,
and obey structural pairing, club, and player-group rules. They are frozen for
one decision. Paused peers are excluded from the current vocabulary; their
historical counts return when they resume. Existing Mixed side assignments and
legacy partner preferences determine the experience types.

Completed and committed active/queued games, including manual games, count once.
Queue-to-active transitions retain their assignment-time side snapshot in the
existing reason JSON. Undo, cancellation, and replacement remove old reservations
from subsequent decisions. Legacy games without snapshots use current resolvable
sides; unclassifiable games still contribute interpersonal history.

Small one/two-court batches with up to fourteen eligible players are exhaustive:
every legal partition and non-overlapping pair is considered. Larger batches use
bounded global search. A timeout returns an incumbent only when its player
fairness and Social rest-turn guardrail are certified, and exposes whether
variety was fully optimized. An uncertified timeout returns a search-limit
failure rather than a greedy batch.

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

3. Rest and arrival priority supplement match-count fairness.
   - Mid-session joiners and resumed players receive a one-time arrival
     priority, oldest first.
   - Rest turns count completed matches missed since becoming available.
   - Ordinary elapsed waiting minutes are not directly ranked in Ratings
     matchmaking.

4. Late joiners and resumed players re-enter neutrally.
   - No catch-up.
   - No penalty.
   - Their matchmaking baseline should be the current lowest eligible
     match-count band.
   - After re-entry, the gap is allowed to drift naturally, but the matcher
     must not actively force catch-up.

5. Balance is team-vs-team balance only.
   - `Ratings` sessions use rating / Elo for strength balance.
   - Rating options with a team-average gap of 50 or less qualify for variety
     comparison. If none qualify in the fair pool, use the smallest available
     gap instead.
   - `Points` sessions use current session performance for strength balance.
   - Very mixed quartets are acceptable if the two teams are balanced.

6. Balanced variety compares prior shared-court contacts, partner coverage, opponent
   coverage, recent partner and opponent repeats, then exact rematches, in that
   order. Recent-repeat penalties decay with history.

7. Batch selection must be global.
   - When multiple courts are open, choose the best batch across all open
     courts together.
   - Do not fill courts greedily one by one.

8. Reshuffle should rerun normal selection.
   - Do not preserve the same 4 players by default.
   - Some of the previous 4 may still be selected again if the normal matcher
     chooses them.

## Decision order

Inside the allowed fairness pool for Ratings:

1. Keep options under the absolute 50-point team-average gap ceiling, or the
   smallest available gap when none meet the ceiling
2. Prefer fresh shared-court contacts, partners, and opponents
3. Prefer the smaller team gap
4. Rest turns, then random tie-breaks

Global rule ordering:

1. Fairness beats partner freshness
2. Variety beats balance only among options under the Ratings ceiling
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
