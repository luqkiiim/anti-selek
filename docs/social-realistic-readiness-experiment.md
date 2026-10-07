# Social matcher and scheduler readiness experiment

This experiment checks the already-frozen `courtmate-beneficial-rescue` matcher against the default production Social matcher and the existing conditional joint-refill scheduler. It does not change matcher ranking, search budgets, or wait thresholds.

The first stage replays the previously failing 16-player / 2-court and 18-player / 3-court candidate sessions for seeds 1, 4729, and 104729. It runs a short prefix of 24 or 27 completed matches first, then continues to 100 only after every short session completes with exact certificates. Both horizons are checked against the previously frozen current-engine layout history.

The real-clock grid uses three matched arms: production with immediate refill, beneficial-rescue with immediate refill, and beneficial-rescue with conditional waiting. Each arm runs seeds 1, 4729, and 104729 to at most 100 completed matches. The roster profiles are 10/5+5/2, 12/6+6/2, 14/7+7/2, 16/8+8/2, 14/8+6/2, 14/9+5/2, 14/10+4/2, 15/8+7/3, 16/8+8/3, and 18/9+9/3. The existing 12/6+6/3 result remains a separately labeled four-player-per-court low-reserve stress case.

Match duration is 20 × (0.8 + 0.4u) simulated minutes. A deterministic Park–Miller stream is independent for each physical court and assignment ordinal. Conditional waiting uses the existing rule without retuning: at most one wait until the next currently busy completion group; the predicted gap must be no more than five minutes; both immediate and future previews must meet the existing wait certificates; and the future batch must improve per-court new courtmate pairs by at least one or signed rolling-six type coverage by at least 0.5. Preview calls clone the matcher RNG; only an executed selection advances it.

The bridge records every matcher invocation’s runtime, options, selection, branch counts, pruning counts, search-limit result, and certificate fields. The independent validator matches those rows to the saved immediate, future, and execution previews, reconstructs scheduler state and completed-only gains, and validates each session trace. A report can be trace-valid while an individual session records a search limit or stops early; the outcome remains in the denominator as a readiness failure.

The simulator knows the next exact finish time. A production wait decision would need a forecast from live court status or expected remaining play time; these results do not claim such a forecast is available or recommend enabling waiting in production.
