import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createClient, type Client } from "@libsql/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import type { NextAuthConfig } from "next-auth";
import type { CredentialsConfig } from "next-auth/providers/credentials";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.AUTH_GOOGLE_ID = "fixture-client";
  process.env.AUTH_GOOGLE_SECRET = "fixture-client-secret";
  process.env.AUTH_SECRET = "isolated-google-test-secret-at-least-32-bytes";
  const jar = new Map<string, { value: string }>();
  return {
    jar,
    config: null as unknown as (request?: NextRequest) => NextAuthConfig,
    auth: vi.fn(),
    signIn: vi.fn(),
  };
});

vi.mock("next-auth", () => ({
  default: (config: typeof mocks.config) => {
    mocks.config = config;
    return { auth: mocks.auth, signIn: mocks.signIn };
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => mocks.jar.get(name),
    set: (name: string, value: string, options: { maxAge: number }) => {
      if (options.maxAge === 0) mocks.jar.delete(name);
      else mocks.jar.set(name, { value });
    },
  }),
}));
vi.mock("@/lib/rateLimit", () => ({
  rateLimit: async () => null,
  checkRateLimit: async () => ({ allowed: true }),
  areRateLimitsDisabled: () => true,
}));
vi.mock("@/lib/prisma", () => ({ get prisma() { return db; } }));

import { POST as startGoogle } from "@/app/api/auth/google/route";
import { GOOGLE_ONLY_PASSWORD } from "./accountPassword";
import { readGoogleCompletion } from "./googleAuthCookies";

const migration = "20261105000000_google_sign_in";
const fixtureDir = mkdtempSync(path.join(tmpdir(), "anti-selek-google-auth-"));
const fixtureSchema = path.join(fixtureDir, "schema.prisma");
const url = "file:" + path.join(fixtureDir, "fixture.db");
const origin = "http://localhost:3000";
const ownerEmail = "owner@example.com";
const ownerPassword = "fixture-password";
const signupProfile = { name: "Confirmed Name", gender: "FEMALE" };
let libsql: Client;
let db: PrismaClient;

function migrate() {
  execFileSync(process.execPath, [
    "node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", fixtureSchema,
  ], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}

beforeAll(async () => {
  const migrations = path.join(fixtureDir, "migrations");
  cpSync("prisma/schema.prisma", fixtureSchema);
  cpSync("prisma/migrations", migrations, { recursive: true, filter: source => !source.endsWith(migration) });
  writeFileSync(path.join(fixtureDir, "fixture.db"), "");
  migrate();

  libsql = createClient({ url });
  const adapter = new PrismaLibSQL(libsql as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]);
  db = new PrismaClient({ adapter });
  // The new Prisma client must read and write password accounts before the OAuth migration.
  await db.user.create({ data: {
    id: "owner", email: ownerEmail, name: "Club Owner",
    passwordHash: await bcrypt.hash(ownerPassword, 4), sessionVersion: 7,
  } });
  expect(await db.user.findUnique({ where: { id: "owner" } })).toMatchObject({ email: ownerEmail });
  await db.club.create({ data: { id: "club", name: "Fixture club", createdById: "owner" } });
  await db.clubAccess.create({ data: { id: "access", clubId: "club", userId: "owner", role: "ADMIN" } });

  cpSync(path.join("prisma/migrations", migration), path.join(migrations, migration), { recursive: true });
  migrate();
});

beforeEach(() => {
  mocks.jar.clear();
  mocks.auth.mockReset();
  mocks.signIn.mockReset().mockResolvedValue("https://accounts.google.com/o/oauth2/v2/auth?state=fixture-state");
  vi.stubEnv("AUTH_GOOGLE_ENROLLMENT", "open");
  vi.stubEnv("GLOBAL_CLUB_VIEWER_EMAILS", "");
});

afterEach(() => vi.unstubAllEnvs());

afterAll(async () => {
  await db?.$disconnect();
  libsql?.close();
  rmSync(fixtureDir, { recursive: true, force: true });
});

function start(input: unknown, requestOrigin = origin) {
  return startGoogle(new Request(`${origin}/api/auth/google`, {
    method: "POST",
    headers: { Origin: requestOrigin, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

function callback(
  subject: string,
  email: string,
  options: { state?: string; verified?: boolean } = {},
) {
  const request = new NextRequest(`${origin}/api/auth/callback/google?state=${options.state ?? "fixture-state"}`);
  const config = mocks.config(request);
  const user = { id: "provider-id", name: "Google Name", email, isAdmin: false };
  const account = { provider: "google", type: "oidc" as const, providerAccountId: subject };
  const profile = { sub: subject, email, email_verified: options.verified ?? true, name: user.name };
  return {
    signIn: () => config.callbacks!.signIn!({ user, account, profile }),
    jwt: () => config.callbacks!.jwt!({
      user, account, profile, token: { id: "provider-id", isAdmin: false, isQuickAccess: false, sub: "provider-id" },
    }),
  };
}

function finishGoogle(credentials: Record<string, string> = signupProfile) {
  const provider = mocks.config().providers
    .find(provider => typeof provider !== "function" && provider.options?.id === "google-complete");
  const options = provider?.options as Partial<CredentialsConfig> | undefined;
  if (!options?.authorize) throw new Error("Google completion credentials provider missing");
  return options.authorize(
    credentials, new Request(`${origin}/api/auth/callback/google-complete`, { method: "POST" }),
  );
}

it("creates one account after profile confirmation and signs in by Google subject on return", async () => {
  const invite = "/player-invites/invite-id?from=club#claim";
  expect((await start({ mode: "sign-in", callbackUrl: invite })).status).toBe(200);
  const first = callback("new-google-id", "new@example.com");
  expect(await first.signIn()).toBe("/complete-google-profile");
  expect(await db.user.findUnique({ where: { email: "new@example.com" } })).toBeNull();
  expect(await readGoogleCompletion()).toMatchObject({ name: "Google Name", callbackUrl: invite });

  const signups = await Promise.all([finishGoogle(), finishGoogle()]);
  const successful = signups.filter(result => result !== null);
  expect(successful).toHaveLength(1);
  const accountId = successful[0]!.id;
  expect(await db.user.findUnique({ where: { id: accountId }, include: { googleIdentity: true } })).toMatchObject({
    id: accountId, ...signupProfile, passwordHash: GOOGLE_ONLY_PASSWORD, googleIdentity: { subject: "new-google-id" },
  });
  expect(await db.player.count()).toBe(0);
  expect(await finishGoogle()).toBeNull();

  vi.stubEnv("AUTH_GOOGLE_ENROLLMENT", "paused");
  await start({ mode: "sign-in", callbackUrl: invite });
  const returning = callback("new-google-id", "changed@example.com");
  expect(await returning.signIn()).toBe(true);
  expect(await returning.jwt()).toMatchObject({ id: accountId, sub: accountId, email: "new@example.com", googleSubject: "new-google-id" });
  expect(await db.user.count({ where: { email: "changed@example.com" } })).toBe(0);

  await db.user.update({ where: { id: accountId }, data: { isActive: false } });
  await start({ mode: "sign-in" });
  expect(await callback("new-google-id", "changed@example.com").signIn()).toContain("google=failed");
});

it("never links on email alone and preserves the existing account and club access after explicit linking", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "owner", isQuickAccess: true } });
  expect((await start({ mode: "connect", password: ownerPassword })).status).toBe(401);
  mocks.auth.mockResolvedValue({ user: { id: "owner", isQuickAccess: false } });
  expect((await start({ mode: "connect", password: ownerPassword }, "https://other.example")).status).toBe(403);
  expect((await start({ mode: "connect", password: "wrong" })).status).toBe(403);
  expect(mocks.signIn).not.toHaveBeenCalled();

  expect((await start({ mode: "connect", password: ownerPassword })).status).toBe(200);
  expect(await callback("owner-google-id", ownerEmail, { state: "another-attempt" }).signIn()).toContain("google=failed");
  expect(await callback("owner-google-id", "different@example.com").signIn()).toBe("/settings?google=failed");
  expect(await db.googleIdentity.findUnique({ where: { userId: "owner" } })).toBeNull();

  await start({ mode: "connect", password: ownerPassword });
  expect(await callback("owner-google-id", ownerEmail).signIn()).toBe("/settings?google=connected");
  const owner = await db.user.findUniqueOrThrow({ where: { id: "owner" } });
  expect(owner).toMatchObject({ email: ownerEmail, sessionVersion: 7 });
  expect(await db.googleIdentity.findUnique({ where: { userId: "owner" } })).toMatchObject({ subject: "owner-google-id" });
  expect(await bcrypt.compare(ownerPassword, owner.passwordHash)).toBe(true);
  expect(await db.clubAccess.findUnique({ where: { id: "access" } })).toMatchObject({ userId: "owner", role: "ADMIN" });

  vi.stubEnv("GLOBAL_CLUB_VIEWER_EMAILS", ownerEmail);
  await start({ mode: "sign-in" });
  expect(await callback("owner-google-id", ownerEmail).signIn()).toContain("google=password-only");
});

it("confirms a matching password account during Google sign-in and keeps the same account", async () => {
  const email = "existing@gmail.com";
  const password = "a-valid-password";
  const owner = await db.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 4), name: "Existing player" } });

  await start({ mode: "sign-in", callbackUrl: "/club/club" });
  expect(await callback("inline-google-id", email).signIn()).toBe("/complete-google-profile");
  expect(await readGoogleCompletion()).toMatchObject({ link: { accountId: owner.id }, callbackUrl: "/club/club" });
  expect(await finishGoogle()).toBeNull();
  expect(await finishGoogle({ password: "wrong" })).toBeNull();
  expect(await db.googleIdentity.findUnique({ where: { userId: owner.id } })).toBeNull();

  expect(await finishGoogle({ password })).toMatchObject({ id: owner.id, googleSubject: "inline-google-id" });
  expect(await finishGoogle({ password })).toBeNull();
  expect(await db.user.count({ where: { email } })).toBe(1);
  const unchanged = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
  expect(await bcrypt.compare(password, unchanged.passwordHash)).toBe(true);

  await start({ mode: "sign-in" });
  const returning = callback("inline-google-id", email);
  expect(await returning.signIn()).toBe(true);
  expect(await returning.jwt()).toMatchObject({ id: owner.id, googleSubject: "inline-google-id" });
});

it("rejects unverified Google identities and sends unsafe continuations to home", async () => {
  await start({ mode: "sign-in", callbackUrl: "//outside.example" });
  expect(mocks.signIn).toHaveBeenCalledWith("google", { redirect: false, redirectTo: "/" }, expect.anything());
  expect(await callback("unverified", "unverified@example.com", { verified: false }).signIn()).toContain("google=failed");
  expect(await readGoogleCompletion()).toBeNull();
});
