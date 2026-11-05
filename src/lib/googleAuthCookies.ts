import "server-only";

import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import { cookies } from "next/headers";
import { z } from "zod";

const MAX_AGE = 10 * 60;
const googleIdentity = z.object({
  subject: z.string().min(1).max(255),
  email: z.email().max(254),
  name: z.string().max(100),
});
const linkSchema = z.object({ accountId: z.string(), sessionVersion: z.number().int() });
const intentSchema = z.object({
  stateHash: z.string(),
  callbackUrl: z.string(),
  link: linkSchema.optional(),
});
const completionSchema = googleIdentity.extend({ callbackUrl: z.string(), link: linkSchema.optional() });

export type GoogleIdentity = z.infer<typeof googleIdentity>;
export type GoogleLink = z.infer<typeof linkSchema>;

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Google sign-in requires AUTH_SECRET");
  return createHash("sha256").update("anti-selek:google-auth:v1:").update(secret).digest();
}

function cookieName(purpose: string, secure: boolean) {
  return `${secure ? "__Host-" : ""}anti-selek-google-${purpose}`;
}

function cookieOptions(request: Request) {
  return {
    secure: process.env.VERCEL === "1" || new URL(request.url).protocol === "https:",
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
  };
}

async function writeCookie(purpose: string, claims: Record<string, unknown>, request: Request) {
  const token = await new EncryptJWT(claims)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setAudience(purpose)
    .setExpirationTime(`${MAX_AGE}s`)
    .encrypt(key());
  const options = cookieOptions(request);
  (await cookies()).set(cookieName(purpose, options.secure), token, { ...options, maxAge: MAX_AGE });
}

async function readCookie<T>(purpose: string, schema: z.ZodType<T>, request?: Request): Promise<T | null> {
  const jar = await cookies();
  const secure = request ? cookieOptions(request).secure : process.env.VERCEL === "1";
  const token = jar.get(cookieName(purpose, true))?.value
    ?? (secure ? undefined : jar.get(cookieName(purpose, false))?.value);
  if (!token) return null;

  try {
    const { payload } = await jwtDecrypt(token, key(), {
      audience: purpose,
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
    });
    const parsed = schema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function clearCookie(purpose: string, request: Request) {
  const options = cookieOptions(request);
  (await cookies()).set(cookieName(purpose, options.secure), "", { ...options, maxAge: 0 });
}

function hashState(state: string) {
  return createHash("sha256").update(state).digest("base64url");
}

export function writeGoogleIntent(
  request: Request,
  state: string,
  callbackUrl: string,
  link?: GoogleLink,
) {
  return writeCookie("intent", { stateHash: hashState(state), callbackUrl, link }, request);
}

export async function consumeGoogleIntent(request: Request) {
  const state = new URL(request.url).searchParams.get("state");
  if (!state) return null;

  const intent = await readCookie("intent", intentSchema, request);
  if (!intent || intent.stateHash !== hashState(state)) return null;

  await clearCookie("intent", request);
  return intent;
}

export function writeGoogleCompletion(request: Request, identity: GoogleIdentity, callbackUrl: string, link?: GoogleLink) {
  return writeCookie("completion", { ...identity, callbackUrl, link }, request);
}

export function readGoogleCompletion(request?: Request) {
  return readCookie("completion", completionSchema, request);
}

export function clearGoogleCompletion(request: Request) {
  return clearCookie("completion", request);
}
