import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), account: vi.fn(), clubs: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.account }, club: { findMany: mocks.clubs } } }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: vi.fn(async () => null) }));
import { GET } from "./route";
const viewer = { user: { id: "viewer", canBrowseAllClubs: true, isAdmin: false } };
const read = (query = "") => GET(new Request(`http://localhost/api/admin/clubs${query}`));
describe("read-only club directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GLOBAL_CLUB_VIEWER_EMAILS", "h.luqman1998@gmail.com");
    mocks.auth.mockResolvedValue(viewer);
    mocks.account.mockResolvedValue({ email: "h.luqman1998@gmail.com", isActive: true, passwordHash: "hash" });
    mocks.clubs.mockResolvedValue([]);
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each([null, { user: { id: "ordinary", isAdmin: false } }, { user: { ...viewer.user, isQuickAccess: true } }])("denies unsigned, ordinary and quick-access accounts", async session => {
    mocks.auth.mockResolvedValue(session);
    expect((await read()).status).toBe(session ? 403 : 401);
    expect(mocks.clubs).not.toHaveBeenCalled();
  });
  it("denies revoked accounts despite an old browsing flag", async () => {
    mocks.account.mockResolvedValue({ email: "h.luqman1998@gmail.com", isActive: false, passwordHash: "hash" });
    expect((await read()).status).toBe(403);
    expect(mocks.clubs).not.toHaveBeenCalled();
  });
  it("lists real clubs without excluding password-protected or closed clubs, with stable pagination", async () => {
    mocks.clubs.mockResolvedValue(Array.from({ length: 21 }, (_, index) => ({ id: `club-${index}`, name: "Same Name", avatarKey: null, _count: { members: index, sessions: index + 1 } })));
    const response = await read("?q=Same");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const body = await response.json();
    expect(body.clubs).toHaveLength(20);
    expect(body.clubs[0]).toEqual({ id: "club-0", name: "Same Name", avatarUrl: null, membersCount: 0, sessionsCount: 1 });
    expect(mocks.clubs).toHaveBeenCalledWith(expect.objectContaining({ where: { isTutorial: false, name: { contains: "Same" } }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 21 }));
    await read(`?q=Same&cursor=${body.nextCursor}`);
    expect(mocks.clubs).toHaveBeenLastCalledWith(expect.objectContaining({ where: { isTutorial: false, name: { contains: "Same" }, OR: [{ name: { gt: "Same Name" } }, { name: "Same Name", id: { gt: "club-19" } }] } }));
  });
  it.each(["?cursor=malformed", "?cursor=%7Bbad", "?cursor=x&cursor=y", `?q=${"x".repeat(201)}`])("rejects invalid search parameters %s", async query => {
    expect((await read(query)).status).toBe(400);
    expect(mocks.clubs).not.toHaveBeenCalled();
  });
});
