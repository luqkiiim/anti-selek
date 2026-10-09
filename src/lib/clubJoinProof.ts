import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const CLUB_JOIN_PROOF_TTL_SECONDS = 10 * 60;
export const CLUB_JOIN_COOKIE_PATH = "/api/clubs";
export const CLUB_COMMUNITY_COMPAT_COOKIE_PATH = "/api/communities";

const COOKIE_PREFIX = "club_join_proof_";
const TOKEN_PREFIX = "club-join-proof:v1";
const claimsSchema = z.object({
  v: z.literal(1),
  subject: z.string().regex(/^[a-f0-9]{64}$/),
  club: z.string().regex(/^[a-f0-9]{64}$/),
  config: z.string().regex(/^[a-f0-9]{64}$/),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
}).strict();

type ProofClaims = z.infer<typeof claimsSchema>;
export type ClubJoinProofStatus = "NOT_REQUIRED" | "PASSWORD_REQUIRED" | "VERIFIED";
export type ClubJoinProofState = {
  status: ClubJoinProofStatus;
  expiresAt: string | null;
};

export class ClubJoinProofRequiredError extends Error {
  readonly code = "PASSWORD_REQUIRED";
  readonly statusCode = 428;

  constructor() {
    super("Enter the club password to continue.");
    this.name = "ClubJoinProofRequiredError";
  }
}

export class ClubJoinProofUnavailableError extends Error {
  readonly code = "PASSWORD_PROOF_UNAVAILABLE";
  readonly statusCode = 503;

  constructor() {
    super("Password verification is temporarily unavailable.");
    this.name = "ClubJoinProofUnavailableError";
  }
}

function signingSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new ClubJoinProofUnavailableError();
  }
  return secret;
}

function scopedDigest(secret: string, scope: string, value: string) {
  return createHmac("sha256", secret)
    .update(`${TOKEN_PREFIX}:${scope}\0`, "utf8")
    .update(value, "utf8")
    .digest("hex");
}

function digestMatches(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function passwordConfigDigest(secret: string, clubId: string, passwordHash: string | null) {
  return scopedDigest(secret, "password-config", `${clubId}\0protected\0${passwordHash ?? ""}`);
}

export function clubJoinProofCookieName(clubId: string, path = CLUB_JOIN_COOKIE_PATH) {
  const suffix = createHash("sha256").update(clubId, "utf8").digest("hex").slice(0, 24);
  const prefix = path === CLUB_COMMUNITY_COMPAT_COOKIE_PATH ? "community_join_proof_" : COOKIE_PREFIX;
  return `${prefix}${suffix}`;
}

function tokenSignature(secret: string, payload: string) {
  return createHmac("sha256", secret).update(`${TOKEN_PREFIX}.${payload}`, "utf8").digest();
}

function readCookie(request: Request, name: string) {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  let result: string | null = null;
  for (const pair of raw.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    if (result !== null) return null;
    result = pair.slice(separator + 1).trim();
  }
  return result;
}

export function issueClubJoinProof(
  input: { userId: string; clubId: string; passwordHash: string | null },
  nowMs = Date.now(),
) {
  const secret = signingSecret();
  const issuedAt = Math.floor(nowMs / 1000);
  const expiresAt = issuedAt + CLUB_JOIN_PROOF_TTL_SECONDS;
  const claims: ProofClaims = {
    v: 1,
    subject: scopedDigest(secret, "subject", input.userId),
    club: scopedDigest(secret, "club", input.clubId),
    config: passwordConfigDigest(secret, input.clubId, input.passwordHash),
    issuedAt,
    expiresAt,
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = tokenSignature(secret, payload).toString("base64url");
  return { token: `${payload}.${signature}`, expiresAt: new Date(expiresAt * 1000) };
}

function readClaims(token: string, secret: string): ProofClaims | null {
  if (token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  const suppliedSignature = Buffer.from(parts[1], "base64url");
  const expectedSignature = tokenSignature(secret, parts[0]);
  if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) return null;
  try {
    const json = Buffer.from(parts[0], "base64url").toString("utf8");
    const parsed = claimsSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function verifyClubJoinProof(
  request: Request,
  input: { userId: string; clubId: string; passwordProtected: boolean; passwordHash: string | null },
  nowMs = Date.now(),
) {
  if (!input.passwordProtected) return null;
  const secret = signingSecret();
  const tokens = [CLUB_JOIN_COOKIE_PATH, CLUB_COMMUNITY_COMPAT_COOKIE_PATH]
    .map(path => readCookie(request, clubJoinProofCookieName(input.clubId, path)))
    .filter((token): token is string => token !== null);
  if (tokens.length !== 1) return null;
  const [token] = tokens;
  const claims = readClaims(token, secret);
  if (!claims) return null;

  const now = Math.floor(nowMs / 1000);
  if (claims.expiresAt <= now || claims.issuedAt > now + 30) return null;
  if (claims.expiresAt <= claims.issuedAt || claims.expiresAt - claims.issuedAt > CLUB_JOIN_PROOF_TTL_SECONDS) return null;

  const expectedSubject = scopedDigest(secret, "subject", input.userId);
  const expectedClub = scopedDigest(secret, "club", input.clubId);
  const expectedConfig = passwordConfigDigest(secret, input.clubId, input.passwordHash);
  if (!digestMatches(claims.subject, expectedSubject) ||
      !digestMatches(claims.club, expectedClub) ||
      !digestMatches(claims.config, expectedConfig)) return null;
  return new Date(claims.expiresAt * 1000);
}

export function clubJoinProofState(
  request: Request,
  input: { userId: string; clubId: string; passwordProtected: boolean; passwordHash: string | null },
): ClubJoinProofState {
  if (!input.passwordProtected) return { status: "NOT_REQUIRED", expiresAt: null };
  const expiresAt = verifyClubJoinProof(request, input);
  return expiresAt
    ? { status: "VERIFIED", expiresAt: expiresAt.toISOString() }
    : { status: "PASSWORD_REQUIRED", expiresAt: null };
}

export function clubJoinProofCookieOptions(request: Request, expiresAt: Date, path = CLUB_JOIN_COOKIE_PATH) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:",
    sameSite: "lax" as const,
    path,
    expires: expiresAt,
    maxAge: Math.max(0, Math.floor(expiresAt.getTime() / 1000) - nowSeconds),
  };
}
