import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  expectAliasPair,
  expectClubContractAliases,
} from "@/lib/clubContractAliasTestUtils";
import { SessionClubStatus } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clubMemberFindUnique: vi.fn(),
  isQuickAccessSession: vi.fn(() => false),
  sessionClubUpdate: vi.fn(),
  sessionFindUnique: vi.fn(),
  rateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clubMember: {
      findUnique: mocks.clubMemberFindUnique,
    },
    session: {
      findUnique: mocks.sessionFindUnique,
    },
    sessionClub: {
      update: mocks.sessionClubUpdate,
    },
  },
}));

vi.mock("@/lib/quickAccess", () => ({
  isQuickAccessSession: mocks.isQuickAccessSession,
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(async () =>
    Response.json({ error: "Unauthorized" }, { status: 403 })
  ),
  rateLimit: mocks.rateLimit,
}));

import { PATCH } from "./route";

describe("session collab review route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
    mocks.isQuickAccessSession.mockReturnValue(false);
    mocks.auth.mockResolvedValue({
      user: {
        id: "admin-1",
        isAdmin: false,
      },
    });
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      status: "WAITING",
      sessionClubs: [
        {
          id: "link-1",
          clubId: "community-2",
          club: {
            id: "community-2",
            name: "Partner Club",
          },
        },
      ],
    });
    mocks.clubMemberFindUnique.mockResolvedValue({ role: "ADMIN" });
    mocks.sessionClubUpdate.mockResolvedValue({
      id: "link-1",
      clubId: "community-2",
      role: "PARTNER",
      status: SessionClubStatus.ACCEPTED,
      reviewedAt: new Date("2026-05-18T00:00:00.000Z"),
      club: {
        id: "community-2",
        name: "Partner Club",
      },
    });
  });

  it("returns canonical club fields with legacy community aliases", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/sessions/ABC123/collab", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: SessionClubStatus.ACCEPTED }),
      }),
      {
        params: Promise.resolve({ code: "ABC123" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expectClubContractAliases(body);
    expectAliasPair(body, "clubId", "communityId");
    expectAliasPair(body, "clubName", "communityName");
  });
});
