import { describe, expect, it, vi } from "vitest";
import {
  SessionClubRole,
  SessionClubStatus,
  SessionPool,
} from "@/types/enums";
import { getSessionMembership } from "./sessionCollab";

describe("session membership player-group precedence", () => {
  it("uses the host-club preference for a member who belongs to both clubs", async () => {
    const findUnique = vi.fn(async ({ where }) => {
      const clubId = where.clubId_userId.clubId;
      return {
        clubId,
        role: "MEMBER",
        elo: 1000,
        needsMoreRest: false,
        preferredPool:
          clubId === "host-club" ? SessionPool.A : SessionPool.B,
      };
    });
    const tx = {
      sessionClub: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "partner-link",
            sessionId: "session-1",
            clubId: "partner-club",
            role: SessionClubRole.PARTNER,
            status: SessionClubStatus.ACCEPTED,
            createdAt: new Date("2026-08-23T00:00:01Z"),
          },
          {
            id: "host-link",
            sessionId: "session-1",
            clubId: "host-club",
            role: SessionClubRole.HOST,
            status: SessionClubStatus.ACCEPTED,
            createdAt: new Date("2026-08-23T00:00:00Z"),
          },
        ]),
      },
      clubMember: { findUnique },
    };

    const membership = await getSessionMembership(tx as never, {
      session: { id: "session-1", clubId: "host-club" },
      userId: "player-1",
      acceptedOnly: true,
    });

    expect(membership?.preferredPool).toBe(SessionPool.A);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clubId_userId: {
            clubId: "host-club",
            userId: "player-1",
          },
        },
      })
    );
  });
});
