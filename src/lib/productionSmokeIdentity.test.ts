import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";

const smokeEmail = "smoke-account@example.invalid";
const accountPassword = "Updated-Account-Password!";
const legacyPlayerPassword = "Old-Legacy-Password!";

async function createPreflightDatabase() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "anti-selek-smoke-identity-"));
  const databasePath = path.join(directory, "preflight.db");
  const db = new DatabaseSync(databasePath);
  try {
    db.exec(`
      CREATE TABLE "Account" (
        "id" TEXT PRIMARY KEY,
        "email" TEXT NOT NULL,
        "passwordHash" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL
      );
      CREATE TABLE "User" (
        "id" TEXT PRIMARY KEY,
        "email" TEXT,
        "passwordHash" TEXT,
        "isClaimed" BOOLEAN NOT NULL,
        "ownerUserId" TEXT
      );
      CREATE TABLE "Community" ("id" TEXT PRIMARY KEY, "createdById" TEXT NOT NULL);
      CREATE TABLE "ClubAccess" (
        "id" TEXT PRIMARY KEY,
        "clubId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "role" TEXT NOT NULL,
        "status" TEXT NOT NULL
      );
      CREATE TABLE "CommunityMember" (
        "id" TEXT PRIMARY KEY,
        "communityId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "archivedAt" TEXT
      );
      CREATE TABLE "Session" ("id" TEXT PRIMARY KEY, "code" TEXT NOT NULL, "communityId" TEXT);
      CREATE TABLE "SessionCommunity" (
        "id" TEXT PRIMARY KEY,
        "sessionId" TEXT NOT NULL,
        "communityId" TEXT NOT NULL
      );
      CREATE TABLE "RateLimitBucket" (
        "scope" TEXT PRIMARY KEY,
        "count" INTEGER NOT NULL,
        "resetAt" TEXT NOT NULL
      );
    `);

    const currentHash = await bcrypt.hash(accountPassword, 4);
    const oldHash = await bcrypt.hash(legacyPlayerPassword, 4);
    db.prepare('INSERT INTO "Account" VALUES (?, ?, ?, ?)').run(
      "account-123",
      smokeEmail,
      currentHash,
      1,
    );
    db.prepare('INSERT INTO "User" VALUES (?, ?, ?, ?, ?)').run(
      "historical-player-789",
      smokeEmail,
      oldHash,
      1,
      "account-123",
    );
    db.prepare('INSERT INTO "Community" VALUES (?, ?)').run(
      "smoke-club",
      "account-123",
    );
    db.prepare('INSERT INTO "ClubAccess" VALUES (?, ?, ?, ?, ?)').run(
      "access-1",
      "smoke-club",
      "account-123",
      "OWNER",
      "ACTIVE",
    );
    db.prepare('INSERT INTO "CommunityMember" VALUES (?, ?, ?, NULL)').run(
      "member-1",
      "smoke-club",
      "historical-player-789",
    );
    db.prepare('INSERT INTO "Session" VALUES (?, ?, ?)').run(
      "session-1",
      "smoke-session",
      "smoke-club",
    );
    expect(currentHash).not.toBe(oldHash);
  } finally {
    db.close();
  }
  return { directory, databasePath };
}

function runPreflight(databasePath: string, password: string) {
  return spawnSync(
    process.execPath,
    [path.resolve("scripts/production-smoke.mjs"), "--preflight"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PRODUCTION_BASE_URL: "https://antiselek.com",
        PRODUCTION_SMOKE_EMAIL: smokeEmail,
        PRODUCTION_SMOKE_PASSWORD: password,
        PRODUCTION_SMOKE_CLUB_ID: "smoke-club",
        PRODUCTION_SMOKE_SESSION_CODE: "smoke-session",
        ALLOW_NON_PROD_SMOKE_TARGET: "1",
        TURSO_DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}`,
        TURSO_AUTH_TOKEN: "local-test-token",
      },
    },
  );
}

function runUnreviewedExternalSmoke(baseUrl = "https://antiselek.com") {
  return spawnSync(
    process.execPath,
    [path.resolve("scripts/production-smoke.mjs")],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PRODUCTION_BASE_URL: baseUrl,
        PRODUCTION_SMOKE_ALLOWED_HOSTS: "staging.example.invalid",
        ALLOW_NON_PROD_SMOKE_TARGET: "1",
        PRODUCTION_SMOKE_REVIEWED_ACCESS: "",
        TURSO_DATABASE_URL: "",
        TURSO_AUTH_TOKEN: "",
      },
    },
  );
}

describe("production smoke Account and Player preflight", () => {
  it("requires the reviewed access flag and environment opt-in before any external HTTP request", () => {
    const result = runUnreviewedExternalSmoke();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing full external smoke access");
    expect(result.stdout).not.toContain("[production-smoke] base URL:");
  });

  it("does not let the allowed-host override bypass the external smoke gate", () => {
    const result = runUnreviewedExternalSmoke("https://staging.example.invalid");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing full external smoke access");
    expect(result.stdout).not.toContain("[production-smoke] base URL:");
  });

  it("allows an IPv6 loopback smoke target without production opt-in", () => {
    const result = runUnreviewedExternalSmoke("http://[::1]:9");
    expect(result.stdout).toContain("[production-smoke] base URL: http://[::1]:9");
    expect(result.stderr).not.toContain("Refusing full external smoke access");
  });

  it("checks the changed Account credential, active ClubAccess, and owned Player with distinct IDs", async () => {
    const { directory, databasePath } = await createPreflightDatabase();
    try {
      const result = runPreflight(databasePath, accountPassword);
      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(result.stdout).toContain("preflight smoke account verified");
      expect(result.stdout).toContain("preflight smoke club access verified");
      expect(result.stdout).toContain("preflight owned Player resolution verified");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("does not accept the retained legacy Player password as the Account password", async () => {
    const { directory, databasePath } = await createPreflightDatabase();
    try {
      const result = runPreflight(databasePath, legacyPlayerPassword);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "smoke account password does not match PRODUCTION_SMOKE_PASSWORD",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
