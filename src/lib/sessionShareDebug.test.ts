import { describe, expect, it } from "vitest";
import { isSessionShareDebugEnabled } from "./sessionShareDebug";

describe("isSessionShareDebugEnabled", () => {
  it("only enables share debug mode for shareDebug=1", () => {
    expect(isSessionShareDebugEnabled(new URLSearchParams("shareDebug=1"))).toBe(
      true
    );
    expect(isSessionShareDebugEnabled(new URLSearchParams("shareDebug=true"))).toBe(
      false
    );
    expect(isSessionShareDebugEnabled(new URLSearchParams(""))).toBe(false);
    expect(isSessionShareDebugEnabled(null)).toBe(false);
  });
});
