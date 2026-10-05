import { beforeEach, describe, expect, it, vi } from "vitest";

type TestUser = { id: string; [key: string]: unknown };
type TestToken = Record<string, unknown> | null;
type TestSession = { user: Record<string, unknown>; expires: string };
type TestAuthConfig = {
  providers: Array<{ authorize: (credentials: Record<string, string>, request: Request) => Promise<TestUser | null> }>;
  callbacks: {
    jwt: (input: { token: Record<string, unknown>; user?: TestUser | null }) => Promise<TestToken>;
    session: (input: { session: TestSession; token: TestToken }) => Promise<TestSession>;
  };
};

const mocks = vi.hoisted(() => ({
  config: null as unknown,
  accountFindUnique: vi.fn(),
  clubFindMany: vi.fn(),
  clubMemberFindMany: vi.fn(),
  clubMemberFindUnique: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: (config: unknown) => {
    mocks.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.accountFindUnique },
    club: { findMany: mocks.clubFindMany },
    clubMember: { findMany: mocks.clubMemberFindMany, findUnique: mocks.clubMemberFindUnique },
  },
}));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn(async () => true) } }));
vi.mock("@/lib/globalAdmin", () => ({
  normalizeAuthEmail: (email: string) => email.trim().toLowerCase(),
  isGlobalAdminEmail: () => false,
}));
vi.mock("@/lib/rateLimit", () => ({ areRateLimitsDisabled: () => true, checkRateLimit: vi.fn() }));
vi.mock("@/lib/serverAudit", () => ({ logAuditEvent: vi.fn() }));

import "@/lib/auth";

const account = {
  id: "account-17",
  email: "member@example.invalid",
  name: "Member Account",
  passwordHash: "test-hash",
  sessionVersion: 7,
  isActive: true,
};
const playerId = "historical-player-17";
const authConfig = () => mocks.config as TestAuthConfig;
const callbacks = () => authConfig().callbacks;
const credentials = () => authConfig().providers[0];

async function authorizeAccount() {
  return credentials().authorize(
    { email: account.email, password: "valid-password" },
    new Request("http://localhost/api/auth/callback/credentials")
  );
}

async function authorizeQuickAccess() {
  return credentials().authorize(
    { quickAccess: "true", clubName: "Example Club", playerName: "Guest Player" },
    new Request("http://localhost/api/auth/callback/credentials")
  );
}

describe("NextAuth Account and Player identities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accountFindUnique.mockImplementation(async ({ where }: { where: { id?: string; email?: string } }) =>
      where.id === account.id || where.email === account.email ? { ...account } : null
    );
    mocks.clubFindMany.mockResolvedValue([{ id: "club-1", name: "Example Club", isTutorial: false }]);
    mocks.clubMemberFindMany.mockResolvedValue([{
      role: "ADMIN",
      player: { id: playerId, name: "Guest Player", ownerUserId: null, isActive: true },
    }]);
    mocks.clubMemberFindUnique.mockResolvedValue({
      archivedAt: null,
      player: { ownerUserId: null, isActive: true },
    });
  });

  it("signs in with the Account ID and returns no Player identity as the account ID", async () => {
    const user = await authorizeAccount();
    expect(user).toMatchObject({ id: account.id, sessionVersion: account.sessionVersion, email: account.email });
    expect(user?.id).not.toBe(playerId);

    const token = await callbacks().jwt({ token: {}, user });
    expect(token).toMatchObject({ identityVersion: 2, id: account.id, sessionVersion: account.sessionVersion, isQuickAccess: false });
    const session = await callbacks().session({
      session: { user: { name: "", email: "" }, expires: "2099-01-01T00:00:00.000Z" },
      token,
    });
    expect(session.user).toMatchObject({ id: account.id, userId: account.id, guestPlayerId: null, isQuickAccess: false });
    expect(session.user.id).not.toBe(playerId);
  });

  it("rejects a pre-separation token that only carries a legacy Player ID", async () => {
    const token = await callbacks().jwt({ token: { id: playerId, email: "legacy@example.invalid", isQuickAccess: false } });
    expect(token).toBeNull();
    expect(mocks.accountFindUnique).not.toHaveBeenCalled();
  });

  it("invalidates an account JWT when its session version changes", async () => {
    mocks.accountFindUnique.mockResolvedValue({ ...account, sessionVersion: account.sessionVersion + 1 });
    const token = await callbacks().jwt({ token: { identityVersion: 2, id: account.id, sessionVersion: account.sessionVersion, isQuickAccess: false } });
    expect(token).toBeNull();
  });

  it("rejects disabled accounts during password authorization", async () => {
    mocks.accountFindUnique.mockResolvedValue({ ...account, isActive: false });
    await expect(authorizeAccount()).resolves.toBeNull();
  });

  it("invalidates an account JWT after the Account is disabled", async () => {
    mocks.accountFindUnique.mockResolvedValue({ ...account, isActive: false });
    const token = await callbacks().jwt({ token: { identityVersion: 2, id: account.id, sessionVersion: account.sessionVersion, isQuickAccess: false } });
    expect(token).toBeNull();
  });

  it("keeps Quick access bound to a Player and strips roster ADMIN privileges", async () => {
    const user = await authorizeQuickAccess();
    expect(user).toMatchObject({
      id: `guest:${playerId}`,
      guestPlayerId: playerId,
      quickAccessClubId: "club-1",
      isQuickAccess: true,
      isAdmin: false,
    });
    const token = await callbacks().jwt({ token: {}, user });
    expect(token).toMatchObject({ id: `guest:${playerId}`, guestPlayerId: playerId, quickAccessClubId: "club-1", isAdmin: false });
    const session = await callbacks().session({
      session: { user: { name: "", email: "" }, expires: "2099-01-01T00:00:00.000Z" },
      token,
    });
    expect(session.user).toMatchObject({ id: `guest:${playerId}`, userId: null, guestPlayerId: playerId, isQuickAccess: true, isAdmin: false });
    expect(mocks.clubMemberFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clubId: "club-1", archivedAt: null } }));
  });

  it("invalidates Quick access after the Player is claimed by an Account", async () => {
    const user = await authorizeQuickAccess();
    mocks.clubMemberFindUnique.mockResolvedValue({ archivedAt: null, player: { ownerUserId: account.id, isActive: true } });
    await expect(callbacks().jwt({ token: {}, user })).resolves.toBeNull();
  });

  it("invalidates Quick access after its roster membership is archived", async () => {
    const user = await authorizeQuickAccess();
    mocks.clubMemberFindUnique.mockResolvedValue({ archivedAt: new Date("2025-01-02T03:04:05.000Z"), player: { ownerUserId: null, isActive: true } });
    await expect(callbacks().jwt({ token: {}, user })).resolves.toBeNull();
  });
});
