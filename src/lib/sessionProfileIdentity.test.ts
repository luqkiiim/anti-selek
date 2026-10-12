import { describe, expect, it, vi } from "vitest";
import { getEligibleSessionProfiles, resolveSessionProfilePair, getSessionParticipantOwners, assertSessionAccountSeatAvailable, withSessionProfileRatings } from "./sessionProfileIdentity";

const members = [
  { clubId: "a", playerId: "pa", ownerUserId: "account", elo: 1300, preferredPool: "A", mixedSideOverride: null, club: { name: "A" }, player: { name: "Person", gender: "FEMALE", mixedSideOverride: null, partnerPreference: "FEMALE_FLEX" } },
  { clubId: "b", playerId: "pb", ownerUserId: "account", elo: 800, preferredPool: "B", mixedSideOverride: "UPPER", club: { name: "B" }, player: { name: "Person", gender: "FEMALE", mixedSideOverride: null, partnerPreference: "FEMALE_FLEX" } },
];
function db() {
  return {
    clubAccess: { findMany: vi.fn().mockResolvedValue([{ clubId: "a" }, { clubId: "b" }]), findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE" }) },
    clubMember: { findMany: vi.fn().mockImplementation(async ({ where }) => members.filter(m => !where.clubId || (typeof where.clubId === "string" ? m.clubId === where.clubId : where.clubId.in.includes(m.clubId))).filter(m => !where.playerId || m.playerId === where.playerId)), findUnique: vi.fn().mockResolvedValue({ elo: 800 }) },
    sessionClub: { findMany: vi.fn().mockResolvedValue([{ clubId: "a", role: "HOST", status: "ACCEPTED" }, { clubId: "b", role: "PARTNER", status: "ACCEPTED" }]) },
    sessionPlayer: { findMany: vi.fn().mockResolvedValue([{ playerId: "pa", profileClubId: "a", participantAccountId: "account", representingClubId: null, isGuest: false }]) },
  };
}
describe("local session profile authority", () => {
  it("offers every active exact pair, requires a choice, and resolves the selected partner profile", async () => {
    const tx = db();
    const eligible = await getEligibleSessionProfiles(tx as never, { userId: "account", clubIds: ["a", "b"] });
    expect(eligible.map(p => [p.playerId, p.profileClubId])).toEqual([["pa", "a"], ["pb", "b"]]);
    await expect(resolveSessionProfilePair(tx as never, { userId: "account", clubIds: ["a", "b"] })).rejects.toThrow("Choose which club profile");
    expect(await resolveSessionProfilePair(tx as never, { userId: "account", clubIds: ["a", "b"], playerId: "pb", profileClubId: "b" })).toMatchObject({ playerId: "pb", profileClubId: "b", elo: 800, mixedSideOverride: "UPPER" });
  });
  it("revoked access to the selected club removes self and scoring authority even with other active clubs", async () => {
    const tx = db();
    tx.clubAccess.findUnique.mockResolvedValue({ status: "REVOKED" });
    expect((await getSessionParticipantOwners(tx as never, { id: "s", clubId: "a" })).get("pa")).toBeNull();
  });
  it("refuses a second account seat for a different local Player", async () => {
    const tx = db();
    await expect(assertSessionAccountSeatAvailable(tx as never, "s", { playerId: "pb", ownerUserId: "account" })).rejects.toThrow("already has a player");
  });
  it("uses selected local rating and fails closed when the required membership is absent", async () => {
    const tx = db();
    const seats = [{ playerId: "pb", profileClubId: "b", isGuest: false, player: { elo: 2000 } }];
    expect((await withSessionProfileRatings(tx as never, { ratingPolicyVersion: 2 }, seats))[0].player.elo).toBe(800);
    tx.clubMember.findUnique.mockResolvedValue(null as never);
    await expect(withSessionProfileRatings(tx as never, { ratingPolicyVersion: 2 }, seats)).rejects.toThrow("no other club rating");
  });
  it("leaves guest and v1 display semantics intact", async () => {
    const tx = db();
    const seats = [{ playerId: "guest", isGuest: true, player: { elo: 1150 } }];
    expect(await withSessionProfileRatings(tx as never, { ratingPolicyVersion: 2 }, seats)).toEqual(seats);
    expect(await withSessionProfileRatings(tx as never, { ratingPolicyVersion: 1 }, seats)).toEqual(seats);
    expect(tx.clubMember.findUnique).not.toHaveBeenCalled();
  });
  it("serializes existing session pairing snapshots even when shared Player fields have changed", async () => {
    const tx = db();
    const seats = [{ playerId: "pb", profileClubId: "b", isGuest: false, gender: "FEMALE", partnerPreference: "FEMALE_FLEX", mixedSideOverride: null, player: { elo: 2000, gender: "MALE", partnerPreference: "OPEN", mixedSideOverride: "LOWER" } }];
    expect((await withSessionProfileRatings(tx as never, { ratingPolicyVersion: 2 }, seats))[0].player).toMatchObject({ elo: 800, gender: "FEMALE", partnerPreference: "FEMALE_FLEX", mixedSideOverride: null });
  });
  it("cannot borrow legacy global ownership when a shared Player has ambiguous club context", async () => {
    const tx = db();
    tx.sessionPlayer.findMany.mockResolvedValue([{ playerId: "shared", profileClubId: null, representingClubId: null, isGuest: false }] as never);
    tx.clubMember.findMany.mockResolvedValue([{ clubId: "a", ownerUserId: "account" }, { clubId: "b", ownerUserId: "account" }] as never);
    expect((await getSessionParticipantOwners(tx as never, { id: "s", clubId: "a" })).get("shared")).toBeNull();
  });
});
