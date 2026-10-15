import { describe, expect, it, vi } from "vitest";
import { getClubRoster, getClubRosterMember, serializeClubRosterMember } from "./clubRoster";

function membership(ownerUserId: string | null = "account-1") {
  return {
    id: "membership-1", playerId: "player-1", ownerUserId, retiredByAdmissionEventId: null,
    archivedAt: null, mixedSideOverride: "UPPER", elo: 1432, status: "OCCASIONAL", preferredPool: "A",
    needsMoreRest: false,
    player: { name: "Player", avatarKey: null, gender: "FEMALE", isActive: true, createdAt: new Date("2026-10-01") },
  } as Parameters<typeof serializeClubRosterMember>[0];
}

describe("club roster member responses", () => {
  it("keeps the targeted response identical to the list contract", async () => {
    const member = membership();
    const db = {
      clubMember: { findUnique: vi.fn().mockResolvedValue(member), findMany: vi.fn().mockResolvedValue([member]) },
      clubAccess: {
        findUnique: vi.fn().mockResolvedValue({ role: "OWNER", status: "ACTIVE" }),
        findMany: vi.fn().mockResolvedValue([{ userId: "account-1", role: "OWNER" }]),
      },
      club: { findUnique: vi.fn().mockResolvedValue({ createdById: "account-1" }) },
    };
    const response = await getClubRosterMember(db as never, "club-1", "player-1");
    expect(db.clubMember.findMany).not.toHaveBeenCalled();
    expect(db.clubAccess.findMany).not.toHaveBeenCalled();
    expect(db.clubMember.findUnique).toHaveBeenCalledWith({ where: { clubId_playerId: { clubId: "club-1", playerId: "player-1" } }, include: { player: true } });
    expect(db.clubAccess.findUnique).toHaveBeenCalledWith({ where: { clubId_userId: { clubId: "club-1", userId: "account-1" } }, select: { role: true, status: true } });
    expect(response).toEqual((await getClubRoster(db as never, "club-1"))[0]);
    expect(response).toMatchObject({
      id: "player-1", playerId: "player-1", clubMemberId: "membership-1", ownerUserId: "account-1",
      retiredByAdmissionEventId: null, name: "Player", email: null, avatarUrl: null, gender: "FEMALE",
      mixedSideOverride: "UPPER", partnerPreference: "OPEN", elo: 1432, status: "OCCASIONAL",
      preferredPool: "A", needsMoreRest: false, isActive: true, isClaimed: true, role: "OWNER", isOwner: true,
      createdAt: member.player.createdAt, wins: 0, losses: 0,
    });
  });

  it("reads no account grant for an offline player", async () => {
    const db = {
      clubMember: { findUnique: vi.fn().mockResolvedValue(membership(null)) },
      clubAccess: { findUnique: vi.fn() },
      club: { findUnique: vi.fn().mockResolvedValue({ createdById: "account-1" }) },
    };
    expect(await getClubRosterMember(db as never, "club-1", "player-1")).toMatchObject({ role: "MEMBER", isClaimed: false, isOwner: false });
    expect(db.clubAccess.findUnique).not.toHaveBeenCalled();
  });

  it("does not expose revoked permissions", async () => {
    const db = {
      clubMember: { findUnique: vi.fn().mockResolvedValue(membership()) },
      clubAccess: { findUnique: vi.fn().mockResolvedValue({ role: "OWNER", status: "REVOKED" }) },
      club: { findUnique: vi.fn().mockResolvedValue({ createdById: "account-1" }) },
    };
    expect(await getClubRosterMember(db as never, "club-1", "player-1")).toMatchObject({ role: "MEMBER", isOwner: false });
  });

  it.each([null, { ...membership(), archivedAt: new Date() }, { ...membership(), retiredByAdmissionEventId: "event-1" }])("excludes unavailable members", async member => {
    const db = { clubMember: { findUnique: vi.fn().mockResolvedValue(member) }, clubAccess: { findUnique: vi.fn() }, club: { findUnique: vi.fn() } };
    expect(await getClubRosterMember(db as never, "club-1", "player-1")).toBeNull();
    expect(db.club.findUnique).not.toHaveBeenCalled();
  });
});
