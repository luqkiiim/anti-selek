import { describe, expect, it } from "vitest";
import { resolvePrismaRuntimeMode, selectPrismaTursoCredentials } from "./prismaRuntime";

describe("resolvePrismaRuntimeMode", () => {
  it("defaults development to sqlite even when Turso credentials exist", () => {
    expect(
      resolvePrismaRuntimeMode({
        nodeEnv: "development",
        tursoUrl: "libsql://example.turso.io",
        tursoToken: "token",
      })
    ).toBe("sqlite");
  });

  it("uses Turso in development when explicitly enabled", () => {
    expect(
      resolvePrismaRuntimeMode({
        nodeEnv: "development",
        useTurso: "true",
        tursoUrl: "libsql://example.turso.io",
        tursoToken: "token",
      })
    ).toBe("turso");
  });

  it("fails closed when Turso is explicitly enabled without full credentials", () => {
    expect(() =>
      resolvePrismaRuntimeMode({
        nodeEnv: "development",
        useTurso: "true",
        tursoUrl: "libsql://example.turso.io",
        tursoToken: "",
      })
    ).toThrow("requires complete non-production");
  });

  it("respects an explicit sqlite override", () => {
    expect(
      resolvePrismaRuntimeMode({
        nodeEnv: "production",
        useTurso: "false",
        tursoUrl: "libsql://example.turso.io",
        tursoToken: "token",
      })
    ).toBe("sqlite");
  });

  it("keeps an actual Production deployment on Turso", () => {
    expect(
      resolvePrismaRuntimeMode({
        nodeEnv: "production",
        vercel: "1",
        vercelEnv: "production",
        vercelUrl: "production.example.invalid",
        tursoUrl: "libsql://example.turso.io",
        tursoToken: "token",
      })
    ).toBe("turso");
  });

  it("fails closed for a deployment without matching credentials", () => {
    expect(() =>
      resolvePrismaRuntimeMode({
        nodeEnv: "production",
        vercel: "1",
        vercelEnv: "preview",
        vercelUrl: "preview.example.invalid",
        tursoUrl: "",
        tursoToken: "",
      })
    ).toThrow("Deployment database access is disabled");
  });

  it.each([
    { vercel: "1", vercelEnv: "preview", vercelUrl: undefined },
    { vercel: "1", vercelEnv: "production", vercelUrl: "" },
    { vercel: undefined, vercelEnv: "preview", vercelUrl: "preview.example.invalid" },
  ])("fails closed for incomplete production Vercel markers: %o", (markers) => {
    expect(() =>
      resolvePrismaRuntimeMode({
        nodeEnv: "production",
        useTurso: "true",
        tursoUrl: "",
        tursoToken: "",
        ...markers,
      })
    ).toThrow("incomplete or inconsistent Vercel deployment markers");
  });

  it("fails closed when Preview credentials identify Preview but the deployment tuple is incomplete", () => {
    expect(() =>
      resolvePrismaRuntimeMode({
        nodeEnv: "production",
        vercel: "1",
        vercelEnv: "preview",
        previewTursoUrl: "libsql://preview.invalid",
        previewTursoToken: "preview-token",
      })
    ).toThrow("incomplete or inconsistent Vercel deployment markers");
  });

  it("keeps local production builds on SQLite despite remote credentials", () => {
    expect(resolvePrismaRuntimeMode({ nodeEnv: "production", tursoUrl: "libsql://production.invalid", tursoToken: "production-token" })).toBe("sqlite");
  });

  it("uses only dedicated Preview credentials", () => {
    expect(selectPrismaTursoCredentials({ NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "preview.invalid", PREVIEW_TURSO_DATABASE_URL: "libsql://staging.invalid", PREVIEW_TURSO_AUTH_TOKEN: "staging-token" })).toEqual({ tursoUrl: "libsql://staging.invalid", tursoToken: "staging-token" });
  });

  it("rejects Production-style credentials in Preview even with safe Preview credentials", () => {
    expect(() => selectPrismaTursoCredentials({ NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "preview.invalid", TURSO_DATABASE_URL: "libsql://production.invalid", TURSO_AUTH_TOKEN: "production-token", PREVIEW_TURSO_DATABASE_URL: "libsql://staging.invalid", PREVIEW_TURSO_AUTH_TOKEN: "staging-token" })).toThrow("Preview refuses");
  });

  it.each([
    { NODE_ENV: "production", VERCEL_ENV: "preview", PREVIEW_TURSO_DATABASE_URL: "libsql://preview.invalid" } as const satisfies NodeJS.ProcessEnv,
    { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "", PREVIEW_TURSO_AUTH_TOKEN: "preview-token" } as const satisfies NodeJS.ProcessEnv,
    { NODE_ENV: "production", VERCEL_ENV: "production", PREVIEW_TURSO_DATABASE_URL: "libsql://preview.invalid" } as const satisfies NodeJS.ProcessEnv,
  ])("does not select shared Turso credentials for partial or contradictory Preview hints: %o", (env) => {
    expect(() => selectPrismaTursoCredentials(env)).toThrow("incomplete or inconsistent Vercel deployment markers");
  });

  it("never selects production defaults for tests with copied Vercel metadata", () => {
    expect(resolvePrismaRuntimeMode({ nodeEnv: "test", vercel: "1", vercelEnv: "production", vercelUrl: "production.invalid", tursoUrl: "libsql://production.invalid", tursoToken: "production-token" })).toBe("sqlite");
  });
});
