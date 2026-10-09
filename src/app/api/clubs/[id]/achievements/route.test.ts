import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clubFindUnique: vi.fn(),
  clubAccessFindUnique: vi.fn(),
  memberFindMany: vi.fn(),
  memberFindUnique: vi.fn(),
  canQuickAccessClub: vi.fn(),
  isQuickAccessSession: vi.fn(),
  rateLimit: vi.fn(),
  getCollection: vi.fn(),
  savePreferences: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    club: { findUnique: mocks.clubFindUnique },
    clubAccess: { findUnique: mocks.clubAccessFindUnique },
    clubMember: {
      findMany: mocks.memberFindMany,
      findUnique: mocks.memberFindUnique,
    },
  },
}));
vi.mock("@/lib/quickAccess", () => ({
  canQuickAccessClub: mocks.canQuickAccessClub,
  isQuickAccessSession: mocks.isQuickAccessSession,
}));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/clubAchievementService", () => ({
  getClubAchievementCollection: mocks.getCollection,
  saveAchievementPreferences: mocks.savePreferences,
}));
vi.mock("@/lib/errors", () => ({
  logError: mocks.logError,
  safeErrorResponse: vi.fn(() => Response.json({ error: "Internal server error" }, { status: 500 })),
}));

import { GET, PATCH } from "./route";

const params = Promise.resolve({ id: "club-1" });
const fullCollection = {
  showcase: ["on-the-board", "clean-sweep"],
  unseen: [{ id: "on-the-board", tier: 1 }],
  achievements: [
    {
      id: "on-the-board",
      name: "On the Board",
      description: "Win recorded games in completed sessions.",
      unit: "wins",
      progress: 12,
      progressLabel: "12 wins",
      earnedTier: 1,
      optional: false,
      tiers: [
        { tier: 1, target: 10, earnedAt: "2026-06-01T00:00:00.000Z", sessionCode: "ABC", sessionName: "Friday games" },
        { tier: 2, target: 50, earnedAt: null, sessionCode: null, sessionName: null },
      ],
    },
    {
      id: "clean-sweep",
      name: "Clean Sweep",
      description: "Win every game you played in a session.",
      unit: "perfect sessions",
      progress: 0,
      progressLabel: "0 perfect sessions",
      earnedTier: 0,
      optional: false,
      tiers: [{ tier: 1, target: 1, earnedAt: null, sessionCode: null, sessionName: null }],
    },
  ],
};

function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost/api/clubs/club-1/achievements${path}`, init);
}

describe("club achievements target reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "account-viewer" } });
    mocks.clubFindUnique.mockResolvedValue({
      id: "club-1",
      createdById: "account-owner",
      isTutorial: false,
      tutorialOwnerId: null,
    });
    mocks.clubAccessFindUnique.mockResolvedValue({ role: "MEMBER", status: "ACTIVE" });
    mocks.memberFindMany.mockResolvedValue([
      {
        id: "membership-viewer",
        playerId: "player-viewer",
        player: { id: "player-viewer", ownerUserId: "account-viewer" },
      },
    ]);
    mocks.memberFindUnique.mockResolvedValue({ id: "membership-target" });
    mocks.canQuickAccessClub.mockReturnValue(true);
    mocks.isQuickAccessSession.mockReturnValue(false);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.getCollection.mockResolvedValue(fullCollection);
    mocks.savePreferences.mockResolvedValue(true);
  });

  it("returns only earned public pins for another club member", async () => {
    const response = await GET(request("?userId=player-target"), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      showcase: ["on-the-board"],
      earned: [{
        id: "on-the-board",
        title: "On the Board",
        description: "Win recorded games in completed sessions.",
        tiers: [{ tier: 1, earnedAt: "2026-06-01T00:00:00.000Z", sessionCode: "ABC", sessionName: "Friday games" }],
      }],
    });
    expect(mocks.getCollection).toHaveBeenCalledWith("club-1", "player-target");
    expect(mocks.memberFindUnique).toHaveBeenCalledWith({
      where: { clubId_playerId: { clubId: "club-1", playerId: "player-target" } },
      select: { id: true, retiredByAdmissionEventId: true },
    });
  });

  it("rejects a retired target before reading or writing achievement snapshots", async () => {
    mocks.memberFindUnique.mockResolvedValue({ id: "membership-retired", retiredByAdmissionEventId: "retirement-event" });

    const read = await GET(request("?userId=player-retired"), { params });

    expect(read.status).toBe(404);
    expect(await read.json()).toEqual({ error: "Club unavailable" });
    expect(mocks.getCollection).not.toHaveBeenCalled();
    expect(mocks.savePreferences).not.toHaveBeenCalled();

    const write = await PATCH(request("?userId=player-retired", { method: "PATCH", body: JSON.stringify({ showcase: [] }) }), { params });

    expect(write.status).toBe(404);
    expect(await write.json()).toEqual({ error: "Club unavailable" });
    expect(mocks.getCollection).not.toHaveBeenCalled();
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });

  it("rejects a target who is not a member of the club", async () => {
    mocks.memberFindUnique.mockResolvedValueOnce(null);

    const response = await GET(request("?userId=player-outsider"), { params });

    expect(response.status).toBe(404);
    expect(mocks.getCollection).not.toHaveBeenCalled();
  });

  it("keeps PATCH self-only when another target is in the query", async () => {
    const response = await PATCH(request("?userId=player-target", { method: "PATCH", body: "{}" }), { params });

    expect(response.status).toBe(403);
    expect(mocks.memberFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });

  it("keeps PATCH self-only when another target is in the body", async () => {
    const response = await PATCH(request("", { method: "PATCH", body: JSON.stringify({ userId: "player-target" }) }), { params });

    expect(response.status).toBe(403);
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });

  it("leaves the self GET response unchanged", async () => {
    const response = await GET(request(""), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(fullCollection);
  });

  it("leaves the self PATCH response unchanged", async () => {
    const response = await PATCH(request("", {
      method: "PATCH",
      body: JSON.stringify({ showcase: ["on-the-board"] }),
    }), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(fullCollection);
    expect(mocks.savePreferences).toHaveBeenCalledWith("club-1", "player-viewer", { showcase: ["on-the-board"] });
  });
});
