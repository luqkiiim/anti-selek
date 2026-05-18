import { describe, expect, it } from "vitest";
import { resolvePrismaRuntimeMode } from "./prismaRuntime";

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

  it("falls back to sqlite when Turso is explicitly enabled without full credentials", () => {
    expect(
      resolvePrismaRuntimeMode({
        nodeEnv: "development",
        useTurso: "true",
        tursoUrl: "libsql://example.turso.io",
        tursoToken: "",
      })
    ).toBe("sqlite");
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

  it("keeps production on Turso when credentials exist and no override is set", () => {
    expect(
      resolvePrismaRuntimeMode({
        nodeEnv: "production",
        tursoUrl: "libsql://example.turso.io",
        tursoToken: "token",
      })
    ).toBe("turso");
  });

  it("uses sqlite in production when Turso credentials are absent", () => {
    expect(
      resolvePrismaRuntimeMode({
        nodeEnv: "production",
        tursoUrl: "",
        tursoToken: "",
      })
    ).toBe("sqlite");
  });
});
