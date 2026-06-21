import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClubPlayerStatus,
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clubFindUnique: vi.fn(),
  clubMemberFindUnique: vi.fn(),
  clubMemberFindMany: vi.fn(),
  offlineIdentityLinkRequestFindFirst: vi.fn(),
  offlineIdentityMemberFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    club: {
      findUnique: mocks.clubFindUnique,
    },
    clubMember: {
      findUnique: mocks.clubMemberFindUnique,
      findMany: mocks.clubMemberFindMany,
    },
    offlineIdentityLinkRequest: {
      findFirst: mocks.offlineIdentityLinkRequestFindFirst,
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
      "http://localhost/api/clubs/community-1/collab-roster?partnerClubId=community-2"
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
    mocks.clubMemberFindUnique.mockResolvedValue({ role: "STAFF" });
    mocks.clubFindUnique.mockResolvedValue({ isTutorial: false });
    mocks.offlineIdentityLinkRequestFindFirst.mockResolvedValue(null);
    mocks.offlineIdentityMemberFindMany.mockResolvedValue([]);
  });

  it("allows staff to load outgoing collab rosters and de-duplicates shared unclaimed players", async () => {
    const createdAt = new Date("2026-05-14T10:00:00.000Z");
    mocks.clubMemberFindMany.mockResolvedValue([
      {
        userId: "user-shared",
        elo: 1200,
        status: ClubPlayerStatus.CORE,
        role: "MEMBER",
        createdAt,
        club: { id: "community-1", name: "Host Club" },
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
        status: ClubPlayerStatus.OCCASIONAL,
        role: "MEMBER",
        createdAt,
        club: { id: "community-2", name: "Partner Club" },
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
        status: ClubPlayerStatus.CORE,
        role: "MEMBER",
        createdAt,
        club: { id: "community-2", name: "Partner Club" },
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

  it("requires operator access to the partner club before exposing its roster", async () => {
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce({ role: "STAFF" })
      .mockResolvedValueOnce({ role: "MEMBER" });

    const response = await getCollabRoster();

    expect(response.status).toBe(403);
    expect(mocks.clubMemberFindMany).not.toHaveBeenCalled();
  });

  it("allows host operators to load rosters for already linked clubs", async () => {
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce({ role: "STAFF" })
      .mockResolvedValueOnce({ role: "MEMBER" });
    mocks.offlineIdentityLinkRequestFindFirst.mockResolvedValue({ id: "link-1" });
    mocks.clubMemberFindMany.mockResolvedValue([]);

    const response = await getCollabRoster();

    expect(response.status).toBe(200);
    expect(mocks.clubMemberFindMany).toHaveBeenCalled();
  });
});
