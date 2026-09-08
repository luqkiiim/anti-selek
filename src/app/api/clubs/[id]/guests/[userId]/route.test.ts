import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), quick: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/clubAdminPermissions", () => ({ getClubAdminAccess: mocks.access }));
vi.mock("@/lib/quickAccess", () => ({ isQuickAccessSession: mocks.quick }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn({ sessionPlayer: { findFirst: mocks.findFirst }, clubMember: { upsert: mocks.upsert } }) } }));
import { POST } from "./route";
const call = () => POST(new Request("http://localhost/api/clubs/club/guests/guest-one", { method: "POST" }), { params: Promise.resolve({ id: "club", userId: "guest-one" }) });
describe("add a guest to the club", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "admin" } });
    mocks.quick.mockReturnValue(false);
    mocks.access.mockResolvedValue({ canAdmin: true });
    mocks.findFirst.mockResolvedValue({ user: { elo: 1150 } });
    mocks.upsert.mockResolvedValue({ userId: "guest-one" });
  });
  it("adds only the selected identity, preserving its starting rating and past records", async () => {
    expect((await call()).status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "guest-one", isGuest: true, session: { isTest: false, status: "COMPLETED" } }) }));
    expect(mocks.upsert).toHaveBeenCalledWith({ where: { clubId_userId: { clubId: "club", userId: "guest-one" } }, update: {}, create: { clubId: "club", userId: "guest-one", role: "MEMBER", status: "OCCASIONAL", elo: 1150 }, select: { userId: true } });
  });
  it("is safe to repeat without resetting existing membership or rating", async () => {
    await call(); await call();
    expect(mocks.upsert.mock.calls.every(([args]) => Object.keys(args.update).length === 0)).toBe(true);
  });
  it("rejects someone without a qualifying guest appearance", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("rejects non-admins", async () => {
    mocks.access.mockResolvedValue({ canAdmin: false });
    expect((await call()).status).toBe(403);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
  it("rejects view-only access", async () => {
    mocks.quick.mockReturnValue(true);
    expect((await call()).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });
});
