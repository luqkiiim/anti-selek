import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MatchStatus, SessionStatus, SessionType } from "@/types/enums";
import {
  SESSION_SHARE_IMAGE_HEIGHT,
  SESSION_SHARE_IMAGE_WIDTH,
} from "@/lib/sessionShareImage";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  sessionFindUnique: vi.fn(),
  getSessionMembership: vi.fn(),
  canQuickAccessClub: vi.fn(),
  isQuickAccessSession: vi.fn(),
  invalidTargetResponse: vi.fn(),
  rateLimit: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(),
  imageResponses: [] as Array<{ element: unknown; options: unknown }>,
}));

vi.mock("next/og", () => ({
  ImageResponse: class ImageResponse extends Response {
    constructor(element: unknown, options: unknown) {
      mocks.imageResponses.push({ element, options });
      super("png", { headers: { "content-type": "image/png" } });
    }
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: {
      findUnique: mocks.sessionFindUnique,
    },
  },
}));

vi.mock("@/lib/sessionCollab", () => ({
  getSessionMembership: mocks.getSessionMembership,
}));

vi.mock("@/lib/quickAccess", () => ({
  canQuickAccessClub: mocks.canQuickAccessClub,
  isQuickAccessSession: mocks.isQuickAccessSession,
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: mocks.checkInvalidTargetRateLimit,
  invalidTargetResponse: mocks.invalidTargetResponse,
  rateLimit: mocks.rateLimit,
}));

import { GET } from "./route";

function createSessionData({
  status = SessionStatus.COMPLETED,
  communityIsTutorial = false,
}: {
  status?: string;
  communityIsTutorial?: boolean;
} = {}) {
  const players = Array.from({ length: 13 }, (_, index) => ({
    userId: `u${index + 1}`,
    sessionPoints: 30 - index,
    joinedAt: new Date("2026-05-01T00:00:00.000Z"),
    ladderEntryAt: new Date("2026-05-01T00:00:00.000Z"),
    isGuest: false,
    user: {
      id: `u${index + 1}`,
      name: index === 0 ? "Lina Kay" : `Player ${index + 1}`,
      avatarKey: null as string | null,
    },
  }));

  return {
    id: "session-1",
    code: "ABC123",
    communityId: "community-1",
    name: "Badminton 29/5/26",
    type: SessionType.POINTS,
    status,
    community: {
      id: "community-1",
      name: communityIsTutorial
        ? "Tutorial playground u1"
        : "Badminton Usuals",
      isTutorial: communityIsTutorial,
      tutorialOwnerId: communityIsTutorial ? "viewer" : null,
    },
    sessionCommunities: [
      {
        role: "HOST",
        status: "ACCEPTED",
        community: {
          id: "community-1",
          name: communityIsTutorial
            ? "Tutorial playground u1"
            : "Badminton Usuals",
          isTutorial: communityIsTutorial,
        },
      },
    ],
    players,
    matches: [
      {
        team1User1Id: "u1",
        team1User2Id: "u3",
        team2User1Id: "u2",
        team2User2Id: "u4",
        team1Score: 21,
        team2Score: 17,
        winnerTeam: 1,
        status: MatchStatus.COMPLETED,
        completedAt: new Date("2026-05-01T01:00:00.000Z"),
      },
    ],
  };
}

describe("session share image route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.imageResponses.length = 0;
    mocks.auth.mockResolvedValue({ user: { id: "viewer", isAdmin: false } });
    mocks.sessionFindUnique.mockResolvedValue(createSessionData());
    mocks.getSessionMembership.mockResolvedValue({ role: "MEMBER" });
    mocks.canQuickAccessClub.mockReturnValue(true);
    mocks.isQuickAccessSession.mockReturnValue(false);
    mocks.invalidTargetResponse.mockImplementation(() =>
      Response.json({ error: "Unauthorized" }, { status: 403 })
    );
    mocks.rateLimit.mockResolvedValue(null);
    mocks.checkInvalidTargetRateLimit.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generates a PNG for an authenticated session viewer", async () => {
    const response = await GET(
      new Request("http://localhost/api/sessions/ABC123/share-image"),
      { params: Promise.resolve({ code: "ABC123" }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.imageResponses[0].options).toEqual({
      width: SESSION_SHARE_IMAGE_WIDTH,
      height: SESSION_SHARE_IMAGE_HEIGHT,
    });
    const markup = renderToStaticMarkup(
      mocks.imageResponses[0].element as ReactElement
    );
    expect(markup).toContain("Badminton 29/5/26");
    expect(markup).toContain(">13<");
  });

  it("rejects unauthenticated users", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/sessions/ABC123/share-image"),
      { params: Promise.resolve({ code: "ABC123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Not authenticated");
    expect(mocks.imageResponses).toHaveLength(0);
  });

  it("rejects unauthorized viewers", async () => {
    mocks.getSessionMembership.mockResolvedValue(null);
    mocks.sessionFindUnique.mockResolvedValue({
      ...createSessionData(),
      players: createSessionData().players.map((player) => ({
        ...player,
        userId: `other-${player.userId}`,
      })),
    });

    const response = await GET(
      new Request("http://localhost/api/sessions/ABC123/share-image"),
      { params: Promise.resolve({ code: "ABC123" }) }
    );

    expect(response.status).toBe(403);
    expect(mocks.imageResponses).toHaveLength(0);
  });

  it("rejects active sessions", async () => {
    mocks.sessionFindUnique.mockResolvedValue(
      createSessionData({ status: SessionStatus.ACTIVE })
    );

    const response = await GET(
      new Request("http://localhost/api/sessions/ABC123/share-image"),
      { params: Promise.resolve({ code: "ABC123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "Final standings are available after the session ends."
    );
    expect(mocks.imageResponses).toHaveLength(0);
  });

  it("masks tutorial club display names", async () => {
    mocks.sessionFindUnique.mockResolvedValue(
      createSessionData({ communityIsTutorial: true })
    );

    await GET(new Request("http://localhost/api/sessions/ABC123/share-image"), {
      params: Promise.resolve({ code: "ABC123" }),
    });
    const markup = renderToStaticMarkup(
      mocks.imageResponses[0].element as ReactElement
    );

    expect(markup).toContain("Tutorial playground");
    expect(markup).not.toContain("Tutorial playground u1");
  });

  it("falls back to initials when avatar fetching fails", async () => {
    const sessionData = createSessionData();
    sessionData.players[0].user.avatarKey = "https://cdn.test/lina.png";
    mocks.sessionFindUnique.mockResolvedValue(sessionData);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    await GET(new Request("http://localhost/api/sessions/ABC123/share-image"), {
      params: Promise.resolve({ code: "ABC123" }),
    });
    const markup = renderToStaticMarkup(
      mocks.imageResponses[0].element as ReactElement
    );

    expect(markup).toContain(">LK<");
    expect(markup).not.toContain("https://cdn.test/lina.png");
  });
});
