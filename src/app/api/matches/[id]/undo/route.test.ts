import { beforeEach, describe, expect, it, vi } from "vitest";
import { MatchStatus, SessionStatus } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  matchFindUnique: vi.fn(),
  communityMemberFindUnique: vi.fn(),
  undoCompletedMatchResult: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/matchCompletion", async () => {
  const actual = await vi.importActual<typeof import("@/lib/matchCompletion")>(
    "@/lib/matchCompletion"
  );

  return {
    ...actual,
    undoCompletedMatchResult: mocks.undoCompletedMatchResult,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    match: {
      findUnique: mocks.matchFindUnique,
    },
    communityMember: {
      findUnique: mocks.communityMemberFindUnique,
    },
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(async () =>
    Response.json(
      { success: false, error: "Unauthorized" },
      { status: 403 }
    )
  ),
  rateLimit: vi.fn(async () => null),
}));

import {
  UndoCompletedMatchError,
} from "@/lib/matchCompletion";
import { POST } from "./route";

function createMatch({
  status = MatchStatus.COMPLETED,
  sessionStatus = SessionStatus.ACTIVE,
  communityId = "community-1",
}: {
  status?: MatchStatus;
  sessionStatus?: SessionStatus;
  communityId?: string | null;
} = {}) {
  return {
    id: "match-1",
    status,
    session: {
      communityId,
      status: sessionStatus,
    },
  };
}

function postUndo() {
  return POST(new Request("http://localhost/api/matches/match-1/undo"), {
    params: Promise.resolve({ id: "match-1" }),
  });
}

describe("undo completed match route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", isAdmin: false },
    });
    mocks.matchFindUnique.mockResolvedValue(createMatch());
    mocks.communityMemberFindUnique.mockResolvedValue({ role: "STAFF" });
    mocks.undoCompletedMatchResult.mockResolvedValue({
      ok: true,
      undoneMatchId: "match-1",
      affectedUserIds: ["a1", "a2", "b1", "b2"],
    });
  });

  it("allows club staff to undo a latest completed match in an active session", async () => {
    const response = await postUndo();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      undoneMatchId: "match-1",
      affectedUserIds: ["a1", "a2", "b1", "b2"],
    });
    expect(mocks.undoCompletedMatchResult).toHaveBeenCalledWith({
      matchId: "match-1",
    });
  });

  it("rejects non-admins", async () => {
    mocks.communityMemberFindUnique.mockResolvedValue({ role: "MEMBER" });

    const response = await postUndo();

    expect(response.status).toBe(403);
    expect(mocks.undoCompletedMatchResult).not.toHaveBeenCalled();
  });

  it("rejects pending approval matches", async () => {
    mocks.matchFindUnique.mockResolvedValue(
      createMatch({ status: MatchStatus.PENDING_APPROVAL })
    );

    const response = await postUndo();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Only completed matches can be undone.",
    });
    expect(mocks.undoCompletedMatchResult).not.toHaveBeenCalled();
  });

  it("rejects completed sessions", async () => {
    mocks.matchFindUnique.mockResolvedValue(
      createMatch({ sessionStatus: SessionStatus.COMPLETED })
    );

    const response = await postUndo();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Only active sessions can undo completed matches.",
    });
    expect(mocks.undoCompletedMatchResult).not.toHaveBeenCalled();
  });

  it("rejects older completed matches", async () => {
    mocks.undoCompletedMatchResult.mockRejectedValue(
      new UndoCompletedMatchError(
        "NOT_LATEST_COMPLETED_MATCH",
        "Only the latest completed match can be undone."
      )
    );

    const response = await postUndo();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Only the latest completed match can be undone.",
    });
  });
});
