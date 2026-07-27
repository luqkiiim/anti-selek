import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OfflineIdentityLinksPanel } from "./OfflineIdentityLinksPanel";

describe("OfflineIdentityLinksPanel", () => {
  it("preserves the three-step bilateral link workflow in the compact layout", () => {
    const markup = renderToStaticMarkup(
      <OfflineIdentityLinksPanel
        links={[]}
        currentClubId="club-1"
        currentUserId="admin-1"
        sourcePlaceholderOptions={[]}
        sourceUserId=""
        onSourceUserIdChange={vi.fn()}
        targetClubSearch=""
        onTargetClubSearchChange={vi.fn()}
        selectedTargetClub={null}
        targetClubCandidates={[]}
        loadingTargetClubs={false}
        loadingTargetRoster={false}
        targetPlaceholderOptions={[]}
        targetUserId=""
        onTargetUserIdChange={vi.fn()}
        submitting={false}
        reviewingLinkId={null}
        onSelectTargetClub={vi.fn()}
        onClearTargetClub={vi.fn()}
        onSubmitLink={vi.fn()}
        onReviewLink={vi.fn()}
        onUnlink={vi.fn()}
      />
    );

    expect(markup).toContain('data-owner-admin-panel="links"');
    expect(markup).toContain("This club placeholder");
    expect(markup).toContain("Partner club");
    expect(markup).toContain("Partner placeholder");
    expect(markup).toContain("both clubs agree");
    expect(markup).toContain("No offline identity links yet");
    expect(markup).toContain('disabled=""');
  });
});
