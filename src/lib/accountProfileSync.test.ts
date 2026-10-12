import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { AccountProfileSyncError, syncAccountProfile } from "./accountProfileSync";
import { PlayerGender, MixedSide } from "@/types/enums";
const account = { id: "account", name: "Original", gender: "FEMALE", mixedSideOverride: null, avatarKey: "old", isActive: true, selfNameChangedAt: null, selfGenderChangedAt: null };
function setup() {
  const db = { user: { findUnique: vi.fn().mockResolvedValue(account), update: vi.fn().mockImplementation(async ({ data }) => ({ ...account, ...data })) }, player: { findMany: vi.fn().mockResolvedValue([{ id: "active", avatarKey: "old", clubMemberships: [{ ownerUserId: "account", retiredByAdmissionEventId: null }] }, { id: "archived", avatarKey: "archive", clubMemberships: [{ ownerUserId: "account", retiredByAdmissionEventId: null }] }]), updateMany: vi.fn().mockResolvedValue({ count: 2 }) } };
  return { db, tx: db as unknown as Prisma.TransactionClient };
}
describe("canonical account metadata synchronization", () => {
  it("fans out only edited fields to owned memberships, including retained archived links", async () => {
    const { db, tx } = setup();
    const result = await syncAccountProfile(tx, { userId: "account", changes: { name: "Updated" } });
    expect(db.player.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [{ clubMemberships: { none: { retiredByAdmissionEventId: { not: null } } } }, { clubMemberships: { some: { ownerUserId: "account", retiredByAdmissionEventId: null } } }] } }));
    expect(db.player.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["active", "archived"] } }, data: { name: "Updated" } });
    expect(result.playerIds).toEqual(["active", "archived"]);
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { name: "Updated", selfNameChangedAt: expect.any(Date) } }));
  });
  it("enforces once-only limits for every caller, with idempotent same-value edits", async () => {
    const { db, tx } = setup(); db.user.findUnique.mockResolvedValue({ ...account, selfNameChangedAt: new Date(), selfGenderChangedAt: new Date() });
    await expect(syncAccountProfile(tx, { userId: "account", changes: { name: "Again" } })).rejects.toBeInstanceOf(AccountProfileSyncError);
    await expect(syncAccountProfile(tx, { userId: "account", changes: { gender: PlayerGender.MALE } })).rejects.toMatchObject({ statusCode: 409 });
    expect(db.player.updateMany).not.toHaveBeenCalled();
    await syncAccountProfile(tx, { userId: "account", changes: { name: "Original" } });
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it("normalizes personal Mixed preferences centrally and leaves ratings alone", async () => {
    const { db, tx } = setup();
    await syncAccountProfile(tx, { userId: "account", changes: { mixedSideOverride: MixedSide.UPPER } });
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { mixedSideOverride: "UPPER" } }));
    expect(db.player.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { mixedSideOverride: "UPPER", partnerPreference: "OPEN" } }));
  });
  it("blocks conflicting retained ownership before any writes", async () => {
    const { db, tx } = setup(); db.player.findMany.mockResolvedValue([{ id: "shared", avatarKey: "old", clubMemberships: [{ ownerUserId: "account", retiredByAdmissionEventId: null }, { ownerUserId: "other", retiredByAdmissionEventId: null }] }]);
    await expect(syncAccountProfile(tx, { userId: "account", changes: { avatarKey: null } })).rejects.toMatchObject({ statusCode: 409 });
    expect(db.user.update).not.toHaveBeenCalled(); expect(db.player.updateMany).not.toHaveBeenCalled();
  });
  it("checks photo concurrency before fanout and reports all superseded keys", async () => {
    const { db, tx } = setup();
    await expect(syncAccountProfile(tx, { userId: "account", changes: { avatarKey: "new" }, expectedAvatarKey: "stale" })).rejects.toMatchObject({ statusCode: 409 });
    expect(db.player.updateMany).not.toHaveBeenCalled();
    const result = await syncAccountProfile(tx, { userId: "account", changes: { avatarKey: null }, expectedAvatarKey: "old" });
    expect(result.previousAvatarKeys).toEqual(["old", "archive"]);
    expect(db.player.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { avatarKey: null } }));
  });
});
