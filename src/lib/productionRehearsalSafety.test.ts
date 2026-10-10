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
  assertRuntimeTursoEndpoint,
  assertProductionRehearsalEnabled,
  tursoEndpointFingerprint,
  tursoTokenFingerprint,
} from "../../scripts/turso-local-target-guard.mjs";

const temporaryDirectories: string[] = [];
const developmentToken = "isolated-development-test-token";
const previewToken = "isolated-preview-test-token";
const policy = {
  version: 1,
  productionEndpointSha256: tursoEndpointFingerprint("libsql://production.example.invalid"),
  nonProductionEndpointSha256: tursoEndpointFingerprint("libsql://development.example.invalid"),
  nonProductionTokenSha256: tursoTokenFingerprint(developmentToken),
  previewEndpointSha256: tursoEndpointFingerprint("libsql://preview.example.invalid"),
  previewTokenSha256: tursoTokenFingerprint(previewToken),
  productionRehearsalEnabled: false,
};

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
        authToken: developmentToken,
        policy,
      }),
    ).toBe("registered-development");
    expect(() =>
      assertLocalTursoEndpoint("libsql://production.example.invalid", {
        registrationPath: fixture.developmentTargetPath,
        authToken: developmentToken,
        policy,
      }),
    ).toThrow("production database is forbidden");
  });

  it("keeps an existing development pin authoritative even with deployed Vercel variables", () => {
    const fixture = protectedCredentialFixture(makeJwt({ a: "ro" }));
    expect(() =>
      assertRuntimeTursoEndpoint("libsql://production.example.invalid", {
        registrationPath: fixture.developmentTargetPath,
        authToken: developmentToken,
        policy,
        env: {
          NODE_ENV: "production",
          VERCEL: "1",
          VERCEL_ENV: "production",
          VERCEL_URL: "app.example.invalid",
        },
      }),
    ).toThrow("production database is forbidden");
  });

  it("requires distinct Preview endpoint and token pins before client construction", () => {
    const fixture = protectedCredentialFixture(makeJwt({ a: "ro" }));
    const options = { registrationPath: path.join(path.dirname(fixture.developmentTargetPath), "absent.json"), policy, env: { NODE_ENV: "production" as const, VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "preview.invalid" } };
    expect(() => assertRuntimeTursoEndpoint("libsql://production.example.invalid", { ...options, authToken: developmentToken })).toThrow("production database is forbidden");
    expect(() => assertRuntimeTursoEndpoint("libsql://development.example.invalid", { ...options, authToken: developmentToken })).toThrow("approved isolated Preview database");
    expect(() => assertRuntimeTursoEndpoint("libsql://unknown.example.invalid", { ...options, authToken: previewToken })).toThrow("approved isolated Preview database");
    for (const authToken of ["production-token", developmentToken, "wrong-token"]) {
      expect(() => assertRuntimeTursoEndpoint("libsql://preview.example.invalid", { ...options, authToken })).toThrow("approved isolated Preview credential");
    }
    expect(assertRuntimeTursoEndpoint("libsql://preview.example.invalid", { ...options, authToken: previewToken })).toBe("approved-preview");
    const productionOnlyPolicy = {
      version: policy.version,
      productionEndpointSha256: policy.productionEndpointSha256,
      nonProductionEndpointSha256: policy.nonProductionEndpointSha256,
      nonProductionTokenSha256: policy.nonProductionTokenSha256,
      productionRehearsalEnabled: policy.productionRehearsalEnabled,
    };
    expect(() => assertRuntimeTursoEndpoint("libsql://preview.example.invalid", {
      ...options, authToken: previewToken, policy: productionOnlyPolicy,
    })).toThrow("approved isolated Preview database");
    expect(() => assertRuntimeTursoEndpoint("libsql://preview.example.invalid", {
      ...options, authToken: previewToken, policy: { ...productionOnlyPolicy, previewEndpointSha256: policy.previewEndpointSha256 },
    })).toThrow("approved isolated Preview credential");
    expect(() => assertRuntimeTursoEndpoint("libsql://preview.example.invalid", {
      ...options, authToken: previewToken, policy: { ...policy, previewEndpointSha256: "" },
    })).toThrow("approved isolated Preview database");
    expect(() => assertRuntimeTursoEndpoint("libsql://preview.example.invalid", {
      ...options, authToken: previewToken, policy: { ...policy, previewTokenSha256: "" },
    })).toThrow("approved isolated Preview credential");
    expect(() => assertRuntimeTursoEndpoint("libsql://development.example.invalid", {
      ...options, authToken: previewToken, policy: { ...policy, previewEndpointSha256: policy.nonProductionEndpointSha256 },
    })).toThrow("approved isolated Preview database");
    expect(() => assertRuntimeTursoEndpoint("libsql://preview.example.invalid", {
      ...options, authToken: developmentToken, policy: { ...policy, previewTokenSha256: policy.nonProductionTokenSha256 },
    })).toThrow("approved isolated Preview credential");
    expect(() => assertRuntimeTursoEndpoint("libsql://preview.example.invalid", {
      ...options, authToken: previewToken, registrationPath: fixture.developmentTargetPath,
    })).toThrow("approved non-production database");
    expect(() => assertRuntimeTursoEndpoint("libsql://preview.example.invalid", {
      ...options, authToken: previewToken, env: { ...options.env, NODE_ENV: "test" },
    })).toThrow("approved non-production database");
  });

  it("allows the production endpoint only in the Production deployment", () => {
    const fixture = protectedCredentialFixture(makeJwt({ a: "ro" }));
    const options = { registrationPath: path.join(path.dirname(fixture.developmentTargetPath), "absent.json"), policy, authToken: "production-token", env: { NODE_ENV: "production" as const, VERCEL: "1", VERCEL_ENV: "production", VERCEL_URL: "production.invalid" } };
    expect(assertRuntimeTursoEndpoint("libsql://production.example.invalid", options)).toBe("deployed-production");
    expect(() => assertRuntimeTursoEndpoint("libsql://development.example.invalid", options)).toThrow("approved production target");
    expect(() => assertRuntimeTursoEndpoint("libsql://production.example.invalid", { ...options, env: { ...options.env, NODE_ENV: "test" } })).toThrow("production database is forbidden");
  });

  it("keeps production rehearsal disabled independently of credentials", () => {
    expect(() => assertProductionRehearsalEnabled()).toThrow("disabled pending credential-incident");
  });

  it("rejects alternate URLs and tokens despite a matching local pin", () => {
    const fixture = protectedCredentialFixture(makeJwt({ a: "ro" }));
    expect(() => assertLocalTursoEndpoint("libsql://development.example.invalid", { registrationPath: fixture.developmentTargetPath, authToken: "unapproved-token", policy })).toThrow("token is not the approved non-production");
    expect(() => tursoEndpointFingerprint("https://development.example.invalid/?target=production")).toThrow("secure libSQL or HTTPS URL");
  });
});
