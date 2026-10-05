import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClubPlayerStatus,
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clubFindUnique: vi.fn(),
  clubAccessFindUnique: vi.fn(),
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
    clubAccess: {
      findUnique: mocks.clubAccessFindUnique,
    },
    clubMember: {
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
      user: { id: "account-operator", isAdmin: false },
    });
    mocks.clubAccessFindUnique.mockResolvedValue({ role: "STAFF", status: "ACTIVE" });
    mocks.clubFindUnique.mockResolvedValue({ isTutorial: false });
    mocks.offlineIdentityLinkRequestFindFirst.mockResolvedValue(null);
    mocks.offlineIdentityMemberFindMany.mockResolvedValue([]);
  });

  it("deduplicates a shared player identity and keeps claimed account details private", async () => {
    const createdAt = new Date("2026-05-14T10:00:00.000Z");
    mocks.clubMemberFindMany.mockResolvedValue([
      {
        playerId: "player-shared",
        elo: 1200,
        status: ClubPlayerStatus.CORE,
        createdAt,
        club: { id: "community-1", name: "Host Club" },
        player: {
          id: "player-shared",
          ownerUserId: null,
          name: "Alex Lee",
          gender: PlayerGender.MALE,
          partnerPreference: PartnerPreference.OPEN,
          mixedSideOverride: null,
          isActive: true,
          createdAt,
        },
      },
      {
        playerId: "player-shared",
        elo: 1310,
        status: ClubPlayerStatus.OCCASIONAL,
        createdAt,
        club: { id: "community-2", name: "Partner Club" },
        player: {
          id: "player-shared",
          ownerUserId: null,
          name: "Alex Lee",
          gender: PlayerGender.MALE,
          partnerPreference: PartnerPreference.OPEN,
          mixedSideOverride: null,
          isActive: true,
          createdAt,
        },
      },
      {
        playerId: "player-duplicate-name",
        elo: 980,
        status: ClubPlayerStatus.CORE,
        createdAt,
        club: { id: "community-2", name: "Partner Club" },
        player: {
          id: "player-duplicate-name",
          ownerUserId: "account-duplicate",
          name: "Alex Lee",
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.OPEN,
          mixedSideOverride: null,
          isActive: true,
          createdAt,
        },
      },
    ]);

    const response = await getCollabRoster();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(2);

    const sharedPlayer = body.find(
      (player: { id: string }) => player.id === "player-shared"
    );
    const duplicateNamePlayer = body.find(
      (player: { id: string }) => player.id === "player-duplicate-name"
    );

    expect(sharedPlayer).toMatchObject({
      id: "player-shared",
      name: "Alex Lee",
      email: null,
      elo: 1200,
      isClaimed: false,
      communityBadges: [
        { id: "community-1", name: "Host Club", userId: "player-shared", elo: 1200 },
        { id: "community-2", name: "Partner Club", elo: 1310 },
      ],
    });
    expect(duplicateNamePlayer).toMatchObject({
      id: "player-duplicate-name",
      name: "Alex Lee",
      email: null,
      isClaimed: true,
      communityBadges: [
        { id: "community-2", name: "Partner Club", elo: 980 },
      ],
    });
    expect(JSON.stringify(duplicateNamePlayer)).not.toContain("account-duplicate");
  });

  it("requires operator access to the partner club before exposing its roster", async () => {
    mocks.clubAccessFindUnique
      .mockResolvedValueOnce({ role: "STAFF", status: "ACTIVE" })
      .mockResolvedValueOnce({ role: "MEMBER", status: "ACTIVE" });

    const response = await getCollabRoster();

    expect(response.status).toBe(403);
    expect(mocks.clubMemberFindMany).not.toHaveBeenCalled();
  });

  it("allows host operators to load rosters for already linked clubs", async () => {
    mocks.clubAccessFindUnique
      .mockResolvedValueOnce({ role: "STAFF", status: "ACTIVE" })
      .mockResolvedValueOnce({ role: "MEMBER", status: "ACTIVE" });
    mocks.offlineIdentityLinkRequestFindFirst.mockResolvedValue({ id: "link-1" });
    mocks.clubMemberFindMany.mockResolvedValue([]);

    const response = await getCollabRoster();

    expect(response.status).toBe(200);
    expect(mocks.clubMemberFindMany).toHaveBeenCalled();
  });
});
