import { describe, expect, it, vi } from "vitest";
const counts = vi.hoisted(() => ({ user: vi.fn(), player: vi.fn(), club: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { count: counts.user }, player: { count: counts.player }, club: { count: counts.club } } }));
import { cleanupSupersededAvatar, rollbackUploadedAvatar, isAvatarReferenced } from "./avatarStorage";
describe("avatar reference retention", () => {
  it.each(["user", "player", "club"] as const)("preserves any %s reference without filtering historical rows", async table => {
    Object.values(counts).forEach(count => count.mockResolvedValue(0)); counts[table].mockResolvedValue(1);
    const deleteObject = vi.fn();
    expect(await cleanupSupersededAvatar({ previousAvatarKey: "shared", nextAvatarKey: "new", deleteObject })).toBe(false);
    expect(await rollbackUploadedAvatar({ uploadedAvatarKey: "shared", deleteObject })).toBe(false);
    expect(deleteObject).not.toHaveBeenCalled();
    Object.values(counts).forEach(count => expect(count).toHaveBeenCalledWith({ where: { avatarKey: "shared" } }));
  });
  it("deletes an unreferenced superseded object and preserves a failed upload that was committed", async () => {
    Object.values(counts).forEach(count => count.mockResolvedValue(0)); const deleteObject = vi.fn().mockResolvedValue(true);
    expect(await cleanupSupersededAvatar({ previousAvatarKey: "old", nextAvatarKey: "new", deleteObject })).toBe(true);
    expect(deleteObject).toHaveBeenCalledWith("old");
    counts.player.mockResolvedValue(1);
    expect(await rollbackUploadedAvatar({ uploadedAvatarKey: "committed", deleteObject })).toBe(false);
    expect(deleteObject).toHaveBeenCalledTimes(1);
  });
  it("fails closed when reference checks fail", async () => {
    counts.user.mockRejectedValue(new Error("database unavailable")); const deleteObject = vi.fn();
    expect(await cleanupSupersededAvatar({ previousAvatarKey: "old", deleteObject })).toBe(false);
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
