import { describe, expect, it, vi } from "vitest";
import { getSessionListProfiles, withSessionListProfiles } from "./sessionListProfiles";
import { withSessionProfileRatings } from "./sessionProfileIdentity";

const members = [
  { playerId: "shared", clubId: "a", ownerUserId: "owner-a", elo: 1300, archivedAt: null, retiredByAdmissionEventId: null, player: { isActive: true } },
  { playerId: "shared", clubId: "b", ownerUserId: "owner-b", elo: 800, archivedAt: null, retiredByAdmissionEventId: null, player: { isActive: true } },
];
const seat = (profileClubId: string | null, isGuest = false) => ({ playerId: "shared", profileClubId, representingClubId: null, isGuest, gender: "FEMALE", partnerPreference: "FEMALE_FLEX", mixedSideOverride: null, player: { elo: 2000 } });
const session = (id: string, profileClubId: string | null, ratingPolicyVersion = 2, isGuest = false) => ({ id, clubId: "a", ratingPolicyVersion, sessionClubs: [{ clubId: "a", role: "HOST", status: "ACCEPTED" }, { clubId: "b", role: "PARTNER", status: "ACCEPTED" }], players: [seat(profileClubId, isGuest)] });
function database(rows = members, revoked = false) {
  const matches = (row: typeof members[number], where: Record<string, unknown>) => {
    const matchesId = (value: string, filter: unknown) => !filter || (typeof filter === "string" ? value === filter : (filter as { in: string[] }).in.includes(value));
    return matchesId(row.playerId, where.playerId) && matchesId(row.clubId, where.clubId) && (!('archivedAt' in where) || !row.archivedAt) && (!('retiredByAdmissionEventId' in where) || !row.retiredByAdmissionEventId) && (!where.player || row.player.isActive);
  };
  return {
    club: { findUnique: vi.fn(async () => ({ id: "a", name: "A" })) },
    sessionClub: { findMany: vi.fn(async () => session("s", "a").sessionClubs) },
    sessionPlayer: { findMany: vi.fn(async () => [seat("a")]) },
    clubMember: {
      findMany: vi.fn(async ({ where }) => rows.filter(row => matches(row, where))),
      findUnique: vi.fn(async ({ where }) => rows.find(row => row.clubId === where.clubId_playerId.clubId && row.playerId === where.clubId_playerId.playerId) ?? null),
    },
    clubAccess: {
      findMany: vi.fn(async () => revoked ? [] : rows.filter(row => row.ownerUserId).map(row => ({ clubId: row.clubId, userId: row.ownerUserId }))),
      findUnique: vi.fn(async () => ({ status: revoked ? "REVOKED" : "ACTIVE" })),
    },
  };
}
describe("batched session list profiles", () => {
  it("preserves per-club ratings and pairing snapshots with two reads for an entire historical list", async () => {
    const db = database();
    const sessions = Array.from({ length: 30 }, (_, i) => session(`s${i}`, i % 2 ? "b" : "a"));
    const profiles = await getSessionListProfiles(db as never, sessions);
    expect(sessions.map(s => withSessionListProfiles(s.players, profiles.get(s.id))[0].player.elo)).toEqual(sessions.map((_, i) => i % 2 ? 800 : 1300));
    expect(withSessionListProfiles(sessions[0].players, profiles.get("s0"))[0].player).toMatchObject({ isClaimed: true, email: null, gender: "FEMALE", partnerPreference: "FEMALE_FLEX", mixedSideOverride: null });
    expect(db.clubMember.findMany).toHaveBeenCalledTimes(1);
    expect(db.clubAccess.findMany).toHaveBeenCalledTimes(1);
    expect(db.sessionPlayer.findMany).not.toHaveBeenCalled();
    expect(db.clubMember.findUnique).not.toHaveBeenCalled();
  });
  it.each(["active", "revoked", "archived", "retired", "inactive", "unowned", "ambiguous"])("preserves existing display authority for %s membership", async state => {
    const rows = members.map(m => ({ ...m, player: { ...m.player } }));
    if (state === "archived") rows[0].archivedAt = new Date() as never;
    if (state === "retired") rows[0].retiredByAdmissionEventId = "retired" as never;
    if (state === "inactive") rows[0].player.isActive = false;
    if (state === "unowned") rows[0].ownerUserId = null as never;
    const db = database(rows, state === "revoked");
    const s = session("s", state === "ambiguous" ? null : "a", state === "ambiguous" ? 1 : 2);
    db.sessionPlayer.findMany.mockResolvedValue(s.players);
    const expected = await withSessionProfileRatings(db as never, s, s.players);
    const profiles = await getSessionListProfiles(db as never, [s]);
    expect(withSessionListProfiles(s.players, profiles.get(s.id))).toEqual(expected);
  });
  it("does not authorize a selected profile from an unaccepted partner club", async () => {
    const db = database(); const s = session("s", "b"); s.sessionClubs[1].status = "PENDING";
    const profiles = await getSessionListProfiles(db as never, [s]);
    expect(withSessionListProfiles(s.players, profiles.get(s.id))[0].player).toMatchObject({ elo: 800, isClaimed: false });
  });
  it.each([null, "missing"])("fails closed for a missing version-2 exact profile: %s", async clubId => {
    const db = database();
    await expect(getSessionListProfiles(db as never, [session("s", clubId)])).rejects.toThrow();
  });
  it("keeps guests independent of memberships and preserves their session rating", async () => {
    const db = database(); const s = session("s", null, 2, true);
    const profiles = await getSessionListProfiles(db as never, [s]);
    expect(withSessionListProfiles(s.players, profiles.get(s.id))[0].player).toMatchObject({ elo: 2000, isClaimed: false });
    expect(db.clubMember.findMany).not.toHaveBeenCalled();
  });
});
