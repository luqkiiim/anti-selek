import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  passwordResetTokenFindUnique: vi.fn(),
  txUserUpdate: vi.fn(),
  txPasswordResetTokenUpdate: vi.fn(),
  txPasswordResetTokenUpdateMany: vi.fn(),
  bcryptHash: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: mocks.bcryptHash,
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    passwordResetToken: {
      findUnique: mocks.passwordResetTokenFindUnique,
    },
    $transaction: async (
      callback: (tx: {
        user: {
          update: typeof mocks.txUserUpdate;
        };
        passwordResetToken: {
          update: typeof mocks.txPasswordResetTokenUpdate;
          updateMany: typeof mocks.txPasswordResetTokenUpdateMany;
        };
      }) => Promise<unknown>
    ) =>
      callback({
        user: {
          update: mocks.txUserUpdate,
        },
        passwordResetToken: {
          update: mocks.txPasswordResetTokenUpdate,
          updateMany: mocks.txPasswordResetTokenUpdateMany,
        },
      }),
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mocks.rateLimit,
}));

vi.mock("@/lib/serverAudit", () => ({
  logAuditEvent: mocks.logAuditEvent,
}));

import { POST } from "./route";

function postResetPassword(body: unknown) {
  return POST(
    new Request("http://localhost/api/auth/reset-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
  );
}

describe("reset password route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.rateLimit.mockResolvedValue(null);
    mocks.bcryptHash.mockResolvedValue("new-password-hash");
    mocks.txUserUpdate.mockResolvedValue({});
    mocks.txPasswordResetTokenUpdate.mockResolvedValue({});
    mocks.txPasswordResetTokenUpdateMany.mockResolvedValue({ count: 2 });
  });

  it("rejects already-used tokens", async () => {
    mocks.passwordResetTokenFindUnique.mockResolvedValue({
      id: "token-1",
      tokenHash: "hash",
      expiresAt: new Date("2026-05-19T18:00:00.000Z"),
      usedAt: new Date("2026-05-19T17:30:00.000Z"),
      user: {
        id: "user-1",
        email: "player@example.com",
        name: "Player One",
        isClaimed: true,
      },
    });

    const response = await postResetPassword({
      token: "plain-token",
      password: "password123",
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Reset link is invalid or expired");
    expect(mocks.txUserUpdate).not.toHaveBeenCalled();
  });

  it("rejects expired tokens", async () => {
    mocks.passwordResetTokenFindUnique.mockResolvedValue({
      id: "token-1",
      tokenHash: "hash",
      expiresAt: new Date("2000-01-01T00:00:00.000Z"),
      usedAt: null,
      user: {
        id: "user-1",
        email: "player@example.com",
        name: "Player One",
        isClaimed: true,
      },
    });

    const response = await postResetPassword({
      token: "plain-token",
      password: "password123",
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Reset link is invalid or expired");
  });

  it("updates the password and invalidates all remaining reset tokens", async () => {
    mocks.passwordResetTokenFindUnique.mockResolvedValue({
      id: "token-1",
      tokenHash: "hash",
      expiresAt: new Date("2099-05-19T18:00:00.000Z"),
      usedAt: null,
      user: {
        id: "user-1",
        email: "player@example.com",
        name: "Player One",
        isClaimed: true,
      },
    });

    const response = await postResetPassword({
      token: "plain-token",
      password: "password123",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mocks.txUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: "new-password-hash" },
    });
    expect(mocks.txPasswordResetTokenUpdate).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: {
        usedAt: expect.any(Date),
      },
    });
    expect(mocks.txPasswordResetTokenUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        usedAt: null,
        id: {
          not: "token-1",
        },
      },
      data: {
        usedAt: expect.any(Date),
      },
    });
  });
});
