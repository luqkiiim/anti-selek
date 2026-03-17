# Ladder Format Spec

This document defines the intended behavior of the future `Ladder` session
format before any implementation work starts.

## Status

- Planning only
- Not wired into production
- No current app behavior should depend on this document yet

## Purpose

`Ladder` is a competitive, asynchronous format where:

- winners tend to play winners
- losers tend to play losers
- court-time fairness still remains the top priority

This is not a strict synchronized Swiss tournament. Courts continue to open and
fill asynchronously.

## Product Model

`Ladder` is a new session format, alongside:

- `Points`
- `Ratings`
- `Ladder`

It is not a matchmaking style layered on top of `Points` or `Ratings`.

It must work with both session modes:

- `Open`
- `Mixed`

So the supported combinations are:

- `Open` + `Ladder`
- `Mixed` + `Ladder`

## Host UI

Session format options:

- `Points`
- `Ratings`
- `Ladder`

Default selected format:

- `Points`

Helper copy for `Ladder`:

- `Winners tend to play winners, losers tend to play losers`

## Goals

- Keep court time fair
- Make competitive grouping feel natural
- Let asynchronous play continue without hard rounds
- Preserve normal live operations like reshuffle and late join
- Keep rating updates enabled

## Non-goals

- Exact Swiss round synchronization
- Hard round boundaries
- Rematch avoidance
- Skill-band quartet coherence beyond normal team balancing

## Rule Order

Global priority order:

1. Fairness of court time
2. Waiting time inside the fairness pool
3. Ladder grouping
4. Team balance
5. Controlled randomness

## Definitions

`Active player`
- available right now
- not paused
- not busy on another court

`Ladder score`
- `wins - losses`

`Standing tie-break`
- point difference

`Neutral entry`
- a late joiner or resumed player enters without catch-up and without penalty

## Fairness

Fairness stays the top priority in `Ladder`.

Rules:

- active players should generally stay within a max `1-match` gap
- fairness defines the eligible pool first
- ladder grouping must happen inside that fair pool
- ladder grouping must not override fairness eligibility

Late joiners and resumed players are exceptions to the visible match-gap rule,
because they re-enter neutrally.

## Late Join and Resume

Late joiners and resumed players are treated the same.

Rules:

- no catch-up
- no penalty
- neutral match-count baseline on entry
- waiting time starts from entry time
- ladder standing starts at `0-0`

That means:

- neutral for court-time fairness
- neutral for ladder standing

## Waiting Time

Waiting time still matters in `Ladder`.

Rules:

- waiting time starts when the player becomes available
- near-equal waiting times should still be treated as close enough for some
  controlled variation
- waiting time should matter before ladder grouping becomes too aggressive

## Ladder Grouping

Primary competitive grouping signal:

- closest `wins - losses`

Secondary competitive grouping signal:

- point difference

Behavior:

- prefer players with the closest ladder score
- if needed, pull from nearby ladder-score groups
- no fixed upward or downward float bias
- use whichever nearby group gives the better fair and balanced result

This is intentionally looser than proper Swiss because the format is
asynchronous and players may have uneven numbers of completed matches.

## Team Formation

Once 4 players are selected:

- teams should still be balanced

So:

- ladder score decides who gets grouped
- team balance decides how those 4 are split into 2 teams

`Mixed` mode constraints still apply before scoring:

- valid gender combinations
- partner-preference rules

## Rematches

There is no rematch-avoidance rule in `Ladder`.

Rules:

- exact rematches are allowed
- repeated pods are allowed
- reshuffle may return the same matchup again if that is still the best result

Reason:

- in a competitive ladder, repeated nearby matchups are acceptable if that is
  what fairness and ladder grouping naturally produce

## Batch Generation

When multiple courts are open at once:

- solve the batch globally
- prefer nearby ladder scores across the whole batch
- then balance teams inside each selected quartet

Example shape:

- top ladder scores tend to group together
- middle scores tend to group together
- lower scores tend to group together

But this grouping must still respect the fairness pool first.

## Standings

Visible ladder standings should show:

- `W-L`
- point difference

Standings sort order:

1. better `wins - losses`
2. higher point difference
3. player name

Examples:

- `2-0` ranks above `3-1`
- a player with fewer matches can rank above a player with more matches if the
  ladder result is better

Only approved/completed matches affect ladder standings.

Pending or disputed results must not affect ladder ranking yet.

## Ratings

`Ladder` still updates persistent player ratings after approved matches.

Rules:

- use the same rating update formula as the current `Ratings` format
- only the matchmaking and standings logic change

## Guests

Guests participate fully in the session ladder.

Rules:

- they appear in ladder standings for that session
- they are grouped by ladder score like normal players
- they follow the same fairness and entry rules

## Randomness

`Ladder` should have less randomness than the default matcher.

Rules:

- clearly better ladder/fairness/balance outcomes should usually win
- near-equal good options may still vary
- randomness should be lower than in the default format

## Live Session UI

For the first version:

- show `W-L` and point difference in standings
- do not add ladder markers to live court cards

## Reshuffle

Reshuffle should rerun normal `Ladder` selection.

Rules:

- do not preserve the same 4 players by default
- some or all of the previous 4 may still be chosen again
- the exact same match is allowed if that is what the system naturally selects

## Examples

### Example A: Fairness still wins

State:

- one player is the obvious next player by court-time fairness
- another player is a slightly better ladder-score fit

Required behavior:

- take the fairer player first
- ladder grouping happens inside the fair pool, not across it

### Example B: Nearby ladder groups can mix

State:

- need one more player for a strong `+2` group
- nearby available players are `+3` and `+1`

Required behavior:

- no hard float-up or float-down rule
- pick whichever nearby player gives the better fair and balanced result

### Example C: Balanced teams inside a ladder quartet

State:

- selected players are near each other on ladder score

Required behavior:

- split them into the most balanced teams available
- do not simply put the top two ladder players together

### Example D: Rematch is allowed

Recent match:

- `A & B vs C & D`

Current best fair ladder result:

- `A & B vs C & D` again

Allowed behavior:

- repeat the same match if that is still what the ladder system wants

## Open Questions

- exact scoring function for "nearby" ladder-score grouping
- exact weight of point-difference refinement inside the same ladder score
- exact amount of randomness relative to the default format
- whether any ladder-specific debug output should be exposed during development
