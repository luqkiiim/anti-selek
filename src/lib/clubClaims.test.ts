import { describe, expect, it, vi } from "vitest";
import { ClaimRequestStatus, PartnerPreference, PlayerGender } from "@/types/enums";
import { deleteDisposableUnclaimedUsers } from "./sessionLifecycle";
import {
  approveClubClaimRequest,
  isClaimableClubPlaceholder,
  mergeClubRoles,
} from "./clubClaims";

vi.mock("./sessionLifecycle", () => ({
  deleteDisposableUnclaimedUsers: vi.fn(),
}));

describe("club claim helpers", () => {
  it("keeps admin role if either side is admin", () => {
    expect(mergeClubRoles("ADMIN", "MEMBER")).toBe("ADMIN");
    expect(mergeClubRoles("ADMIN", "STAFF")).toBe("ADMIN");
    expect(mergeClubRoles("STAFF", "ADMIN")).toBe("ADMIN");
    expect(mergeClubRoles("MEMBER", "ADMIN")).toBe("ADMIN");
    expect(mergeClubRoles("ADMIN", "ADMIN")).toBe("ADMIN");
  });

  it("keeps staff role if neither side is admin but either side is staff", () => {
    expect(mergeClubRoles("STAFF", "MEMBER")).toBe("STAFF");
    expect(mergeClubRoles("MEMBER", "STAFF")).toBe("STAFF");
    expect(mergeClubRoles("STAFF", "STAFF")).toBe("STAFF");
  });

  it("keeps member role when neither side is admin", () => {
    expect(mergeClubRoles("MEMBER", "MEMBER")).toBe("MEMBER");
  });

  it("only allows email-less unclaimed placeholders to be claimed", () => {
    expect(
      isClaimableClubPlaceholder({
        isClaimed: false,
        email: null,
      })
    ).toBe(true);

    expect(
      isClaimableClubPlaceholder({
        isClaimed: true,
        email: null,
      })
    ).toBe(false);

    expect(
      isClaimableClubPlaceholder({
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
          clubId: "community-1",
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
      clubMember: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ role: "MEMBER", elo: 1000 })
          .mockResolvedValueOnce({ role: "MEMBER" }),
        findMany: vi.fn().mockResolvedValue([
          {
            clubId: "community-1",
            userId: "placeholder-1",
            role: "MEMBER",
            elo: 1000,
          },
        ]),
        delete: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      offlineIdentityMember: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      offlineIdentity: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
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
      matchEloAdjustment: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        update: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Parameters<typeof approveClubClaimRequest>[0];

    const result = await approveClubClaimRequest(tx, {
      clubId: "community-1",
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

  it("requires manual merge for linked profiles spanning multiple clubs", async () => {
    const tx = {
      claimRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "claim-1",
          clubId: "community-1",
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
      },
      offlineIdentityMember: {
        findUnique: vi.fn().mockResolvedValue({
          offlineIdentity: {
            members: [
              { clubId: "community-1", userId: "placeholder-1" },
              { clubId: "community-2", userId: "placeholder-2" },
            ],
          },
        }),
      },
      clubMember: {
        update: vi.fn(),
      },
    } as unknown as Parameters<typeof approveClubClaimRequest>[0];

    await expect(
      approveClubClaimRequest(tx, {
        clubId: "community-1",
        requestId: "claim-1",
        reviewerUserId: "admin-1",
      })
    ).rejects.toMatchObject({
      message: "Linked profiles span multiple clubs. Manual merge required.",
      statusCode: 409,
    });
    expect(tx.clubMember.update).not.toHaveBeenCalled();
  });
});
