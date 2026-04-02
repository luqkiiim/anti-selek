import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionStatus } from "@/types/enums";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findUnique: vi.fn(), update: vi.fn() },
    communityMember: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/communityElo", () => ({
  getCommunityEloByUserId: vi.fn(),
  withCommunityElo: vi.fn((players) => players),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

describe("start session route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes player availability when a session starts", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      code: "session-1",
      communityId: null,
      status: SessionStatus.WAITING,
      players: [{ id: "player-1" }],
    } as never);
    vi.mocked(prisma.session.update).mockResolvedValue({
      communityId: null,
      players: [],
      courts: [],
    } as never);

    const response = await POST(new Request("http://localhost/session/start"), {
      params: Promise.resolve({ code: "session-1" }),
    });

    expect(response.status).toBe(200);
    expect(prisma.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: "session-1" },
        data: expect.objectContaining({
          status: SessionStatus.ACTIVE,
          players: {
            updateMany: {
              where: {},
              data: {
                availableSince: expect.any(Date),
              },
            },
          },
        }),
      })
    );
  });
});
