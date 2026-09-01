import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HostTournamentPanel } from "./HostTournamentPanel";
import {
  SessionBalanceMetric,
  SessionCollabFormat,
  SessionMatchmakingStyle,
  SessionPairingMode,
  SessionPool,
} from "@/types/enums";

function renderPanel({
  matchmakingStyle = SessionMatchmakingStyle.BALANCED,
  creationIssues = [],
  poolsEnabled = false,
  selectedPlayerCount = 0,
  guestCount = 0,
}: {
  matchmakingStyle?: SessionMatchmakingStyle;
  creationIssues?: string[];
  poolsEnabled?: boolean;
  selectedPlayerCount?: number;
  guestCount?: number;
} = {}) {
  return renderToStaticMarkup(
    <HostTournamentPanel
      newSessionName="Friday Night"
      onNewSessionNameChange={vi.fn()}
      matchmakingStyle={matchmakingStyle}
      onMatchmakingStyleChange={vi.fn()}
      balanceMetric={SessionBalanceMetric.SESSION_POINTS}
      onBalanceMetricChange={vi.fn()}
      pairingMode={SessionPairingMode.OPEN}
      onPairingModeChange={vi.fn()}
      isTestSession={false}
      onIsTestSessionChange={vi.fn()}
      autoQueueEnabled={true}
      onAutoQueueEnabledChange={vi.fn()}
      respectPlayerRest={true}
      onRespectPlayerRestChange={vi.fn()}
      collabFormat={SessionCollabFormat.FREE_PLAY}
      onCollabFormatChange={vi.fn()}
      partnerClubId=""
      partnerClubSearch=""
      onPartnerClubSearchChange={vi.fn()}
      collabCandidates={[]}
      selectedPartnerClub={null}
      loadingCollabCandidates={false}
      onSelectPartnerClub={vi.fn()}
      onClearPartnerClub={vi.fn()}
      loadingCollabRoster={false}
      openModeLabel="Open"
      mixedModeLabel="Mixed"
      courtCount={2}
      onCourtCountChange={vi.fn()}
      poolsEnabled={poolsEnabled}
      onPoolsEnabledChange={vi.fn()}
      selectedPoolCounts={{
        [SessionPool.A]: poolsEnabled ? 2 : 0,
        [SessionPool.B]: poolsEnabled ? 1 : 0,
      }}
      guestPoolCounts={{
        [SessionPool.A]: 0,
        [SessionPool.B]: poolsEnabled ? guestCount : 0,
      }}
      selectedPlayerCount={selectedPlayerCount}
      guestCount={guestCount}
      onOpenPlayers={vi.fn()}
      onCreateSession={vi.fn()}
      creatingSession={false}
      creationIssues={creationIssues}
    />
  );
}

describe("HostTournamentPanel", () => {
  it("renders the matchmaking style picker as a dropdown in the fixed order", () => {
    const markup = renderPanel();

    expect(markup).toContain("<select");

    const balancedIndex = markup.indexOf(">Balanced<");
    const socialIndex = markup.indexOf(">Social<");
    const levelMatchIndex = markup.indexOf(">Level Match<");

    expect(balancedIndex).toBeGreaterThan(-1);
    expect(socialIndex).toBeGreaterThan(balancedIndex);
    expect(levelMatchIndex).toBeGreaterThan(socialIndex);
    expect(markup).not.toContain(">Ratings<");
    expect(markup).not.toContain(">Ladder<");
    expect(markup).not.toContain(">Race<");
  });

  it("shows the selected social helper copy", () => {
    const markup = renderPanel({
      matchmakingStyle: SessionMatchmakingStyle.SOCIAL,
    });

    expect(markup).toContain("More variety, less focus on fairness.");
  });

  it("keeps advanced setup controls constrained on mobile", () => {
    const markup = renderPanel();

    expect(markup).toContain("app-panel min-w-0 max-w-full overflow-hidden");
    expect(markup).toContain("min-w-0 rounded-lg border");
    expect(markup).not.toContain("Regular tournament / Auto queue on");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
  });

  it("exposes tutorial targets for name, roster choice, and creation", () => {
    const markup = renderPanel();

    expect(markup).toContain(
      'data-tutorial-target="admin-onboarding-session-name"'
    );
    expect(markup).toContain(
      'data-tutorial-target="admin-onboarding-host-players"'
    );
    expect(markup).toContain(
      'data-tutorial-target="admin-onboarding-create-session"'
    );
  });

  it("uses one Add players roster action", () => {
    const markup = renderPanel();

    expect(markup).toContain(">Add players<");
    expect(markup).toContain("0 added");
    expect(markup).not.toContain(">Guests<");
    expect(markup).not.toContain(">Manage<");
  });

  it("combines member, guest, and group counts", () => {
    const markup = renderPanel({
      poolsEnabled: true,
      selectedPlayerCount: 3,
      guestCount: 1,
    });

    expect(markup).toContain(
      "4 added · 2 Competitive · 2 Social · 1 guest"
    );
  });

  it("shows every creation issue and disables the create action", () => {
    const markup = renderPanel({
      creationIssues: [
        "Add a tournament name.",
        "Add 2 more players or guests.",
      ],
    });

    expect(markup).toContain("Add a tournament name.");
    expect(markup).toContain("Add 2 more players or guests.");
    expect(markup).toContain('aria-describedby="host-creation-issues"');
    expect(markup).toContain("disabled");
  });

  it("does not render the redundant host back control", () => {
    expect(renderPanel()).not.toContain(">Exit<");
  });

});
