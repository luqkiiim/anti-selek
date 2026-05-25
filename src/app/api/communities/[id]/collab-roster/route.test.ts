import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CommunityPlayerStatus,
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  communityMemberFindUnique: vi.fn(),
  communityMemberFindMany: vi.fn(),
  offlineIdentityMemberFindMany: vi.fn(),
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
    offlineIdentityMember: {
      findMany: mocks.offlineIdentityMemberFindMany,
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

import { GET } from "./route";

function getCollabRoster() {
  return GET(
    new Request(
      "http://localhost/api/communities/community-1/collab-roster?partnerCommunityId=community-2"
    ),
    { params: Promise.resolve({ id: "community-1" }) }
  );
}

describe("collab roster route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", isAdmin: false },
    });
    mocks.communityMemberFindUnique.mockResolvedValue({
      role: "ADMIN",
    });
    mocks.offlineIdentityMemberFindMany.mockResolvedValue([]);
  });

  it("de-duplicates shared unclaimed players by user id and keeps duplicate names separate", async () => {
    const createdAt = new Date("2026-05-14T10:00:00.000Z");
    mocks.communityMemberFindMany.mockResolvedValue([
      {
        userId: "user-shared",
        elo: 1200,
        status: CommunityPlayerStatus.CORE,
        role: "MEMBER",
        createdAt,
        community: { id: "community-1", name: "Host Club" },
        user: {
          id: "user-shared",
          name: "Alex Lee",
          email: null,
          gender: PlayerGender.MALE,
          partnerPreference: PartnerPreference.OPEN,
          mixedSideOverride: null,
          isActive: true,
          isClaimed: false,
          createdAt,
        },
      },
      {
        userId: "user-shared",
        elo: 1310,
        status: CommunityPlayerStatus.OCCASIONAL,
        role: "MEMBER",
        createdAt,
        community: { id: "community-2", name: "Partner Club" },
        user: {
          id: "user-shared",
          name: "Alex Lee",
          email: null,
          gender: PlayerGender.MALE,
          partnerPreference: PartnerPreference.OPEN,
          mixedSideOverride: null,
          isActive: true,
          isClaimed: false,
          createdAt,
        },
      },
      {
        userId: "user-duplicate-name",
        elo: 980,
        status: CommunityPlayerStatus.CORE,
        role: "MEMBER",
        createdAt,
        community: { id: "community-2", name: "Partner Club" },
        user: {
          id: "user-duplicate-name",
          name: "Alex Lee",
          email: null,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.OPEN,
          mixedSideOverride: null,
          isActive: true,
          isClaimed: false,
          createdAt,
        },
      },
    ]);

    const response = await getCollabRoster();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(2);

    const sharedPlayer = body.find(
      (player: { id: string }) => player.id === "user-shared"
    );
    const duplicateNamePlayer = body.find(
      (player: { id: string }) => player.id === "user-duplicate-name"
    );

    expect(sharedPlayer).toMatchObject({
      id: "user-shared",
      name: "Alex Lee",
      elo: 1200,
      isClaimed: false,
      communityBadges: [
        { id: "community-1", name: "Host Club", elo: 1200 },
        { id: "community-2", name: "Partner Club", elo: 1310 },
      ],
    });
    expect(duplicateNamePlayer).toMatchObject({
      id: "user-duplicate-name",
      name: "Alex Lee",
      communityBadges: [
        { id: "community-2", name: "Partner Club", elo: 980 },
      ],
    });
  });
});
