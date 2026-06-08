import { createHash, randomBytes } from "node:crypto";

export const PASSWORD_RESET_MIN_LENGTH = 8;
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function generatePasswordResetToken() {
  return randomBytes(32).toString("hex");
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getPasswordResetExpiresAt(now = new Date()) {
  return new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS);
}

export function isPasswordResetTokenExpired(
  expiresAt: Date,
  now = new Date()
) {
  return expiresAt.getTime() <= now.getTime();
}

export function getAppBaseUrl(request?: Request) {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_BASE_URL is not configured");
  }

  if (request) {
    return new URL(request.url).origin;
  }

  throw new Error("APP_BASE_URL is not configured");
}

export function buildPasswordResetUrl(token: string, request?: Request) {
  return `${getAppBaseUrl(request)}/reset-password?token=${encodeURIComponent(token)}`;
}
