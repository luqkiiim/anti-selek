import { afterEach, describe, expect, it } from "vitest";
import { getAppBaseUrl } from "@/lib/passwordReset";

describe("password reset URL origin", () => {
  const originalAppBaseUrl = process.env.APP_BASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (typeof originalAppBaseUrl === "undefined") {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = originalAppBaseUrl;
    }
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("uses configured APP_BASE_URL without trailing slashes", () => {
    process.env.APP_BASE_URL = "https://antiselek.com///";
    process.env.NODE_ENV = "production";

    expect(getAppBaseUrl(new Request("https://evil.example/reset"))).toBe(
      "https://antiselek.com"
    );
  });

  it("does not trust request origin as a production fallback", () => {
    delete process.env.APP_BASE_URL;
    process.env.NODE_ENV = "production";

    expect(() =>
      getAppBaseUrl(new Request("https://evil.example/reset"))
    ).toThrow("APP_BASE_URL is not configured");
  });

  it("keeps request-origin fallback outside production for local tests", () => {
    delete process.env.APP_BASE_URL;
    process.env.NODE_ENV = "test";

    expect(getAppBaseUrl(new Request("http://localhost:3000/reset"))).toBe(
      "http://localhost:3000"
    );
  });
});
