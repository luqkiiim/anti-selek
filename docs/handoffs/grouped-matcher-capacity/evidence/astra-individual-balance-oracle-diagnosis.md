# Astra diagnosis: individual trajectory step33 balance assertion

2026-10-16. Read-only inspection; no matcher or fixture changes, no tests run. Source fixture fingerprint supplied by parent:3cb2df2b0c4a8900007e5fe09af41161fc32ed6fbb76b544d7e6dd2d0947f61f.

## Finding: the independent partition oracle omits court-group legality

The saved24-player12/12 balanced seed1 individual trajectory failed at completedCount33, step33, one open court, production-correct unbudgeted request, elapsed425.421ms. The artifact stores the preselection state but not the failing selection; parent supplied the selection recovered by the owner's isolated reproduction. Quartet:P14,P20,P6,P8. Selected teams:P14+P8 versus P20+P6.

Saved-state values:

| Player | Pool | Mixed side | Points | Preference |
|---|---|---|---:|---|
| P14 | B | LOWER |20|FEMALE_FLEX|
| P20 | B | LOWER |20|FEMALE_FLEX|
| P6 | A | LOWER |24|OPEN|
| P8 | A | LOWER |17|FEMALE_FLEX|

The selected teams are B+A versus B+A, the CROSSOVER topology. Their sums37 and44 produce the reported average-strength gap3.5. The other crossover pairing P14+P6 versus P20+P8 gives44 versus37, also gap3.5. The supposedly better P14+P20 versus P6+P8 gives40 versus41 (gap0.5), but is B+B versus A+A: OPEN_OVERFLOW topology, not CROSSOVER.

Production hard constraints in playerGroupPlanner.ts:392-428 require one player from each group on each CROSSOVER team. For OPEN_OVERFLOW with2A/2B, they require the opposite topology and reject crossover pairs. classifyCourtGroupSnapshot in playerGroups.ts:45-73 independently describes that distinction. The harness legalPointGaps at groupedCapacityBenchmark.test.ts:27-41 filters only Mixed lower-side counts; it therefore incorrectly compares this crossover selection to an alternative from a different court type. Ask the reproduction to record courtGroupType and its balanceGuardrail as durable evidence; its current console payload omits both.

This is not a units discrepancy: balance.ts:181-196 uses the absolute difference between team-average strength. POINTS uses sessionPoints, and balanceGuardrail.ts fixes nearBestWindow=1.5 in those same units. All four selected players resolve LOWER under their valid explicit overrides; Mixed legality permits lower+lower versus lower+lower. The OPEN preference on P6 does not override that side or cause this failure. History/last-partner penalties cannot make the0.5 partition legal for a CROSSOVER court.

The exact single-court baseline freezes fairness, schedule rank and starvation before minimax/total balance (balancedRecurrence.ts:2123-2137). Changing the court type is not a same-class balance alternative. Even a legal same-quartet bound remains only a necessary bound, not a complete global fairness/balance optimum oracle.

## Safe correction, preserving acceptance strength

Keep the1.5-point bound and exact average-strength units. Extend the independent oracle with declarative group-topology checks using selection.courtGroupType and pool counts; do not merely raise the bound or import the production normalizer as the oracle. Require crossover teams to beA+B, competitive allA, social allB, and2/2 overflow to be same-pool teams. Also verify the returned partition's topology itself, not only its total seat counts. Add this quartet as a focused oracle regression: crossover legal minimum3.5, overflow legal minimum0.5. Preserve side checks and subsequent full matrix runs. Store failing selected teams/group type/guardrail before assertions so future failures retain the necessary evidence.

No product-policy violation is demonstrated by this particular3.5versus2.0 failure. This conclusion is confined to the identified illegal comparison and does not certify the whole returned certificate, global baseline optimum, or capacity matrix. Await actual returned group-type/guardrail logging and corrected-fingerprint reruns.
