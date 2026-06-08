import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionStatus } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  invalidTargetResponse: vi.fn(),
  rateLimit: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionUpdate: vi.fn(),
  sessionPlayerFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    communityMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    session: {
      findUnique: mocks.sessionFindUnique,
      update: mocks.sessionUpdate,
    },
    sessionPlayer: {
      findUnique: mocks.sessionPlayerFindUnique,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: mocks.checkInvalidTargetRateLimit,
  invalidTargetResponse: mocks.invalidTargetResponse,
  rateLimit: mocks.rateLimit,
}));

import { POST } from "./route";

function postJoin(body: unknown = {}) {
  return POST(
    new Request("http://localhost/api/sessions/ABC/join", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ code: "ABC" }) }
  );
}

describe("join session route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.rateLimit.mockResolvedValue(null);
    mocks.checkInvalidTargetRateLimit.mockResolvedValue(null);
    mocks.invalidTargetResponse.mockImplementation(() =>
      Response.json({ error: "Unauthorized" }, { status: 403 })
    );
  });

  it("blocks quick-access users from joining sessions", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "player-1",
        isAdmin: false,
        isQuickAccess: true,
        quickAccessCommunityId: "community-1",
      },
    });
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      communityId: "community-1",
      status: SessionStatus.WAITING,
      players: [],
    });

    const response = await postJoin();

    expect(response.status).toBe(403);
    expect(mocks.sessionPlayerFindUnique).not.toHaveBeenCalled();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });
});
