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
  isAccountSessionPlayer: vi.fn(),
  canQuickAccessClub: vi.fn(),
  getQuickAccessPlayerId: vi.fn(),
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
  isAccountSessionPlayer: mocks.isAccountSessionPlayer,
}));

vi.mock("@/lib/quickAccess", () => ({
  canQuickAccessClub: mocks.canQuickAccessClub,
  getQuickAccessPlayerId: mocks.getQuickAccessPlayerId,
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
    playerId: `player-${index + 1}`,
    sessionPoints: 30 - index,
    joinedAt: new Date("2026-05-01T00:00:00.000Z"),
    ladderEntryAt: new Date("2026-05-01T00:00:00.000Z"),
    isGuest: false,
    player: {
      id: `player-${index + 1}`,
      name: index === 0 ? "Lina Kay" : `Player ${index + 1}`,
      avatarKey: null as string | null,
    },
  }));

  return {
    id: "session-1",
    code: "ABC123",
    clubId: "community-1",
    name: "Badminton 29/5/26",
    type: SessionType.POINTS,
    status,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    endedAt: new Date("2026-05-01T12:00:00.000Z"),
    club: {
      id: "community-1",
      name: communityIsTutorial
        ? "Tutorial playground u1"
        : "Badminton Usuals",
      isTutorial: communityIsTutorial,
      tutorialOwnerId: communityIsTutorial ? "viewer" : null,
    },
    sessionClubs: [
      {
        role: "HOST",
        status: "ACCEPTED",
        club: {
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
        team1Player1Id: "player-1",
        team1Player2Id: "player-3",
        team2Player1Id: "player-2",
        team2Player2Id: "player-4",
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
    mocks.isAccountSessionPlayer.mockResolvedValue(false);
    mocks.canQuickAccessClub.mockReturnValue(true);
    mocks.getQuickAccessPlayerId.mockImplementation((session: { user?: { isQuickAccess?: boolean; guestPlayerId?: string | null } } | null | undefined) => session?.user?.isQuickAccess ? session.user.guestPlayerId ?? null : null);
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
    expect(mocks.imageResponses[0].options).toEqual(expect.objectContaining({
      width: SESSION_SHARE_IMAGE_WIDTH,
      height: SESSION_SHARE_IMAGE_HEIGHT,
      fonts: expect.arrayContaining([
        expect.objectContaining({ name: "Nunito Sans", weight: 400 }),
        expect.objectContaining({ name: "Nunito Sans", weight: 800 }),
      ]),
    }));
    const markup = renderToStaticMarkup(
      mocks.imageResponses[0].element as ReactElement
    );
    expect(markup).toContain("Badminton 29/5/26");
    expect(markup).toContain(">13<");
    expect(markup).toContain("1 May 2026");
    expect(markup).toContain("13 players");
    expect(markup).toContain("1 match");
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
        playerId: `other-${player.playerId}`,
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
      "Final standings are available after the tournament ends."
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
    sessionData.players[0].player.avatarKey = "https://cdn.test/lina.png";
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
