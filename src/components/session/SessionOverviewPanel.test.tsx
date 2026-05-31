import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionOverviewPanel } from "./SessionOverviewPanel";
import { SessionStatus } from "@/types/enums";

function renderOverviewPanel({
  sessionStatus = SessionStatus.ACTIVE,
  canShareResults = false,
  sharingResults = false,
}: {
  sessionStatus?: SessionStatus;
  canShareResults?: boolean;
  sharingResults?: boolean;
} = {}) {
  return renderToStaticMarkup(
    <SessionOverviewPanel
      sessionTypeLabel="Points"
      sessionModeLabel="Open"
      isTestSession={false}
      playersCount={10}
      guestPlayersCount={0}
      activeMatchesCount={2}
      completedMatchesCount={6}
      pausedPlayersCount={0}
      sessionStatus={sessionStatus}
      canStartSession={false}
      canOpenPlayerManager={true}
      canOpenSettings={true}
      canShareResults={canShareResults}
      sharingResults={sharingResults}
      onStartSession={vi.fn()}
      onOpenPlayerManager={vi.fn()}
      onOpenSettings={vi.fn()}
      onOpenMatchHistory={vi.fn()}
      onShareResults={vi.fn()}
    />
  );
}

describe("SessionOverviewPanel", () => {
  it("shows a share action for completed sessions when sharing is available", () => {
    const markup = renderOverviewPanel({
      sessionStatus: SessionStatus.COMPLETED,
      canShareResults: true,
    });

    expect(markup).toContain("Share");
    expect(markup).toContain("Match History");
  });

  it("shows preparing copy while a share export is in progress", () => {
    const markup = renderOverviewPanel({
      sessionStatus: SessionStatus.COMPLETED,
      canShareResults: true,
      sharingResults: true,
    });

    expect(markup).toContain("Preparing...");
  });

  it("does not show share on active sessions", () => {
    const markup = renderOverviewPanel({
      sessionStatus: SessionStatus.ACTIVE,
      canShareResults: false,
    });

    expect(markup).not.toContain(">Share<");
  });
});
