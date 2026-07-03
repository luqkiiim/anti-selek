import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClaimRequestStatus } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  approveClubClaimRequest: vi.fn(),
  auth: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(),
  cleanupSupersededAvatar: vi.fn(),
  getClubAdminAccess: vi.fn(),
  invalidTargetResponse: vi.fn(),
  isQuickAccessSession: vi.fn(),
  rateLimit: vi.fn(),
  requestFindUnique: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/avatarStorage", () => ({
  cleanupSupersededAvatar: mocks.cleanupSupersededAvatar,
}));

vi.mock("@/lib/clubAdminPermissions", () => ({
  getClubAdminAccess: mocks.getClubAdminAccess,
}));

vi.mock("@/lib/clubClaims", () => ({
  approveClubClaimRequest: mocks.approveClubClaimRequest,
  ClubClaimError: class ClubClaimError extends Error {
    constructor(
      message: string,
      public readonly statusCode = 400
    ) {
      super(message);
      this.name = "ClubClaimError";
    }
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    claimRequest: {
      findUnique: mocks.requestFindUnique,
    },
  },
}));

vi.mock("@/lib/quickAccess", () => ({
  getQuickAccessDeniedMessage: () => "Quick access denied",
  isQuickAccessSession: mocks.isQuickAccessSession,
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: mocks.checkInvalidTargetRateLimit,
  invalidTargetResponse: mocks.invalidTargetResponse,
  rateLimit: mocks.rateLimit,
}));

import { PATCH } from "./route";

function approvedClaimResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "claim-1",
    status: ClaimRequestStatus.APPROVED,
    requesterUserId: "requester-1",
    requesterName: "New Signup",
    targetUserId: "placeholder-1",
    targetName: "Old Member",
    adoptedAvatarKey: null,
    discardedAvatarKey: null,
    reviewedAt: new Date("2026-07-04T10:00:00.000Z"),
    ...overrides,
  };
}

function patchClaimReview(body: unknown = { action: "APPROVE" }) {
  return PATCH(
    new Request("http://localhost/api/clubs/community-1/claim-requests/claim-1", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    {
      params: Promise.resolve({
        id: "community-1",
        requestId: "claim-1",
      }),
    }
  );
}

describe("club claim review route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      user: {
        id: "admin-1",
        isAdmin: false,
      },
    });
    mocks.checkInvalidTargetRateLimit.mockResolvedValue(null);
    mocks.getClubAdminAccess.mockResolvedValue({ canAdmin: true });
    mocks.invalidTargetResponse.mockImplementation(async () =>
      Response.json({ error: "Unauthorized" }, { status: 403 })
    );
    mocks.isQuickAccessSession.mockReturnValue(false);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.requestFindUnique.mockResolvedValue({
      id: "claim-1",
      clubId: "community-1",
      requesterUserId: "requester-1",
    });
    mocks.transaction.mockImplementation(async (callback) => callback({}));
    mocks.approveClubClaimRequest.mockResolvedValue(approvedClaimResponse());
    mocks.cleanupSupersededAvatar.mockResolvedValue(false);
  });

  it("cleans up a discarded placeholder avatar after approving a claim", async () => {
    mocks.approveClubClaimRequest.mockResolvedValue(
      approvedClaimResponse({
        discardedAvatarKey: "https://cdn.test/placeholder.webp",
      })
    );

    const response = await patchClaimReview();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.cleanupSupersededAvatar).toHaveBeenCalledWith({
      previousAvatarKey: "https://cdn.test/placeholder.webp",
      nextAvatarKey: null,
    });
    expect(body.discardedAvatarKey).toBeUndefined();
    expect(body.adoptedAvatarKey).toBeUndefined();
  });

  it("does not clean up an adopted placeholder avatar", async () => {
    mocks.approveClubClaimRequest.mockResolvedValue(
      approvedClaimResponse({
        adoptedAvatarKey: "https://cdn.test/placeholder.webp",
      })
    );

    const response = await patchClaimReview();

    expect(response.status).toBe(200);
    expect(mocks.cleanupSupersededAvatar).not.toHaveBeenCalled();
  });
});
