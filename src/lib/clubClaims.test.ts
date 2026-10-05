import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/clubAdmissions", () => ({ ClubAdmissionError: class extends Error {}, reviewClubAdmission: vi.fn().mockResolvedValue({ status: "APPROVED" }) }));
import { approveClubClaimRequest, isClaimableClubPlaceholder } from "./clubClaims";
import { reviewClubAdmission } from "./clubAdmissions";
describe("legacy claim adapter", () => {
  it("determines claimability only from current ownership", () => {
    expect(isClaimableClubPlaceholder({ ownerUserId: null })).toBe(true);
    expect(isClaimableClubPlaceholder({ ownerUserId: "account" })).toBe(false);
  });
  it("delegates to ownership approval without invoking a history merge", async () => {
    const tx = {} as Parameters<typeof approveClubClaimRequest>[0];
    await approveClubClaimRequest(tx, { clubId: "club", requestId: "request", reviewerUserId: "account-reviewer" });
    expect(reviewClubAdmission).toHaveBeenCalledWith(tx, { clubId: "club", requestId: "request", reviewerUserId: "account-reviewer", action: "APPROVE" });
  });
});
