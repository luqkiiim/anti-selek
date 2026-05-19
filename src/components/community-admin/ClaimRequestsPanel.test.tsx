import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClaimRequestStatus } from "@/types/enums";
import type { CommunityAdminClaimRequest } from "./communityAdminTypes";
import { ClaimRequestsPanel } from "./ClaimRequestsPanel";

function buildClaimRequest(
  overrides: Partial<CommunityAdminClaimRequest> = {}
): CommunityAdminClaimRequest {
  return {
    id: "claim-1",
    requesterUserId: "requester-1",
    requesterName: "New Signup",
    requesterEmail: "new@example.com",
    targetUserId: "placeholder-1",
    targetName: "Old Member",
    targetEmail: null,
    status: ClaimRequestStatus.PENDING,
    note: null,
    createdAt: "2026-05-19T00:00:00.000Z",
    ...overrides,
  };
}

function renderPanel(claimRequests: CommunityAdminClaimRequest[]) {
  return renderToStaticMarkup(
    <ClaimRequestsPanel
      claimRequests={claimRequests}
      reviewingClaimRequestId={null}
      currentUserId="admin-1"
      onReviewClaimRequest={vi.fn()}
    />
  );
}

describe("ClaimRequestsPanel", () => {
  it("shows a warning when requester and placeholder names differ", () => {
    const markup = renderPanel([buildClaimRequest()]);

    expect(markup).toContain("Name mismatch");
    expect(markup).toContain(
      "Confirm this placeholder belongs to the requester before approving."
    );
  });

  it("does not show the mismatch warning when names match", () => {
    const markup = renderPanel([
      buildClaimRequest({
        requesterName: "  Jane   Doe ",
        targetName: "Jane Doe",
      }),
    ]);

    expect(markup).not.toContain("Name mismatch");
  });
});
