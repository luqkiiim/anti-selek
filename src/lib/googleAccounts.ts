import "server-only";

import bcrypt from "bcryptjs";
import type { Account, Profile } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { GOOGLE_ONLY_PASSWORD, hasAccountPassword } from "@/lib/accountPassword";
import { isGlobalAdminEmail, normalizeAuthEmail } from "@/lib/globalAdmin";
import { isGlobalClubViewerEmail } from "@/lib/globalClubViewer";
import { checkRateLimit } from "@/lib/rateLimit";
import type { GoogleIdentity, GoogleLink } from "@/lib/googleAuthCookies";

export const googleAccountSelect = {
  id: true,
  email: true,
  name: true,
  isActive: true,
  sessionVersion: true,
  googleIdentity: { select: { subject: true } },
  passwordHash: true,
} as const;

export function isPasswordOnlyEmail(email: string) {
  return isGlobalAdminEmail(email) || isGlobalClubViewerEmail(email);
}

export function getVerifiedGoogleIdentity(account: Account, profile: Profile | undefined): GoogleIdentity | null {
  const email = normalizeAuthEmail(profile?.email);
  const subject = profile?.sub;
  if (profile?.email_verified !== true || !email || email.length > 254 ||
      !z.email().safeParse(email).success || typeof subject !== "string" ||
      !subject || subject.length > 255 || subject !== account.providerAccountId) return null;

  return { subject, email, name: typeof profile.name === "string" ? profile.name.trim().slice(0, 100) : "" };
}

export async function findGoogleAccount(subject: string) {
  const identity = await prisma.googleIdentity.findUnique({
    where: { subject },
    select: { user: { select: googleAccountSelect } },
  });
  return identity?.user ?? null;
}

export function checkGooglePasswordRateLimit(request: Request, accountId: string) {
  return checkRateLimit(request, "auth:google:connect", {
    identity: accountId,
    applyHighRiskBucket: false,
    limit: 5,
    windowMs: 15 * 60_000,
  });
}

function errorCode(error: unknown) {
  return (error as { code?: string } | null)?.code;
}

export async function createGoogleAccount(identity: GoogleIdentity, profile: { name: string; gender: "MALE" | "FEMALE" }) {
  if (isPasswordOnlyEmail(identity.email)) return null;

  try {
    // A replay cannot authenticate an existing account through signup.
    return await prisma.user.create({
      data: {
        ...profile,
        email: identity.email,
        passwordHash: GOOGLE_ONLY_PASSWORD,
        googleIdentity: { create: { subject: identity.subject } },
      },
      select: googleAccountSelect,
    });
  } catch (error) {
    if (errorCode(error) === "P2002") return null;
    throw error;
  }
}

export async function connectGoogleAccount(identity: GoogleIdentity, link: GoogleLink, password?: string) {
  if (isPasswordOnlyEmail(identity.email)) return null;
  const account = await prisma.user.findUnique({ where: { id: link.accountId }, select: googleAccountSelect });
  if (!account?.isActive || !hasAccountPassword(account.passwordHash) ||
      account.email !== identity.email || account.sessionVersion !== link.sessionVersion) return null;
  if (password !== undefined && !await bcrypt.compare(password, account.passwordHash)) return null;
  if (account.googleIdentity) return account.googleIdentity.subject === identity.subject ? account : null;

  try {
    return await prisma.user.update({
      where: {
        id: account.id,
        email: identity.email,
        sessionVersion: link.sessionVersion,
        isActive: true,
        googleIdentity: { is: null },
        passwordHash: account.passwordHash,
      },
      data: { googleIdentity: { create: { subject: identity.subject } } },
      select: googleAccountSelect,
    });
  } catch (error) {
    if (["P2002", "P2025"].includes(errorCode(error) ?? "")) return null;
    throw error;
  }
}
