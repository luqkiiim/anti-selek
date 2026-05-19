import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CommunityPlayerStatus,
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  isQuickAccessSession: vi.fn(),
  rateLimit: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(),
  invalidTargetResponse: vi.fn(),
  communityMemberFindUnique: vi.fn(),
  communityMemberFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  resolveMixedSideState: vi.fn(),
  serializeAvatarEntity: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    communityMember: {
      findUnique: mocks.communityMemberFindUnique,
      findMany: mocks.communityMemberFindMany,
    },
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}));

vi.mock("@/lib/mixedSide", () => ({
  isValidMixedSide: (value: unknown) =>
    value === "UPPER" || value === "LOWER",
  isValidPartnerPreference: (value: unknown) => value === PartnerPreference.OPEN,
  isValidPlayerGender: (value: unknown) =>
    value === PlayerGender.MALE ||
    value === PlayerGender.FEMALE ||
    value === PlayerGender.UNSPECIFIED,
  resolveMixedSideState: mocks.resolveMixedSideState,
}));

vi.mock("@/lib/avatar", () => ({
  serializeAvatarEntity: mocks.serializeAvatarEntity,
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mocks.rateLimit,
  checkInvalidTargetRateLimit: mocks.checkInvalidTargetRateLimit,
  invalidTargetResponse: mocks.invalidTargetResponse,
}));

vi.mock("@/lib/quickAccess", () => ({
  getQuickAccessDeniedMessage: () => "Quick access not allowed",
  isQuickAccessSession: mocks.isQuickAccessSession,
  normalizeNameLookupKey: (value: string) =>
    value.trim().toLowerCase().replace(/\s+/g, " "),
}));

import { PATCH } from "./route";

function patchMember(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/communities/community-1/members/user-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "community-1", userId: "user-1" }) }
  );
}

describe("community admin update member route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());

    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", isAdmin: false },
    });
    mocks.isQuickAccessSession.mockReturnValue(false);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.checkInvalidTargetRateLimit.mockResolvedValue(null);
    mocks.invalidTargetResponse.mockImplementation(() =>
      Response.json({ error: "Unauthorized" }, { status: 403 })
    );
    mocks.resolveMixedSideState.mockReturnValue({
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.serializeAvatarEntity.mockImplementation((entity: { avatarKey?: string | null }) => ({
      avatarUrl: entity.avatarKey ?? null,
    }));
  });

  it("rejects renaming claimed members", async () => {
    mocks.communityMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "MEMBER",
        elo: 1000,
        status: CommunityPlayerStatus.CORE,
      });
    mocks.userFindUnique.mockResolvedValue({
      name: "Claimed Player",
      email: "claimed@example.com",
      avatarKey: null,
      isClaimed: true,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });

    const response = await patchMember({ name: "Renamed By Admin" });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Claimed members manage their own account name");
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("still allows renaming unclaimed placeholders", async () => {
    const createdAt = new Date("2026-05-19T00:00:00.000Z");
    mocks.communityMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "MEMBER",
        elo: 1000,
        status: CommunityPlayerStatus.CORE,
      })
      .mockResolvedValueOnce({
        role: "MEMBER",
        elo: 1000,
        status: CommunityPlayerStatus.CORE,
      });
    mocks.userFindUnique.mockResolvedValue({
      name: "Placeholder",
      email: null,
      avatarKey: null,
      isClaimed: false,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.communityMemberFindMany.mockResolvedValue([]);
    mocks.userUpdate.mockResolvedValue({
      id: "user-1",
      name: "Renamed Placeholder",
      email: null,
      avatarKey: null,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
      isActive: true,
      isClaimed: false,
      createdAt,
    });

    const response = await patchMember({ name: "Renamed Placeholder" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        name: "Renamed Placeholder",
        email: undefined,
        gender: undefined,
        partnerPreference: PartnerPreference.OPEN,
        mixedSideOverride: null,
        isActive: undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarKey: true,
        gender: true,
        partnerPreference: true,
        mixedSideOverride: true,
        isActive: true,
        isClaimed: true,
        createdAt: true,
      },
    });
    expect(body.name).toBe("Renamed Placeholder");
  });
});
