import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ account: vi.fn(), club: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.account }, club: { findUnique: mocks.club } } }));
import { canBrowseAllClubs, canReadClubGlobally, canReadSessionGlobally, isGlobalClubViewerEmail } from "./globalClubViewer";
const session = { user: { id: "account-viewer", isQuickAccess: false, canBrowseAllClubs: true, isAdmin: false } } as never;
describe("read-only global club permission", () => {
  beforeEach(() => {
    vi.stubEnv("GLOBAL_CLUB_VIEWER_EMAILS", " H.Luqman1998@gmail.com , viewer@example.invalid ");
    mocks.account.mockResolvedValue({ email: "h.luqman1998@gmail.com", passwordHash: "hash", isActive: true });
    mocks.club.mockResolvedValue({ isTutorial: false });
    vi.clearAllMocks();
  });
  afterEach(() => vi.unstubAllEnvs());
  it("matches only normalized exact configured addresses", () => {
    expect(isGlobalClubViewerEmail(" H.LUQMAN1998@GMAIL.COM ")).toBe(true);
    for (const email of [null, "", "luqman1998@gmail.com", "h.luqman1998+other@gmail.com", "h.luqman1998@gmail.com.attacker.invalid"]) expect(isGlobalClubViewerEmail(email)).toBe(false);
    vi.stubEnv("GLOBAL_CLUB_VIEWER_EMAILS", "");
    expect(isGlobalClubViewerEmail("h.luqman1998@gmail.com")).toBe(false);
  });
  it("does not confuse browsing with admin privileges", async () => {
    expect(await canBrowseAllClubs(session)).toBe(true);
    expect(await canBrowseAllClubs({ user: { id: "admin", isAdmin: true } } as never)).toBe(false);
  });
  it("denies ordinary accounts and forged quick-access flags before querying accounts", async () => {
    expect(await canBrowseAllClubs({ user: { id: "ordinary", canBrowseAllClubs: false } } as never)).toBe(false);
    expect(await canBrowseAllClubs({ user: { id: "guest:x", canBrowseAllClubs: true, isQuickAccess: true } } as never)).toBe(false);
    expect(mocks.account).not.toHaveBeenCalled();
  });
  it.each([null, { email: "ordinary@example.invalid", passwordHash: "hash", isActive: true }, { email: "h.luqman1998@gmail.com", passwordHash: null, isActive: true }, { email: "h.luqman1998@gmail.com", passwordHash: "hash", isActive: false }])("revalidates the fresh full active account: %j", async account => {
    mocks.account.mockResolvedValue(account);
    expect(await canBrowseAllClubs(session)).toBe(false);
  });
  it("excludes tutorials regardless of ownership", async () => {
    mocks.club.mockResolvedValue({ isTutorial: true });
    expect(await canReadClubGlobally(session, "tutorial")).toBe(false);
  });
  it.each(["", "?view=global", "?view=global&clubId=other", "?view=global&clubId=partner", "?view=global&clubId=host&clubId=other", "?view=global&clubId=%20host", "?view=global&clubId=", "?view=global&view=global&clubId=host"])("rejects missing, malformed or unaccepted session context %s", async query => {
    expect(await canReadSessionGlobally(new Request(`http://localhost/session${query}`), session, { clubId: "host", sessionClubs: [{ clubId: "partner", status: "PENDING" }] })).toBe(false);
  });
  it.each(["host", "partner"])("reads only hosting or accepted partner context %s", async clubId => {
    expect(await canReadSessionGlobally(new Request(`http://localhost/session?view=global&clubId=${clubId}`), session, { clubId: "host", sessionClubs: [{ clubId: "partner", status: "ACCEPTED" }] })).toBe(true);
  });
});
