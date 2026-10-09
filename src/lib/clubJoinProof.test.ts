import { afterEach, describe, expect, it, vi } from "vitest";
import { CLUB_COMMUNITY_COMPAT_COOKIE_PATH, CLUB_JOIN_COOKIE_PATH, ClubJoinProofUnavailableError, clubJoinProofCookieName, clubJoinProofCookieOptions, issueClubJoinProof, verifyClubJoinProof } from "./clubJoinProof";

const originalSecret = process.env.AUTH_SECRET;
const localSecret = "local-test-secret-for-club-join-proof-0123456789";

afterEach(() => {
  vi.unstubAllEnvs();
  if (originalSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalSecret;
});

describe("club join password proofs", () => {
  it("binds an opaque, short-lived proof to one account, club, and password configuration", () => {
    process.env.AUTH_SECRET = localSecret;
    const input = { userId: "account-a", clubId: "club-a", passwordHash: "bcrypt-hash-do-not-return", passwordProtected: true };
    const issuedAt = 1_800_000_000_000;
    const proof = issueClubJoinProof(input, issuedAt);
    const cookieName = clubJoinProofCookieName(input.clubId);
    const [payloadPart, signaturePart] = proof.token.split(".");
    expect(Buffer.from(signaturePart, "base64url")).toHaveLength(32);
    expect(JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"))).toMatchObject({ v: 1, issuedAt: 1_800_000_000, expiresAt: 1_800_000_600 });
    const request = new Request("http://localhost/api/clubs/join-requests", {
      headers: { Cookie: `${cookieName}=${proof.token}` },
    });

    expect(proof.expiresAt.getTime()).toBe(issuedAt + 10 * 60 * 1000);
    expect(proof.token).not.toContain(input.userId);
    expect(proof.token).not.toContain(input.clubId);
    expect(proof.token).not.toContain(input.passwordHash);
    expect(verifyClubJoinProof(request, input, issuedAt + 30_000)).toEqual(proof.expiresAt);
    const communityAliasRequest = new Request("http://localhost/api/communities/club-a/claim-requests", {
      headers: { Cookie: `${clubJoinProofCookieName(input.clubId, CLUB_COMMUNITY_COMPAT_COOKIE_PATH)}=${proof.token}` },
    });
    expect(verifyClubJoinProof(communityAliasRequest, input, issuedAt + 30_000)).toEqual(proof.expiresAt);
    expect(verifyClubJoinProof(request, { ...input, userId: "account-b" }, issuedAt + 30_000)).toBeNull();
    expect(verifyClubJoinProof(request, { ...input, clubId: "club-b" }, issuedAt + 30_000)).toBeNull();
    expect(verifyClubJoinProof(request, { ...input, passwordHash: "rotated-hash" }, issuedAt + 30_000)).toBeNull();
    expect(verifyClubJoinProof(request, input, proof.expiresAt.getTime())).toBeNull();
  });

  it("rejects duplicate proof cookies and proofs signed under a different application secret", () => {
    process.env.AUTH_SECRET = localSecret;
    const input = { userId: "account-a", clubId: "club-a", passwordHash: "hash-a", passwordProtected: true };
    const proof = issueClubJoinProof(input, 1_800_000_000_000);
    const cookieName = clubJoinProofCookieName(input.clubId);
    const duplicateCookie = new Request("http://localhost/api/clubs/join-requests", {
      headers: { Cookie: `${cookieName}=${proof.token}; ${cookieName}=${proof.token}` },
    });
    expect(verifyClubJoinProof(duplicateCookie, input, 1_800_000_001_000)).toBeNull();

    const validCookie = new Request("http://localhost/api/clubs/join-requests", {
      headers: { Cookie: `${cookieName}=${proof.token}` },
    });
    process.env.AUTH_SECRET = "a-different-local-test-secret-0123456789";
    expect(verifyClubJoinProof(validCookie, input, 1_800_000_001_000)).toBeNull();
  });

  it("fails closed without the stable signer and applies private short-lived cookie options", () => {
    try {
      delete process.env.AUTH_SECRET;
      expect(() => issueClubJoinProof({ userId: "account-a", clubId: "club-a", passwordHash: "hash-a" })).toThrow(ClubJoinProofUnavailableError);

      vi.stubEnv("NODE_ENV", "test");
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const httpOptions = clubJoinProofCookieOptions(new Request("http://localhost/api/clubs/join-proof"), expiresAt, CLUB_JOIN_COOKIE_PATH);
      expect(httpOptions).toMatchObject({ httpOnly: true, sameSite: "lax", secure: false, path: CLUB_JOIN_COOKIE_PATH });
      expect(httpOptions.maxAge).toBeGreaterThan(0);
      expect(httpOptions.maxAge).toBeLessThanOrEqual(10 * 60);

      const httpsOptions = clubJoinProofCookieOptions(new Request("https://localhost/api/clubs/join-proof"), expiresAt);
      expect(httpsOptions.secure).toBe(true);

      vi.stubEnv("NODE_ENV", "production");
      const productionOptions = clubJoinProofCookieOptions(new Request("http://localhost/api/clubs/join-proof"), expiresAt);
      expect(productionOptions.secure).toBe(true);
    } finally {
      if (originalSecret === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = originalSecret;
    }
  });
});
