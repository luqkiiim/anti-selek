import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionClubStatus } from "@/types/enums";
import { expectAliasPair } from "@/lib/clubContractAliasTestUtils";

const mocks = vi.hoisted(() => ({
  clubAccessFindUnique: vi.fn(),
  clubMemberFindFirst: vi.fn(),
  sessionFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clubAccess: {
      findUnique: mocks.clubAccessFindUnique,
    },
    clubMember: { findFirst: mocks.clubMemberFindFirst },
    session: {
      findMany: mocks.sessionFindMany,
    },
  },
}));

import { listSessionsForClub } from "./listSessionsService";

describe("listSessionsForClub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clubMemberFindFirst.mockResolvedValue(null);
    mocks.sessionFindMany.mockResolvedValue([]);
  });

  it("allows an active unowned roster Player to read accepted non-test club sessions", async () => {
    mocks.clubMemberFindFirst.mockResolvedValue({ id: "guest-roster" });
    await listSessionsForClub({ clubId: "club-1", viewerId: "guest:player-1", viewerIsAdmin: false, quickAccessPlayerId: "player-1" });
    expect(mocks.clubAccessFindUnique).not.toHaveBeenCalled();
    expect(mocks.clubMemberFindFirst).toHaveBeenCalledWith({
      where: { clubId: "club-1", playerId: "player-1", archivedAt: null, player: { isActive: true, ownerUserId: null } },
      select: { id: true },
    });
    expect(mocks.sessionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ isTest: false, OR: expect.arrayContaining([
        { sessionClubs: { some: { clubId: "club-1", status: { in: [SessionClubStatus.ACCEPTED] } } } },
      ]) }),
    }));
  });

  it("never gives a guest pending collab visibility through an admin flag", async () => {
    mocks.clubMemberFindFirst.mockResolvedValue({ id: "guest-roster" });
    await listSessionsForClub({ clubId: "club-1", viewerId: "guest:player-1", viewerIsAdmin: true, quickAccessPlayerId: "player-1" });
    expect(mocks.sessionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.arrayContaining([
        { sessionClubs: { some: { clubId: "club-1", status: { in: [SessionClubStatus.ACCEPTED] } } } },
      ]) }),
    }));
  });

  it.each(["player-in-another-club", "archived-player", "inactive-player", "owned-player", ""])("rejects an ineligible guest roster: %s", async playerId => {
    await expect(listSessionsForClub({ clubId: "club-1", viewerId: "guest:player-1", viewerIsAdmin: true, quickAccessPlayerId: playerId })).rejects.toMatchObject({ status: 403 });
    expect(mocks.sessionFindMany).not.toHaveBeenCalled();
  });

  it("does not expose incoming pending collab sessions to staff", async () => {
    mocks.clubAccessFindUnique.mockResolvedValue({ role: "STAFF", status: "ACTIVE" });

    await listSessionsForClub({
      clubId: "community-1",
      viewerId: "staff-account-1",
      viewerIsAdmin: false,
    });

    expect(mocks.sessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              sessionClubs: {
                some: {
                  clubId: "community-1",
                  status: { in: [SessionClubStatus.ACCEPTED] },
                },
              },
            }),
          ]),
        }),
      })
    );
  });

  it("keeps incoming pending collab sessions visible to admins", async () => {
    mocks.clubAccessFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });

    await listSessionsForClub({
      clubId: "community-1",
      viewerId: "admin-account-1",
      viewerIsAdmin: false,
    });

    expect(mocks.sessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              sessionClubs: {
                some: {
                  clubId: "community-1",
                  status: {
                    in: [
                      SessionClubStatus.ACCEPTED,
                      SessionClubStatus.PENDING,
                    ],
                  },
                },
              },
            }),
          ]),
        }),
      })
    );
  });

  it("returns canonical session club fields with legacy aliases", async () => {
    mocks.clubAccessFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
    mocks.sessionFindMany.mockResolvedValue([
      {
        id: "session-1",
        code: "ABC123",
        clubId: "community-1",
        name: "Morning Session",
        status: "ACTIVE",
        isTest: false,
        createdAt: new Date("2026-05-18T00:00:00.000Z"),
        endedAt: null,
        sessionClubs: [
          {
            clubId: "community-1",
            role: "HOST",
            status: SessionClubStatus.ACCEPTED,
            club: {
              id: "community-1",
              name: "Club One",
              isTutorial: false,
            },
          },
        ],
        courts: [],
        players: [],
      },
    ]);

    const sessions = await listSessionsForClub({
      clubId: "community-1",
      viewerId: "admin-account-1",
      viewerIsAdmin: false,
    });

    expect(sessions).toHaveLength(1);
    expectAliasPair(sessions[0], "clubId", "communityId");
    expectAliasPair(sessions[0], "clubs", "communities");
  });
});
