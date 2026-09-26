import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClubRole, SessionStatus } from "@/types/enums";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findUnique: vi.fn() },
    clubMember: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/sessionLifecycle", () => ({
  collectGuestUserIds: vi.fn(() => []),
  deleteEphemeralGuestUsers: vi.fn(),
  reverseSessionEloChanges: vi.fn(),
}));
vi.mock("@/lib/serverAudit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () => null),
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reverseSessionEloChanges } from "@/lib/sessionLifecycle";
import { DELETE } from "./route";

function request() {
  return DELETE(new Request("http://localhost/api/sessions/CODE/delete", { method: "DELETE" }), {
    params: Promise.resolve({ code: "CODE" }),
  });
}

describe("delete session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { id: "host", isAdmin: false } } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session", code: "CODE", clubId: "club", isTest: false, status: SessionStatus.ACTIVE,
    } as never);
    vi.mocked(prisma.clubMember.findUnique).mockResolvedValue({ role: ClubRole.STAFF } as never);
  });

  it("lets a host operator cancel an active session and reverses its rating changes", async () => {
    const tx = {
      sessionPlayer: { findMany: vi.fn(async () => []), deleteMany: vi.fn(async () => ({ count: 0 })) },
      court: { updateMany: vi.fn(async () => ({ count: 0 })) },
      match: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      session: { delete: vi.fn(async () => ({})) },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    const response = await request();
    expect(response.status).toBe(200);
    expect(reverseSessionEloChanges).toHaveBeenCalledWith(tx, { sessionId: "session", clubId: "club" });
    expect(tx.session.delete).toHaveBeenCalledWith({ where: { id: "session" } });
  });

  it("rejects an ordinary member before deleting any data", async () => {
    vi.mocked(prisma.clubMember.findUnique).mockResolvedValue({ role: ClubRole.MEMBER } as never);
    const response = await request();
    expect(response.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("keeps completed non-test sessions protected", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session", code: "CODE", clubId: "club", isTest: false, status: SessionStatus.COMPLETED,
    } as never);
    const response = await request();
    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
