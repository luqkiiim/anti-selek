import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CommunityPlayerStatus,
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";
import type {
  CommunityLeaderboardClaimState,
  CommunityPageMember,
} from "./communityTypes";
import { CommunityLeaderboardPanel } from "./CommunityLeaderboardPanel";

function buildPlayer(overrides: Partial<CommunityPageMember> = {}): CommunityPageMember {
  return {
    id: "placeholder-1",
    name: "Old Member",
    email: null,
    avatarUrl: null,
    status: CommunityPlayerStatus.CORE,
    gender: PlayerGender.UNSPECIFIED,
    partnerPreference: PartnerPreference.OPEN,
    elo: 1000,
    wins: 0,
    losses: 0,
    isClaimed: false,
    role: "MEMBER",
    ...overrides,
  };
}

function buildClaimState(overrides: Partial<CommunityLeaderboardClaimState> = {}): CommunityLeaderboardClaimState {
  return {
    currentUser: {
      id: "requester-1",
      name: "New Signup",
      email: "new@example.com",
      avatarUrl: null,
      elo: 1000,
      gender: PlayerGender.UNSPECIFIED,
      partnerPreference: PartnerPreference.OPEN,
    },
    currentUserClaimEligibility: {
      canRequest: true,
      reason: null,
    },
    myPendingClaimRequest: null,
    pendingClaimByTargetId: new Map(),
    requestingClaimFor: null,
    ...overrides,
  };
}

function renderPanel(
  player: CommunityPageMember,
  claimState: CommunityLeaderboardClaimState
) {
  return renderToStaticMarkup(
    <CommunityLeaderboardPanel
      title="Leaderboard"
      subtitle="Latest standings"
      players={[player]}
      communityId="community-1"
      claimState={claimState}
      onRequestClaim={vi.fn()}
      onOpenPlayerProfile={vi.fn()}
    />
  );
}

describe("CommunityLeaderboardPanel", () => {
  it("shows Request Claim for eligible placeholders even when names differ", () => {
    const markup = renderPanel(buildPlayer(), buildClaimState());

    expect(markup).toContain("Request Claim");
    expect(markup).toContain("Admin will verify this claim manually.");
  });

  it("does not show the manual-review warning when names match", () => {
    const markup = renderPanel(
      buildPlayer({ name: "  Jane   Doe " }),
      buildClaimState({
        currentUser: {
          id: "requester-1",
          name: "Jane Doe",
          email: "jane@example.com",
          avatarUrl: null,
          elo: 1000,
          gender: PlayerGender.UNSPECIFIED,
          partnerPreference: PartnerPreference.OPEN,
        },
      })
    );

    expect(markup).toContain("Request Claim");
    expect(markup).not.toContain("Admin will verify this claim manually.");
  });

  it("keeps claim controls hidden for claimed targets", () => {
    const markup = renderPanel(
      buildPlayer({ isClaimed: true, email: "claimed@example.com" }),
      buildClaimState()
    );

    expect(markup).not.toContain("Request Claim");
  });

  it("renders an up movement arrow with the number below it", () => {
    const markup = renderPanel(
      buildPlayer({ rankDelta: 2, previousRank: 3 }),
      buildClaimState()
    );

    expect(markup).toContain('data-testid="rank-movement-up"');
    expect(markup).toContain('aria-label="Moved up 2 ranks"');
    expect(markup).toMatch(
      /data-testid="rank-movement-up"[\s\S]*<svg[\s\S]*<\/svg>[\s\S]*>2<\/span>/
    );
    expect(markup.indexOf('data-testid="rank-movement-up"')).toBeLessThan(
      markup.indexOf("#1")
    );
  });

  it("renders a down movement number with the arrow below it", () => {
    const markup = renderPanel(
      buildPlayer({ rankDelta: -1, previousRank: 1 }),
      buildClaimState()
    );

    expect(markup).toContain('data-testid="rank-movement-down"');
    expect(markup).toContain('aria-label="Moved down 1 rank"');
    expect(markup).toMatch(
      /data-testid="rank-movement-down"[\s\S]*>1<\/span>[\s\S]*<svg[\s\S]*<\/svg>/
    );
  });

  it("hides the movement indicator when rank movement is unavailable or unchanged", () => {
    const unavailableMarkup = renderPanel(
      buildPlayer({ rankDelta: null, previousRank: null }),
      buildClaimState()
    );
    const unchangedMarkup = renderPanel(
      buildPlayer({ rankDelta: 0, previousRank: 1 }),
      buildClaimState()
    );

    expect(unavailableMarkup).not.toContain("rank-movement-up");
    expect(unavailableMarkup).not.toContain("rank-movement-down");
    expect(unchangedMarkup).not.toContain("rank-movement-up");
    expect(unchangedMarkup).not.toContain("rank-movement-down");
  });
});
