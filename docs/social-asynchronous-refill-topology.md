# Social asynchronous refill topologies

This note records the structural cases used to test one conditional joint-refill rule. It describes feasibility from the players available to a decision. Busy players remain in the structural roster and cannot be assigned again while their match is active. Production receives active reservations in social history; candidate courtmate/type priority uses completed history. This is a topology argument, not evidence that a scheduler should wait in production.

## Feasible match types

For a full roster with `U` upper-side and `L` lower-side players, a player's `MIXED` type is structurally feasible exactly when `U >= 2` and `L >= 2`. An upper player's `OWN_SIDE` type is feasible when `U >= 4`; a lower player's is feasible when `L >= 4`. A match needs two players from each side for `MIXED`, or four from one side for `OWN_SIDE`.

These are full-roster structural possibilities. The current assignment pool can temporarily contain too few players of one side to realize a type that remains structurally feasible. Busy assignments, short rests, and pauses do not erase a type from the structural denominator. A policy that waits for a completion changes which players are available for its next batch, not the roster's type vocabulary.

Court-mate novelty counts unordered player pairs that have not appeared together in completed history. Rolling type coverage counts, per player's latest six match appearances, the fraction of that player's structurally feasible types observed in that window. These are breadth measures: the experiment does not require an equal `MIXED`/`OWN_SIDE` frequency or any other fixed type ratio.

## Ten players, five per side, two courts

With 5 upper and 5 lower players, both types are structurally feasible for every player. Consider two simultaneous `MIXED` matches. Each busy court reserves two players from each side. When one court finishes while the other remains active, the idle court can draw only from the 3 upper and 3 lower players not reserved by the still-busy match. That pool can form another mixed match, but it cannot form an own-side match because neither side has four available players. Refilling immediately with another mixed match can therefore recreate the same availability pattern.

If the scheduler waits once for the remaining active match to finish, all 5 players from each side are available together and a two-court batch can include an own-side match. This is the specific topology behind the mixed-opening test. Seeded production selection may choose a different opening, so the experiment records the actual opening per run and separately tests this constructed mixed/mixed case.

There is a symmetric lock when the opening is two `OWN_SIDE` matches, one all-upper and one all-lower. When the upper match finishes first, the currently available pool is 5 upper and 1 lower while the lower match remains busy. An upper own-side refill is feasible; a mixed refill is not. Waiting for both active assignments to finish restores the full 5/5 pool and makes `MIXED` feasible again. The lower-first case is the side-label mirror. The experiment must report both opening families if they occur and must not assume every production seed starts mixed/mixed.

## Eight upper-side players, two courts

With 8 upper players and no lower players, only `OWN_SIDE` is feasible, so completed-history type coverage is fixed at `T = 1` for every player. Two active courts use all 8 players. Once one court completes, exactly its four players are available; the other four remain busy. An immediate one-court refill has no bench to draw from and must reuse that same four-player cohort. If the scheduler waits for the remaining court, all 8 players become available together and the two-court batch can form a different disjoint cohort.

That change can improve courtmate breadth, but it cannot improve type variety: the only feasible type remains `OWN_SIDE`. The test treats these as separate outcomes.

## Three courts with one assignment still active: extreme low-reserve stress scenario — 4 players per court

The 12-player / three-court setup has only four players per court. Treat it as an **extreme low-reserve stress scenario**, useful for revealing topology lock-in but not representative of the usual five-or-more players per court. The selective case is one idle court and two active assignments. The immediate preview fills one court from currently available players. If the next active assignment finishes before the last one, the future preview can fill two idle courts together while the third remains busy. The scheduler compares these one-court and two-court proposals on a per-court basis. It waits only if the configured courtmate or signed rolling-type threshold is met and the forecast is within the five-minute cap. At the wake, it executes one joint refill for the two idle courts and does not start a second lookahead wait. A trace may also show two idle courts with one assignment busy, but in that topology the next finish releases the final reservation; it is a separate case and does not demonstrate selective refill while a court remains active.

## Scheduler and audit invariants

The simulator uses only completed matches for the independent rolling-type and courtmate calculations. Production selection retains its existing social-history treatment of active reservations, while candidate courtmate and type ranking follows the completed-history contract. A future preview advances a clone through the next completion group, including match-count and rest updates, while a rejected preview leaves the real players, history, reservations, and matcher random stream untouched. Exogenous match duration is keyed to seed, physical court, and that court's assignment ordinal, so changing start times does not change the duration assigned to the same physical assignment slot. Assignment rest-turn counts and elapsed wall-clock rest are reported separately; busy and paused intervals do not count as completed-match rest turns.

The conditional rule makes at most one wait decision at a refill boundary. It considers the next busy completion group (all assignments tied at that time), never a later group. It waits only when both immediate and future proposals are fully certified and either (a) the normalized new courtmate-pair gain is at least one per court or (b) the signed rolling-type gain is at least `0.5` per court. A future result that is incomplete, uncertified, absent, or beyond five minutes is not treated as a gain. The real refill runs once after the wake; subsequent refill boundaries are evaluated afresh and do not inherit a pending chain of waits.

Production may return its established heuristic selection with `varietyOptimal: false`; that is recorded as a production limitation, not relabeled as a failed execution. The experimental candidate executes a refill only when the required matcher certificates pass. The independent prefix scorer is reported alongside those certificates. The horizon stops at exactly the 100th completed match. If another assignment would complete at that same timestamp as match 101, it is left unprocessed and recorded as censored. Outstanding reservations and elapsed idle/wait intervals at the cutoff are right-censored rather than projected forward.

The paired simulation covers 8 one-side players and 10 balanced players under production and the candidate, plus 12 balanced players with two or three courts under the candidate, for seeds 1, 4729, and 104729. These fixtures test concrete availability topologies and one bounded forecast rule. They do not establish the value of waiting under uncertain live durations or support a change to production scheduling.
