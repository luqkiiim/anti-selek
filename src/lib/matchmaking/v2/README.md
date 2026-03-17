# Matchmaking v2

`v2` is the current live matcher.

## Goals

- Fair first.
- No catch-up after pause or late join.
- Better variety without forcing unnatural spread.
- Keep team balance meaningful, but secondary to fairness.

## Core rules

1. Hard constraints come first.
   - Busy and paused players are excluded before selection.
   - Mixicano validity is still enforced when partitions are scored.

2. Fairness is based on rotation load, not match rate.
   - `rotationLoad = matchesPlayed + matchmakingMatchesCredit`
   - `matchmakingMatchesCredit` acts as the "neutral baseline" for resumed and
     late-joined players.
   - Lower `rotationLoad` gets priority.
   - Within the same load band, older `availableSince` gets priority.

3. Match selection searches within a fairness window.
   - Start with the lowest-load players.
   - Add a small amount of slack so the matcher can improve variety and balance
     without jumping too far ahead in the queue.
   - Do not preserve exact match-count histograms across courts.

4. Variety and balance are scored together inside that fairness window.
   - Variety uses recent courtmate / partner / opponent / exact-partition
     history.
   - Balance uses the same Elo / point-difference inputs as `v1`.
   - When fairness is tied, prefer the lower combined variety + balance score.

5. Randomness is only a tie-breaker.
   - The matcher is not meant to be random.
   - Random order is only used when fairness and scoring are effectively tied.

## Current scope

- Single-court selection
- Batch selection for multiple open courts
- Simulation-oriented tests for pause / resume behavior

`v2` is the only matcher wired into production routes.
