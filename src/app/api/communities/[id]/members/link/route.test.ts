import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CommunityPlayerStatus,
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  communityMemberFindUnique: vi.fn(),
  communityMemberCreate: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    communityMember: {
      findUnique: mocks.communityMemberFindUnique,
      create: mocks.communityMemberCreate,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(async () =>
    Response.json({ error: "Unauthorized" }, { status: 403 })
  ),
  rateLimit: vi.fn(async () => null),
}));

import { POST } from "./route";

function postLink(body: unknown) {
  return POST(
    new Request("http://localhost/api/communities/community-2/members/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "community-2" }) }
  );
}

describe("link existing unclaimed community player route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", isAdmin: false },
    });
    mocks.communityMemberFindUnique.mockResolvedValue({ role: "ADMIN" });
  });

  it("creates a second community membership for the same unclaimed user id", async () => {
    const createdAt = new Date("2026-05-14T12:00:00.000Z");
    mocks.userFindUnique.mockResolvedValue({
      id: "unclaimed-user-1",
      name: "Alex Lee",
      email: null,
      gender: PlayerGender.FEMALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
      isActive: true,
      isClaimed: false,
      createdAt,
    });
    mocks.communityMemberCreate.mockResolvedValue({
      role: "MEMBER",
      elo: 1000,
      status: CommunityPlayerStatus.OCCASIONAL,
    });

    const response = await postLink({
      userId: "unclaimed-user-1",
      status: CommunityPlayerStatus.OCCASIONAL,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.communityMemberCreate).toHaveBeenCalledWith({
      data: {
        communityId: "community-2",
        userId: "unclaimed-user-1",
        role: "MEMBER",
        status: CommunityPlayerStatus.OCCASIONAL,
      },
      select: {
        role: true,
        elo: true,
        status: true,
      },
    });
    expect(body).toMatchObject({
      id: "unclaimed-user-1",
      name: "Alex Lee",
      status: CommunityPlayerStatus.OCCASIONAL,
      elo: 1000,
      isClaimed: false,
    });
  });

  it("does not link claimed users", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "claimed-user-1",
      name: "Claimed User",
      isClaimed: true,
    });

    const response = await postLink({ userId: "claimed-user-1" });

    expect(response.status).toBe(403);
    expect(mocks.communityMemberCreate).not.toHaveBeenCalled();
  });
});
