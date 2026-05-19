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
});
