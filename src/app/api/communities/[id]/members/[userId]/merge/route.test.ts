import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  communityMemberFindUnique: vi.fn(),
  transaction: vi.fn(),
  mergeDuplicateUnclaimedCommunityPlayer: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    communityMember: {
      findUnique: mocks.communityMemberFindUnique,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/communityPlayerMerge", async () => {
  const actual = await vi.importActual<typeof import("@/lib/communityPlayerMerge")>(
    "@/lib/communityPlayerMerge"
  );
  return {
    CommunityPlayerMergeError: actual.CommunityPlayerMergeError,
    mergeDuplicateUnclaimedCommunityPlayer:
      mocks.mergeDuplicateUnclaimedCommunityPlayer,
  };
});

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(async () =>
    Response.json({ error: "Unauthorized" }, { status: 403 })
  ),
  rateLimit: vi.fn(async () => null),
}));

import { CommunityPlayerMergeError } from "@/lib/communityPlayerMerge";
import { POST } from "./route";

function postMerge(body: unknown) {
  return POST(
    new Request(
      "http://localhost/api/communities/community-1/members/source-user/merge",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }
    ),
    { params: Promise.resolve({ id: "community-1", userId: "source-user" }) }
  );
}

describe("duplicate player merge route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", email: "admin@example.com", isAdmin: false },
    });
    mocks.communityMemberFindUnique.mockResolvedValue({ role: "ADMIN" });
    mocks.transaction.mockImplementation(async (callback) => callback("tx"));
    mocks.mergeDuplicateUnclaimedCommunityPlayer.mockResolvedValue({
      sourceUserId: "source-user",
      sourceName: "Alex Lee",
      targetUserId: "target-user",
      targetName: "Alex Lee",
      deletedSourceUser: true,
    });
  });

  it("runs the merge service for community admins", async () => {
    const response = await postMerge({ targetUserId: "target-user" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.mergeDuplicateUnclaimedCommunityPlayer).toHaveBeenCalledWith(
      "tx",
      {
        communityId: "community-1",
        sourceUserId: "source-user",
        targetUserId: "target-user",
        reviewerUserId: "admin-1",
      }
    );
    expect(body).toMatchObject({
      sourceUserId: "source-user",
      targetUserId: "target-user",
      deletedSourceUser: true,
    });
  });

  it("rejects quick-access users", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", isQuickAccess: true },
    });

    const response = await postMerge({ targetUserId: "target-user" });

    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns merge service errors with their status code", async () => {
    mocks.mergeDuplicateUnclaimedCommunityPlayer.mockRejectedValue(
      new CommunityPlayerMergeError(
        "Target player already belongs to this community",
        409
      )
    );

    const response = await postMerge({ targetUserId: "target-user" });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: "Target player already belongs to this community",
    });
  });
});
