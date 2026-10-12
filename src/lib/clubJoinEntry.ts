import "server-only";
import { createHash, createHmac } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { isGlobalAdminEmail } from "@/lib/globalAdmin";
import { getClubAdminAccess } from "@/lib/clubAdminPermissions";

type Db = Prisma.TransactionClient | PrismaClient;
const purpose = "club-join-entry";
const issuer = "anti-selek";
const ttlSeconds = 30 * 60;
interface EntryClaims { userId: string; clubId: string; sessionVersion: number; fingerprint: string; expiresAt: number }
// Capabilities cannot be forged by deserializing a browser-provided object.
const capabilities = new WeakMap<object, EntryClaims>();
export interface ClubEntryProof { readonly __entryProof: unique symbol }
function proof(claims: EntryClaims): ClubEntryProof {
  const value = Object.freeze({}) as ClubEntryProof; capabilities.set(value, claims); return value;
}
export class ClubEntryUnavailableError extends Error {
  readonly code = "PASSWORD_PROOF_UNAVAILABLE";
  readonly statusCode = 503;
  constructor() { super("Password verification is temporarily unavailable."); }
}
export function clubEntryProofExpiresAt(value?: ClubEntryProof) {
  const claims = value && capabilities.get(value);
  return claims ? new Date(claims.expiresAt * 1000).toISOString() : null;
}
function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || Buffer.byteLength(value, "utf8") < 32) throw new ClubEntryUnavailableError();
  return value;
}
function fingerprint(hash: string | null) {
  return createHmac("sha256", secret()).update(`${purpose}:password:${hash ?? ""}`).digest("base64url");
}
function signingKey() { return createHmac("sha256", secret()).update(`${purpose}:signing:v1`).digest(); }
export function clubEntryCookieName(clubId: string) {
  return `club-entry-${createHash("sha256").update(clubId).digest("hex").slice(0, 24)}`;
}
export function sameOriginJsonGuard(request: Request) {
  const destination = new URL(request.url);
  destination.host = request.headers.get("host") ?? destination.host;
  if (request.headers.get("origin") !== destination.origin || request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "Same-origin JSON request required." }, { status: 403, headers: { "Cache-Control": "no-store, private" } });
  }
}
export async function verifyClubEntryPassword(club: { id: string; isPasswordProtected: boolean; passwordHash: string | null }, account: { id: string; sessionVersion: number }, password: unknown) {
  if (club.isPasswordProtected && (typeof password !== "string" || !password || password.length > 256 || !club.passwordHash || !await bcrypt.compare(password, club.passwordHash))) return null;
  return proof({ userId: account.id, clubId: club.id, sessionVersion: account.sessionVersion, fingerprint: fingerprint(club.passwordHash), expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds });
}
export async function signClubEntryProof(value: ClubEntryProof) {
  const claims = capabilities.get(value);
  if (!claims) throw new Error("Invalid club entry capability");
  return new SignJWT({ purpose, version: 1, clubId: claims.clubId, sessionVersion: claims.sessionVersion, fingerprint: claims.fingerprint })
    .setProtectedHeader({ alg: "HS256", typ: "club-entry+jwt" }).setIssuer(issuer).setAudience(purpose).setSubject(claims.userId)
    .setIssuedAt().setExpirationTime(claims.expiresAt).sign(signingKey());
}
export async function readClubEntryProof(request: Request, clubId: string): Promise<ClubEntryProof | undefined> {
  const token = new NextRequest(request.url, { headers: request.headers }).cookies.get(clubEntryCookieName(clubId))?.value;
  if (!token || token.length > 4096) return;
  try {
    const { payload, protectedHeader } = await jwtVerify(token, signingKey(), { algorithms: ["HS256"], issuer, audience: purpose, typ: "club-entry+jwt", maxTokenAge: ttlSeconds });
    if (protectedHeader.typ !== "club-entry+jwt" || payload.purpose !== purpose || payload.version !== 1 || payload.clubId !== clubId || typeof payload.sub !== "string" || !Number.isInteger(payload.sessionVersion) || typeof payload.fingerprint !== "string" || typeof payload.exp !== "number") return;
    return proof({ userId: payload.sub, clubId, sessionVersion: payload.sessionVersion as number, fingerprint: payload.fingerprint, expiresAt: payload.exp });
  } catch { return; }
}
export async function hasClubEntry(db: Db, club: { id: string; isPasswordProtected: boolean; passwordHash: string | null }, account: { id: string; email: string; isActive: boolean; sessionVersion: number }, value?: ClubEntryProof) {
  if (!account.isActive) return false;
  if (!club.isPasswordProtected) return true;
  const [access, admin] = await Promise.all([
    db.clubAccess.findUnique({ where: { clubId_userId: { clubId: club.id, userId: account.id } } }),
    getClubAdminAccess(db, { clubId: club.id, userId: account.id, isGlobalAdmin: isGlobalAdminEmail(account.email) }),
  ]);
  if (access?.status === "ACTIVE" || admin?.canAdmin) return true;
  if (!club.passwordHash) return false;
  secret();
  const claims = value && capabilities.get(value);
  return !!claims && claims.userId === account.id && claims.clubId === club.id && claims.sessionVersion === account.sessionVersion && claims.expiresAt > Math.floor(Date.now() / 1000) && claims.fingerprint === fingerprint(club.passwordHash);
}
export function setClubEntryCookie(response: NextResponse, request: Request, clubId: string, token: string) {
  response.cookies.set(clubEntryCookieName(clubId), token, { httpOnly: true, secure: process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:", sameSite: "lax", path: "/", maxAge: ttlSeconds, expires: new Date(Date.now() + ttlSeconds * 1000) });
}
