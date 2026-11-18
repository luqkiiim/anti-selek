import { expect, it } from "vitest";
import type { V3DoublesPartition } from "../v3/types";
import { buildLevelRelationshipVariety } from "./levelRelationshipVariety";

it("distinguishes a changed team split from the same match and uses real completion order for recency", () => {
  const old: V3DoublesPartition = { team1: ["a", "b"], team2: ["c", "d"] };
  const recent: V3DoublesPartition = { team1: ["a", "c"], team2: ["b", "d"] };
  const fresh: V3DoublesPartition = { team1: ["a", "d"], team2: ["b", "c"] };
  const scorer = buildLevelRelationshipVariety([
    { ...old, completedAt: new Date("2026-10-01T00:00:00Z") },
    { ...recent, completedAt: new Date("2026-10-01T00:10:00Z") },
  ]);
  expect(scorer.score(recent, 0)[5]).toBeGreaterThan(scorer.score(old, 0)[5]);
  expect(scorer.score(fresh, 0).slice(6, 8)).toEqual([2, 0]);
  expect(scorer.score(old, 0).slice(6, 8)).toEqual([2, 1]);
});
