import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionCommunityStatus } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  communityMemberFindUnique: vi.fn(),
  sessionFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    communityMember: {
      findUnique: mocks.communityMemberFindUnique,
    },
    session: {
      findMany: mocks.sessionFindMany,
    },
  },
}));

import { listSessionsForCommunity } from "./listSessionsService";

describe("listSessionsForCommunity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessionFindMany.mockResolvedValue([]);
  });

  it("does not expose incoming pending collab sessions to staff", async () => {
    mocks.communityMemberFindUnique.mockResolvedValue({ role: "STAFF" });

    await listSessionsForCommunity({
      communityId: "community-1",
      viewerId: "staff-1",
      viewerIsAdmin: false,
    });

    expect(mocks.sessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              sessionCommunities: {
                some: {
                  communityId: "community-1",
                  status: { in: [SessionCommunityStatus.ACCEPTED] },
                },
              },
            }),
          ]),
        }),
      })
    );
  });

  it("keeps incoming pending collab sessions visible to admins", async () => {
    mocks.communityMemberFindUnique.mockResolvedValue({ role: "ADMIN" });

    await listSessionsForCommunity({
      communityId: "community-1",
      viewerId: "admin-1",
      viewerIsAdmin: false,
    });

    expect(mocks.sessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              sessionCommunities: {
                some: {
                  communityId: "community-1",
                  status: {
                    in: [
                      SessionCommunityStatus.ACCEPTED,
                      SessionCommunityStatus.PENDING,
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
