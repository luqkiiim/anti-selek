import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PlayerGender,
  SessionPairingMode,
  SessionPool,
  SessionStatus,
} from "@/types/enums";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findUnique: vi.fn(), update: vi.fn() },
    clubMember: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/clubElo", () => ({
  getClubEloByUserId: vi.fn(),
  withClubElo: vi.fn((players) => players),
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
      clubId: null,
      status: SessionStatus.WAITING,
      players: [{ id: "player-1" }],
    } as never);
    vi.mocked(prisma.session.update).mockResolvedValue({
      clubId: null,
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

  it("revalidates the minimum active roster for player groups", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      code: "session-1",
      clubId: null,
      status: SessionStatus.WAITING,
      poolsEnabled: true,
      players: [
        { id: "player-1", pool: SessionPool.A, isPaused: false },
        { id: "player-2", pool: SessionPool.B, isPaused: false },
        { id: "player-3", pool: SessionPool.B, isPaused: false },
        { id: "player-4", pool: SessionPool.A, isPaused: true },
      ],
    } as never);

    const response = await POST(new Request("http://localhost/session/start"), {
      params: Promise.resolve({ code: "session-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("at least 2 Competitive and 2 Social");
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  it("names the player whose gender blocks mixed pairing", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      code: "session-1",
      clubId: null,
      status: SessionStatus.WAITING,
      poolsEnabled: false,
      pairingMode: SessionPairingMode.MIXED,
      players: [
        {
          id: "player-1",
          gender: PlayerGender.UNSPECIFIED,
          user: { name: "Alex" },
        },
      ],
      sessionClubs: [],
    } as never);

    const response = await POST(new Request("http://localhost/session/start"), {
      params: Promise.resolve({ code: "session-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Alex");
    expect(prisma.session.update).not.toHaveBeenCalled();
  });
});
