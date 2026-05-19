import { describe, expect, it, vi } from "vitest";
import { ClaimRequestStatus, PartnerPreference, PlayerGender } from "@/types/enums";
import { deleteDisposableUnclaimedUsers } from "./sessionLifecycle";
import {
  approveCommunityClaimRequest,
  isClaimableCommunityPlaceholder,
  mergeCommunityRoles,
} from "./communityClaims";

vi.mock("./sessionLifecycle", () => ({
  deleteDisposableUnclaimedUsers: vi.fn(),
}));

describe("community claim helpers", () => {
  it("keeps admin role if either side is admin", () => {
    expect(mergeCommunityRoles("ADMIN", "MEMBER")).toBe("ADMIN");
    expect(mergeCommunityRoles("MEMBER", "ADMIN")).toBe("ADMIN");
    expect(mergeCommunityRoles("ADMIN", "ADMIN")).toBe("ADMIN");
  });

  it("keeps member role when neither side is admin", () => {
    expect(mergeCommunityRoles("MEMBER", "MEMBER")).toBe("MEMBER");
  });

  it("only allows email-less unclaimed placeholders to be claimed", () => {
    expect(
      isClaimableCommunityPlaceholder({
        isClaimed: false,
        email: null,
      })
    ).toBe(true);

    expect(
      isClaimableCommunityPlaceholder({
        isClaimed: true,
        email: null,
      })
    ).toBe(false);

    expect(
      isClaimableCommunityPlaceholder({
        isClaimed: false,
        email: "placeholder@example.com",
      })
    ).toBe(false);
  });

  it("keeps the requester's chosen name when approving a claim", async () => {
    const tx = {
      claimRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "claim-1",
          communityId: "community-1",
          requesterUserId: "requester-1",
          targetUserId: "placeholder-1",
          status: ClaimRequestStatus.PENDING,
          requester: {
            id: "requester-1",
            name: "New Signup",
            email: "new@example.com",
            isClaimed: true,
          },
          target: {
            id: "placeholder-1",
            name: "Old Member",
            email: null,
            isClaimed: false,
            gender: PlayerGender.FEMALE,
            partnerPreference: PartnerPreference.OPEN,
            mixedSideOverride: null,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      communityMember: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ role: "MEMBER", elo: 1000 })
          .mockResolvedValueOnce({ role: "MEMBER" }),
        delete: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      session: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      sessionPlayer: {
        findFirst: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      match: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        update: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Parameters<typeof approveCommunityClaimRequest>[0];

    const result = await approveCommunityClaimRequest(tx, {
      communityId: "community-1",
      requestId: "claim-1",
      reviewerUserId: "admin-1",
    });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "requester-1" },
      data: {
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.OPEN,
        mixedSideOverride: null,
      },
    });
    expect(result.requesterName).toBe("New Signup");
    expect(deleteDisposableUnclaimedUsers).toHaveBeenCalledWith(tx, ["placeholder-1"]);
  });
});
