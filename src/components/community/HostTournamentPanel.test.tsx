import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HostTournamentPanel } from "./HostTournamentPanel";
import { SessionMode, SessionPool, SessionType } from "@/types/enums";

function renderPanel(sessionType: SessionType) {
  return renderToStaticMarkup(
    <HostTournamentPanel
      newSessionName="Friday Night"
      onNewSessionNameChange={vi.fn()}
      sessionType={sessionType}
      onSessionTypeChange={vi.fn()}
      sessionMode={SessionMode.MEXICANO}
      onSessionModeChange={vi.fn()}
      isTestSession={false}
      onIsTestSessionChange={vi.fn()}
      autoQueueEnabled={true}
      onAutoQueueEnabledChange={vi.fn()}
      partnerCommunityId=""
      partnerCommunitySearch=""
      onPartnerCommunitySearchChange={vi.fn()}
      collabCandidates={[]}
      selectedPartnerCommunity={null}
      loadingCollabCandidates={false}
      onSelectPartnerCommunity={vi.fn()}
      onClearPartnerCommunity={vi.fn()}
      loadingCollabRoster={false}
      openModeLabel="Open"
      mixedModeLabel="Mixed"
      courtCount={2}
      onCourtCountChange={vi.fn()}
      poolsEnabled={false}
      onPoolsEnabledChange={vi.fn()}
      poolAName="Open"
      onPoolANameChange={vi.fn()}
      poolBName="Regular"
      onPoolBNameChange={vi.fn()}
      selectedPoolCounts={{
        [SessionPool.A]: 0,
        [SessionPool.B]: 0,
      }}
      guestPoolCounts={{
        [SessionPool.A]: 0,
        [SessionPool.B]: 0,
      }}
      selectedPlayerCount={0}
      guestCount={0}
      onOpenPlayers={vi.fn()}
      onOpenGuests={vi.fn()}
      onCreateSession={vi.fn()}
      onExitHostMode={vi.fn()}
      exitHostModeLabel="Exit"
      creatingSession={false}
    />
  );
}

describe("HostTournamentPanel", () => {
  it("renders the format picker as a dropdown in the fixed order", () => {
    const markup = renderPanel(SessionType.POINTS);

    expect(markup).toContain("<select");

    const pointsIndex = markup.indexOf(">Points<");
    const socialMixIndex = markup.indexOf(">Social Mix<");
    const ratingsIndex = markup.indexOf(">Ratings<");
    const ladderIndex = markup.indexOf(">Ladder<");
    const raceIndex = markup.indexOf(">Race<");

    expect(pointsIndex).toBeGreaterThan(-1);
    expect(socialMixIndex).toBeGreaterThan(pointsIndex);
    expect(ratingsIndex).toBeGreaterThan(socialMixIndex);
    expect(ladderIndex).toBeGreaterThan(ratingsIndex);
    expect(raceIndex).toBeGreaterThan(ladderIndex);
    expect(markup).not.toContain("About Points format");
  });

  it("shows the selected social mix helper copy", () => {
    const markup = renderPanel(SessionType.SOCIAL_MIX);

    expect(markup).toContain(
      "Pushes for first-time partners and opponents across the session."
    );
    expect(markup).toContain(
      "Still records scores, session points, and rating updates."
    );
  });

  it("exposes tutorial targets for name, roster choice, and creation", () => {
    const markup = renderPanel(SessionType.POINTS);

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
});
