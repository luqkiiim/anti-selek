import { describe, expect, it, vi } from "vitest";
import { getSessionAdminMembership, getSessionMembership } from "./sessionCollab";
function fixture(role: string | null = "MEMBER", status = "ACTIVE") {
  return {
    sessionClub: { findMany: vi.fn().mockResolvedValue([
      { id: "partner", sessionId: "session", clubId: "partner-club", role: "PARTNER", status: "ACCEPTED", createdAt: new Date("2026-01-02") },
      { id: "host", sessionId: "session", clubId: "host-club", role: "HOST", status: "ACCEPTED", createdAt: new Date("2026-01-01") },
    ]) },
    club: { findUnique: vi.fn().mockResolvedValue({ id: "host-club", createdById: "other-account", isTutorial: false }) },
    clubAccess: {
      findUnique: vi.fn().mockResolvedValue(role ? { role, status } : null),
      findFirst: vi.fn(async () => null as { clubId: string; role: string } | null),
    },
    clubMember: { findMany: vi.fn().mockResolvedValue([{ id: "member", playerId: "historical-player", role: "ADMIN", preferredPool: "A", player: { id: "historical-player", ownerUserId: "account-new" } }]) },
  };
}
const input = { session: { id: "session", clubId: "host-club" }, userId: "account-new", acceptedOnly: true };
describe("session club authorization is independent of player groups", () => {
  it("prefers the host club's Account access when belonging to both clubs", async () => {
    const db = fixture(); const membership = await getSessionMembership(db as never, input);
    expect(membership).toEqual({ clubId: "host-club", role: "MEMBER" });
    expect(db.clubAccess.findUnique).toHaveBeenCalledTimes(1);
    expect(db.clubAccess.findUnique).toHaveBeenCalledWith({ where: { clubId_userId: { clubId: "host-club", userId: "account-new" } } });
  });
  it("does not turn a historical ADMIN roster role into session access", async () => {
    expect(await getSessionMembership(fixture(null) as never, input)).toBeNull();
  });
  it("does not authorize a revoked Account grant", async () => {
    expect(await getSessionMembership(fixture("ADMIN", "REVOKED") as never, input)).toBeNull();
  });
  it("recognizes an active OWNER grant as session admin access", async () => {
    const db = fixture();
    db.clubAccess.findFirst.mockResolvedValue({ clubId: "host-club", role: "OWNER" });

    await expect(getSessionAdminMembership(db as never, input)).resolves.toEqual({
      clubId: "host-club",
      role: "OWNER",
    });
    expect(db.clubAccess.findFirst).toHaveBeenCalledWith({
      where: {
        clubId: { in: ["host-club", "partner-club"] },
        userId: "account-new",
        status: "ACTIVE",
        role: { in: ["OWNER", "ADMIN"] },
      },
      select: { clubId: true, role: true },
    });
  });
});
