import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), quick: vi.fn(), member: vi.fn(), update: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/clubAdminPermissions", () => ({ getClubAdminAccess: m.access }));
vi.mock("@/lib/quickAccess", () => ({ isQuickAccessSession: m.quick }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/prisma", () => { const tx = { clubMember: { findUnique: m.member, updateMany: m.update }, clubRatingAdjustment: { create: m.audit } }; return { prisma: { ...tx, $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } }; });
import { GET, POST } from "./route";
const context = { params: Promise.resolve({ id: "club", userId: "player" }) };
const call = (body: unknown = { rating: 1125, expectedRating: 1000, reason: "Guest results correction" }) => POST(new Request('http://localhost/rating', { method: 'POST', body: JSON.stringify(body) }), context);
describe('manual club rating adjustment', () => {
  beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue({ user: { id: 'admin', name: 'Admin' } }); m.quick.mockReturnValue(false); m.access.mockResolvedValue({ canAdmin: true }); m.member.mockResolvedValue({ id: 'member', elo: 1000, ratingAdjustments: [] }); m.update.mockResolvedValue({ count: 1 }); m.audit.mockResolvedValue({}); });
  it('changes only membership rating and records actor, reason, and before/after values', async () => {
    expect((await call()).status).toBe(200);
    expect(m.update).toHaveBeenCalledWith({ where: { id: 'member', elo: 1000 }, data: { elo: 1125 } });
    expect(m.audit).toHaveBeenCalledWith({ data: { memberId: 'member', actorId: 'admin', actorName: 'Admin', beforeElo: 1000, afterElo: 1125, reason: 'Guest results correction' } });
  });
  it.each([{ rating: -1, expectedRating: 1000, reason: 'x' }, { rating: 5001, expectedRating: 1000, reason: 'x' }, { rating: 1000.5, expectedRating: 1000, reason: 'x' }, { rating: 1100, expectedRating: 1000, reason: '  ' }, { rating: 1100, reason: 'x' }])('rejects invalid input %j', async body => { expect((await call(body)).status).toBe(400); expect(m.update).not.toHaveBeenCalled(); });
  it('rejects a stale rating instead of overwriting a new match result', async () => { m.member.mockResolvedValue({ id: 'member', elo: 1015 }); expect((await call()).status).toBe(409); expect(m.audit).not.toHaveBeenCalled(); });
  it('detects concurrent changes during the write', async () => { m.update.mockResolvedValue({ count: 0 }); expect((await call()).status).toBe(409); expect(m.audit).not.toHaveBeenCalled(); });
  it('records a restore as another adjustment', async () => { m.member.mockResolvedValue({ id: 'member', elo: 1125 }); expect((await call({ rating: 1000, expectedRating: 1125, reason: 'Restore previous rating' })).status).toBe(200); expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ beforeElo: 1125, afterElo: 1000 }) })); });
  it('requires authentication', async () => { m.auth.mockResolvedValue(null); expect((await call()).status).toBe(401); });
  it('rejects non-admin reads and writes', async () => { m.access.mockResolvedValue({ canAdmin: false }); expect((await call()).status).toBe(403); expect((await GET(new Request('http://localhost/rating'), context)).status).toBe(403); });
  it('rejects view-only users', async () => { m.quick.mockReturnValue(true); expect((await call()).status).toBe(403); });
  it('returns current rating and history', async () => { const response = await GET(new Request('http://localhost/rating'), context); expect(await response.json()).toEqual({ rating: 1000, history: [] }); });
});
