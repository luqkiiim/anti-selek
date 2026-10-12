import { describe, expect, it } from "vitest";
import { withLegacySportingAliases } from "./sportingIdentity";

describe("sporting identity compatibility", () => {
  it("preserves the exact club claimed state over frozen Player provenance", () => {
    const result = withLegacySportingAliases({ playerId: "original", player: {
      ownerUserId: "legacy-owner", ownerUser: { email: "legacy@example.invalid" },
      isClaimed: false, email: null,
    } });
    expect(result.userId).toBe("original");
    expect(result.user.isClaimed).toBe(false);
    expect(result.user.email).toBeNull();
  });
  it("retains explicitly resolved local ownership when provenance is empty", () => {
    const result = withLegacySportingAliases({ ownerUserId: null, isClaimed: true, email: "local@example.invalid" });
    expect(result.isClaimed).toBe(true);
    expect(result.email).toBe("local@example.invalid");
  });
  it("does not expose legacy owner email or invent current ownership without club context", () => {
    const result = withLegacySportingAliases({ ownerUserId: "legacy-owner", ownerUser: { email: "legacy@example.invalid" } });
    expect(result.isClaimed).toBe(false);
    expect(result.email).toBeNull();
  });
});
