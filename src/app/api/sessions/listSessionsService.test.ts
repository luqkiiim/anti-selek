import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionClubStatus } from "@/types/enums";
import { expectAliasPair } from "@/lib/clubContractAliasTestUtils";

const mocks = vi.hoisted(() => ({
  clubAccessFindUnique: vi.fn(),
  sessionFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clubAccess: {
      findUnique: mocks.clubAccessFindUnique,
    },
    session: {
      findMany: mocks.sessionFindMany,
    },
  },
}));

import { listSessionsForClub } from "./listSessionsService";

describe("listSessionsForClub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessionFindMany.mockResolvedValue([]);
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
