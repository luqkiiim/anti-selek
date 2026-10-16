import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMatchmakingSearchBudget,
  MatchmakingSearchBudgetExceededError,
} from "@/lib/matchmaking/v3/searchBudget";

const mocks = vi.hoisted(() => ({
  tryRebuild: vi.fn(),
  getStored: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../queue-match/shared", () => ({
  tryRebuildQueuedMatchForSessionId: mocks.tryRebuild,
  getQueuedMatchForSessionId: mocks.getStored,
}));
vi.mock("@/lib/errors", () => ({ logError: mocks.logError }));

import { rebuildQueueAfterCommitDetailed } from "./postCommitQueue";

describe("post-commit optional queue outcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStored.mockResolvedValue(null);
  });

  it("offers recovery when an admitted queue search ends after the shared cutoff", async () => {
    let elapsed = 0;
    const budget = createMatchmakingSearchBudget({ now: () => elapsed });
    mocks.tryRebuild.mockImplementation(async () => { elapsed = 4_300; return null; });

    expect(await rebuildQueueAfterCommitDetailed("session-1", budget)).toEqual({
      queuedMatch: null,
      deferred: true,
    });
    expect(mocks.tryRebuild).toHaveBeenCalledTimes(1);
  });

  it("offers recovery for an explicit matcher budget error before the outer cutoff", async () => {
    let elapsed = 0;
    const budget = createMatchmakingSearchBudget({ now: () => elapsed });
    mocks.tryRebuild.mockRejectedValue(new MatchmakingSearchBudgetExceededError());

    expect(await rebuildQueueAfterCommitDetailed("session-1", budget)).toEqual({
      queuedMatch: null,
      deferred: true,
    });
  });

  it("does not offer recovery for an ordinary infeasible result", async () => {
    let elapsed = 0;
    const budget = createMatchmakingSearchBudget({ now: () => elapsed });
    mocks.tryRebuild.mockImplementation(async () => { elapsed = 100; return null; });

    expect(await rebuildQueueAfterCommitDetailed("session-1", budget)).toEqual({
      queuedMatch: null,
      deferred: false,
    });
  });

  it("returns an existing queue even if the search cutoff has passed", async () => {
    let elapsed = 0;
    const budget = createMatchmakingSearchBudget({ now: () => elapsed });
    const queuedMatch = { id: "manual-queue" };
    mocks.tryRebuild.mockImplementation(async () => { elapsed = 4_300; return queuedMatch; });

    expect(await rebuildQueueAfterCommitDetailed("session-1", budget)).toEqual({
      queuedMatch,
      deferred: false,
    });
  });
});
