import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bcryptHash: vi.fn(),
  checkRateLimit: vi.fn(),
  isGlobalAdminEmail: vi.fn(),
  logAuditEvent: vi.fn(),
  rateLimit: vi.fn(),
  userCreate: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: mocks.bcryptHash,
  },
}));

vi.mock("@/lib/globalAdmin", () => ({
  isGlobalAdminEmail: mocks.isGlobalAdminEmail,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      create: mocks.userCreate,
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimit: mocks.rateLimit,
}));

vi.mock("@/lib/serverAudit", () => ({
  logAuditEvent: mocks.logAuditEvent,
}));

import { POST } from "./route";

function postSignup(body: unknown) {
  return POST(
    new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
  );
}

describe("signup route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.rateLimit.mockResolvedValue(null);
    mocks.checkRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 0,
    });
    mocks.bcryptHash.mockResolvedValue("password-hash");
    mocks.isGlobalAdminEmail.mockReturnValue(false);
  });

  it("blocks public signup for configured global admin emails", async () => {
    mocks.isGlobalAdminEmail.mockReturnValue(true);

    const response = await postSignup({
      email: "admin@example.com",
      name: "Admin",
      password: "password123",
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("This account must be provisioned by an administrator.");
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.bcryptHash).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        details: { reason: "admin_email_public_signup_blocked" },
        outcome: "denied",
      })
    );
  });

  it("creates normal non-admin accounts", async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue({
      id: "user-1",
      email: "player@example.com",
      name: "Player",
      isClaimed: true,
    });

    const response = await postSignup({
      email: "Player@Example.com",
      name: " Player ",
      password: "password123",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: {
        email: "player@example.com",
        passwordHash: "password-hash",
        name: "Player",
        isClaimed: true,
      },
    });
    expect(body.email).toBe("player@example.com");
  });
});
