import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadProductionRehearsalCredentials,
  validateReadOnlyTursoToken,
} from "../../scripts/production-rehearsal-credentials.mjs";
import {
  assertLocalTursoEndpoint,
  tursoEndpointFingerprint,
} from "../../scripts/turso-local-target-guard.mjs";

const temporaryDirectories: string[] = [];

function makeJwt(claims: Record<string, unknown>) {
  return [
    Buffer.from(JSON.stringify({ alg: "test", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "test-signature",
  ].join(".");
}

function protectedCredentialFixture(token: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "anti-selek-prod-rehearsal-"));
  fs.chmodSync(directory, 0o700);
  temporaryDirectories.push(directory);
  const privateDirectory = path.join(directory, "private");
  fs.mkdirSync(privateDirectory, { mode: 0o700 });
  fs.chmodSync(privateDirectory, 0o700);
  const credentialsPath = path.join(privateDirectory, "production-rehearsal.env");
  fs.writeFileSync(
    credentialsPath,
    `PRODUCTION_REHEARSAL_TURSO_URL=libsql://production.example.invalid\nPRODUCTION_REHEARSAL_TURSO_TOKEN=${token}\n`,
    { mode: 0o600 },
  );
  fs.chmodSync(credentialsPath, 0o600);
  const developmentTargetPath = path.join(privateDirectory, "development-target.json");
  fs.writeFileSync(
    developmentTargetPath,
    JSON.stringify({
      version: 1,
      endpointSha256: tursoEndpointFingerprint("libsql://development.example.invalid"),
    }),
    { mode: 0o600 },
  );
  fs.chmodSync(developmentTargetPath, 0o600);
  return { credentialPath: credentialsPath, developmentTargetPath };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("isolated production rehearsal credentials", () => {
  it("accepts a legacy read-only token without exp and does not modify normal database environment", () => {
    const envNames = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "DATABASE_URL"] as const;
    const before = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
    const fixture = protectedCredentialFixture(makeJwt({ a: "ro" }));

    const credentials = loadProductionRehearsalCredentials(fixture);

    expect(credentials).toEqual({
      url: "libsql://production.example.invalid",
      authToken: expect.any(String),
    });
    expect(Object.keys(credentials).sort()).toEqual(["authToken", "url"]);
    expect(Object.fromEntries(envNames.map((name) => [name, process.env[name]]))).toEqual(before);
  });

  it("fails closed on misspelled loader paths before opening the default credential file", () => {
    expect(() =>
      loadProductionRehearsalCredentials({
        credentialsPath: "/intentionally-unreadable-test-fixture.env",
      } as Parameters<typeof loadProductionRehearsalCredentials>[0]),
    ).toThrow("loader options contain an unsupported key");
  });

  it("rejects a read grant combined with a writer permission because p overrides a", () => {
    const token = makeJwt({
      a: "ro",
      p: { ro: { ns: ["main"] }, rw: { ns: ["main"] } },
    });
    expect(() => validateReadOnlyTursoToken(token)).toThrow("write, create, or DDL permission");
  });

  it("accepts a scoped read-only p claim and rejects a DDL grant", () => {
    expect(() =>
      validateReadOnlyTursoToken(makeJwt({ p: { ro: { ns: ["main"], tags: ["schema"] } } })),
    ).not.toThrow();
    expect(() =>
      validateReadOnlyTursoToken(
        makeJwt({ p: { ro: { ns: ["main"] }, ddl: { ns: ["main"] } } }),
      ),
    ).toThrow("write, create, or DDL permission");
  });

  it("rejects expired tokens and tokens that are not yet valid", () => {
    const nowMilliseconds = 10_000;
    expect(() =>
      validateReadOnlyTursoToken(makeJwt({ a: "ro", exp: 9 }), nowMilliseconds),
    ).toThrow("exp claim is invalid or expired");
    expect(() =>
      validateReadOnlyTursoToken(makeJwt({ a: "ro", nbf: 11 }), nowMilliseconds),
    ).toThrow("invalid or future nbf claim");
  });

  it("allows the pinned development endpoint and refuses another remote target", () => {
    const fixture = protectedCredentialFixture(makeJwt({ a: "ro" }));
    expect(
      assertLocalTursoEndpoint("libsql://development.example.invalid", {
        registrationPath: fixture.developmentTargetPath,
      }),
    ).toBe("registered-development");
    expect(() =>
      assertLocalTursoEndpoint("libsql://production.example.invalid", {
        registrationPath: fixture.developmentTargetPath,
      }),
    ).toThrow("does not match this checkout's registered development database");
  });

  it("keeps an existing development pin authoritative even with deployed Vercel variables", () => {
    const fixture = protectedCredentialFixture(makeJwt({ a: "ro" }));
    expect(() =>
      assertLocalTursoEndpoint("libsql://production.example.invalid", {
        registrationPath: fixture.developmentTargetPath,
        allowDeployedVercelRuntime: true,
        env: {
          NODE_ENV: "production",
          VERCEL: "1",
          VERCEL_ENV: "production",
          VERCEL_URL: "app.example.invalid",
        },
      }),
    ).toThrow("does not match this checkout's registered development database");
  });
});
