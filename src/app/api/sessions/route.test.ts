import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  expectAliasPair,
  expectClubContractAliases,
} from "@/lib/clubContractAliasTestUtils";
import { withLegacyClubAliases } from "@/lib/clubContractAliases";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  canQuickAccessClub: vi.fn(() => true),
  createSessionForUser: vi.fn(),
  isQuickAccessSession: vi.fn(() => false),
  listSessionsForClub: vi.fn(),
  rateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/app/api/sessions/createSessionService", () => ({
  createSessionForUser: mocks.createSessionForUser,
}));

vi.mock("@/app/api/sessions/listSessionsService", () => ({
  listSessionsForClub: mocks.listSessionsForClub,
}));

vi.mock("@/lib/quickAccess", () => ({
  canQuickAccessClub: mocks.canQuickAccessClub,
  getQuickAccessDeniedMessage: vi.fn(() => "Denied"),
  isQuickAccessSession: mocks.isQuickAccessSession,
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mocks.rateLimit,
}));

import { GET, POST } from "./route";

describe("sessions API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
    mocks.canQuickAccessClub.mockReturnValue(true);
    mocks.isQuickAccessSession.mockReturnValue(false);
    mocks.auth.mockResolvedValue({
      user: {
        id: "viewer-1",
        isAdmin: false,
      },
    });
  });

  it("returns canonical and legacy club aliases when creating a session", async () => {
    mocks.createSessionForUser.mockResolvedValue({
      id: "session-1",
      code: "ABC123",
      clubId: "community-1",
      clubName: "Club One",
      partnerClubId: "community-2",
      name: "Morning Session",
      status: "WAITING",
    });

    const response = await POST(
      new Request("http://localhost/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Morning Session",
          clubId: "community-1",
          partnerClubId: "community-2",
          courtCount: 2,
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expectClubContractAliases(body);
    expectAliasPair(body, "clubId", "communityId");
    expectAliasPair(body, "clubName", "communityName");
    expectAliasPair(body, "partnerClubId", "partnerCommunityId");
  });

  it("preserves canonical and legacy aliases when listing sessions", async () => {
    mocks.listSessionsForClub.mockResolvedValue([
      withLegacyClubAliases({
        id: "session-1",
        code: "ABC123",
        clubId: "community-1",
        clubName: "Club One",
        partnerClubId: "community-2",
        clubs: [
          { id: "community-1", name: "Club One", role: "HOST" },
          { id: "community-2", name: "Club Two", role: "PARTNER" },
        ],
        name: "Morning Session",
        status: "ACTIVE",
      }),
    ]);

    const response = await GET(
      new Request("http://localhost/api/sessions?clubId=community-1")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.listSessionsForClub).toHaveBeenCalledWith({
      clubId: "community-1",
      viewerId: "viewer-1",
      viewerIsAdmin: false,
    });
    expect(body).toHaveLength(1);
    expectClubContractAliases(body[0]);
    expectAliasPair(body[0], "clubId", "communityId");
    expectAliasPair(body[0], "clubName", "communityName");
    expectAliasPair(body[0], "partnerClubId", "partnerCommunityId");
    expectAliasPair(body[0], "clubs", "communities");
  });
});
