import { describe, expect, it } from "vitest";

import {
  buildLadderGroupingSummary,
  compareLadderGroupingSummaries,
} from "./ladderGrouping";

describe("ladder grouping", () => {
  it("prefers tighter ladder-score groups", () => {
    const tight = buildLadderGroupingSummary([
      { ladderScore: 2, pointDiff: 12 },
      { ladderScore: 2, pointDiff: 9 },
      { ladderScore: 1, pointDiff: 4 },
      { ladderScore: 1, pointDiff: 2 },
    ]);
    const spread = buildLadderGroupingSummary([
      { ladderScore: 3, pointDiff: 12 },
      { ladderScore: 1, pointDiff: 9 },
      { ladderScore: 0, pointDiff: 4 },
      { ladderScore: -1, pointDiff: 2 },
    ]);

    expect(compareLadderGroupingSummaries(tight, spread)).toBeLessThan(0);
  });

  it("uses point difference as a lighter refinement inside the same ladder spread", () => {
    const closerPointDiff = buildLadderGroupingSummary([
      { ladderScore: 1, pointDiff: 6 },
      { ladderScore: 1, pointDiff: 5 },
      { ladderScore: 0, pointDiff: 4 },
      { ladderScore: 0, pointDiff: 3 },
    ]);
    const widerPointDiff = buildLadderGroupingSummary([
      { ladderScore: 1, pointDiff: 18 },
      { ladderScore: 1, pointDiff: 1 },
      { ladderScore: 0, pointDiff: -2 },
      { ladderScore: 0, pointDiff: -11 },
    ]);

    expect(compareLadderGroupingSummaries(closerPointDiff, widerPointDiff)).toBeLessThan(
      0
    );
  });
});
