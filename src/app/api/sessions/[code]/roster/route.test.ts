import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClubPlayerStatus,
  PartnerPreference,
  PlayerGender,
  SessionClubRole,
  SessionClubStatus,
  SessionCollabFormat,
} from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  isQuickAccessSession: vi.fn(),
  invalidTargetResponse: vi.fn(),
  rateLimit: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(),
  sessionFindUnique: vi.fn(),
  clubAccessFindMany: vi.fn(),
  clubMemberFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clubAccess: {
      findMany: mocks.clubAccessFindMany,
    },
    session: {
      findUnique: mocks.sessionFindUnique,
    },
    clubMember: {
      findMany: mocks.clubMemberFindMany,
    },
  },
}));

vi.mock("@/lib/quickAccess", () => ({
  isQuickAccessSession: mocks.isQuickAccessSession,
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: mocks.checkInvalidTargetRateLimit,
  invalidTargetResponse: mocks.invalidTargetResponse,
  rateLimit: mocks.rateLimit,
}));

import { GET } from "./route";

function getRoster() {
  return GET(new Request("http://localhost/api/sessions/ABC/roster"), {
    params: Promise.resolve({ code: "ABC" }),
  });
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    clubId: "club-a",
    collabFormat: SessionCollabFormat.INTERCLUB,
    sessionClubs: [
      {
        clubId: "club-a",
        role: SessionClubRole.HOST,
        status: SessionClubStatus.ACCEPTED,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        club: { id: "club-a", name: "Northside" },
      },
      {
        clubId: "club-b",
        role: SessionClubRole.PARTNER,
        status: SessionClubStatus.ACCEPTED,
        createdAt: new Date("2026-06-01T00:01:00.000Z"),
        club: { id: "club-b", name: "Anti-SeleK" },
      },
    ],
    ...overrides,
  };
}

function makeMembership({
  clubId,
  clubName,
  playerId,
  name,
}: {
  clubId: string;
  clubName: string;
  playerId: string;
  name: string;
}) {
  return {
    clubId,
    club: { id: clubId, name: clubName },
    playerId,
    elo: 1100,
    status: ClubPlayerStatus.CORE,
    createdAt: new Date("2026-06-02T00:00:00.000Z"),
    player: {
      id: playerId,
      name,
      avatarKey: null,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
      isActive: true,
      ownerUserId: `${playerId}-owner-account`,
      createdAt: new Date("2026-06-02T00:00:00.000Z"),
    },
  };
}

describe("session roster route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "club-b-admin-account", isAdmin: false },
    });
    mocks.isQuickAccessSession.mockReturnValue(false);
    mocks.invalidTargetResponse.mockImplementation(() =>
      Response.json({ error: "Unauthorized" }, { status: 403 })
    );
    mocks.rateLimit.mockResolvedValue(null);
    mocks.checkInvalidTargetRateLimit.mockResolvedValue(null);
    mocks.sessionFindUnique.mockResolvedValue(makeSession());
    mocks.clubAccessFindMany.mockResolvedValue([{ clubId: "club-b" }]);
    mocks.clubMemberFindMany.mockResolvedValue([
      makeMembership({
        clubId: "club-b",
        clubName: "Anti-SeleK",
        playerId: "b-player",
        name: "B Player",
      }),
    ]);
  });

  it("returns Club B players for a Club B operator", async () => {
    const response = await getRoster();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: "b-player",
      name: "B Player",
      representingClubId: "club-b",
      representingClubName: "Anti-SeleK",
    });
    expect(mocks.clubMemberFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { clubId: { in: ["club-b"] } },
      })
    );
  });

  it("returns Club B players for a Club B operator in free-play collab", async () => {
    mocks.sessionFindUnique.mockResolvedValue(
      makeSession({ collabFormat: SessionCollabFormat.FREE_PLAY })
    );

    const response = await getRoster();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: "b-player",
      name: "B Player",
      representingClubId: "club-b",
      representingClubName: "Anti-SeleK",
    });
    expect(mocks.clubMemberFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { clubId: { in: ["club-b"] } },
      })
    );
  });

  it("returns Club A players for a Club A operator", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "club-a-admin-account", isAdmin: false },
    });
    mocks.clubAccessFindMany.mockResolvedValue([{ clubId: "club-a" }]);
    mocks.clubMemberFindMany.mockResolvedValue([
      makeMembership({
        clubId: "club-a",
        clubName: "Northside",
        playerId: "a-player",
        name: "A Player",
      }),
    ]);

    const response = await getRoster();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: "a-player",
      name: "A Player",
      representingClubId: "club-a",
      representingClubName: "Northside",
    });
  });

  it("returns both accepted club rosters for a global admin", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "global-admin", isAdmin: true },
    });
    mocks.clubMemberFindMany.mockResolvedValue([
      makeMembership({
        clubId: "club-b",
        clubName: "Anti-SeleK",
        playerId: "b-player",
        name: "B Player",
      }),
      makeMembership({
        clubId: "club-a",
        clubName: "Northside",
        playerId: "a-player",
        name: "A Player",
      }),
    ]);

    const response = await getRoster();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.map((row: { representingClubId: string }) => row.representingClubId)).toEqual([
      "club-a",
      "club-b",
    ]);
    expect(mocks.clubMemberFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.clubMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clubId: { in: ["club-a", "club-b"] } },
      })
    );
  });

  it("returns both accepted club rosters for a global admin in free-play collab", async () => {
    mocks.sessionFindUnique.mockResolvedValue(
      makeSession({ collabFormat: SessionCollabFormat.FREE_PLAY })
    );
    mocks.auth.mockResolvedValue({
      user: { id: "global-admin", isAdmin: true },
    });
    mocks.clubMemberFindMany.mockResolvedValue([
      makeMembership({
        clubId: "club-b",
        clubName: "Anti-SeleK",
        playerId: "b-player",
        name: "B Player",
      }),
      makeMembership({
        clubId: "club-a",
        clubName: "Northside",
        playerId: "a-player",
        name: "A Player",
      }),
    ]);

    const response = await getRoster();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.map((row: { representingClubId: string }) => row.representingClubId)).toEqual([
      "club-a",
      "club-b",
    ]);
    expect(mocks.clubMemberFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.clubMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clubId: { in: ["club-a", "club-b"] } },
      })
    );
  });

  it("rejects sessions without two accepted interclub clubs", async () => {
    mocks.sessionFindUnique.mockResolvedValue(
      makeSession({
        sessionClubs: [
          {
            clubId: "club-a",
            role: SessionClubRole.HOST,
            status: SessionClubStatus.ACCEPTED,
            club: { id: "club-a", name: "Northside" },
          },
          {
            clubId: "club-b",
            role: SessionClubRole.PARTNER,
            status: SessionClubStatus.PENDING,
            club: { id: "club-b", name: "Anti-SeleK" },
          },
        ],
      })
    );

    const response = await getRoster();
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Club vs club roster requires two accepted clubs");
  });

  it("rejects free-play collab sessions without an accepted partner club", async () => {
    mocks.sessionFindUnique.mockResolvedValue(
      makeSession({
        collabFormat: SessionCollabFormat.FREE_PLAY,
        sessionClubs: [
          {
            clubId: "club-a",
            role: SessionClubRole.HOST,
            status: SessionClubStatus.ACCEPTED,
            club: { id: "club-a", name: "Northside" },
          },
          {
            clubId: "club-b",
            role: SessionClubRole.PARTNER,
            status: SessionClubStatus.PENDING,
            club: { id: "club-b", name: "Anti-SeleK" },
          },
        ],
      })
    );

    const response = await getRoster();
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "Tournament roster requires accepted partner clubs"
    );
  });

  it("rejects non-operators", async () => {
    mocks.clubAccessFindMany.mockResolvedValueOnce([]);

    const response = await getRoster();

    expect(response.status).toBe(403);
  });

  it("rejects unauthenticated and quick-access requests", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    let response = await getRoster();
    expect(response.status).toBe(401);

    mocks.auth.mockResolvedValueOnce({
      user: { id: "quick", isAdmin: false, isQuickAccess: true },
    });
    mocks.isQuickAccessSession.mockReturnValueOnce(true);
    response = await getRoster();
    expect(response.status).toBe(403);
  });
});
