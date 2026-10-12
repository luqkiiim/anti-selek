import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), update: vi.fn(), reservation: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { player: { findUnique: mocks.find, update: mocks.update } } }));
vi.mock("@/lib/serverAudit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/clubPlayerOwnership", async original => ({ ...await original<typeof import("@/lib/clubPlayerOwnership")>(), clubOwnershipTransaction: async (db: object, fn: (tx: object) => unknown) => { mocks.reservation(); return fn(db); } }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: async () => null, checkInvalidTargetRateLimit: async () => null, invalidTargetResponse: () => Response.json({ error: "Unavailable" }, { status: 404 }) }));
import { PATCH, DELETE } from "./route";
const context = { params: Promise.resolve({ id: "player" }) };
const patch = (body: unknown) => PATCH(new Request("http://localhost/api/admin/players/player", { method: "PATCH", body: JSON.stringify(body) }), context);
const remove = () => DELETE(new Request("http://localhost/api/admin/players/player", { method: "DELETE" }), context);
const player = { id: "player", name: "Name", ownerUserId: "frozen-original", isActive: true, clubMemberships: [] };
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "admin", isAdmin: true } }); mocks.find.mockResolvedValue(player); mocks.update.mockResolvedValue({ id: "player", name: "Changed", avatarKey: null, elo: 1100, isActive: true }); });
describe("global Player administration uses current local ownership", () => {
  it("renames disconnected legacy provenance without treating it as a claim", async () => {
    const response = await patch({ name: "Changed" }); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ isClaimed: false });
    expect(mocks.reservation.mock.invocationCallOrder[0]).toBeLessThan(mocks.find.mock.invocationCallOrder[0]);
    expect(mocks.find.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
  });
  it("blocks another locally connected account even when global provenance is null", async () => {
    mocks.find.mockResolvedValue({ ...player, ownerUserId: null, clubMemberships: [{ ownerUserId: "current-owner", retiredByAdmissionEventId: null }] });
    expect((await patch({ name: "Changed" })).status).toBe(403); expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([true, false])("requires local operations for connected isActive=%s", async isActive => {
    mocks.find.mockResolvedValue({ ...player, clubMemberships: [{ ownerUserId: "current-owner", retiredByAdmissionEventId: null }] });
    expect((await patch({ isActive })).status).toBe(409); expect((await remove()).status).toBe(409); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("retains rating controls for connected players and reports their current claim", async () => {
    mocks.find.mockResolvedValue({ ...player, clubMemberships: [{ ownerUserId: "current-owner", retiredByAdmissionEventId: null }] });
    const response = await patch({ elo: 1100 }); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ isClaimed: true });
  });
  it("archives disconnected durable profiles without deleting history", async () => {
    expect((await remove()).status).toBe(200); expect(mocks.update).toHaveBeenCalledWith({ where: { id: "player" }, data: { isActive: false } });
  });
  it("rechecks retirement under reservation for edit and archive", async () => {
    mocks.find.mockResolvedValue({ ...player, clubMemberships: [{ ownerUserId: null, retiredByAdmissionEventId: "retired" }] });
    expect((await patch({ elo: 1100 })).status).toBe(409); expect((await remove()).status).toBe(409); expect(mocks.update).not.toHaveBeenCalled();
  });
});
