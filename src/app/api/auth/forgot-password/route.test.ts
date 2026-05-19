import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  checkRateLimit: vi.fn(),
  userFindUnique: vi.fn(),
  txUpdateMany: vi.fn(),
  txCreate: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  generatePasswordResetToken: vi.fn(),
  hashPasswordResetToken: vi.fn(),
  getPasswordResetExpiresAt: vi.fn(),
  buildPasswordResetUrl: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    $transaction: async (
      callback: (tx: {
        passwordResetToken: {
          updateMany: typeof mocks.txUpdateMany;
          create: typeof mocks.txCreate;
        };
      }) => Promise<unknown>
    ) =>
      callback({
        passwordResetToken: {
          updateMany: mocks.txUpdateMany,
          create: mocks.txCreate,
        },
      }),
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mocks.rateLimit,
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("@/lib/passwordResetEmail", () => ({
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
}));

vi.mock("@/lib/passwordReset", () => ({
  buildPasswordResetUrl: mocks.buildPasswordResetUrl,
  generatePasswordResetToken: mocks.generatePasswordResetToken,
  getPasswordResetExpiresAt: mocks.getPasswordResetExpiresAt,
  hashPasswordResetToken: mocks.hashPasswordResetToken,
}));

vi.mock("@/lib/serverAudit", () => ({
  logAuditEvent: mocks.logAuditEvent,
}));

import { POST } from "./route";

function postForgotPassword(body: unknown) {
  return POST(
    new Request("http://localhost/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
  );
}

describe("forgot password route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.rateLimit.mockResolvedValue(null);
    mocks.checkRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: Date.now() + 1000,
      retryAfterSeconds: 0,
    });
    mocks.generatePasswordResetToken.mockReturnValue("plain-token");
    mocks.hashPasswordResetToken.mockReturnValue("hashed-token");
    mocks.getPasswordResetExpiresAt.mockReturnValue(
      new Date("2026-05-19T18:00:00.000Z")
    );
    mocks.buildPasswordResetUrl.mockReturnValue(
      "https://antiselek.com/reset-password?token=plain-token"
    );
    mocks.sendPasswordResetEmail.mockResolvedValue(undefined);
    mocks.txUpdateMany.mockResolvedValue({ count: 1 });
    mocks.txCreate.mockResolvedValue({ id: "reset-token-1" });
  });

  it("creates a reset token and emails claimed users", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      email: "player@example.com",
      name: "Player One",
      isClaimed: true,
    });

    const response = await postForgotPassword({ email: "player@example.com" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      message:
        "If that email belongs to a claimed account, we've sent a reset link.",
    });
    expect(mocks.txUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        usedAt: null,
      },
      data: {
        usedAt: expect.any(Date),
      },
    });
    expect(mocks.txCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        tokenHash: "hashed-token",
        expiresAt: new Date("2026-05-19T18:00:00.000Z"),
      },
    });
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith({
      email: "player@example.com",
      name: "Player One",
      resetUrl: "https://antiselek.com/reset-password?token=plain-token",
    });
  });

  it("returns generic success for unknown emails without creating tokens", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const response = await postForgotPassword({ email: "ghost@example.com" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mocks.txCreate).not.toHaveBeenCalled();
    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("returns generic success for unclaimed or email-less users", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user-2",
      email: null,
      name: "Placeholder",
      isClaimed: false,
    });

    const response = await postForgotPassword({ email: "placeholder@example.com" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mocks.txCreate).not.toHaveBeenCalled();
    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
