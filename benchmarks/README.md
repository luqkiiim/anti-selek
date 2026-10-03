# Matchmaking benchmark artifacts

The canonical full comparison is the 400-completed-match, asynchronous Mixed benchmark using narrow seeds `1, 4729, 104729, 130363, 2097593` and wide-skill seeds `30011, 65537, 999983`. Each format at a seed shares the same 14-player roster and seeded court-completion schedule. The baseline, strict, and final policy reports contain 21 sessions apiece.

| Files | Policy and source | Purpose |
|---|---|---|
| `social-coverage-full-baseline.json` and `.md` | Entropy-first baseline at `de0254f84adef7414b512e3d3fd936033d65bef8`; engine source SHA-256 `2c84aa6ef5fad73662f9f05300fbc810eee3028ca956b200193be16496981a2c` | Historical baseline. `socialVariety.ts` includes only the coverage measurement API added for this run; the engine hash records the exact file content. |
| `social-coverage-full-strict.json` and `.md` | Strict-cadence policy at `93262f36336b9533ba96b4e4bec5d7e8061eef6e`; engine source SHA-256 `5dd33ca48c7a7731883081792360f0a04e439b3ddd704f135ed3a63ed1bf2f36` | Preserved comparison that minimized the complete rest vector before entropy. |
| `social-coverage-full-current.json` and `.md` | Final type-entropy-first policy at `bcf07fb22cded580c7e2c0c72d6a5a58bc4eb49d`; engine source SHA-256 `21c2b52a97ec90d86ac60148a3c5443e7074bd44d81f2a9358b13644d92ea643` | Current production policy: in Mixed sessions, match-type entropy → immediate replay count → relationship entropy → soft cadence; other modes start with immediate replay count. |
| `social-coverage-full-policy-comparison.json` and `.md` | The three source identities above | Same-seed comparison including completed MIXED/OWN_SIDE counts in early and late windows. |

The final current report's measurement-harness SHA-256 is `27e22fd7eb48ca8e2d96638583de3c75aa7f064e5c3e3aea136667d44a0599b0`. Its overall worktree dirty flag includes generated, untracked reports; the recorded tracked core-engine, shared-variety, and harness diffs are empty. The baseline's only shared-variety source diff is the added coverage API. The strict run changes only benchmark instrumentation files.

## Retained one-seed pilots

`split-cadence-pilot/` preserves the rejected immediate-replay-first split experiment and its baseline/strict comparisons (seed 1, narrow profile, 400 completions). That experiment substantially reduced back-to-back assignments but suppressed OWN_SIDE matches, so it is historical evidence rather than the final policy.

`type-entropy-first-pilot/` preserves the first successful type-entropy-first pilot (seed 1, narrow profile, 400 completions). It used the `93262f36336b9533ba96b4e4bec5d7e8061eef6e` source base plus the experimental policy change; its engine SHA-256 is `291da1b22ca83cfa515017424738dc1543b14c7169bd04957e96ac09e0b7d198`. It predates the optimized final source and is superseded by the canonical full current report.

The large benchmark is run manually with `npm run benchmark:matchmaking`; the 120-completion three-format regression probe runs in the ordinary Vitest suite.
