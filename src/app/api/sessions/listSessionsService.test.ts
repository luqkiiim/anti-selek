import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionClubStatus } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  clubMemberFindUnique: vi.fn(),
  sessionFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clubMember: {
      findUnique: mocks.clubMemberFindUnique,
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
    mocks.clubMemberFindUnique.mockResolvedValue({ role: "STAFF" });

    await listSessionsForClub({
      clubId: "community-1",
      viewerId: "staff-1",
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
    mocks.clubMemberFindUnique.mockResolvedValue({ role: "ADMIN" });

    await listSessionsForClub({
      clubId: "community-1",
      viewerId: "admin-1",
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
});
