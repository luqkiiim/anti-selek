import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getClubAdminAccess: vi.fn(),
  clubFindUnique: vi.fn(),
  sessionFindMany: vi.fn(),
  sessionPlayerFindMany: vi.fn(),
  courtUpdateMany: vi.fn(),
  matchDeleteMany: vi.fn(),
  sessionPlayerDeleteMany: vi.fn(),
  sessionDeleteMany: vi.fn(),
  clubMemberUpdateMany: vi.fn(),
  transaction: vi.fn(),
  deleteEphemeralGuestUsers: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/clubAdminPermissions", () => ({ getClubAdminAccess: mocks.getClubAdminAccess }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    club: { findUnique: mocks.clubFindUnique },
    session: { findMany: mocks.sessionFindMany, deleteMany: mocks.sessionDeleteMany },
    sessionPlayer: { findMany: mocks.sessionPlayerFindMany, deleteMany: mocks.sessionPlayerDeleteMany },
    court: { updateMany: mocks.courtUpdateMany },
    match: { deleteMany: mocks.matchDeleteMany },
    clubMember: { updateMany: mocks.clubMemberUpdateMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/sessionLifecycle", () => ({
  collectGuestUserIds: vi.fn(() => []),
  deleteEphemeralGuestUsers: mocks.deleteEphemeralGuestUsers,
}));
vi.mock("@/lib/tutorialPlayground", () => ({ resetTutorialPlayground: vi.fn() }));
vi.mock("@/lib/serverAudit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/errors", () => ({ logError: vi.fn(), safeErrorResponse: vi.fn(() => Response.json({ error: "Internal server error" }, { status: 500 })) }));
vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () => null),
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(() => Response.json({ error: "Invalid target" }, { status: 404 })),
}));

import { POST } from "./route";

const tx = {
  session: { findMany: mocks.sessionFindMany, deleteMany: mocks.sessionDeleteMany },
  sessionPlayer: { findMany: mocks.sessionPlayerFindMany, deleteMany: mocks.sessionPlayerDeleteMany },
  court: { updateMany: mocks.courtUpdateMany },
  match: { deleteMany: mocks.matchDeleteMany },
  clubMember: { updateMany: mocks.clubMemberUpdateMany },
};

describe("club reset route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "admin-account", isAdmin: false } });
    mocks.getClubAdminAccess.mockResolvedValue({ canAdmin: true });
    mocks.clubFindUnique.mockResolvedValue({ isTutorial: false, tutorialOwnerId: null });
    mocks.sessionFindMany.mockResolvedValue([]);
    mocks.deleteEphemeralGuestUsers.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx));
  });

  it("resets active memberships while excluding immutable retired memberships", async () => {
    const response = await POST(
      new Request("http://localhost/api/clubs/club-1/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: "RESET" }),
      }),
      { params: Promise.resolve({ id: "club-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.clubMemberUpdateMany).toHaveBeenCalledWith({
      where: { clubId: "club-1", retiredByAdmissionEventId: null },
      data: { elo: 1000 },
    });
  });
});
